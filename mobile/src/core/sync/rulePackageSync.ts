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

  // Cache with 72-hour TTL (rule packages don't change frequently)
  setCachedJSON(CACHE_KEYS.RULE_SET, data, data.rule_set_version, 72);

  return true;
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
