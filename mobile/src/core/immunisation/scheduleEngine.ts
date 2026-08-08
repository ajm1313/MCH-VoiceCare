/**
 * Immunisation schedule engine — mobile offline (§26, DEC-007).
 *
 * Ported from backend/apps/immunisation/engine.py and seed_ghana_epi.py.
 * Provides deterministic dose eligibility calculation and catch-up planning
 * without server connectivity.
 *
 * IMM-ENG-005: AI shall not determine dose validity or catch-up eligibility.
 * IMM-ENG-006: every calculated status records schedule version and reason.
 */

export const SCHEDULE_VERSION = 'GHS-EPI-2026-DRAFT-v1.1';

export type ImmunisationStatus =
  | 'NOT_YET_DUE'
  | 'DUE_SOON'
  | 'DUE_NOW'
  | 'OVERDUE'
  | 'DEFAULTER'
  | 'LONG_OVERDUE'
  | 'COMPLETE'
  | 'NOT_APPLICABLE'
  | 'PENTA1_OVERDUE';

export interface ScheduleEntry {
  vaccineCode: string;
  vaccineLabel: string;
  doseNumber: number;
  doseLabel: string;
  recommendedAgeDays: number;
  minimumAgeDays: number;
  minimumIntervalDays: number | null;
  maximumAgeDays: number | null;
  routeSite: string;
  isPhased: boolean;
}

export interface AdministeredDose {
  vaccineCode: string;
  doseNumber: number;
  administrationDate: string; // ISO date
  validityStatus: string;
  superseded: boolean;
}

export interface DoseEligibility {
  vaccineCode: string;
  doseNumber: number;
  doseLabel: string;
  status: ImmunisationStatus;
  recommendedDueDate: string | null;
  eligibilityDate: string | null;
  reason: string;
  scheduleVersion: string;
}

export interface CatchUpDose {
  vaccineCode: string;
  doseNumber: number;
  doseLabel: string;
  earliestEligibleDate: string;
  status: 'ELIGIBLE_NOW' | 'ELIGIBLE_LATER' | 'TOO_LATE' | 'ALREADY_GIVEN';
  reason: string;
  scheduleVersion: string;
  isPriority: boolean;
}

export interface CatchUpPlan {
  childId: string;
  childAgeDays: number;
  dosesNeeded: CatchUpDose[];
  nextSessionRecommendation: string | null;
  isFullyCaughtUp: boolean;
  scheduleVersion: string;
}

// ---------------------------------------------------------------------------
// Ghana EPI schedule data (from seed_ghana_epi.py)
// ---------------------------------------------------------------------------

