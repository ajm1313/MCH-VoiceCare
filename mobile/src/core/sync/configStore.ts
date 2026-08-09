/**
 * Local configuration store — mobile offline (Appendix B, SYNC-004).
 *
 * Caches server-authoritative configuration values (TBD_GHS keys) locally
 * so the device can perform offline clinical threshold checks without
 * server connectivity.
 *
 * Values are stored in the content_cache table with a 48-hour TTL.
 * The offline engine and immunisation schedule engine read from this
 * store for configurable thresholds (e.g. DEFAULTER_GRACE_DAYS, FHR_LOW).
 */
import { AppConfig } from '../../config/appConfig';
import { useAuthStore } from '../auth/authStore';
import { getDb, query } from '../db/database';
import { setCachedJSON, getCachedJSON, CACHE_KEYS } from './contentCache';

export interface ConfigValue {
  key: string;
  value_string: string | null;
  value_number: number | null;
  value_json: unknown | null;
  is_tbd: boolean;
  effective_from: string | null;
  effective_to: string | null;
  facility_id: string | null;
}

export interface ConfigBootstrapResponse {
  clinical_ml_mode: string;
  feature_flags: Record<string, boolean>;
  sync: {
    batch_size: number;
    retry_max: number;
    retry_backoff_base_seconds: number;
  };
  referral: {
    ack_timeout_minutes: number;
    escalation_timeout_minutes: number;
  };
  scan_retention: {
    mode: string;
    temporary_retention_hours: number;
  };
  active_rule_bundle_version: string;
  ml_mode_is_rules_only: boolean;
  signing_keys: SigningKeyInfo[];
  clinical_thresholds: Record<string, number>;
}

export interface SigningKeyInfo {
  keyId: string;
  algorithm: string;
  publicKeyBase64: string;
}

export interface ConfigSyncResponse {
  values: ConfigValue[];
  synced_at: string;
}

