/**
 * Rule package validation — spec §4.2, §24, OFF-010.
 *
 * If the local rule package is expired or invalid, the system shall warn
 * the user and use the last approved package while blocking unsafe
 * unvalidated updates.
 *
 * Signature verification is performed at sync time (rulePackageSync.ts).
 * This module checks the post-sync status of the cached package.
 */
import { getCachedContent, getCacheVersion, isCacheStale, CACHE_KEYS } from '../sync/contentCache';

export interface RulePackageStatus {
  isValid: boolean;
  isExpired: boolean;
  isSignatureVerified: boolean;
  version: string | null;
  warning: string | null;
}

export function checkRulePackageStatus(): RulePackageStatus {
  const version = getCacheVersion(CACHE_KEYS.RULE_SET);
  const isExpired = isCacheStale(CACHE_KEYS.RULE_SET);
  const content = getCachedContent(CACHE_KEYS.RULE_SET);

  if (!content) {
    return {
      isValid: false,
      isExpired: true,
      isSignatureVerified: false,
      version: null,
      warning: 'No rule package cached. Connect to synchronise before making clinical assessments.',
    };
  }

  if (isExpired) {
    return {
      isValid: true,
      isExpired: true,
      isSignatureVerified: true,
      version,
      warning: `Rule package v${version} is expired. Using last approved version. Please synchronise when connectivity is available.`,
    };
  }

  return {
    isValid: true,
    isExpired: false,
    isSignatureVerified: true,
    version,
    warning: null,
  };
}

export function getRuleSetVersion(): string {
  const status = checkRulePackageStatus();
  return status.version ?? 'unknown';
}
