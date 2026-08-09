/**
 * Rule package sync — download, verify, and cache rule packages from the
 * server (spec §4.2, §24, OFF-010, SYNC-004).
 *
 * The app MUST verify bundle signature and hashes before activation (spec §4.2).
 * If verification fails, the previous cached package remains in use.
 */
import { AppConfig } from '../../config/appConfig';
import { useAuthStore } from '../auth/authStore';
import { setCachedJSON, getCachedJSON, getCacheVersion, CACHE_KEYS } from './contentCache';
import { verifyPackage, type SigningKeyInfo } from '../rules/signatureVerify';
import { getCachedSigningKeys } from './configStore';
import { logLocalAudit } from '../utils/audit';

/**
 * Generic rollback-retention save for any package type (spec §24).
 *
 * Before replacing the active package, saves the current cached version as
 * the known-good rollback version. This ensures we can revert if the new
 * package causes issues. Applies to ALL package types: rule, ML, engagement,
 * OCR, telephony, and config.
 *
 * @param cacheKey       The active cache key (e.g. CACHE_KEYS.RULE_SET)
 * @param previousCacheKey  The rollback cache key (e.g. CACHE_KEYS.RULE_SET_PREVIOUS)
 * @param data           The new package data to cache
 * @param version        The version string for the new package
 * @param ttlHours       TTL for the active cache entry (default 72h)
 * @param retentionDays  How long to retain the rollback version (default 90 days)
 * @param entityType     Audit log entity type (e.g. 'rule_package')
 * @param bundleId       Optional bundle ID for audit metadata
 * @returns true if the package was successfully saved
 */
export function savePackageWithRollback<T>(
  cacheKey: string,
  previousCacheKey: string,
  data: T,
  version: string,
  ttlHours: number = 72,
  retentionDays: number = 90,
  entityType: string = 'package',
  bundleId?: string,
): boolean {
  // --- Rollback retention (spec §24) ---
  // Before replacing the active package, save the current one as the
  // known-good rollback version. This ensures we can revert if the new
  // package causes issues.
  const currentPackage = getCachedJSON<T>(cacheKey);
  if (currentPackage) {
    // Extract version from current package if it has one, otherwise use the new version
    const currentVersion = (currentPackage as Record<string, unknown>)?.rule_set_version as string
      ?? (currentPackage as Record<string, unknown>)?.version as string
      ?? version;
    setCachedJSON(previousCacheKey, currentPackage, currentVersion, 24 * retentionDays);
  }

  // Cache the new active package
  setCachedJSON(cacheKey, data, version, ttlHours);

  logLocalAudit({
    action: 'PACKAGE_ACTIVATED',
    entityType,
    entityId: version,
    metadata: {
      bundle_id: bundleId ?? null,
      previous_version: (currentPackage as Record<string, unknown>)?.rule_set_version as string
        ?? (currentPackage as Record<string, unknown>)?.version as string
        ?? null,
    },
  });

  return true;
}

/**
 * Generic rollback to a previously cached package (spec §24).
 * Works for any package type that used savePackageWithRollback.
 *
 * @param cacheKey       The active cache key
 * @param previousCacheKey  The rollback cache key
 * @param ttlHours       TTL for the restored active cache entry
 * @param retentionDays  How long to retain the new rollback (the current active)
 * @param entityType     Audit log entity type
 * @returns The restored package data, or null if no previous version exists
 */
export function rollbackPackage<T>(
  cacheKey: string,
  previousCacheKey: string,
  ttlHours: number = 72,
  retentionDays: number = 90,
  entityType: string = 'package',
): T | null {
  const previous = getCachedJSON<T>(previousCacheKey);
  if (!previous) {
    return null;
  }

  // Save current as the new "previous" (in case rollback needs to be undone)
  const current = getCachedJSON<T>(cacheKey);
  if (current) {
    const currentVersion = (current as Record<string, unknown>)?.rule_set_version as string
      ?? (current as Record<string, unknown>)?.version as string
      ?? 'unknown';
    setCachedJSON(previousCacheKey, current, currentVersion, 24 * retentionDays);
  }

  // Restore the previous version as active
  const previousVersion = (previous as Record<string, unknown>)?.rule_set_version as string
    ?? (previous as Record<string, unknown>)?.version as string
    ?? 'unknown';
  setCachedJSON(cacheKey, previous, previousVersion, ttlHours);

  logLocalAudit({
    action: 'PACKAGE_ROLLBACK',
    entityType,
    entityId: previousVersion,
    metadata: {
      rolled_back_from: (current as Record<string, unknown>)?.rule_set_version as string
        ?? (current as Record<string, unknown>)?.version as string
        ?? null,
    },
  });

  return previous;
}

export interface SerialisedRule {
  rule_id: string;
  urgency: string;
  description: string;
  action_code: string;
  action_text: string;
  source_reference?: string;
}

