/**
 * Provenance helper — attaches spec §9 provenance fields to any
 * clinically relevant observation payload before it is enqueued to the
 * outbox or saved to the local database.
 *
 * Required fields (spec §9):
 *   capture_route        — MANUAL | OCR | IVR | USSD | SYNC
 *   source_page_or_prompt— screen name or prompt ID
 *   template_version     — OCR template version (null for manual)
 *   captured_at          — ISO 8601 timestamp
 *   captured_by          — username of the authenticated user
 *   ocr_confidence       — per-field confidence (null for manual)
 *   human_confirmed      — whether safety-critical fields were confirmed
 *   correction_of        — UUID of original observation if this is a correction
 *   correction_reason    — reason for correction
 *   device_id            — provisioned device identifier
 */
import { Platform } from 'react-native';
import { useAuthStore } from '../auth/authStore';
import { getCachedDeviceConfig } from '../auth/deviceProvision';

export type CaptureRoute = 'MANUAL' | 'OCR' | 'IVR' | 'USSD' | 'SYNC';

export interface ProvenanceFields {
  capture_route: CaptureRoute;
  source_page_or_prompt: string;
  template_version: string | null;
  captured_at: string;
  captured_by: string;
  ocr_confidence: Record<string, number> | null;
  human_confirmed: boolean;
  correction_of: string | null;
  correction_reason: string | null;
  device_id: string;
}

/**
 * Build provenance fields for an observation.
 *
 * @param sourcePage  The screen name where capture occurred (e.g. 'PregnancyObserveScreen')
 * @param captureRoute How the data was captured
 * @param options     Extra provenance options (OCR confidence, correction info)
 */
export function buildProvenance(
  sourcePage: string,
  captureRoute: CaptureRoute = 'MANUAL',
  options?: {
    templateVersion?: string | null;
    ocrConfidence?: Record<string, number> | null;
    humanConfirmed?: boolean;
    correctionOf?: string | null;
    correctionReason?: string | null;
  },
): ProvenanceFields {
  const { user } = useAuthStore.getState();
  const deviceConfig = getCachedDeviceConfig();

  return {
    capture_route: captureRoute,
    source_page_or_prompt: sourcePage,
    template_version: options?.templateVersion ?? null,
    captured_at: new Date().toISOString(),
    captured_by: user?.username ?? 'unknown',
    ocr_confidence: options?.ocrConfidence ?? null,
    human_confirmed: options?.humanConfirmed ?? (captureRoute === 'MANUAL'),
    correction_of: options?.correctionOf ?? null,
    correction_reason: options?.correctionReason ?? null,
    device_id: deviceConfig?.deviceId ?? `device-${Platform.OS}-local`,
  };
}

/**
 * Merge provenance fields into an observation payload.
 * This is the primary function screens should call before enqueueing.
 */
export function withProvenance<T extends Record<string, unknown>>(
  payload: T,
  sourcePage: string,
  captureRoute: CaptureRoute = 'MANUAL',
  options?: {
    templateVersion?: string | null;
    ocrConfidence?: Record<string, number> | null;
    humanConfirmed?: boolean;
    correctionOf?: string | null;
    correctionReason?: string | null;
  },
): T & ProvenanceFields {
  return {
    ...payload,
    ...buildProvenance(sourcePage, captureRoute, options),
  };
}
