/**
 * Feature flag helpers — spec §34.
 *
 * Reads feature flags from the locally cached config store so that
 * flag checks work offline. Flags are synced from the backend
 * SystemConfig via the config bootstrap endpoint.
 */
import { getConfigValue } from '../sync/configStore';

/**
 * Check if a feature flag is enabled (spec §34).
 * Returns false if the flag is not cached or is explicitly disabled.
 */
export function isFeatureEnabled(flag: string): boolean {
  const val = getConfigValue(`FEATURE_${flag.toUpperCase()}`);
  if (!val) return false;
  return val.value_number === 1 || val.value_string === 'true';
}

/**
 * speech_capture_enabled MUST be false in the first release (spec §34, §37).
 * The voice/LLM observation feature MUST NOT be accessible when this flag
 * is false.
 */
export function isSpeechCaptureEnabled(): boolean {
  return isFeatureEnabled('SPEECH_CAPTURE_ENABLED');
}

/**
 * OCR scanning feature flag (spec §34).
 * Defaults to true when config hasn't been synced yet, matching the
 * backend default (SystemConfig.ocr_enabled = True).
 */
export function isOcrEnabled(): boolean {
  const val = getConfigValue('FEATURE_OCR_ENABLED');
  if (!val) return true;
  return val.value_number === 1 || val.value_string === 'true';
}

/**
 * IVR/DTMF telephony feature flag (spec §34).
 */
export function isIvrDtmfEnabled(): boolean {
  return isFeatureEnabled('IVR_DTMF_ENABLED');
}

/**
 * USSD telephony feature flag (spec §34).
 */
export function isUssdEnabled(): boolean {
  return isFeatureEnabled('USSD_ENABLED');
}

/**
 * Print referral slip feature flag (spec §34).
 */
export function isPrintReferralSlipEnabled(): boolean {
  return isFeatureEnabled('PRINT_REFERRAL_SLIP_ENABLED');
}

/**
 * Remote emergency cascade feature flag (spec §34).
 */
export function isRemoteEmergencyCascadeEnabled(): boolean {
  return isFeatureEnabled('REMOTE_EMERGENCY_CASCADE_ENABLED');
}

/**
 * Engagement model feature flag (spec §34).
 */
export function isEngagementModelEnabled(): boolean {
  return isFeatureEnabled('ENGAGEMENT_MODEL_ENABLED');
}
