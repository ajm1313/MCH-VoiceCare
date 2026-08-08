/**
 * CWC session reconciliation — mobile offline port of backend §27 algorithm.
 *
 * Implements the CLOSE_CWC_SESSION algorithm:
 * 1. For each expected child, recalculate eligibility using session date.
 * 2. If absent, record missed doses.
 * 3. If present, compare eligible doses with administered doses.
 * 4. Classify dispositions into groups A-F.
 * 5. Determine follow-up priority P1-P4.
 * 6. Produce an immutable reconciliation report.
 *
 * Backend source: backend/apps/immunisation/reconciliation.py
 */
import { calculateFullSchedule, type DoseEligibility, type AdministeredDose, SCHEDULE_VERSION } from '../immunisation/scheduleEngine';
import { query, getDb } from '../db/database';

export const SessionDisposition = {
  DOSE_ADMINISTERED: 'DOSE_ADMINISTERED',
  CLINICAL_DEFERRAL: 'CLINICAL_DEFERRAL',
  SERVICE_SIDE_MISS: 'SERVICE_SIDE_MISS',
  MISSED_OPPORTUNITY: 'MISSED_OPPORTUNITY',
  VACCINATED_ELSEWHERE: 'VACCINATED_ELSEWHERE',
  MOVED: 'MOVED',
  ABSENT: 'ABSENT',
} as const;

export const ImmunisationStatus = {
  NOT_YET_DUE: 'NOT_YET_DUE',
  DUE_SOON: 'DUE_SOON',
  DUE_NOW: 'DUE_NOW',
  OVERDUE: 'OVERDUE',
  DEFAULTER: 'DEFAULTER',
  LONG_OVERDUE: 'LONG_OVERDUE',
  COMPLETE: 'COMPLETE',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  PENTA1_OVERDUE: 'PENTA1_OVERDUE',
} as const;

export const ImmunisationPriority = {
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
  P4: 'P4',
} as const;

const OVERDUE_STATUSES = [
  ImmunisationStatus.OVERDUE,
  ImmunisationStatus.DEFAULTER,
  ImmunisationStatus.LONG_OVERDUE,
  ImmunisationStatus.PENTA1_OVERDUE,
];

const NOT_DUE_STATUSES = [
  ImmunisationStatus.NOT_YET_DUE,
  ImmunisationStatus.NOT_APPLICABLE,
  ImmunisationStatus.COMPLETE,
];

export interface ChildReconciliationResult {
  child_id: string;
  attended: boolean;
  eligible_doses: Array<{ vaccine: string; dose: number; label: string; status: string }>;
  administered_doses: Array<{ vaccine: string; dose: number }>;
  missed_doses: Array<{ vaccine: string; dose: number; label: string; status: string; disposition?: string; reason_code?: string }>;
  disposition: string;
  disposition_reason_code: string;
  group: string;
  next_due_date: string | null;
  created_defaulter: boolean;
  growth_due: boolean;
}

export interface ReconciliationReport {
  session_id: string;
  session_date: string;
  total_expected: number;
  total_attended: number;
  total_absent: number;
  total_doses_eligible: number;
  total_doses_administered: number;
  total_missed_sessions: number;
  total_mov: number;
  total_service_side_miss: number;
  total_vaccinated_elsewhere: number;
  total_moved: number;
  group_a: number;
  group_b: number;
  group_c: number;
  group_d: number;
  group_e: number;
  group_f: number;
  child_results: ChildReconciliationResult[];
  created_defaulter_episodes: number;
}

interface AttendanceRecord {
  child_id: string;
  attended: boolean;
  disposition?: string;
  reason_code?: string;
  doses_given?: string;
  growth_recorded?: boolean;
}

interface LocalChild {
  id: string;
  child_name: string;
  dob: string | null;
  cwc_card_number: string | null;
  residence_status: string | null;
  defaulter_status: string | null;
  overdue_count: number;
}

function classifyDisposition(dispositionCode: string): string {
  const mapping: Record<string, string> = {
    [SessionDisposition.DOSE_ADMINISTERED]: 'A',
    [SessionDisposition.CLINICAL_DEFERRAL]: 'B',
    [SessionDisposition.MISSED_OPPORTUNITY]: 'B',
    [SessionDisposition.SERVICE_SIDE_MISS]: 'F',
    [SessionDisposition.VACCINATED_ELSEWHERE]: 'D',
    [SessionDisposition.MOVED]: 'E',
    [SessionDisposition.ABSENT]: 'C',
  };
  return mapping[dispositionCode] ?? 'B';
}

function determinePriority(
  overdueCount: number,
  consecutiveMissed: number,
  hasOverdue: boolean,
): string {
  if (overdueCount >= 2 || consecutiveMissed >= 2) return ImmunisationPriority.P1;
  if (overdueCount === 1 || consecutiveMissed >= 1) return ImmunisationPriority.P2;
  if (hasOverdue) return ImmunisationPriority.P3;
  return ImmunisationPriority.P4;
}

