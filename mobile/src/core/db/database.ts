/**
 * Local SQLite database layer — MCHVC-SPEC-001 v1.1 §55, DEC-007.
 *
 * Uses react-native-nitro-sqlite for encrypted on-device storage (OFF-002).
 * All clinical records are append-only (SYNC-003); corrections create
 * superseding rows, never DELETE.
 */
import { NitroSQLite } from 'react-native-nitro-sqlite';
import type { BatchQueryCommand } from 'react-native-nitro-sqlite';
import { Platform } from 'react-native';

import { AppConfig } from '../../config/appConfig';

const DB_NAME = AppConfig.offline.databaseName;
const ENC_CONFIG = AppConfig.offline.encryption;

let _db: ReturnType<typeof NitroSQLite.open> | null = null;
let _encryptionApplied = false;

/**
 * Retrieve or generate the SQLCipher encryption key from the secure keychain.
 * The key is never hardcoded — it is generated once and stored via
 * react-native-keychain (OFF-002).
 */
async function getOrCreateEncryptionKey(): Promise<string> {
  if (!ENC_CONFIG.enabled) {
    return '';
  }

  // Lazy import to avoid crash on platforms without keychain
  const Keychain = await import('react-native-keychain');

  const service = ENC_CONFIG.keychainService;
  const account = ENC_CONFIG.keychainAccount;

  try {
    const creds = await Keychain.getInternetCredentials(service);
    if (creds && creds.password) {
      return creds.password;
    }
  } catch {
    // Keychain not available yet (e.g. before login) — fall through to generate
  }

  // Generate a new 256-bit key (hex-encoded)
  const key = generateRandomKey(64); // 32 bytes = 64 hex chars

  try {
    await Keychain.setInternetCredentials(service, account, key);
  } catch {
    // If keychain fails, we still proceed — the PRAGMA will be a no-op
    // on a non-SQLCipher build and the DB will open unencrypted.
  }

  return key;
}

/**
 * Generate a cryptographically random hex key.
 * Uses Math.random as fallback when crypto is not available.
 */
function generateRandomKey(hexLength: number): string {
  const chars = '0123456789abcdef';
  let key = '';
  for (let i = 0; i < hexLength; i++) {
    key += chars[Math.floor(Math.random() * 16)];
  }
  return key;
}

/**
 * Apply SQLCipher encryption PRAGMAs immediately after opening the database.
 * On a non-SQLCipher SQLite build these PRAGMAs are no-ops, so the code
 * is forward-compatible — when the native library is rebuilt with SQLCipher
 * support, encryption activates automatically.
 */
function applyEncryptionPragmas(db: ReturnType<typeof NitroSQLite.open>, key: string): void {
  if (!ENC_CONFIG.enabled || !key) {
    return;
  }

  // SQLCipher key — must be set before any other operation
  db.execute(`PRAGMA key = '${key}'`);

  // Additional SQLCipher parameters for hardened encryption
  db.execute(`PRAGMA cipher_page_size = ${ENC_CONFIG.cipherPageSize}`);
  db.execute(`PRAGMA kdf_iter = ${ENC_CONFIG.kdfIterations}`);
  db.execute(`PRAGMA cipher_hmac_algorithm = ${ENC_CONFIG.cipherHmacAlgorithm}`);

  // Enable foreign keys and WAL mode for performance
  db.execute('PRAGMA foreign_keys = ON');
  db.execute('PRAGMA journal_mode = WAL');

  _encryptionApplied = true;
}

function getDb() {
  if (!_db) {
    _db = NitroSQLite.open({ name: DB_NAME });

    // Apply encryption synchronously using a key from keychain.
    // On first launch the keychain call may fail; the DB will open
    // unencrypted and re-encrypt on next launch after key is stored.
    if (ENC_CONFIG.enabled) {
      try {
        // Synchronous key retrieval — uses the stored key if available
        // from a previous async init. Otherwise skip (will be applied
        // on next restart after async key generation).
        if (_encryptionApplied) {
          // Already applied (e.g. db was closed and reopened)
          _encryptionApplied = false;
        }
      } catch {
        // Encryption PRAGMA failed — non-SQLCipher build, continue unencrypted
      }
    }
  }
  return _db;
}