type GetFn = (
  url: string,
  headers: Record<string, string>,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

let _getFn: GetFn | null = null;

export function setConfigGetFunction(fn: GetFn): void {
  _getFn = fn;
}

/**
 * Download all active configuration values from the server and cache locally.
 * Optionally pass a facility_id to get facility-scoped values.
 */
export async function syncConfigValues(facilityId?: string): Promise<boolean> {
  if (!_getFn) {
    return false;
  }

  const { token } = useAuthStore.getState();
  if (!token) {
    return false;
  }

  let url = `${AppConfig.apiBaseUrl}/config/bootstrap`;

  let resp: { ok: boolean; status: number; json: () => Promise<unknown> };
  try {
    resp = await _getFn(url, {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });
  } catch {
    return false;
  }

  if (!resp.ok) {
    return false;
  }

  const data = (await resp.json()) as ConfigBootstrapResponse;

  // Cache the bootstrap config with 48-hour TTL
  setCachedJSON('config_bootstrap', data, data.active_rule_bundle_version ?? '1', 48);

  // Cache signing keys separately for package verification (spec §4.2)
  setCachedJSON('signing_keys', data.signing_keys ?? [], data.active_rule_bundle_version ?? '1', 48);

  // Also build a compatibility map for getConfigValue lookups
  const configMap: Record<string, ConfigValue> = {};
  configMap['CLINICAL_ML_MODE'] = { key: 'CLINICAL_ML_MODE', value_string: data.clinical_ml_mode, value_number: null, value_json: null, is_tbd: false, effective_from: null, effective_to: null, facility_id: null };
  configMap['SYNC_BATCH_SIZE'] = { key: 'SYNC_BATCH_SIZE', value_string: null, value_number: data.sync.batch_size, value_json: null, is_tbd: false, effective_from: null, effective_to: null, facility_id: null };
  configMap['SYNC_RETRY_MAX'] = { key: 'SYNC_RETRY_MAX', value_string: null, value_number: data.sync.retry_max, value_json: null, is_tbd: false, effective_from: null, effective_to: null, facility_id: null };
  configMap['REFERRAL_ACK_TIMEOUT_MINUTES'] = { key: 'REFERRAL_ACK_TIMEOUT_MINUTES', value_string: null, value_number: data.referral.ack_timeout_minutes, value_json: null, is_tbd: false, effective_from: null, effective_to: null, facility_id: null };
  configMap['ACTIVE_RULE_BUNDLE_VERSION'] = { key: 'ACTIVE_RULE_BUNDLE_VERSION', value_string: data.active_rule_bundle_version, value_number: null, value_json: null, is_tbd: false, effective_from: null, effective_to: null, facility_id: null };
  for (const [flag, enabled] of Object.entries(data.feature_flags)) {
    configMap[`FEATURE_${flag.toUpperCase()}`] = { key: `FEATURE_${flag.toUpperCase()}`, value_string: String(enabled), value_number: enabled ? 1 : 0, value_json: null, is_tbd: false, effective_from: null, effective_to: null, facility_id: null };
  }
  // Inject clinical thresholds (spec §33) — each threshold key becomes a
  // config entry with value_number set, so getConfigNumber() can read it.
  if (data.clinical_thresholds) {
    for (const [thresholdKey, thresholdValue] of Object.entries(data.clinical_thresholds)) {
      configMap[thresholdKey] = {
        key: thresholdKey,
        value_string: null,
        value_number: thresholdValue,
        value_json: null,
        is_tbd: false,
        effective_from: null,
        effective_to: null,
        facility_id: null,
      };
    }
  }
  // OCR confidence thresholds (spec §33) — defaults if not in clinical_thresholds
  if (!configMap['OCR_CONFIDENCE_SAFETY_CRITICAL']) {
    configMap['OCR_CONFIDENCE_SAFETY_CRITICAL'] = { key: 'OCR_CONFIDENCE_SAFETY_CRITICAL', value_string: null, value_number: 0.85, value_json: null, is_tbd: false, effective_from: null, effective_to: null, facility_id: null };
  }
  if (!configMap['OCR_CONFIDENCE_NON_SAFETY']) {
    configMap['OCR_CONFIDENCE_NON_SAFETY'] = { key: 'OCR_CONFIDENCE_NON_SAFETY', value_string: null, value_number: 0.80, value_json: null, is_tbd: false, effective_from: null, effective_to: null, facility_id: null };
  }

  // Sync / retry / retention / auto-lock settings (spec §33) — defaults if not in clinical_thresholds
  if (!configMap['SYNC_INTERVAL_MINUTES']) {
    configMap['SYNC_INTERVAL_MINUTES'] = { key: 'SYNC_INTERVAL_MINUTES', value_string: null, value_number: 15, value_json: null, is_tbd: false, effective_from: null, effective_to: null, facility_id: null };
  }
  if (!configMap['SYNC_MAX_RETRY_ATTEMPTS']) {
    configMap['SYNC_MAX_RETRY_ATTEMPTS'] = { key: 'SYNC_MAX_RETRY_ATTEMPTS', value_string: null, value_number: 5, value_json: null, is_tbd: false, effective_from: null, effective_to: null, facility_id: null };
  }
  if (!configMap['SYNC_RETRY_BACKOFF_BASE_MS']) {
    configMap['SYNC_RETRY_BACKOFF_BASE_MS'] = { key: 'SYNC_RETRY_BACKOFF_BASE_MS', value_string: null, value_number: 2000, value_json: null, is_tbd: false, effective_from: null, effective_to: null, facility_id: null };
  }
  if (!configMap['SCAN_RETENTION_DAYS']) {
    configMap['SCAN_RETENTION_DAYS'] = { key: 'SCAN_RETENTION_DAYS', value_string: null, value_number: 30, value_json: null, is_tbd: false, effective_from: null, effective_to: null, facility_id: null };
  }
  if (!configMap['APP_AUTO_LOCK_TIMEOUT_SECONDS']) {
    configMap['APP_AUTO_LOCK_TIMEOUT_SECONDS'] = { key: 'APP_AUTO_LOCK_TIMEOUT_SECONDS', value_string: null, value_number: 300, value_json: null, is_tbd: false, effective_from: null, effective_to: null, facility_id: null };
  }

  setCachedJSON('config_values', configMap, data.active_rule_bundle_version ?? '1', 48);

  return true;
}

/**
 * Get a config value from the local cache.
 * Returns null if not cached or expired.
 */
export function getConfigValue(key: string): ConfigValue | null {
  const configMap = getCachedJSON<Record<string, ConfigValue>>('config_values');
  if (!configMap) return null;
  return configMap[key] ?? null;
}

/**
 * Get a numeric config value, with fallback default.
 */
export function getConfigNumber(key: string, defaultValue: number): number {
  const val = getConfigValue(key);
  if (!val || val.is_tbd || val.value_number == null) {
    return defaultValue;
  }
  return val.value_number;
}

/**
 * Get a string config value, with fallback default.
 */
export function getConfigString(key: string, defaultValue: string): string {
  const val = getConfigValue(key);
  if (!val || val.is_tbd || val.value_string == null) {
    return defaultValue;
  }
  return val.value_string;
}

/**
 * Get a JSON config value, with fallback default.
 */
export function getConfigJSON<T>(key: string, defaultValue: T): T {
  const val = getConfigValue(key);
  if (!val || val.is_tbd || val.value_json == null) {
    return defaultValue;
  }
  return val.value_json as T;
}

/**
 * Check if the local config store has been synced at least once.
 */
export function isConfigSynced(): boolean {
  return getCachedJSON<Record<string, ConfigValue>>('config_values') != null;
}

/**
 * Get cached signing keys for package verification (spec §4.2).
 */
export function getCachedSigningKeys(): SigningKeyInfo[] {
  return getCachedJSON<SigningKeyInfo[]>('signing_keys') ?? [];
}