function getLocalChild(childId: string): LocalChild | null {
  const rows = query(
    'SELECT id, child_name, dob, cwc_card_number, residence_status, defaulter_status, overdue_count FROM immunisation_children WHERE id = ?',
    [childId],
  );
  if (rows.length === 0) return null;
  return rows[0] as unknown as LocalChild;
}

function getAdministeredDoses(childId: string, sessionDate: string): Set<string> {
  const rows = query(
    `SELECT vaccine_code, dose_number FROM vaccine_doses
     WHERE child_id = ? AND date(administration_datetime) = date(?) AND sync_status != 'DELETED'`,
    [childId, sessionDate],
  );
  const set = new Set<string>();
  for (const row of rows) {
    set.add(`${row.vaccine_code}_${row.dose_number}`);
  }
  return set;
}

function getAdministeredDosesForChild(childId: string): AdministeredDose[] {
  const rows = query(
    `SELECT vaccine_code, dose_number, administration_datetime, sync_status
     FROM vaccine_doses WHERE child_id = ? AND sync_status != 'DELETED'`,
    [childId],
  );
  return rows.map((r) => ({
    vaccineCode: String(r.vaccine_code),
    doseNumber: Number(r.dose_number),
    administrationDate: String(r.administration_datetime),
    validityStatus: 'VALID',
    superseded: false,
  }));
}

function getConsecutiveMissed(childId: string): number {
  const rows = query(
    'SELECT overdue_count FROM immunisation_children WHERE id = ?',
    [childId],
  );
  return (rows[0]?.overdue_count as number) ?? 0;
}

/**
 * Execute the CLOSE_CWC_SESSION reconciliation algorithm (§27) offline.
 *
 * @param sessionId - Local CWC session ID
 * @param sessionDate - ISO date string for the session
 * @param expectedChildIds - Array of child IDs expected at the session
 * @param attendanceRecords - Attendance records for the session
 * @param scheduleVersion - Immunisation schedule version string
 * @param defaulterGraceDays - Grace period before defaulter (default 14)
 * @param longOverdueDays - Threshold for long overdue (default 30)
 */