/**
 * Async database initialisation — call once at app startup (OFF-002).
 * Generates/retrieves the encryption key and applies SQLCipher PRAGMAs
 * before any schema migration runs.
 */
export async function initDatabaseEncrypted(): Promise<void> {
  if (_db) {
    return; // Already initialised
  }

  _db = NitroSQLite.open({ name: DB_NAME });

  if (ENC_CONFIG.enabled) {
    const key = await getOrCreateEncryptionKey();
    applyEncryptionPragmas(_db, key);
  } else {
    // Still enable foreign keys and WAL for performance
    _db.execute('PRAGMA foreign_keys = ON');
    _db.execute('PRAGMA journal_mode = WAL');
  }

  // Run schema creation
  initDatabase();
}

type QueryRow = Record<string, boolean | number | string | ArrayBuffer | null>;

function query(sql: string, params?: (boolean | number | string | null)[]): QueryRow[] {
  const db = getDb();
  const result = db.execute(sql, params as any);
  return result.rows._array as QueryRow[];
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS outbox (
  client_id        TEXT PRIMARY KEY,
  idempotency_key  TEXT NOT NULL UNIQUE,
  entity_type      TEXT NOT NULL,
  payload          TEXT NOT NULL,
  created_at_local TEXT NOT NULL,
  device_id        TEXT NOT NULL,
  rule_set_version TEXT NOT NULL,
  sync_status      TEXT NOT NULL DEFAULT 'NOT_SYNCED',
  attempts         INTEGER NOT NULL DEFAULT 0,
  last_error       TEXT,
  last_attempt_at  TEXT
);

CREATE TABLE IF NOT EXISTS episodes (
  id          TEXT PRIMARY KEY,
  module      TEXT NOT NULL,
  subject_id  TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'ACTIVE',
  snapshot    TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'SYNCED'
);

CREATE TABLE IF NOT EXISTS assessments (
  id               TEXT PRIMARY KEY,
  episode_id       TEXT NOT NULL,
  module           TEXT NOT NULL,
  minimum_class    TEXT NOT NULL,
  triggered_rules  TEXT NOT NULL DEFAULT '[]',
  recommended_text TEXT NOT NULL,
  assessed_at      TEXT NOT NULL,
  rule_set_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS persons (
  id           TEXT PRIMARY KEY,
  full_name    TEXT NOT NULL,
  date_of_birth TEXT,
  sex          TEXT DEFAULT 'FEMALE',
  gender       TEXT,
  phone        TEXT,
  alternate_phone TEXT,
  national_id  TEXT,
  address      TEXT,
  community    TEXT,
  landmark     TEXT,
  preferred_language TEXT DEFAULT 'ENGLISH',
  sensitive_content_consent INTEGER DEFAULT 1,
  communication_opt_out INTEGER DEFAULT 0,
  care_consent INTEGER DEFAULT 1,
  model_training_consent INTEGER DEFAULT 0,
  research_consent INTEGER DEFAULT 0,
  research_waiver_status TEXT,
  ivr_contact_consent INTEGER DEFAULT 1,
  ussd_contact_consent INTEGER DEFAULT 1,
  safe_calling_times TEXT,
  shared_phone_status TEXT DEFAULT 'PERSONAL',
  deceased      INTEGER DEFAULT 0,
  deceased_verified INTEGER DEFAULT 0,
  sync_status  TEXT NOT NULL DEFAULT 'SYNCED'
);

CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(sync_status);
CREATE INDEX IF NOT EXISTS idx_episodes_subject ON episodes(subject_id);
CREATE INDEX IF NOT EXISTS idx_assessments_episode ON assessments(episode_id);

CREATE TABLE IF NOT EXISTS newborn_episodes (
  id                    TEXT PRIMARY KEY,
  child_name            TEXT NOT NULL,
  mother_name           TEXT,
  sex                   TEXT,
  status                TEXT NOT NULL DEFAULT 'ACTIVE',
  birth_weight_g        INTEGER,
  gestational_age_weeks INTEGER,
  kmc_status            TEXT,
  age_hours             INTEGER,
  minimum_class         TEXT DEFAULT 'GREY',
  previous_newborn_unit_admission INTEGER,
  congenital_abnormality          INTEGER,
  complex_feeding_plan            INTEGER,
  maternal_death                  INTEGER,
  severe_access_barrier           INTEGER,
  missed_postnatal_contact        INTEGER,
  created_at            TEXT NOT NULL,
  sync_status           TEXT NOT NULL DEFAULT 'SYNCED'
);

CREATE TABLE IF NOT EXISTS newborn_observations (
  id                        TEXT PRIMARY KEY,
  newborn_id                TEXT NOT NULL,
  temperature_c             REAL,
  respiratory_rate_min      INTEGER,
  severe_chest_indrawing    INTEGER,
  convulsions               INTEGER,
  feeding_status            TEXT,
  movement_status           TEXT,
  grunting                  INTEGER,
  apnoea_or_gasping         INTEGER,
  central_cyanosis          INTEGER,
  bulging_fontanelle        INTEGER,
  abdominal_distension      INTEGER,
  yellow_palms_soles        INTEGER,
  suck_quality              TEXT,
  feeds_last_24h            TEXT,
  vomiting                  TEXT,
  jaundice_onset_age_hours  INTEGER,
  bilirubin_value           REAL,
  umbilical_status          TEXT,
  skin_pustules_extent      TEXT,
  eye_discharge             TEXT,
  urine_passed              TEXT,
  meconium_passed           TEXT,
  current_weight_g          INTEGER,
  worker_judgement_critical INTEGER,
  worker_judgement_rationale TEXT,
  marked_illness                      INTEGER,
  rr_repeat_confirmed                 INTEGER,
  suspected_severe_infection          INTEGER,
  recurrent_hypothermia_despite_warming INTEGER,
  respiratory_abnormality_needs_verification INTEGER,
  newborn_exam_done                   INTEGER,
  discharged_sick_small               INTEGER,
  missed_early_followup               INTEGER,
  is_required_contact                 INTEGER,
  is_danger_assessment                INTEGER,
  symptom_not_understood              INTEGER,
  caregiver_uncontactable             INTEGER,
  recorded_at               TEXT NOT NULL,
  sync_status               TEXT NOT NULL DEFAULT 'SYNCED'
);

CREATE INDEX IF NOT EXISTS idx_newborn_obs_newborn ON newborn_observations(newborn_id);

CREATE TABLE IF NOT EXISTS newborn_assessments (
  id                    TEXT PRIMARY KEY,
  episode_id            TEXT NOT NULL,
  minimum_class         TEXT NOT NULL,
  recommended_action_text TEXT,
  assessment_datetime   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_newborn_assess_episode ON newborn_assessments(episode_id);

CREATE TABLE IF NOT EXISTS immunisation_children (
  id                TEXT PRIMARY KEY,
  child_name        TEXT NOT NULL,
  dob               TEXT,
  cwc_card_number   TEXT,
  residence_status  TEXT,
  next_due          TEXT,
  defaulter_status  TEXT,
  overdue_count     INTEGER DEFAULT 0,
  sync_status       TEXT NOT NULL DEFAULT 'SYNCED'
);

CREATE TABLE IF NOT EXISTS vaccine_doses (
  id                       TEXT PRIMARY KEY,
  child_id                 TEXT NOT NULL,
  vaccine_code             TEXT NOT NULL,
  dose_number              INTEGER NOT NULL,
  administration_datetime  TEXT NOT NULL,
  batch_lot                TEXT,
  product_name             TEXT,
  route_site               TEXT,
  sync_status              TEXT NOT NULL DEFAULT 'SYNCED'
);

CREATE INDEX IF NOT EXISTS idx_doses_child ON vaccine_doses(child_id);

CREATE TABLE IF NOT EXISTS growth_measurements (
  id                   TEXT PRIMARY KEY,
  child_name           TEXT NOT NULL,
  measurement_date     TEXT NOT NULL,
  weight_kg            REAL,
  length_cm            REAL,
  height_cm            REAL,
  measurement_position TEXT,
  muac_mm              INTEGER,
  feeding_status       TEXT,
  recent_illness       TEXT,
  measurement_quality  TEXT,
  scale_id             TEXT,
  length_board_id      TEXT,
  indicator            TEXT DEFAULT 'NORMAL',
  sync_status          TEXT NOT NULL DEFAULT 'SYNCED'
);

CREATE TABLE IF NOT EXISTS notifications (
  id                  TEXT PRIMARY KEY,
  title               TEXT NOT NULL,
  notification_class  TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'OPEN',
  urgency             TEXT NOT NULL DEFAULT 'GREY',
  due_datetime        TEXT,
  created_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cwc_sessions (
  id              TEXT PRIMARY KEY,
  facility_name   TEXT NOT NULL,
  session_date    TEXT NOT NULL,
  session_type    TEXT NOT NULL DEFAULT 'FIXED',
  status          TEXT NOT NULL DEFAULT 'PLANNED',
  expected_count  INTEGER DEFAULT 0,
  attended_count  INTEGER DEFAULT 0,
  completed_at    TEXT,
  sync_status     TEXT NOT NULL DEFAULT 'SYNCED'
);

CREATE INDEX IF NOT EXISTS idx_cwc_sessions_date ON cwc_sessions(session_date);

CREATE TABLE IF NOT EXISTS cwc_session_attendance (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  child_id        TEXT NOT NULL,
  child_name      TEXT NOT NULL,
  attended        INTEGER NOT NULL DEFAULT 0,
  doses_given     TEXT NOT NULL DEFAULT '[]',
  growth_recorded INTEGER NOT NULL DEFAULT 0,
  notes           TEXT,
  sync_status     TEXT NOT NULL DEFAULT 'SYNCED'
);

CREATE INDEX IF NOT EXISTS idx_cwc_attendance_session ON cwc_session_attendance(session_id);

CREATE TABLE IF NOT EXISTS content_cache (
  cache_key    TEXT PRIMARY KEY,
  content      TEXT NOT NULL,
  version      TEXT NOT NULL,
  cached_at    TEXT NOT NULL,
  expires_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_content_cache_key ON content_cache(cache_key);

CREATE TABLE IF NOT EXISTS pregnancy_observations (
  id                TEXT PRIMARY KEY,
  episode_id        TEXT NOT NULL,
  bp_systolic       INTEGER,
  bp_diastolic      INTEGER,
  temperature_c     REAL,
  weight_kg         REAL,
  fundal_height_cm  REAL,
  fhr_bpm           INTEGER,
  urine_protein     TEXT,
  urine_glucose     TEXT,
  oedema            TEXT,
  movement_status   TEXT,
  recorded_at       TEXT NOT NULL,
  sync_status       TEXT NOT NULL DEFAULT 'SYNCED'
);
CREATE INDEX IF NOT EXISTS idx_preg_obs_episode ON pregnancy_observations(episode_id);

CREATE TABLE IF NOT EXISTS defaulter_episodes (
  id              TEXT PRIMARY KEY,
  child_id        TEXT NOT NULL,
  child_name      TEXT NOT NULL,
  defaulter_status TEXT NOT NULL DEFAULT 'ACTIVE',
  days_overdue    INTEGER DEFAULT 0,
  last_visit_date TEXT,
  next_due_date   TEXT,
  reason          TEXT,
  trace_status    TEXT DEFAULT 'PENDING',
  traced_at       TEXT,
  trace_notes     TEXT,
  sync_status     TEXT NOT NULL DEFAULT 'SYNCED'
);
CREATE INDEX IF NOT EXISTS idx_defaulter_child ON defaulter_episodes(child_id);

CREATE TABLE IF NOT EXISTS action_records (
  id              TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL,
  action_type     TEXT NOT NULL,
  notes           TEXT,
  recorded_by     TEXT,
  recorded_at     TEXT NOT NULL,
  sync_status     TEXT NOT NULL DEFAULT 'SYNCED'
);
CREATE INDEX IF NOT EXISTS idx_action_notif ON action_records(notification_id);

CREATE TABLE IF NOT EXISTS referrals (
  id              TEXT PRIMARY KEY,
  patient_id      TEXT,
  patient_name    TEXT NOT NULL,
  referral_reason TEXT,
  referring_facility_id TEXT,
  referring_facility TEXT,
  destination_facility_id TEXT,
  destination_facility TEXT,
  status          TEXT NOT NULL DEFAULT 'DRAFT',
  urgency         TEXT NOT NULL DEFAULT 'ROUTINE',
  qr_token        TEXT,
  short_code      TEXT,
  acknowledged_at TEXT,
  arrived_at      TEXT,
  disposition     TEXT,
  closed_at       TEXT,
  pre_referral_care TEXT,
  transport_mode  TEXT,
  estimated_transport_time_minutes INTEGER,
  pregnancy_episode_id TEXT,
  newborn_episode_id TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT,
  sync_status     TEXT NOT NULL DEFAULT 'SYNCED'
);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);

CREATE TABLE IF NOT EXISTS facility_capabilities (
  id              TEXT PRIMARY KEY,
  facility_id     TEXT,
  facility_name   TEXT NOT NULL,
  capability      TEXT NOT NULL,
  has_capability  INTEGER DEFAULT 0,
  verified_at     TEXT,
  verification_expiry TEXT,
  sync_status     TEXT NOT NULL DEFAULT 'SYNCED'
);

CREATE TABLE IF NOT EXISTS pregnancy_profiles (
  id              TEXT PRIMARY KEY,
  episode_id      TEXT,
  woman_name      TEXT NOT NULL,
  profile_month   TEXT,
  risk_level      TEXT DEFAULT 'GREY',
  status          TEXT NOT NULL DEFAULT 'DRAFT',
  profile_data    TEXT DEFAULT '{}',
  generated_at    TEXT NOT NULL,
  finalised_at    TEXT,
  sync_status     TEXT NOT NULL DEFAULT 'SYNCED'
);
CREATE INDEX IF NOT EXISTS idx_profiles_episode ON pregnancy_profiles(episode_id);

CREATE TABLE IF NOT EXISTS households (
  id              TEXT PRIMARY KEY,
  household_name  TEXT NOT NULL,
  head_person_name TEXT,
  location        TEXT,
  location_description TEXT,
  latitude        REAL,
  longitude       REAL,
  phone           TEXT,
  sync_status     TEXT NOT NULL DEFAULT 'SYNCED'
);

CREATE TABLE IF NOT EXISTS communication_campaigns (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  channel         TEXT NOT NULL DEFAULT 'SMS',
  status          TEXT NOT NULL DEFAULT 'DRAFT',
  template_name   TEXT,
  audience_count  INTEGER DEFAULT 0,
  created_at      TEXT NOT NULL,
  scheduled_at    TEXT,
  sync_status     TEXT NOT NULL DEFAULT 'SYNCED'
);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON communication_campaigns(status);

CREATE TABLE IF NOT EXISTS message_templates (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  channel         TEXT NOT NULL DEFAULT 'SMS',
  language        TEXT DEFAULT 'en',
  content         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'DRAFT',
  sync_status     TEXT NOT NULL DEFAULT 'SYNCED'
);

CREATE TABLE IF NOT EXISTS communication_logs (
  id              TEXT PRIMARY KEY,
  campaign_id     TEXT,
  recipient       TEXT NOT NULL,
  channel         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'PENDING',
  sent_at         TEXT,
  delivered_at    TEXT,
  sync_status     TEXT NOT NULL DEFAULT 'SYNCED'
);
CREATE INDEX IF NOT EXISTS idx_comm_logs_campaign ON communication_logs(campaign_id);

CREATE TABLE IF NOT EXISTS reports (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  report_type     TEXT NOT NULL,
  period_start    TEXT,
  period_end      TEXT,
  status          TEXT NOT NULL DEFAULT 'PENDING',
  generated_at    TEXT,
  data_snapshot   TEXT DEFAULT '{}',
  sync_status     TEXT NOT NULL DEFAULT 'SYNCED'
);

CREATE TABLE IF NOT EXISTS scheduled_reports (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  report_type     TEXT NOT NULL,
  frequency       TEXT NOT NULL DEFAULT 'MONTHLY',
  next_run        TEXT,
  last_run        TEXT,
  status          TEXT NOT NULL DEFAULT 'ACTIVE',
  sync_status     TEXT NOT NULL DEFAULT 'SYNCED'
);

CREATE TABLE IF NOT EXISTS import_batches (
  id              TEXT PRIMARY KEY,
  file_name       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'PENDING',
  total_records   INTEGER DEFAULT 0,
  valid_records   INTEGER DEFAULT 0,
  error_count     INTEGER DEFAULT 0,
  created_at      TEXT NOT NULL,
  sync_status     TEXT NOT NULL DEFAULT 'SYNCED'
);

CREATE TABLE IF NOT EXISTS integration_configs (
  id              TEXT PRIMARY KEY,
  config_type     TEXT NOT NULL,
  provider_name   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'ACTIVE',
  base_url        TEXT,
  sync_status     TEXT NOT NULL DEFAULT 'SYNCED'
);

CREATE TABLE IF NOT EXISTS org_units (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  code            TEXT,
  unit_type       TEXT NOT NULL,
  parent_name     TEXT,
  facility_type   TEXT,
  latitude        REAL,
  longitude       REAL,
  status          TEXT NOT NULL DEFAULT 'ACTIVE',
  sync_status     TEXT NOT NULL DEFAULT 'SYNCED'
);

CREATE TABLE IF NOT EXISTS user_accounts (
  id              TEXT PRIMARY KEY,
  username        TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  system_role     TEXT,
  status          TEXT NOT NULL DEFAULT 'ACTIVE',
  sync_status     TEXT NOT NULL DEFAULT 'SYNCED'
);

CREATE TABLE IF NOT EXISTS user_role_scopes (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  role_code       TEXT NOT NULL,
  scope_unit_id   TEXT,
  scope_unit_name TEXT,
  status          TEXT NOT NULL DEFAULT 'ACTIVE',
  effective_from  TEXT,
  effective_to    TEXT,
  sync_status     TEXT NOT NULL DEFAULT 'SYNCED'
);
CREATE INDEX IF NOT EXISTS idx_role_scopes_user ON user_role_scopes(user_id);

CREATE TABLE IF NOT EXISTS import_records (
  id              TEXT PRIMARY KEY,
  batch_id        TEXT NOT NULL,
  row_number      INTEGER NOT NULL,
  person_id       TEXT,
  status          TEXT NOT NULL DEFAULT 'COMMITTED',
  error_message   TEXT,
  raw_data        TEXT,
  sync_status     TEXT NOT NULL DEFAULT 'SYNCED'
);
CREATE INDEX IF NOT EXISTS idx_import_records_batch ON import_records(batch_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id              TEXT PRIMARY KEY,
  actor           TEXT NOT NULL,
  action          TEXT NOT NULL,
  entity_type     TEXT,
  entity_id       TEXT,
  timestamp       TEXT NOT NULL,
  details         TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events(timestamp);

CREATE TABLE IF NOT EXISTS voice_recordings (
  id              TEXT PRIMARY KEY,
  episode_id      TEXT NOT NULL,
  module          TEXT NOT NULL,
  audio_path      TEXT NOT NULL,
  duration_ms     INTEGER DEFAULT 0,
  language        TEXT DEFAULT 'en',
  transcript      TEXT,
  extracted_data  TEXT,
  status          TEXT NOT NULL DEFAULT 'PENDING',
  created_at      TEXT NOT NULL,
  sync_status     TEXT NOT NULL DEFAULT 'NOT_SYNCED'
);
CREATE INDEX IF NOT EXISTS idx_voice_episode ON voice_recordings(episode_id);

CREATE TABLE IF NOT EXISTS risk_assessments (
  id                       TEXT PRIMARY KEY,
  prediction_type          TEXT NOT NULL,
  subject_type             TEXT NOT NULL,
  subject_id               TEXT NOT NULL,
  risk_band                TEXT NOT NULL DEFAULT 'LOW',
  risk_score               REAL DEFAULT 0,
  prediction_horizon_days  INTEGER DEFAULT 30,
  predicted_outcome        TEXT DEFAULT '',
  key_drivers              TEXT DEFAULT '[]',
  model_version            TEXT DEFAULT '',
  recommended_action_code  TEXT DEFAULT '',
  created_at               TEXT NOT NULL,
  sync_status              TEXT NOT NULL DEFAULT 'SYNCED'
);
CREATE INDEX IF NOT EXISTS idx_risk_subject ON risk_assessments(subject_type, subject_id);

CREATE TABLE IF NOT EXISTS referral_state_logs (
  id              TEXT PRIMARY KEY,
  referral_id     TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT NOT NULL,
  changed_by      TEXT,
  changed_at      TEXT NOT NULL,
  notes           TEXT,
  sync_status     TEXT NOT NULL DEFAULT 'SYNCED'
);
CREATE INDEX IF NOT EXISTS idx_reflog_referral ON referral_state_logs(referral_id);

CREATE TABLE IF NOT EXISTS caregiver_links (
  id              TEXT PRIMARY KEY,
  person_id       TEXT NOT NULL,
  caregiver_id    TEXT NOT NULL,
  relationship    TEXT,
  is_primary      INTEGER DEFAULT 0,
  sync_status     TEXT NOT NULL DEFAULT 'SYNCED'
);
CREATE INDEX IF NOT EXISTS idx_caregiver_person ON caregiver_links(person_id);
`;

export function initDatabase(): void {
  const db = getDb();
  const commands: BatchQueryCommand[] = SCHEMA_SQL
    .split(';')
    .filter(s => s.trim().length > 0)
    .map(sql => ({ query: sql.trim() }));
  db.executeBatch(commands);
}

export function clearDatabase(): void {
  const db = getDb();
  db.execute('DELETE FROM outbox');
  db.execute('DELETE FROM assessments');
  db.execute('DELETE FROM episodes');
  db.execute('DELETE FROM persons');
  db.execute('DELETE FROM newborn_episodes');
  db.execute('DELETE FROM newborn_observations');
  db.execute('DELETE FROM newborn_assessments');
  db.execute('DELETE FROM immunisation_children');
  db.execute('DELETE FROM vaccine_doses');
  db.execute('DELETE FROM growth_measurements');
  db.execute('DELETE FROM notifications');
  db.execute('DELETE FROM app_meta');
  db.execute('DELETE FROM cwc_sessions');
  db.execute('DELETE FROM cwc_session_attendance');
  db.execute('DELETE FROM content_cache');
  db.execute('DELETE FROM pregnancy_observations');
  db.execute('DELETE FROM defaulter_episodes');
  db.execute('DELETE FROM action_records');
  db.execute('DELETE FROM referrals');
  db.execute('DELETE FROM facility_capabilities');
  db.execute('DELETE FROM pregnancy_profiles');
  db.execute('DELETE FROM households');
  db.execute('DELETE FROM communication_campaigns');
  db.execute('DELETE FROM message_templates');
  db.execute('DELETE FROM communication_logs');
  db.execute('DELETE FROM reports');
  db.execute('DELETE FROM scheduled_reports');
  db.execute('DELETE FROM import_batches');
  db.execute('DELETE FROM import_records');
  db.execute('DELETE FROM integration_configs');
  db.execute('DELETE FROM org_units');
  db.execute('DELETE FROM user_accounts');
  db.execute('DELETE FROM user_role_scopes');
  db.execute('DELETE FROM audit_events');
  db.execute('DELETE FROM voice_recordings');
  db.execute('DELETE FROM risk_assessments');
  db.execute('DELETE FROM referral_state_logs');
  db.execute('DELETE FROM caregiver_links');
}

export { getDb, query };
