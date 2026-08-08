/**
 * Offline content cache — SYNC-004, MVP-005.
 *
 * Server-authoritative reference data (schedules, protocol rules, approved
 * messages, CWC manifests) are cached locally as signed/versioned packages.
 * The cache supports expiry and version checking.
 */
import { getDb, query } from '../db/database';

const DEFAULT_TTL_HOURS = 24;

export interface CacheEntry {
  cache_key: string;
  content: string;
  version: string;
  cached_at: string;
  expires_at: string | null;
}

export function getCachedContent(key: string): string | null {
  const rows = query(
    'SELECT content, expires_at FROM content_cache WHERE cache_key = ?',
    [key],
  );
  if (rows.length === 0) return null;

  const entry = rows[0];
  if (entry.expires_at) {
    const now = new Date().toISOString();
    if (now > String(entry.expires_at)) {
      return null;
    }
  }
  return String(entry.content);
}

export function getCachedJSON<T>(key: string): T | null {
  const raw = getCachedContent(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setCachedContent(
  key: string,
  content: string,
  version: string,
  ttlHours: number = DEFAULT_TTL_HOURS,
): void {
  const db = getDb();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000).toISOString();
  db.execute(
    `INSERT OR REPLACE INTO content_cache (cache_key, content, version, cached_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [key, content, version, now, expiresAt],
  );
}

export function setCachedJSON(
  key: string,
  data: unknown,
  version: string,
  ttlHours: number = DEFAULT_TTL_HOURS,
): void {
  setCachedContent(key, JSON.stringify(data), version, ttlHours);
}

export function getCacheVersion(key: string): string | null {
  const rows = query(
    'SELECT version FROM content_cache WHERE cache_key = ?',
    [key],
  );
  if (rows.length === 0) return null;
  return String(rows[0].version);
}

export function isCacheStale(key: string): boolean {
  const rows = query(
    'SELECT expires_at FROM content_cache WHERE cache_key = ?',
    [key],
  );
  if (rows.length === 0) return true;
  if (!rows[0].expires_at) return false;
  return new Date().toISOString() > String(rows[0].expires_at);
}

export function clearCache(key?: string): void {
  const db = getDb();
  if (key) {
    db.execute('DELETE FROM content_cache WHERE cache_key = ?', [key]);
  } else {
    db.execute('DELETE FROM content_cache');
  }
}

// Standard cache keys for server-authoritative reference data (SYNC-004)
export const CACHE_KEYS = {
  IMM_SCHEDULE: 'imm_schedule',
  CATCH_UP_RULESET: 'catch_up_ruleset',
  APPROVED_MESSAGES: 'approved_messages',
  CWC_MANIFEST: 'cwc_manifest',
  FACILITY_CAPABILITIES: 'facility_capabilities',
  RULE_SET: 'rule_set',
  LANGUAGE_PACK: 'language_pack',
  REFERRAL_DIRECTORY: 'referral_directory',
  DEVICE_CONFIG: 'device_config',
  DASHBOARD_AGGREGATE: 'dashboard_aggregate',
  WORKLIST: 'worklist',
} as const;
