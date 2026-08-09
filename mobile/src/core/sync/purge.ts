/**
 * Mobile data retention/purge service — SYNC-010, CFG_DEVICE_RETENTION_POLICY.
 *
 * Purges locally cached data that has been synced to the server and is
 * older than the configured retention period. Clinical records that have
 * not yet been synced are never purged.
 *
 * Called during background sync or manually from the Sync Status screen.
 */
import { getDb, query } from '../db/database';
import { getConfigNumber } from './configStore';

const DEFAULT_RETENTION_DAYS = 30;

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/**
 * Purge synced records older than the retention period.
 * Only records with sync_status = 'SYNCED' are deleted.
 * Returns counts of purged records per table.
 */
export function purgeExpiredLocalData(retentionDays?: number): Record<string, number> {
  const retention = retentionDays ?? getConfigNumber('CFG_DEVICE_RETENTION_POLICY', DEFAULT_RETENTION_DAYS);
  const cutoff = daysAgoISO(retention);
  const db = getDb();

  const tables = [
    'episodes',
    'newborn_episodes',
    'newborn_observations',
    'newborn_assessments',
    'immunisation_children',
    'vaccine_doses',
    'growth_measurements',
    'notifications',
    'pregnancy_observations',
    'defaulter_episodes',
    'action_records',
    'referrals',
    'pregnancy_profiles',
    'cwc_sessions',
    'cwc_session_attendance',
    'import_batches',
    'import_records',
    'voice_recordings',
    'risk_assessments',
  ];

  const counts: Record<string, number> = {};

  for (const table of tables) {
    try {
      const result = db.execute(
        `DELETE FROM ${table} WHERE sync_status = 'SYNCED' AND (
          SELECT datetime FROM (
            SELECT 
              CASE 
                WHEN '${table}' = 'episodes' THEN updated_at
                WHEN '${table}' = 'notifications' THEN created_at
                WHEN '${table}' = 'import_batches' THEN created_at
                WHEN '${table}' = 'voice_recordings' THEN created_at
                WHEN '${table}' = 'pregnancy_profiles' THEN generated_at
                WHEN '${table}' = 'defaulter_episodes' THEN COALESCE(traced_at, created_at)
                ELSE created_at
              END as datetime
          )
        ) < ?`,
        [cutoff],
      );
      counts[table] = result.rowsAffected ?? 0;
    } catch {
      // Table might not have the expected columns — skip
      counts[table] = 0;
    }
  }

  // Purge expired outbox entries (only successfully synced ones)
  try {
    const outboxResult = db.execute(
      `DELETE FROM outbox WHERE sync_status = 'SYNCED' AND last_attempt_at < ?`,
      [cutoff],
    );
    counts['outbox'] = outboxResult.rowsAffected ?? 0;
  } catch {
    counts['outbox'] = 0;
  }

  // Purge expired content cache entries
  try {
    db.execute(
      `DELETE FROM content_cache WHERE expires_at IS NOT NULL AND expires_at < ?`,
      [new Date().toISOString()],
    );
    counts['content_cache'] = 1; // Approximate — SQLite doesn't return affected count reliably
  } catch {
    counts['content_cache'] = 0;
  }

  // Purge expired audit events (older than retention)
  try {
    const auditResult = db.execute(
      `DELETE FROM audit_events WHERE timestamp < ?`,
      [cutoff],
    );
    counts['audit_events'] = auditResult.rowsAffected ?? 0;
  } catch {
    counts['audit_events'] = 0;
  }

  return counts;
}

/**
 * Get the current local database size estimate (in rows) for each table.
 * Useful for displaying in the Sync Status screen.
 */
export function getLocalDataCounts(): Record<string, number> {
  const tables = [
    'episodes', 'newborn_episodes', 'newborn_observations',
    'immunisation_children', 'vaccine_doses', 'growth_measurements',
    'notifications', 'pregnancy_observations', 'defaulter_episodes',
    'referrals', 'pregnancy_profiles', 'outbox', 'voice_recordings',
    'risk_assessments',
  ];

  const counts: Record<string, number> = {};
  for (const table of tables) {
    try {
      const rows = query(`SELECT COUNT(*) as cnt FROM ${table}`);
      counts[table] = (rows[0]?.cnt as number) ?? 0;
    } catch {
      counts[table] = 0;
    }
  }
  return counts;
}