export const GHANA_EPI_SCHEDULE: ScheduleEntry[] = [
  { vaccineCode: 'BCG', vaccineLabel: 'BCG', doseNumber: 0, doseLabel: 'BCG (birth)', recommendedAgeDays: 0, minimumAgeDays: 0, minimumIntervalDays: null, maximumAgeDays: null, routeSite: 'Intradermal; right upper arm', isPhased: false },
  { vaccineCode: 'OPV', vaccineLabel: 'Oral Polio Vaccine', doseNumber: 0, doseLabel: 'OPV0 (birth)', recommendedAgeDays: 0, minimumAgeDays: 0, minimumIntervalDays: null, maximumAgeDays: null, routeSite: 'Oral', isPhased: false },
  { vaccineCode: 'HEP_B', vaccineLabel: 'Hepatitis B birth dose', doseNumber: 0, doseLabel: 'Hep-B birth dose', recommendedAgeDays: 0, minimumAgeDays: 0, minimumIntervalDays: null, maximumAgeDays: null, routeSite: 'IM; left anterolateral thigh', isPhased: false },
  // 6 weeks
  { vaccineCode: 'DPT_HEPB_HIB', vaccineLabel: 'DPT-HepB-Hib (Pentavalent)', doseNumber: 1, doseLabel: 'Penta1', recommendedAgeDays: 42, minimumAgeDays: 42, minimumIntervalDays: null, maximumAgeDays: null, routeSite: 'IM; left anterolateral thigh', isPhased: false },
  { vaccineCode: 'OPV', vaccineLabel: 'Oral Polio Vaccine', doseNumber: 1, doseLabel: 'OPV1', recommendedAgeDays: 42, minimumAgeDays: 42, minimumIntervalDays: 28, maximumAgeDays: null, routeSite: 'Oral', isPhased: false },
  { vaccineCode: 'PCV', vaccineLabel: 'Pneumococcal Conjugate Vaccine', doseNumber: 1, doseLabel: 'PCV1', recommendedAgeDays: 42, minimumAgeDays: 42, minimumIntervalDays: null, maximumAgeDays: null, routeSite: 'IM; right anterolateral thigh', isPhased: false },
  { vaccineCode: 'ROTA', vaccineLabel: 'Rotavirus Vaccine', doseNumber: 1, doseLabel: 'Rota1', recommendedAgeDays: 42, minimumAgeDays: 42, minimumIntervalDays: null, maximumAgeDays: 104, routeSite: 'Oral', isPhased: false },
  // 10 weeks
  { vaccineCode: 'DPT_HEPB_HIB', vaccineLabel: 'DPT-HepB-Hib (Pentavalent)', doseNumber: 2, doseLabel: 'Penta2', recommendedAgeDays: 70, minimumAgeDays: 70, minimumIntervalDays: 28, maximumAgeDays: null, routeSite: 'IM; left anterolateral thigh', isPhased: false },
  { vaccineCode: 'OPV', vaccineLabel: 'Oral Polio Vaccine', doseNumber: 2, doseLabel: 'OPV2', recommendedAgeDays: 70, minimumAgeDays: 70, minimumIntervalDays: 28, maximumAgeDays: null, routeSite: 'Oral', isPhased: false },
  { vaccineCode: 'PCV', vaccineLabel: 'Pneumococcal Conjugate Vaccine', doseNumber: 2, doseLabel: 'PCV2', recommendedAgeDays: 70, minimumAgeDays: 70, minimumIntervalDays: 28, maximumAgeDays: null, routeSite: 'IM; right anterolateral thigh', isPhased: false },
  { vaccineCode: 'ROTA', vaccineLabel: 'Rotavirus Vaccine', doseNumber: 2, doseLabel: 'Rota2', recommendedAgeDays: 70, minimumAgeDays: 70, minimumIntervalDays: 28, maximumAgeDays: 104, routeSite: 'Oral', isPhased: false },
  // 14 weeks
  { vaccineCode: 'DPT_HEPB_HIB', vaccineLabel: 'DPT-HepB-Hib (Pentavalent)', doseNumber: 3, doseLabel: 'Penta3', recommendedAgeDays: 98, minimumAgeDays: 98, minimumIntervalDays: 28, maximumAgeDays: null, routeSite: 'IM; left anterolateral thigh', isPhased: false },
  { vaccineCode: 'OPV', vaccineLabel: 'Oral Polio Vaccine', doseNumber: 3, doseLabel: 'OPV3', recommendedAgeDays: 98, minimumAgeDays: 98, minimumIntervalDays: 28, maximumAgeDays: null, routeSite: 'Oral', isPhased: false },
  { vaccineCode: 'PCV', vaccineLabel: 'Pneumococcal Conjugate Vaccine', doseNumber: 3, doseLabel: 'PCV3', recommendedAgeDays: 98, minimumAgeDays: 98, minimumIntervalDays: 28, maximumAgeDays: null, routeSite: 'IM; right anterolateral thigh', isPhased: false },
  { vaccineCode: 'ROTA', vaccineLabel: 'Rotavirus Vaccine', doseNumber: 3, doseLabel: 'Rota3', recommendedAgeDays: 98, minimumAgeDays: 98, minimumIntervalDays: 28, maximumAgeDays: 104, routeSite: 'Oral', isPhased: false },
  { vaccineCode: 'IPV', vaccineLabel: 'Inactivated Polio Vaccine', doseNumber: 1, doseLabel: 'IPV1', recommendedAgeDays: 98, minimumAgeDays: 98, minimumIntervalDays: null, maximumAgeDays: null, routeSite: 'IM; right anterolateral thigh', isPhased: false },
  // 6 months — malaria (phased)
  { vaccineCode: 'MAL', vaccineLabel: 'Malaria Vaccine', doseNumber: 1, doseLabel: 'Malaria 1', recommendedAgeDays: 180, minimumAgeDays: 180, minimumIntervalDays: null, maximumAgeDays: null, routeSite: 'IM; left anterolateral thigh', isPhased: true },
  // 7 months
  { vaccineCode: 'MAL', vaccineLabel: 'Malaria Vaccine', doseNumber: 2, doseLabel: 'Malaria 2', recommendedAgeDays: 210, minimumAgeDays: 210, minimumIntervalDays: 28, maximumAgeDays: null, routeSite: 'IM; left anterolateral thigh', isPhased: true },
  { vaccineCode: 'IPV', vaccineLabel: 'Inactivated Polio Vaccine', doseNumber: 2, doseLabel: 'IPV2', recommendedAgeDays: 210, minimumAgeDays: 210, minimumIntervalDays: 56, maximumAgeDays: null, routeSite: 'IM; right anterolateral thigh', isPhased: false },
  // 9 months
  { vaccineCode: 'MR', vaccineLabel: 'Measles-Rubella', doseNumber: 1, doseLabel: 'MR1', recommendedAgeDays: 270, minimumAgeDays: 270, minimumIntervalDays: null, maximumAgeDays: null, routeSite: 'Subcutaneous; left upper arm', isPhased: false },
  { vaccineCode: 'YF', vaccineLabel: 'Yellow Fever', doseNumber: 0, doseLabel: 'Yellow Fever', recommendedAgeDays: 270, minimumAgeDays: 270, minimumIntervalDays: null, maximumAgeDays: null, routeSite: 'Subcutaneous; right upper arm', isPhased: false },
  { vaccineCode: 'MAL', vaccineLabel: 'Malaria Vaccine', doseNumber: 3, doseLabel: 'Malaria 3', recommendedAgeDays: 270, minimumAgeDays: 270, minimumIntervalDays: 56, maximumAgeDays: null, routeSite: 'IM; left anterolateral thigh', isPhased: true },
  // 18 months
  { vaccineCode: 'MR', vaccineLabel: 'Measles-Rubella', doseNumber: 2, doseLabel: 'MR2', recommendedAgeDays: 540, minimumAgeDays: 540, minimumIntervalDays: null, maximumAgeDays: null, routeSite: 'Subcutaneous; left upper arm', isPhased: false },
  { vaccineCode: 'MEN_A', vaccineLabel: 'Meningitis A', doseNumber: 0, doseLabel: 'Men A', recommendedAgeDays: 540, minimumAgeDays: 540, minimumIntervalDays: null, maximumAgeDays: null, routeSite: 'Subcutaneous; left upper arm', isPhased: false },
  { vaccineCode: 'MAL', vaccineLabel: 'Malaria Vaccine', doseNumber: 4, doseLabel: 'Malaria 4', recommendedAgeDays: 540, minimumAgeDays: 540, minimumIntervalDays: 56, maximumAgeDays: null, routeSite: 'IM; left anterolateral thigh', isPhased: true },
  // 9 years
  { vaccineCode: 'HPV', vaccineLabel: 'Human Papillomavirus', doseNumber: 0, doseLabel: 'HPV', recommendedAgeDays: 3285, minimumAgeDays: 3285, minimumIntervalDays: null, maximumAgeDays: null, routeSite: 'IM; right upper arm', isPhased: false },
];

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDays(from: string, to: string): number {
  const f = new Date(from + 'T00:00:00');
  const t = new Date(to + 'T00:00:00');
  return Math.round((t.getTime() - f.getTime()) / 86400000);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Dose helpers
// ---------------------------------------------------------------------------

function latestValidDose(
  doses: AdministeredDose[],
  vaccineCode: string,
  doseNumber: number,
): AdministeredDose | null {
  const filtered = doses
    .filter(
      d =>
        d.vaccineCode === vaccineCode &&
        d.doseNumber === doseNumber &&
        !d.superseded &&
        d.validityStatus === 'VALID',
    )
    .sort((a, b) => b.administrationDate.localeCompare(a.administrationDate));
  return filtered[0] || null;
}

function previousValidDose(
  doses: AdministeredDose[],
  vaccineCode: string,
  doseNumber: number,
): AdministeredDose | null {
  if (doseNumber <= 0) return null;
  return latestValidDose(doses, vaccineCode, doseNumber - 1);
}

function isPhasedApplicable(
  schedule: ScheduleEntry,
  childDistrictId: string,
  childDob: string,
  applicableDistricts: string[],
  applicableBirthCohorts: string[],
): boolean {
  if (!schedule.isPhased) return true;
  if (applicableDistricts.length === 0) return false;
  const districtOk = applicableDistricts.includes(childDistrictId);
  const cohortOk =
    applicableBirthCohorts.length === 0 ||
    applicableBirthCohorts.includes(childDob);
  return districtOk && cohortOk;
}

// ---------------------------------------------------------------------------
// Eligibility calculation (§26)
// ---------------------------------------------------------------------------

export function calculateEligibility(
  childDob: string,
  schedule: ScheduleEntry,
  doses: AdministeredDose[],
  today: string | null = null,
  defaulterGraceDays = 14,
  longOverdueDays = 30,
  childDistrictId = '',
  applicableDistricts: string[] = [],
  applicableBirthCohorts: string[] = [],
): DoseEligibility {
  const todayDate = today || todayISO();

  if (
    !isPhasedApplicable(
      schedule,
      childDistrictId,
      childDob,
      applicableDistricts,
      applicableBirthCohorts,
    )
  ) {
    return {
      vaccineCode: schedule.vaccineCode,
      doseNumber: schedule.doseNumber,
      doseLabel: schedule.doseLabel,
      status: 'NOT_APPLICABLE',
      recommendedDueDate: null,
      eligibilityDate: null,
      reason: 'Phased vaccine not configured for this district/cohort',
      scheduleVersion: SCHEDULE_VERSION,
    };
  }

  const recommendedDue = addDays(childDob, schedule.recommendedAgeDays);

  // Check if valid dose already exists -> COMPLETE
  const existing = latestValidDose(doses, schedule.vaccineCode, schedule.doseNumber);
  if (existing) {
    return {
      vaccineCode: schedule.vaccineCode,
      doseNumber: schedule.doseNumber,
      doseLabel: schedule.doseLabel,
      status: 'COMPLETE',
      recommendedDueDate: recommendedDue,
      eligibilityDate: existing.administrationDate,
      reason: `Valid dose administered on ${existing.administrationDate}`,
      scheduleVersion: SCHEDULE_VERSION,
    };
  }

  // Calculate eligibility date with minimum interval
  let eligibilityDate = recommendedDue;
  const prev = previousValidDose(doses, schedule.vaccineCode, schedule.doseNumber);
  if (prev && schedule.minimumIntervalDays != null) {
    const intervalEligible = addDays(prev.administrationDate, schedule.minimumIntervalDays);
    if (intervalEligible > eligibilityDate) {
      eligibilityDate = intervalEligible;
    }
  }

  // Maximum age check
  if (schedule.maximumAgeDays != null) {
    const maxAgeDate = addDays(childDob, schedule.maximumAgeDays);
    if (todayDate > maxAgeDate) {
      return {
        vaccineCode: schedule.vaccineCode,
        doseNumber: schedule.doseNumber,
        doseLabel: schedule.doseLabel,
        status: 'NOT_APPLICABLE',
        recommendedDueDate: recommendedDue,
        eligibilityDate,
        reason: `Child exceeds maximum age (${schedule.maximumAgeDays} days)`,
        scheduleVersion: SCHEDULE_VERSION,
      };
    }
  }

  // Status determination (§26)
  let status: ImmunisationStatus;
  let reason: string;

  if (todayDate < eligibilityDate) {
    const daysUntil = diffDays(todayDate, eligibilityDate);
    if (daysUntil <= 14) {
      status = 'DUE_SOON';
      reason = `Due in ${daysUntil} days`;
    } else {
      status = 'NOT_YET_DUE';
      reason = `Eligible from ${eligibilityDate}`;
    }
  } else if (todayDate <= addDays(recommendedDue, defaulterGraceDays)) {
    if (todayDate > recommendedDue) {
      status = 'OVERDUE';
      reason = `Overdue since ${recommendedDue} (within grace)`;
    } else {
      status = 'DUE_NOW';
      reason = `Due now (eligible from ${eligibilityDate})`;
    }
  } else if (todayDate <= addDays(recommendedDue, longOverdueDays)) {
    status = 'DEFAULTER';
    reason = `Defaulter: overdue beyond ${defaulterGraceDays} days grace`;
  } else {
    status = 'LONG_OVERDUE';
    reason = `Long overdue: past ${longOverdueDays} days`;
  }

  // Zero-dose risk: Penta1 overdue and child < 12 months
  if (
    schedule.vaccineCode === 'DPT_HEPB_HIB' &&
    schedule.doseNumber === 1 &&
    (status === 'OVERDUE' || status === 'DEFAULTER' || status === 'LONG_OVERDUE') &&
    diffDays(childDob, todayDate) < 365
  ) {
    status = 'PENTA1_OVERDUE';
    reason = 'Penta1 overdue — zero-dose risk (child < 12 months)';
  }

  return {
    vaccineCode: schedule.vaccineCode,
    doseNumber: schedule.doseNumber,
    doseLabel: schedule.doseLabel,
    status,
    recommendedDueDate: recommendedDue,
    eligibilityDate,
    reason,
    scheduleVersion: SCHEDULE_VERSION,
  };
}

export function calculateFullSchedule(
  childDob: string,
  doses: AdministeredDose[],
  today: string | null = null,
  defaulterGraceDays = 14,
  longOverdueDays = 30,
  childDistrictId = '',
  applicableDistricts: string[] = [],
  applicableBirthCohorts: string[] = [],
): DoseEligibility[] {
  return GHANA_EPI_SCHEDULE.map(sched =>
    calculateEligibility(
      childDob,
      sched,
      doses,
      today,
      defaulterGraceDays,
      longOverdueDays,
      childDistrictId,
      applicableDistricts,
      applicableBirthCohorts,
    ),
  );
}

// ---------------------------------------------------------------------------
// Catch-up calculation (IMM-ENG-001)
// ---------------------------------------------------------------------------

export function calculateCatchUp(
  childId: string,
  childDob: string,
  doses: AdministeredDose[],
  today: string | null = null,
  childDistrictId = '',
  applicableDistricts: string[] = [],
  applicableBirthCohorts: string[] = [],
): CatchUpPlan {
  const todayDate = today || todayISO();
  const ageDays = diffDays(childDob, todayDate);

  const dosesNeeded: CatchUpDose[] = [];
  const eligibleNowDates: string[] = [];

  for (const sched of GHANA_EPI_SCHEDULE) {
    if (
      !isPhasedApplicable(
        sched,
        childDistrictId,
        childDob,
        applicableDistricts,
        applicableBirthCohorts,
      )
    ) {
      continue;
    }

    // Already given?
    const existing = latestValidDose(doses, sched.vaccineCode, sched.doseNumber);
    if (existing) continue;

    // Minimum age check
    const minAgeDate = addDays(childDob, sched.minimumAgeDays);
    if (todayDate < minAgeDate) {
      dosesNeeded.push({
        vaccineCode: sched.vaccineCode,
        doseNumber: sched.doseNumber,
        doseLabel: sched.doseLabel,
        earliestEligibleDate: minAgeDate,
        status: 'ELIGIBLE_LATER',
        reason: `Minimum age not reached until ${minAgeDate}`,
        scheduleVersion: SCHEDULE_VERSION,
        isPriority: false,
      });
      continue;
    }

    // Maximum age check
    if (sched.maximumAgeDays != null) {
      const maxAgeDate = addDays(childDob, sched.maximumAgeDays);
      if (todayDate > maxAgeDate) {
        dosesNeeded.push({
          vaccineCode: sched.vaccineCode,
          doseNumber: sched.doseNumber,
          doseLabel: sched.doseLabel,
          earliestEligibleDate: minAgeDate,
          status: 'TOO_LATE',
          reason: `Child exceeds maximum age (${sched.maximumAgeDays} days) for ${sched.doseLabel}`,
          scheduleVersion: SCHEDULE_VERSION,
          isPriority: false,
        });
        continue;
      }
    }

    // Earliest eligible date with interval constraint
    let earliest = minAgeDate;
    const prev = previousValidDose(doses, sched.vaccineCode, sched.doseNumber);
    if (prev && sched.minimumIntervalDays != null) {
      const intervalEligible = addDays(prev.administrationDate, sched.minimumIntervalDays);
      if (intervalEligible > earliest) {
        earliest = intervalEligible;
      }
    }

    // Priority determination
    let isPriority = false;
    if (sched.vaccineCode === 'DPT_HEPB_HIB' && sched.doseNumber === 1 && ageDays < 365) {
      isPriority = true;
    } else if ((sched.vaccineCode === 'MR' && sched.doseNumber === 1) || (sched.vaccineCode === 'MR' && sched.doseNumber === 2)) {
      if (ageDays > 365) isPriority = true;
    }

    let status: CatchUpDose['status'];
    let reason: string;

    if (earliest <= todayDate) {
      status = 'ELIGIBLE_NOW';
      reason = `Eligible for catch-up since ${earliest}`;
      eligibleNowDates.push(earliest);
    } else {
      status = 'ELIGIBLE_LATER';
      reason = `Eligible from ${earliest} (interval constraint)`;
    }

    dosesNeeded.push({
      vaccineCode: sched.vaccineCode,
      doseNumber: sched.doseNumber,
      doseLabel: sched.doseLabel,
      earliestEligibleDate: earliest,
      status,
      reason,
      scheduleVersion: SCHEDULE_VERSION,
      isPriority,
    });
  }

  // Next session recommendation
  let nextSession: string | null = null;
  if (eligibleNowDates.length > 0) {
    nextSession = todayDate;
  } else if (dosesNeeded.length > 0) {
    const laterDates = dosesNeeded
      .filter(d => d.status === 'ELIGIBLE_LATER')
      .map(d => d.earliestEligibleDate);
    if (laterDates.length > 0) {
      nextSession = laterDates.sort()[0];
    }
  }

  return {
    childId,
    childAgeDays: ageDays,
    dosesNeeded,
    nextSessionRecommendation: nextSession,
    isFullyCaughtUp: dosesNeeded.length === 0,
    scheduleVersion: SCHEDULE_VERSION,
  };
}
