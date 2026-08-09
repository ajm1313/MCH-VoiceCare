/**
 * Local audit logger — writes audit events to the on-device SQLite database
 * (spec §23). These events are synced to the server via the pull/push cycle.
 *
 * Audit events are append-only — no UPDATE or DELETE is ever issued on the
 * audit_events table except by the purge service (which only removes
 * SYNCED events past the retention window).
 */
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import { useAuthStore } from '../auth/authStore';
import { getCachedDeviceConfig } from '../auth/deviceProvision';

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'PATIENT_VIEW'
  | 'PATIENT_SEARCH'
  | 'RECORD_CREATE'
  | 'RECORD_UPDATE'
  | 'RECORD_CORRECTION'
  | 'OCR_EXTRACTION'
  | 'OCR_CORRECTION'
  | 'RULE_EVALUATION'
  | 'ML_INFERENCE'
  | 'CLINICIAN_OVERRIDE'
  | 'REFERRAL_CREATED'
  | 'REFERRAL_STATE_CHANGE'
  | 'PACKAGE_ACTIVATED'
  | 'PACKAGE_ROLLBACK';

export interface AuditEventInput {
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  patientId?: string | null;
  pregnancyEpisodeId?: string | null;
  referralEpisodeId?: string | null;
  facilityId?: string | null;
  purpose?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Write an audit event to the local database.
 * This is fire-and-forget — it should never throw or block the UI.
 */
export function logLocalAudit(input: AuditEventInput): void {
  try {
    const { user } = useAuthStore.getState();
    const deviceConfig = getCachedDeviceConfig();
    const db = getDb();

    db.execute(
      `INSERT OR REPLACE INTO audit_events (
        id, actor, actor_role, action, entity_type, entity_id,
        patient_id, pregnancy_episode_id, referral_episode_id,
        device_id, facility_id, timestamp, purpose, details
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        user?.username ?? 'unknown',
        user?.systemRole ?? '',
        input.action,
        input.entityType ?? '',
        input.entityId ?? '',
        input.patientId ?? null,
        input.pregnancyEpisodeId ?? null,
        input.referralEpisodeId ?? null,
        deviceConfig?.deviceId ?? 'local-device',
        input.facilityId ?? user?.organisationUnitId ?? null,
        new Date().toISOString(),
        input.purpose ?? 'DIRECT_CARE',
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  } catch {
    // Audit logging must never block clinical workflow
  }
}