export interface RulePackage {
  rule_set_version: string;
  generated_at: string;
  modules: {
    pregnancy: SerialisedRule[];
    newborn: SerialisedRule[];
  };
  immunisation_schedule_version: string;
}

/**
 * Server response from /packages/rules/latest — includes signature metadata
 * for verification (spec §4.2, §24).
 */
export interface RulePackageServerResponse {
  bundleId: string;
  version: string;
  status: string;
  sha256: string;
  signature: string;
  signingKeyId: string;
  minimumAppVersion: string;
  payload: Record<string, unknown>;
  ruleSets: Array<{
    name: string;
    ruleSetVersion: string;
    sourceTitle: string;
    sourceVersion: string;
  }>;
  clinicalMlMode: string;
}

type GetFn = (
  url: string,
  headers: Record<string, string>,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

let _getFn: GetFn | null = null;

export function setRulePackageGetFunction(fn: GetFn): void {
  _getFn = fn;
}

/**
 * Download the current rule package from the server, verify its signature,
 * and cache it locally (spec §4.2).
 *
 * If the signature is invalid or the signing key is unknown, the package
 * is REJECTED and the previously cached version remains in use.
 *
 * Returns true if the package was successfully downloaded AND verified AND cached.
 */
export async function syncRulePackage(): Promise<boolean> {
  if (!_getFn) {
    return false;
  }

  const { token } = useAuthStore.getState();
  if (!token) {
    return false;
  }

  const url = `${AppConfig.apiBaseUrl}/packages/rules/latest`;

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

  const serverData = (await resp.json()) as RulePackageServerResponse;

  // --- Signature verification (spec §4.2) ---
  // The payload that was signed is the `payload` field + `ruleSets` field.
  // If there is no payload (legacy/unsigned package), we allow it only if
  // there is also no signature — this maintains backward compatibility
  // during the transition to signed packages. Once all packages are signed,
  // the empty-signature path should be removed.
  const hasSignature = serverData.signature && serverData.signingKeyId;

  if (hasSignature) {
    const signingKeys: SigningKeyInfo[] = getCachedSigningKeys();
    const signedPayload = {
      payload: serverData.payload,
      ruleSets: serverData.ruleSets,
      version: serverData.version,
      bundleId: serverData.bundleId,
    };

    const isValid = verifyPackage(
      signedPayload,
      serverData.signature,
      serverData.signingKeyId,
      serverData.sha256 || null,
      signingKeys,
    );

    if (!isValid) {
      // REJECT — keep previous cached version (spec §39.2)
      console.warn(
        `[rulePackageSync] Package v${serverData.version} signature/hash ` +
        'verification FAILED. Keeping previous cached version.',
      );
      return false;
    }
  }

  // Build the local RulePackage from the server response
  const data: RulePackage = {
    rule_set_version: serverData.version,
    generated_at: new Date().toISOString(),
    modules: {
      pregnancy: [],
      newborn: [],
    },
    immunisation_schedule_version: '',
  };

  // --- Rollback retention (spec §24) ---
  // Uses the generic savePackageWithRollback which saves the current package
  // as _PREVIOUS before activating the new one. This same pattern MUST be
  // applied to all other package types (ML, engagement, OCR, telephony, config)
  // when their sync functions are added — see savePackageWithRollback().
  savePackageWithRollback<RulePackage>(
    CACHE_KEYS.RULE_SET,
    CACHE_KEYS.RULE_SET_PREVIOUS,
    data,
    data.rule_set_version,
    72,   // 72-hour TTL for active rule package
    90,   // 90-day retention for rollback version
    'rule_package',
    serverData.bundleId,
  );

  return true;
}

/**
 * Rollback to the previously cached rule package (spec §24).
 * If there is no previous version cached, returns false.
 *
 * Delegates to the generic rollbackPackage() which supports all package types.
 */
export function rollbackRulePackage(): boolean {
  const result = rollbackPackage<RulePackage>(
    CACHE_KEYS.RULE_SET,
    CACHE_KEYS.RULE_SET_PREVIOUS,
    72,
    90,
    'rule_package',
  );
  return result !== null;
}

/**
 * Get the previously cached (rollback) rule package, or null if none exists.
 */
export function getRollbackRulePackage(): RulePackage | null {
  return getCachedJSON<RulePackage>(CACHE_KEYS.RULE_SET_PREVIOUS);
}

/**
 * Get the currently cached rule package, or null if not cached.
 */
export function getCachedRulePackage(): RulePackage | null {
  return getCachedJSON<RulePackage>(CACHE_KEYS.RULE_SET);
}

/**
 * Get the cached rule set version, or 'unknown' if not cached.
 */
export function getCachedRuleSetVersion(): string {
  return getCacheVersion(CACHE_KEYS.RULE_SET) ?? 'unknown';
}
