/**
 * Sync engine — MCHVC-SPEC-001 v1.1 §55, SYNC-001..SYNC-010.
 *
 * Drains the outbox in resumable batches. Each record is POSTed to the
 * versioned API with its idempotency key. On success the record is marked
 * SYNCED; on failure it is retried with exponential backoff (SYNC-008)
 * up to maxRetryAttempts, after which it is marked REJECTED.
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

let _postFn: PostFn | null = null;
let _isSyncing = false;
let _listeners: Array<(depth: number) => void> = [];
let _lastSyncAt: string | null = null;
let _lastSyncResult: { synced: number; failed: number; pulled: number } | null = null;

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

    for (const record of batch) {
      if (record.attempts >= AppConfig.sync.maxRetryAttempts) {
        updateStatus(record.clientId, 'REJECTED', 'Max retry attempts exceeded');
        failed++;
        continue;
      }

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
              failed++;
              continue;
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
        const resp = await _postFn(url, postBody, {
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
          synced++;
        } else if (resp.status === 409) {
          const ack = (await resp.json()) as SyncAck;
          updateStatus(record.clientId, 'CONFLICT', JSON.stringify(ack.errors));
          failed++;
        } else if (resp.status >= 400 && resp.status < 500) {
          const ack = (await resp.json()) as SyncAck;
          updateStatus(record.clientId, 'REJECTED', JSON.stringify(ack.errors));
          failed++;
        } else {
          const backoff =
            AppConfig.sync.retryBackoffBaseMs *
            Math.pow(2, record.attempts);
          updateStatus(record.clientId, 'RETRY_PENDING', `HTTP ${resp.status}`);
          failed++;
          await sleep(backoff);
        }
      } catch (err) {
        const backoff =
          AppConfig.sync.retryBackoffBaseMs * Math.pow(2, record.attempts);
        updateStatus(
          record.clientId,
          'RETRY_PENDING',
          err instanceof Error ? err.message : String(err),
        );
        failed++;
        await sleep(backoff);
      }
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
