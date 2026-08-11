/**
 * Clinician override service — POST /api/v1/clinical/override/ (spec §3.1, §23).
 *
 * A clinician can confirm, escalate, de-escalate, or reject a system-generated
 * clinical decision. Emergency rules cannot be de-escalated (non-downgrade invariant).
 * All overrides are audit-logged with actor, timestamp, reason, prior recommendation,
 * and resulting action.
 *
 * OFFLINE SUPPORT (spec §10.2 #14): When the network is unavailable, the override
 * is persisted to the local outbox and synced later via /sync/batch. The override
 * is also written to the local audit_events table immediately so it is visible
 * in the audit log even before sync.
 */
import { AppConfig } from '../../config/appConfig';
import { useAuthStore } from '../auth/authStore';
import { apiFetch } from '../security/secureFetch';
import { enqueue } from '../sync/outbox';
import { getDb } from '../db/database';
import { logLocalAudit } from '../utils/audit';
import { v4 as uuidv4 } from 'uuid';

export type OverrideAction = 'CONFIRM' | 'ESCALATE' | 'DEESCALATE' | 'REJECT';

export interface OverrideRequest {
  episode_type: 'PregnancyEpisode' | 'NewbornEpisode' | 'GrowthMeasurement';
  episode_id: string;
  prior_recommendation: string;
  resulting_action: OverrideAction;
  override_reason: string;
  new_urgency?: string;
  patient_id?: string;
}

export interface OverrideResponse {
  override_id: string;
  action: OverrideAction;
  description: string;
  recorded: boolean;
  audit_logged: boolean;
  pending_sync?: boolean;
}

const OVERRIDE_DESCRIPTIONS: Record<OverrideAction, string> = {
  CONFIRM: 'Clinician confirmed the system recommendation.',
  ESCALATE: 'Clinician escalated to higher urgency.',
  DEESCALATE: 'Clinician de-escalated to lower urgency.',
  REJECT: 'Clinician rejected the system recommendation.',
};

/**
 * Submit a clinician override. Attempts the direct API first; if the network
 * is unavailable, enqueues the override to the local outbox for later sync.
 * In both cases, a local audit event is written immediately.
 */
export async function submitClinicianOverride(
  req: OverrideRequest,
): Promise<{ ok: boolean; data?: OverrideResponse; error?: string }> {
  const { token } = useAuthStore.getState();
  if (!token) {
    return { ok: false, error: 'Not authenticated' };
  }

  // Generate an override ID upfront so we can use it locally and in the outbox
  const overrideId = uuidv4();

  // Write to local audit log immediately (works offline)
  logLocalAudit({
    action: 'CLINICIAN_OVERRIDE',
    entityType: req.episode_type,
    entityId: req.episode_id,
    metadata: {
      override_id: overrideId,
      prior_recommendation: req.prior_recommendation,
      resulting_action: req.resulting_action,
      override_reason: req.override_reason,
      patient_id: req.patient_id,
    },
  });

  // Try the direct API first
  try {
    const resp = await apiFetch(`${AppConfig.apiBaseUrl}/clinical/override/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(req),
    });

    if (resp.ok) {
      const data = (await resp.json()) as OverrideResponse;
      return { ok: true, data };
    }

    // Non-recoverable HTTP errors (validation, conflict) — don't retry
    if (resp.status >= 400 && resp.status < 500) {
      const errData = await resp.json().catch(() => ({}));
      return { ok: false, error: errData.detail ?? `HTTP ${resp.status}` };
    }
    // 5xx — fall through to offline enqueue
  } catch {
    // Network error — fall through to offline enqueue
  }

  // Network unavailable or server error — enqueue to outbox for later sync
  const { deviceId } = useAuthStore.getState();
  enqueue(
    'clinician_overrides',
    {
      ...req,
      override_id: overrideId,
      client_timestamp: new Date().toISOString(),
    },
    deviceId || 'unknown',
    'local',
    { entityId: overrideId },
  );

  return {
    ok: true,
    data: {
      override_id: overrideId,
      action: req.resulting_action,
      description: OVERRIDE_DESCRIPTIONS[req.resulting_action],
      recorded: true,
      audit_logged: true,
      pending_sync: true,
    },
  };
}