export function closeCwcSession(
  sessionId: string,
  sessionDate: string,
  expectedChildIds: string[],
  attendanceRecords: AttendanceRecord[],
  scheduleVersion: string,
  defaulterGraceDays: number = 14,
  longOverdueDays: number = 30,
): ReconciliationReport {
  const report: ReconciliationReport = {
    session_id: sessionId,
    session_date: sessionDate,
    total_expected: 0,
    total_attended: 0,
    total_absent: 0,
    total_doses_eligible: 0,
    total_doses_administered: 0,
    total_missed_sessions: 0,
    total_mov: 0,
    total_service_side_miss: 0,
    total_vaccinated_elsewhere: 0,
    total_moved: 0,
    group_a: 0,
    group_b: 0,
    group_c: 0,
    group_d: 0,
    group_e: 0,
    group_f: 0,
    child_results: [],
    created_defaulter_episodes: 0,
  };

  // Build attendance lookup
  const attendedMap = new Map<string, AttendanceRecord>();
  for (const rec of attendanceRecords) {
    attendedMap.set(rec.child_id, rec);
  }

  for (const childId of expectedChildIds) {
    const child = getLocalChild(childId);
    if (!child) continue;

    report.total_expected += 1;
    const attended = attendedMap.has(childId) && attendedMap.get(childId)!.attended;

    const result: ChildReconciliationResult = {
      child_id: childId,
      attended,
      eligible_doses: [],
      administered_doses: [],
      missed_doses: [],
      disposition: '',
      disposition_reason_code: '',
      group: '',
      next_due_date: null,
      created_defaulter: false,
      growth_due: false,
    };

    // Recalculate eligibility using session date
    const administeredDoses = getAdministeredDosesForChild(childId);
    const eligibleResults = calculateFullSchedule(
      child.dob ?? '',
      administeredDoses,
      sessionDate,
      defaulterGraceDays,
      longOverdueDays,
    );

    // Filter to doses that were due or overdue at session time
    const dueDoses = eligibleResults.filter(
      (r) => !NOT_DUE_STATUSES.includes(r.status as any),
    );

    result.eligible_doses = dueDoses.map((r) => ({
      vaccine: r.vaccineCode,
      dose: r.doseNumber,
      label: r.doseLabel,
      status: r.status,
    }));
    report.total_doses_eligible += dueDoses.length;

    if (!attended) {
      // Group C: Absent
      result.group = 'C';
      result.disposition = SessionDisposition.ABSENT;
      report.total_absent += 1;
      report.group_c += 1;

      for (const dose of dueDoses) {
        result.missed_doses.push({
          vaccine: dose.vaccineCode,
          dose: dose.doseNumber,
          label: dose.doseLabel,
          status: dose.status,
        });
        report.total_missed_sessions += 1;
      }

      // Check if defaulter episode needed
      const hasOverdue = dueDoses.some((d) => OVERDUE_STATUSES.includes(d.status as any));
      if (hasOverdue) {
        const overdueCount = dueDoses.filter((d) => OVERDUE_STATUSES.includes(d.status as any)).length;
        const consecutiveMissed = getConsecutiveMissed(childId);
        const priority = determinePriority(overdueCount, consecutiveMissed + 1, true);

        // Create defaulter episode locally
        const db = getDb();
        db.execute(
          `INSERT OR REPLACE INTO defaulter_episodes
           (id, child_id, child_name, defaulter_status, days_overdue, last_visit_date, next_due_date, reason, trace_status, sync_status)
           VALUES (?, ?, ?, 'ACTIVE', ?, ?, NULL, ?, 'PENDING', 'NOT_SYNCED')`,
          [
            `${childId}_${sessionDate}_def`,
            childId,
            child.child_name,
            overdueCount,
            sessionDate,
            `Absent from CWC session ${sessionDate}`,
          ],
        );
        result.created_defaulter = true;
        report.created_defaulter_episodes += 1;
      }

      // Increment missed session counter
      const db = getDb();
      db.execute(
        'UPDATE immunisation_children SET overdue_count = overdue_count + 1 WHERE id = ?',
        [childId],
      );
    } else {
      // Attended — compare eligible doses with administration records
      report.total_attended += 1;

      // Reset consecutive missed counter
      const db = getDb();
      db.execute(
        'UPDATE immunisation_children SET overdue_count = 0 WHERE id = ?',
        [childId],
      );

      const administeredSet = getAdministeredDoses(childId, sessionDate);
      result.administered_doses = Array.from(administeredSet).map((s) => {
        const [vaccine, dose] = s.split('_');
        return { vaccine, dose: parseInt(dose, 10) };
      });
      report.total_doses_administered += administeredSet.size;

      const unadministered = dueDoses.filter(
        (d) => !administeredSet.has(`${d.vaccineCode}_${d.doseNumber}`),
      );

      if (unadministered.length === 0) {
        // Group A: all eligible doses administered
        result.group = 'A';
        report.group_a += 1;
      } else {
        // Group B: some eligible doses not administered
        const attRec = attendedMap.get(childId);
        const disposition = attRec?.disposition ?? SessionDisposition.MISSED_OPPORTUNITY;
        const reasonCode = attRec?.reason_code ?? '';

        result.disposition = disposition;
        result.disposition_reason_code = reasonCode;
        result.group = classifyDisposition(disposition);

        for (const dose of unadministered) {
          result.missed_doses.push({
            vaccine: dose.vaccineCode,
            dose: dose.doseNumber,
            label: dose.doseLabel,
            status: dose.status,
            disposition,
            reason_code: reasonCode,
          });

          if (disposition === SessionDisposition.SERVICE_SIDE_MISS) {
            report.total_service_side_miss += 1;
          } else if (disposition === SessionDisposition.VACCINATED_ELSEWHERE) {
            report.total_vaccinated_elsewhere += 1;
            report.group_d += 1;
          } else if (disposition === SessionDisposition.MOVED) {
            report.total_moved += 1;
            report.group_e += 1;
          } else if (disposition === SessionDisposition.CLINICAL_DEFERRAL) {
            // Deferral recorded, no defaulter
          } else {
            report.total_mov += 1;
            report.group_b += 1;
          }
        }

        // Create defaulter episode for MOV with overdue status
        if (disposition === SessionDisposition.MISSED_OPPORTUNITY) {
          const hasOverdue = unadministered.some((d) =>
            OVERDUE_STATUSES.includes(d.status as any),
          );
          if (hasOverdue) {
            const overdueCount = dueDoses.filter((d) => OVERDUE_STATUSES.includes(d.status as any)).length;
            const consecutiveMissed = 0; // Reset since they attended
            const priority = determinePriority(overdueCount, consecutiveMissed, true);

            const db2 = getDb();
            db2.execute(
              `INSERT OR REPLACE INTO defaulter_episodes
               (id, child_id, child_name, defaulter_status, days_overdue, last_visit_date, next_due_date, reason, trace_status, sync_status)
               VALUES (?, ?, ?, 'ACTIVE', ?, ?, NULL, ?, 'PENDING', 'NOT_SYNCED')`,
              [
                `${childId}_${sessionDate}_mov`,
                childId,
                child.child_name,
                overdueCount,
                sessionDate,
                `Missed opportunity at CWC session ${sessionDate}`,
              ],
            );
            result.created_defaulter = true;
            report.created_defaulter_episodes += 1;
          }
        }
      }
    }

    // Calculate next due date from future doses
    const futureDoses = eligibleResults.filter((r) => r.status === ImmunisationStatus.DUE_SOON);
    if (futureDoses.length > 0) {
      const nextDueDates = futureDoses
        .map((r) => r.recommendedDueDate)
        .filter((d): d is string => d != null)
        .sort();
      result.next_due_date = nextDueDates[0] ?? null;
    }

    report.child_results.push(result);
  }

  // Store reconciliation report on session in local DB
  const db = getDb();
  db.execute(
    `UPDATE cwc_sessions SET status = 'RECONCILED', completed_at = ? WHERE id = ?`,
    [new Date().toISOString(), sessionId],
  );

  return report;
}
