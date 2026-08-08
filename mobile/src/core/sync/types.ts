/**
 * Offline synchronisation contracts — MCHVC-SPEC-001 v1.1 §55.
 */

/** SyncStatus closed enumeration (Appendix A). */
export type SyncStatus =
  | 'NOT_SYNCED'
  | 'SYNCING'
  | 'SYNCED'
  | 'CONFLICT'
  | 'REJECTED'
  | 'RETRY_PENDING';

/**
 * SYNC-001: every offline-created object carries a client-generated UUID and
 * an idempotency key.
 */
export interface OfflineEnvelope<TPayload> {
  clientId: string; // UUID v4 generated on device
  idempotencyKey: string;
  entityType: string;
  payload: TPayload;
  createdAtLocal: string; // ISO 8601 with original zone (PARSE-008)
  deviceId: string;
  ruleSetVersion: string; // OFF-003
  syncStatus: SyncStatus;
  attempts: number;
}

/** SYNC-002: per-record server acknowledgement. */
export interface SyncAck {
  clientId: string;
  serverVersion: number | null;
  status: 'ACCEPTED' | 'REJECTED' | 'CONFLICT';
  errors: Record<string, string[]>;
}
