/**
 * Outbox queue — SYNC-001/SYNC-003/SYNC-008.
 *
 * Offline-created records are persisted to the outbox with a client-generated
 * UUID and idempotency key. The sync engine drains the queue in resumable
 * batches with exponential backoff retry.
 */
import { v4 as uuidv4 } from 'uuid';

import { getDb, query } from '../db/database';
import type { OfflineEnvelope, SyncStatus } from './types';

const TABLE = 'outbox';

export interface OutboxRecord extends OfflineEnvelope<unknown> {
  lastError?: string | null;
  lastAttemptAt?: string | null;
}

export interface EnqueueOptions {
  /** The UUID of the entity being synced (spec §19.2). */
  entityId?: string;
  /** Whether this is an UPSERT or DELETE (spec §19.2). Defaults to 'UPSERT'. */
  operation?: 'UPSERT' | 'DELETE';
  /** Incremental version counter for optimistic concurrency (spec §19.2). Defaults to 1. */
  localVersion?: number;
}

export function enqueue<TPayload>(
  entityType: string,
  payload: TPayload,
  deviceId: string,
  ruleSetVersion: string,
  options?: EnqueueOptions,
): string {
  const clientId = uuidv4();
  const idempotencyKey = `${clientId}:${Date.now()}`;
  const now = new Date().toISOString();

  const entityId = options?.entityId ?? null;
  const operation = options?.operation ?? 'UPSERT';
  const localVersion = options?.localVersion ?? 1;

  const db = getDb();
  if (!db) throw new Error('Database not available');
  db.execute(
    `INSERT INTO ${TABLE} (client_id, idempotency_key, entity_type, payload, created_at_local, device_id, rule_set_version, sync_status, attempts, entity_id, operation, local_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'NOT_SYNCED', 0, ?, ?, ?)`,
    [
      clientId,
      idempotencyKey,
      entityType,
      JSON.stringify(payload),
      now,
      deviceId,
      ruleSetVersion,
      entityId,
      operation,
      localVersion,
    ],
  );

  return clientId;
}

export function getPending(limit = 50): OutboxRecord[] {
  const rows = query(
    `SELECT * FROM ${TABLE} WHERE sync_status IN ('NOT_SYNCED', 'RETRY_PENDING') ORDER BY created_at_local LIMIT ?`,
    [limit],
  );
  return rows.map(rowToRecord);
}

export function updateStatus(
  clientId: string,
  status: SyncStatus,
  error?: string | null,
): void {
  const db = getDb();
  if (!db) return;
  const now = new Date().toISOString();

  if (status === 'RETRY_PENDING') {
    db.execute(
      `UPDATE ${TABLE} SET sync_status = ?, attempts = attempts + 1, last_error = ?, last_attempt_at = ? WHERE client_id = ?`,
      [status, error ?? null, now, clientId],
    );
  } else {
    db.execute(
      `UPDATE ${TABLE} SET sync_status = ?, last_error = ?, last_attempt_at = ? WHERE client_id = ?`,
      [status, error ?? null, now, clientId],
    );
  }
}

export function getQueueDepth(): number {
  const rows = query(
    `SELECT COUNT(*) as cnt FROM ${TABLE} WHERE sync_status IN ('NOT_SYNCED', 'RETRY_PENDING')`,
  );
  return (rows[0]?.cnt as number) ?? 0;
}

function rowToRecord(row: Record<string, unknown>): OutboxRecord {
  return {
    clientId: row.client_id as string,
    idempotencyKey: row.idempotency_key as string,
    entityType: row.entity_type as string,
    payload: JSON.parse(row.payload as string),
    createdAtLocal: row.created_at_local as string,
    deviceId: row.device_id as string,
    ruleSetVersion: row.rule_set_version as string,
    syncStatus: row.sync_status as SyncStatus,
    attempts: row.attempts as number,
    lastError: (row.last_error as string) ?? null,
    lastAttemptAt: (row.last_attempt_at as string) ?? null,
    entityId: (row.entity_id as string) ?? undefined,
    operation: (row.operation as 'UPSERT' | 'DELETE') ?? 'UPSERT',
    localVersion: (row.local_version as number) ?? 1,
  };
}
