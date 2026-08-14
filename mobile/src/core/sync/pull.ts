/**
 * Sync pull service — server → device download (SYNC-006).
 *
 * Fetches assigned episodes, observations, and reference data from the
 * backend and upserts them into the local SQLite database. This complements
 * the outbox push (engine.ts) which drains device → server.
 *
 * The pull is incremental: it sends the last-sync timestamp so the server
 * can return only records modified since then.
 */
import { AppConfig } from '../../config/appConfig';
import { getDb, query } from '../db/database';
import { useAuthStore } from '../auth/authStore';

type GetFn = (
  url: string,
  headers: Record<string, string>,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

let _getFn: GetFn | null = null;

export function setGetFunction(fn: GetFn): void {
  _getFn = fn;
}

interface PullResponse {
  synced_at: string;
  records: Record<string, Record<string, unknown>[]>;
}

const LAST_SYNC_KEY = 'last_sync_at';

function getLastSync(): string {
  const rows = query(
    'SELECT value FROM app_meta WHERE key = ?',
    [LAST_SYNC_KEY],
  );
  return (rows[0]?.value as string) ?? '1970-01-01T00:00:00Z';
}

function setLastSync(timestamp: string): void {
  const db = getDb();
  if (!db) return;
  db.execute(
    `INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)`,
    [LAST_SYNC_KEY, timestamp],
  );
}

export async function pullOnce(
  since?: string,
): Promise<{ pulled: number }> {
  if (!_getFn) {
    return { pulled: 0 };
  }

  const { token } = useAuthStore.getState();
  if (!token) {
    return { pulled: 0 };
  }

  const lastSync = since ?? getLastSync();

  const url = new URL(`${AppConfig.apiBaseUrl}/sync/`);
  url.searchParams.set('since', lastSync);

  let resp: { ok: boolean; status: number; json: () => Promise<unknown> };
  try {
    resp = await _getFn(url.toString(), {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });
  } catch {
    return { pulled: 0 };
  }

  if (!resp.ok) {
    return { pulled: 0 };
  }

  const data = (await resp.json()) as PullResponse;
  let pulled = 0;

  for (const [entityType, records] of Object.entries(data.records)) {
    upsertRecords(entityType, records);
    pulled += records.length;
  }

  if (data.synced_at) {
    setLastSync(data.synced_at);
  }

  return { pulled };
}

function upsertRecords(
  entityType: string,
  records: Record<string, unknown>[],
): void {
  const db = getDb();
  if (!db) return;

  for (const record of records) {
    const id = record.id as string;
    if (!id) continue;

    if (entityType === 'pregnancy_episodes') {
      upsertEpisode(record);
    } else if (entityType === 'newborn_episodes') {
      upsertNewbornEpisode(record);
    } else if (entityType === 'immunisation_records') {
      upsertImmunisationChild(record);
    } else if (entityType === 'growth_measurements') {
      upsertGrowthMeasurement(record);
    } else if (entityType === 'referrals') {
      upsertReferral(record);
    } else if (entityType === 'persons') {
      upsertPerson(record);
    } else if (entityType === 'vaccine_doses') {
      upsertVaccineDose(record);
    } else if (entityType === 'pregnancy_observations') {
      upsertPregnancyObservation(record);
    } else if (entityType === 'newborn_observations') {
      upsertNewbornObservation(record);
    } else if (entityType === 'defaulter_episodes') {
      upsertDefaulter(record);
    } else if (entityType === 'cwc_sessions') {
      upsertCWCSession(record);
    } else if (entityType === 'cwc_attendance') {
      upsertCWCAttendance(record);
    } else if (entityType === 'import_records') {
      upsertImportRecord(record);
    } else if (entityType === 'import_batches') {
      upsertImportBatch(record);
    } else if (entityType === 'audit_events') {
      upsertAuditEvent(record);
    } else if (entityType === 'notifications') {
      upsertNotification(record);
    } else if (entityType === 'action_records') {
      upsertActionRecord(record);
    } else if (entityType === 'risk_assessments') {
      upsertRiskAssessment(record);
    } else if (entityType === 'pregnancy_assessments') {
      upsertPregnancyAssessment(record);
    } else if (entityType === 'newborn_assessments') {
      upsertNewbornAssessment(record);
    } else if (entityType === 'referral_state_logs') {
      upsertReferralStateLog(record);
    } else if (entityType === 'caregiver_links') {
      upsertCaregiverLink(record);
    }
  }
}

function upsertEpisode(record: Record<string, unknown>): void {
  const db = getDb();
  if (!db) return;
  db.execute(
    `INSERT OR REPLACE INTO episodes (id, module, subject_id, status, snapshot, updated_at, sync_status)
     VALUES (?, 'pregnancy', ?, ?, ?, ?, 'SYNCED')`,
    [
      record.id as string,
      record.woman_id as string ?? '',
      (record.status as string) ?? 'ACTIVE',
      JSON.stringify(record),
      (record.updated_at as string) ?? new Date().toISOString(),
    ],
  );
}

function upsertNewbornEpisode(record: Record<string, unknown>): void {
  const db = getDb();
  if (!db) return;
  db.execute(
    `INSERT OR REPLACE INTO newborn_episodes
     (id, child_name, mother_name, sex, status, birth_weight_g, gestational_age_weeks, kmc_status, age_hours, minimum_class, created_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')`,
    [
      record.id as string,
      (record.child_name as string) ?? '',
      (record.mother_name as string) ?? null,
      (record.sex as string) ?? null,
      (record.status as string) ?? 'ACTIVE',
      (record.birth_weight_g as number) ?? null,
      (record.gestational_age_weeks as number) ?? null,
      (record.kmc_status as string) ?? null,
      (record.age_hours as number) ?? null,
      (record.minimum_class as string) ?? 'GREY',
      (record.created_at as string) ?? new Date().toISOString(),
    ],
  );
}

function upsertImmunisationChild(record: Record<string, unknown>): void {
  const db = getDb();
  if (!db) return;
  db.execute(
    `INSERT OR REPLACE INTO immunisation_children
     (id, child_name, dob, cwc_card_number, residence_status, next_due, defaulter_status, overdue_count, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')`,
    [
      record.id as string,
      (record.child_name as string) ?? '',
      (record.dob as string) ?? null,
      (record.cwc_card_number as string) ?? null,
      (record.residence_status as string) ?? null,
      (record.next_due as string) ?? null,
      (record.defaulter_status as string) ?? null,
      (record.overdue_count as number) ?? 0,
    ],
  );
}

function upsertGrowthMeasurement(record: Record<string, unknown>): void {
  const db = getDb();
  if (!db) return;
  db.execute(
    `INSERT OR REPLACE INTO growth_measurements
     (id, child_name, measurement_date, weight_kg, length_cm, muac_mm, indicator, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'SYNCED')`,
    [
      record.id as string,
      (record.child_name as string) ?? '',
      (record.measurement_date as string) ?? new Date().toISOString(),
      (record.weight_kg as number) ?? null,
      (record.length_cm as number) ?? null,
      (record.muac_mm as number) ?? null,
      (record.indicator as string) ?? 'NORMAL',
    ],
  );
}

function upsertNotification(record: Record<string, unknown>): void {
  const db = getDb();
  if (!db) return;
  db.execute(
    `INSERT OR REPLACE INTO notifications
     (id, title, notification_class, status, urgency, due_datetime, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id as string,
      (record.title as string) ?? '',
      (record.notification_class as string) ?? '',
      (record.status as string) ?? 'OPEN',
      (record.urgency as string) ?? 'GREY',
      (record.due_datetime as string) ?? null,
      (record.created_at as string) ?? new Date().toISOString(),
    ],
  );
}

function upsertCWCSession(record: Record<string, unknown>): void {
  const db = getDb();
  if (!db) return;
  db.execute(
    `INSERT OR REPLACE INTO cwc_sessions
     (id, facility_name, session_date, session_type, status, expected_count, attended_count, completed_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')`,
    [
      record.id as string,
      (record.facility_name as string) ?? '',
      (record.session_date as string) ?? new Date().toISOString(),
      (record.session_type as string) ?? 'FIXED',
      (record.status as string) ?? 'PLANNED',
      (record.expected_count as number) ?? 0,
      (record.attended_count as number) ?? 0,
      (record.completed_at as string) ?? null,
    ],
  );
}

function upsertReferral(record: Record<string, unknown>): void {
  const db = getDb();
  if (!db) return;
  const patientId = (record.patient_id as string) ?? (record.patient as string) ?? null;
  const patientName = (record.patient_name as string) ?? '';
  const refFacilityId = (record.referring_facility_id as string) ?? (record.referring_facility as string) ?? null;
  const destFacilityId = (record.destination_facility_id as string) ?? (record.destination_facility as string) ?? null;
  db.execute(
    `INSERT OR REPLACE INTO referrals
     (id, patient_id, patient_name, referral_reason,
      referring_facility_id, referring_facility,
      destination_facility_id, destination_facility,
      status, urgency, qr_token, short_code,
      acknowledged_at, arrived_at, disposition, closed_at, pre_referral_care,
      created_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')`,
    [
      record.id as string,
      patientId,
      patientName,
      (record.referral_reason as string) ?? null,
      refFacilityId,
      (record.referring_facility_name as string) ?? null,
      destFacilityId,
      (record.destination_facility_name as string) ?? null,
      (record.status as string) ?? 'DRAFT',
      (record.urgency as string) ?? 'ROUTINE',
      (record.qr_token as string) ?? null,
      (record.short_code as string) ?? null,
      (record.acknowledged_at as string) ?? null,
      (record.arrived_at as string) ?? null,
      (record.disposition as string) ?? null,
      (record.closed_at as string) ?? null,
      (record.pre_referral_care as string) ?? null,
      (record.created_at as string) ?? new Date().toISOString(),
      (record.updated_at as string) ?? null,
    ],
  );
}

function upsertPerson(record: Record<string, unknown>): void {
  const db = getDb();
  if (!db) return;
  db.execute(
    `INSERT OR REPLACE INTO persons (id, full_name, date_of_birth, gender, phone, preferred_language, sensitive_content_consent, communication_opt_out, national_id, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')`,
    [
      record.id as string,
      (record.full_name as string) ?? '',
      (record.date_of_birth as string) ?? null,
      (record.sex as string) ?? (record.gender as string) ?? null,
      (record.phone as string) ?? null,
      (record.preferred_language as string) ?? 'en',
      (record.sensitive_content_consent as number) ?? 1,
      (record.communication_opt_out as number) ?? 0,
      (record.national_id as string) ?? null,
    ],
  );
}

function upsertRiskAssessment(record: Record<string, unknown>): void {
  const db = getDb();
  if (!db) return;
  db.execute(
    `INSERT OR REPLACE INTO risk_assessments
     (id, prediction_type, subject_type, subject_id, risk_band, risk_score,
      prediction_horizon_days, predicted_outcome, key_drivers, model_version,
      recommended_action_code, created_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')`,
    [
      record.id as string,
      (record.prediction_type as string) ?? '',
      (record.subject_type as string) ?? '',
      (record.subject_id as string) ?? '',
      (record.risk_band as string) ?? 'LOW',
      (record.risk_score as number) ?? 0,
      (record.prediction_horizon_days as number) ?? 30,
      (record.predicted_outcome as string) ?? '',
      JSON.stringify(record.key_drivers ?? []),
      (record.model_version as string) ?? '',
      (record.recommended_action_code as string) ?? '',
      (record.created_at as string) ?? new Date().toISOString(),
    ],
  );
}

function upsertDefaulter(record: Record<string, unknown>): void {
  const db = getDb();
  if (!db) return;
  db.execute(
    `INSERT OR REPLACE INTO defaulter_episodes
     (id, child_id, child_name, defaulter_status, days_overdue, last_visit_date, next_due_date, reason, trace_status, traced_at, trace_notes, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')`,
    [
      record.id as string,
      (record.child_id as string) ?? '',
      (record.child_name as string) ?? '',
      (record.defaulter_status as string) ?? 'ACTIVE',
      (record.days_overdue as number) ?? 0,
      (record.last_visit_date as string) ?? null,
      (record.next_due_date as string) ?? null,
      (record.reason as string) ?? null,
      (record.trace_status as string) ?? 'PENDING',
      (record.traced_at as string) ?? null,
      (record.trace_notes as string) ?? null,
    ],
  );
}

function upsertImportRecord(record: Record<string, unknown>): void {
  const db = getDb();
  if (!db) return;
  db.execute(
    `INSERT OR REPLACE INTO import_records
     (id, batch_id, row_number, person_id, status, error_message, raw_data, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'SYNCED')`,
    [
      record.id as string,
      (record.batch_id as string) ?? (record.batch as string) ?? '',
      (record.row_number as number) ?? 0,
      (record.person_id as string) ?? (record.person as string) ?? null,
      (record.status as string) ?? 'COMMITTED',
      (record.error_message as string) ?? null,
      record.raw_data ? JSON.stringify(record.raw_data) : null,
    ],
  );
}

function upsertVaccineDose(record: Record<string, unknown>): void {
  const db = getDb();
  if (!db) return;
  db.execute(
    `INSERT OR REPLACE INTO vaccine_doses
     (id, child_id, vaccine_code, dose_number, administration_datetime, batch_lot, product_name, route_site, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')`,
    [
      record.id as string,
      (record.child_record_id as string) ?? (record.child_id as string) ?? '',
      (record.vaccine_code as string) ?? '',
      (record.dose_number as number) ?? 0,
      (record.administration_datetime as string) ?? new Date().toISOString(),
      (record.batch_lot as string) ?? null,
      (record.product_name as string) ?? null,
      (record.route_site as string) ?? null,
    ],
  );
}

function upsertPregnancyObservation(record: Record<string, unknown>): void {
  const db = getDb();
  if (!db) return;
  db.execute(
    `INSERT OR REPLACE INTO episodes (id, module, subject_id, status, snapshot, updated_at, sync_status)
     VALUES (?, 'pregnancy_observation', ?, 'OBSERVED', ?, ?, 'SYNCED')`,
    [
      record.id as string,
      (record.episode_id as string) ?? '',
      JSON.stringify(record),
      (record.updated_at as string) ?? new Date().toISOString(),
    ],
  );
}

function upsertNewbornObservation(record: Record<string, unknown>): void {
  const db = getDb();
  if (!db) return;
  db.execute(
    `INSERT OR REPLACE INTO newborn_observations
     (id, newborn_id, temperature_c, respiratory_rate_min, severe_chest_indrawing, convulsions,
      feeding_status, movement_status, grunting, apnoea_or_gasping, central_cyanosis,
      bulging_fontanelle, abdominal_distension, yellow_palms_soles, suck_quality, feeds_last_24h,
      vomiting, jaundice_onset_age_hours, bilirubin_value, umbilical_status, skin_pustules_extent,
      eye_discharge, urine_passed, meconium_passed, current_weight_g, worker_judgement_critical,
      worker_judgement_rationale, recorded_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')`,
    [
      record.id as string,
      (record.newborn_id as string) ?? (record.newborn as string) ?? '',
      (record.temperature_c as number) ?? null,
      (record.respiratory_rate_min as number) ?? null,
      (record.severe_chest_indrawing as number) ?? 0,
      (record.convulsions as number) ?? 0,
      (record.feeding_status as string) ?? null,
      (record.movement_status as string) ?? null,
      (record.grunting as number) ?? 0,
      (record.apnoea_or_gasping as number) ?? 0,
      (record.central_cyanosis as number) ?? 0,
      (record.bulging_fontanelle as number) ?? 0,
      (record.abdominal_distension as number) ?? 0,
      (record.yellow_palms_soles as number) ?? 0,
      (record.suck_quality as string) ?? null,
      (record.feeds_last_24h as string) ?? null,
      (record.vomiting as string) ?? null,
      (record.jaundice_onset_age_hours as number) ?? null,
      (record.bilirubin_value as number) ?? null,
      (record.umbilical_status as string) ?? null,
      (record.skin_pustules_extent as string) ?? null,
      (record.eye_discharge as string) ?? null,
      (record.urine_passed as string) ?? null,
      (record.meconium_passed as string) ?? null,
      (record.current_weight_g as number) ?? null,
      (record.worker_judgement_critical as number) ?? 0,
      (record.worker_judgement_rationale as string) ?? null,
      (record.recorded_at as string) ?? new Date().toISOString(),
    ],
  );
}

function upsertImportBatch(record: Record<string, unknown>): void {
  const db = getDb();
  if (!db) return;
  db.execute(
    `INSERT OR REPLACE INTO import_batches
     (id, file_name, status, total_records, committed_records, error_records, created_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'SYNCED')`,
    [
      record.id as string,
      (record.file_name as string) ?? '',
      (record.status as string) ?? 'PENDING',
      (record.total_records as number) ?? 0,
      (record.committed_records as number) ?? 0,
      (record.error_records as number) ?? 0,
      (record.created_at as string) ?? new Date().toISOString(),
    ],
  );
}

function upsertCWCAttendance(record: Record<string, unknown>): void {
  const db = getDb();
  if (!db) return;
  db.execute(
    `INSERT OR REPLACE INTO cwc_session_attendance
     (id, session_id, child_id, child_name, attended, weight_kg, muac_mm, notes, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')`,
    [
      record.id as string,
      (record.session_id as string) ?? (record.session as string) ?? '',
      (record.child_id as string) ?? (record.child as string) ?? '',
      (record.child_name as string) ?? '',
      (record.attended as number) ?? 0,
      (record.weight_kg as number) ?? null,
      (record.muac_mm as number) ?? null,
      (record.notes as string) ?? null,
    ],
  );
}

function upsertAuditEvent(record: Record<string, unknown>): void {
  const db = getDb();
  if (!db) return;
  db.execute(
    `INSERT OR REPLACE INTO audit_events
     (id, actor, action, entity_type, entity_id, purpose, occurred_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'SYNCED')`,
    [
      record.id as string,
      (record.actor as string) ?? '',
      (record.action as string) ?? '',
      (record.entity_type as string) ?? null,
      (record.entity_id as string) ?? null,
      (record.purpose as string) ?? null,
      (record.occurred_at as string) ?? new Date().toISOString(),
    ],
  );
}

function upsertActionRecord(record: Record<string, unknown>): void {
  const db = getDb();
  if (!db) return;
  db.execute(
    `INSERT OR REPLACE INTO action_records
     (id, notification_id, action_type, notes, sync_status)
     VALUES (?, ?, ?, ?, 'SYNCED')`,
    [
      record.id as string,
      (record.notification_id as string) ?? (record.notification as string) ?? '',
      (record.action_type as string) ?? '',
      (record.notes as string) ?? null,
    ],
  );
}

function upsertPregnancyAssessment(record: Record<string, unknown>): void {
  const db = getDb();
  if (!db) return;
  db.execute(
    `INSERT OR REPLACE INTO assessments
     (id, module, episode_id, disposition, fired_rules, recommended_action, assessed_at, sync_status)
     VALUES (?, 'pregnancy', ?, ?, ?, ?, ?, 'SYNCED')`,
    [
      record.id as string,
      (record.episode_id as string) ?? (record.episode as string) ?? '',
      (record.disposition as string) ?? 'GREEN',
      JSON.stringify(record.fired_rules ?? []),
      (record.recommended_action as string) ?? null,
      (record.assessed_at as string) ?? new Date().toISOString(),
    ],
  );
}

function upsertNewbornAssessment(record: Record<string, unknown>): void {
  const db = getDb();
  if (!db) return;
  db.execute(
    `INSERT OR REPLACE INTO newborn_assessments
     (id, episode_id, disposition, fired_rules, recommended_action, assessed_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, 'SYNCED')`,
    [
      record.id as string,
      (record.episode_id as string) ?? (record.episode as string) ?? '',
      (record.disposition as string) ?? 'GREEN',
      JSON.stringify(record.fired_rules ?? []),
      (record.recommended_action as string) ?? null,
      (record.assessed_at as string) ?? new Date().toISOString(),
    ],
  );
}

function upsertReferralStateLog(record: Record<string, unknown>): void {
  const db = getDb();
  if (!db) return;
  db.execute(
    `INSERT OR REPLACE INTO referral_state_logs
     (id, referral_id, from_status, to_status, changed_by, changed_at, notes, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'SYNCED')`,
    [
      record.id as string,
      (record.referral_id as string) ?? (record.referral as string) ?? '',
      (record.from_status as string) ?? null,
      (record.to_status as string) ?? '',
      (record.changed_by as string) ?? null,
      (record.changed_at as string) ?? new Date().toISOString(),
      (record.notes as string) ?? null,
    ],
  );
}

function upsertCaregiverLink(record: Record<string, unknown>): void {
  const db = getDb();
  if (!db) return;
  db.execute(
    `INSERT OR REPLACE INTO caregiver_links
     (id, person_id, caregiver_id, relationship, is_primary, sync_status)
     VALUES (?, ?, ?, ?, ?, 'SYNCED')`,
    [
      record.id as string,
      (record.person_id as string) ?? (record.person as string) ?? '',
      (record.caregiver_id as string) ?? (record.caregiver as string) ?? '',
      (record.relationship as string) ?? null,
      (record.is_primary as number) ?? 0,
    ],
  );
}

/**
 * Full pull cycle — fetch all entity types from server in a single request.
 */
export async function pullAll(): Promise<{ totalPulled: number }> {
  const result = await pullOnce();

  // Sync rule package (OFF-010) — non-blocking, failures don't break pull
  try {
    const { syncRulePackage } = await import('./rulePackageSync');
    await syncRulePackage();
  } catch {
    // Rule package sync is best-effort
  }

  // Sync configuration values (SYNC-004, Appendix B)
  try {
    const { syncConfigValues } = await import('./configStore');
    await syncConfigValues();
  } catch {
    // Config sync is best-effort
  }

  // Sync dashboard aggregate (best-effort)
  try {
    const { syncDashboardAggregate } = await import('./dashboardSync');
    await syncDashboardAggregate();
  } catch {
    // Dashboard sync is best-effort
  }

  // Sync worklist (best-effort)
  try {
    const { syncWorklist } = await import('./worklistSync');
    await syncWorklist();
  } catch {
    // Worklist sync is best-effort
  }

  return { totalPulled: result.pulled };
}
