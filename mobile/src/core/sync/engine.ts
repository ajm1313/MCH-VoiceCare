/**
 * Sync engine — MCHVC-SPEC-001 v1.1 §55, SYNC-001..SYNC-010.
 *
 * Drains the outbox in resumable batches. Records are POSTed to the
 * versioned API with their idempotency key. On success the record is
 * marked SYNCED; on failure it is retried with exponential backoff
 * (SYNC-008) up to maxRetryAttempts, after which it is marked REJECTED.
 *
 * Uses the spec-required /sync/batch endpoint (spec §20.3) with
 * {deviceId, lastServerCursor, events: [{eventId, resourceType, resource}]}.
 * Falls back to the legacy /sync/ endpoint if /sync/batch returns an error.
 *
 * SYNC-004: conflict resolution is last-writer-wins for non-clinical metadata;
 * clinical observations are append-only and never overwritten (SYNC-003).
 */
import { AppConfig } from '../../config/appConfig';
import { getDb } from '../db/database';
import { useAuthStore } from '../auth/authStore';
import { getPending, updateStatus, getQueueDepth } from './outbox';
import { pullAll } from './pull';
import type { SyncAck } from './types';

type PostFn = (
  url: string,
  body: unknown,
  headers: Record<string, string>,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** Map mobile entityType → FHIR resourceType for /sync/batch (spec §20.3). */
const ENTITY_TO_RESOURCE_TYPE: Record<string, string> = {
  persons: 'Person',
  households: 'Household',
  pregnancy_episodes: 'PregnancyEpisode',
  pregnancy_observations: 'Observation',
  newborn_episodes: 'NewbornEpisode',
  newborn_observations: 'NewbornObservation',
  immunisation_records: 'ImmunisationRecord',
  vaccine_doses: 'VaccineDose',
  growth_measurements: 'GrowthMeasurement',
  referrals: 'Referral',
  clinician_overrides: 'ClinicianOverride',
};

let _postFn: PostFn | null = null;
let _isSyncing = false;
let _listeners: Array<(depth: number) => void> = [];
let _lastSyncAt: string | null = null;
let _lastSyncResult: { synced: number; failed: number; pulled: number } | null = null;
let _lastServerCursor: string | null = null;

export function setPostFunction(fn: PostFn): void {
  _postFn = fn;
}

export function subscribeToSyncDepth(cb: (depth: number) => void): () => void {
  _listeners.push(cb);
  return () => {
    _listeners = _listeners.filter(l => l !== cb);
  };
}

export function getLastSyncAt(): string | null {
  return _lastSyncAt;
}

export function getLastSyncResult(): { synced: number; failed: number; pulled: number } | null {
  return _lastSyncResult;
}

/** Get/set the last server cursor for delta sync (spec §20.3). */
export function getLastServerCursor(): string | null {
  return _lastServerCursor;
}

export function setLastServerCursor(cursor: string | null): void {
  _lastServerCursor = cursor;
}

function notify(depth: number): void {
  for (const l of _listeners) {
    l(depth);
  }
}

/**
 * Read an audio file as base64 for inclusion in sync payload.
 * Uses fetch() which works with file:// URIs on React Native.
 */
async function readAudioAsBase64(filePath: string): Promise<string> {
  const response = await fetch(filePath);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // result is "data:audio/m4a;base64,AAAA..." — strip the prefix
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Process a successful voice_observation sync response.
 * Updates the local voice_recordings table with transcript and extracted data.
 */
function processVoiceSyncResponse(record: any, responseData: any): void {
  if (record.entityType !== 'voice_observation') return;
  const payload = record.payload as any;
  const recordingId = payload.recordingId;
  if (!recordingId) return;

  const db = getDb();
  const transcript = responseData.transcript ?? '';
  const extractedData = responseData.extractedFields
    ? JSON.stringify(responseData.extractedFields)
    : null;
  const assessmentClass = responseData.assessmentClass ?? '';

  db.execute(
    `UPDATE voice_recordings
     SET transcript = ?, extracted_data = ?, status = 'PROCESSED', sync_status = 'SYNCED'
     WHERE id = ?`,
    [transcript, extractedData, recordingId],
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Push a single record via the legacy /sync/ endpoint (spec §20.3 fallback).
 * Returns { synced: 1, failed: 0 } on success or { synced: 0, failed: 1 } on failure.
 */
async function pushRecordLegacy(record: any): Promise<{ synced: number; failed: number }> {
  try {
    const url = `${AppConfig.apiBaseUrl}/sync/`;

    // Build the payload — for voice_observation, read the audio file and inject as base64
    let payload = record.payload;
    if (record.entityType === 'voice_observation') {
      const voicePayload = record.payload as any;
      if (voicePayload.audioPath) {
        try {
          const audioBase64 = await readAudioAsBase64(voicePayload.audioPath);
          payload = {
            ...voicePayload,
            audioData: audioBase64,
          };
        } catch {
          updateStatus(record.clientId, 'REJECTED', 'Failed to read audio file');
          return { synced: 0, failed: 1 };
        }
      }
    }

    // Backend expects: {"records": {entityType: [payload, ...]}}
    const postBody = {
      records: {
        [record.entityType]: [payload],
      },
    };

    const { token } = useAuthStore.getState();
    const resp = await _postFn!(url, postBody, {
      'Content-Type': 'application/json',
      'Idempotency-Key': record.idempotencyKey,
      'X-Client-Id': record.clientId,
      'X-Rule-Set-Version': record.ruleSetVersion,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    });

    if (resp.ok) {
      // For voice_observation, process the response to update local DB
      if (record.entityType === 'voice_observation') {
        try {
          const responseData = await resp.json() as any;
          processVoiceSyncResponse(record, responseData);
        } catch {
          // Response processing failed but sync itself succeeded
        }
      }
      updateStatus(record.clientId, 'SYNCED');
      return { synced: 1, failed: 0 };
    } else if (resp.status === 409) {
      const ack = (await resp.json()) as SyncAck;
      updateStatus(record.clientId, 'CONFLICT', JSON.stringify(ack.errors));
      return { synced: 0, failed: 1 };
    } else if (resp.status >= 400 && resp.status < 500) {
      const ack = (await resp.json()) as SyncAck;
      updateStatus(record.clientId, 'REJECTED', JSON.stringify(ack.errors));
      return { synced: 0, failed: 1 };
    } else {
      // FIX 8 (§19.5): exponential backoff with jitter
      const baseBackoff =
        AppConfig.sync.retryBackoffBaseMs *
        Math.pow(2, record.attempts);
      const jitter = Math.random() * baseBackoff * 0.3; // 0-30% jitter
      const backoff = baseBackoff + jitter;
      updateStatus(record.clientId, 'RETRY_PENDING', `HTTP ${resp.status}`);
      await sleep(backoff);
      return { synced: 0, failed: 1 };
    }
  } catch (err) {
    // FIX 8 (§19.5): exponential backoff with jitter
    const baseBackoff =
      AppConfig.sync.retryBackoffBaseMs * Math.pow(2, record.attempts);
    const jitter = Math.random() * baseBackoff * 0.3; // 0-30% jitter
    const backoff = baseBackoff + jitter;
    updateStatus(
      record.clientId,
      'RETRY_PENDING',
      err instanceof Error ? err.message : String(err),
    );
    await sleep(backoff);
    return { synced: 0, failed: 1 };
  }
}

/**
 * Push a batch of records via the /sync/batch endpoint (spec §20.3).
 *
 * Builds the request body as:
 *   { deviceId, lastServerCursor, events: [{eventId, resourceType, resource}] }
 *
 * Processes the response (acceptedEventIds, rejectedEvents, nextServerCursor)
 * and updates each record's sync status accordingly.
 *
 * Returns { synced, failed } on success, or throws if the batch endpoint
 * returns an error (caller should fall back to legacy per-record push).
 */
async function pushBatch(records: any[]): Promise<{ synced: number; failed: number }> {
  const url = `${AppConfig.apiBaseUrl}/sync/batch`;

  const events = records.map(r => ({
    eventId: r.idempotencyKey,
    resourceType: ENTITY_TO_RESOURCE_TYPE[r.entityType] ?? r.entityType,
    resource: r.payload,
  }));

  const deviceId = records[0]?.deviceId || 'unknown';
  const postBody = {
    deviceId,
    lastServerCursor: _lastServerCursor || null,
    events,
  };

  const { token } = useAuthStore.getState();
  const resp = await _postFn!(url, postBody, {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  if (!resp.ok) {
    // Batch endpoint returned an error — throw to trigger fallback
    const err = new Error(`Batch sync failed: HTTP ${resp.status}`);
    (err as any).status = resp.status;
    throw err;
  }

  const data = (await resp.json()) as any;

  // Process acceptedEventIds — mark corresponding records as SYNCED
  const acceptedIds = new Set<string>(data.acceptedEventIds || []);
  const rejectedEvents: Array<{ eventId: string; code: string; message: string }> =
    data.rejectedEvents || [];

  // Build a map from eventId → rejection info
  const rejectedMap = new Map<string, { code: string; message: string }>();
  for (const rej of rejectedEvents) {
    rejectedMap.set(rej.eventId, { code: rej.code, message: rej.message });
  }

  let synced = 0;
  let failed = 0;

  for (const record of records) {
    const eventId = record.idempotencyKey;
    if (acceptedIds.has(eventId)) {
      updateStatus(record.clientId, 'SYNCED');
      synced++;
    } else if (rejectedMap.has(eventId)) {
      const rej = rejectedMap.get(eventId)!;
      // Version conflicts → CONFLICT, other rejections → REJECTED
      if (rej.code === 'VERSION_CONFLICT' || rej.code === 'CONFLICT') {
        updateStatus(record.clientId, 'CONFLICT', rej.message);
      } else {
        updateStatus(record.clientId, 'REJECTED', rej.message);
      }
      failed++;
    } else {
      // Not in accepted or rejected — mark for retry
      updateStatus(record.clientId, 'RETRY_PENDING', 'No acknowledgement from server');
      failed++;
    }
  }

  // Store nextServerCursor for next sync (spec §20.3)
  if (data.nextServerCursor) {
    _lastServerCursor = data.nextServerCursor;
  }

  return { synced, failed };
}

export async function syncOnce(): Promise<{ synced: number; failed: number }> {
  if (_isSyncing) {
    return { synced: 0, failed: 0 };
  }
  if (!_postFn) {
    return { synced: 0, failed: 0 };
  }

  _isSyncing = true;
  let synced = 0;
  let failed = 0;

  try {
    const batch = getPending(AppConfig.sync.maxRetryAttempts * 10);

    // Reject records that exceeded max retry attempts
    const pendingRecords: any[] = [];
    for (const record of batch) {
      if (record.attempts >= AppConfig.sync.maxRetryAttempts) {
        updateStatus(record.clientId, 'REJECTED', 'Max retry attempts exceeded');
        failed++;
        continue;
      }
      pendingRecords.push(record);
    }

    if (pendingRecords.length === 0) {
      return { synced, failed };
    }

    // Separate voice_observation records (need audio base64, use legacy)
    const voiceRecords = pendingRecords.filter(r => r.entityType === 'voice_observation');
    const otherRecords = pendingRecords.filter(r => r.entityType !== 'voice_observation');

    // Try /sync/batch for non-voice records (spec §20.3)
    if (otherRecords.length > 0) {
      try {
        const batchResult = await pushBatch(otherRecords);
        synced += batchResult.synced;
        failed += batchResult.failed;
      } catch {
        // /sync/batch failed — fall back to legacy per-record push (spec §20.3)
        for (const record of otherRecords) {
          const result = await pushRecordLegacy(record);
          synced += result.synced;
          failed += result.failed;
        }
      }
    }

    // Voice observation records always use legacy endpoint (audio base64)
    for (const record of voiceRecords) {
      const result = await pushRecordLegacy(record);
      synced += result.synced;
      failed += result.failed;
    }
  } finally {
    _isSyncing = false;
    notify(getQueueDepth());
  }

  return { synced, failed };
}

export async function syncFull(): Promise<{ pushed: { synced: number; failed: number }; pulled: number }> {
  const pushed = await syncOnce();
  const pullResult = await pullAll();
  _lastSyncAt = new Date().toISOString();
  _lastSyncResult = { synced: pushed.synced, failed: pushed.failed, pulled: pullResult.totalPulled };
  return { pushed, pulled: pullResult.totalPulled };
}

/**
 * Background sync loop — called on app foreground and at configured intervals.
 */
let _intervalId: ReturnType<typeof setInterval> | null = null;

export function startBackgroundSync(): void {
  if (_intervalId) {
    return;
  }
  const ms = AppConfig.sync.backgroundIntervalMinutes * 60 * 1000;
  _intervalId = setInterval(() => {
    syncFull().catch(() => {});
  }, ms);
}

export function stopBackgroundSync(): void {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}
