/**
 * Clinician override service — POST /api/v1/clinical/override/ (spec §3.1, §23).
 *
 * A clinician can confirm, escalate, de-escalate, or reject a system-generated
 * clinical decision. Emergency rules cannot be de-escalated (non-downgrade invariant).
 * All overrides are audit-logged with actor, timestamp, reason, prior recommendation,
 * and resulting action.
 */
import { AppConfig } from '../../config/appConfig';
import { useAuthStore } from '../auth/authStore';

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
}

export async function submitClinicianOverride(
  req: OverrideRequest,
): Promise<{ ok: boolean; data?: OverrideResponse; error?: string }> {
  const { token } = useAuthStore.getState();
  if (!token) {
    return { ok: false, error: 'Not authenticated' };
  }

  try {
    const resp = await fetch(`${AppConfig.apiBaseUrl}/clinical/override/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(req),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      return { ok: false, error: errData.detail ?? `HTTP ${resp.status}` };
    }

    const data = (await resp.json()) as OverrideResponse;
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}
