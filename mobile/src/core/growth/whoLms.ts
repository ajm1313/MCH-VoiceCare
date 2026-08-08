/**
 * WHO Child Growth Standards (2006) LMS reference tables — TypeScript port.
 *
 * Ported from backend/apps/growth/who_lms.py to enable offline z-score
 * computation on the mobile device (§51, DEC-007).
 *
 * Sources: WHO Child Growth Standards (2006)
 * https://www.who.int/tools/child-growth-standards/standards
 */

interface LMSPoint {
  x: number; // age_days or length_cm
  L: number;
  M: number;
  S: number;
}

// ---------------------------------------------------------------------------
// Length-for-age (0-24 months, recumbent) — boys
// ---------------------------------------------------------------------------
const LFA_BOYS: LMSPoint[] = [
  { x: 0, L: 1.0, M: 49.154, S: 0.0379 },
  { x: 30, L: 1.0, M: 54.0, S: 0.0362 },
  { x: 60, L: 1.0, M: 58.0, S: 0.0350 },
  { x: 91, L: 1.0, M: 61.0, S: 0.0343 },
  { x: 122, L: 1.0, M: 63.5, S: 0.0339 },
  { x: 152, L: 1.0, M: 66.0, S: 0.0337 },
  { x: 183, L: 1.0, M: 68.0, S: 0.0336 },
  { x: 213, L: 1.0, M: 70.0, S: 0.0336 },
  { x: 244, L: 1.0, M: 72.0, S: 0.0337 },
  { x: 274, L: 1.0, M: 74.0, S: 0.0339 },
  { x: 305, L: 1.0, M: 76.0, S: 0.0341 },
  { x: 335, L: 1.0, M: 78.0, S: 0.0343 },
  { x: 365, L: 1.0, M: 79.8, S: 0.0345 },
  { x: 430, L: 1.0, M: 82.5, S: 0.0348 },
  { x: 487, L: 1.0, M: 84.8, S: 0.0351 },
  { x: 548, L: 1.0, M: 87.0, S: 0.0354 },
  { x: 608, L: 1.0, M: 89.0, S: 0.0357 },
  { x: 670, L: 1.0, M: 91.0, S: 0.0360 },
  { x: 730, L: 1.0, M: 93.0, S: 0.0363 },
];

// ---------------------------------------------------------------------------
// Length-for-age (0-24 months, recumbent) — girls
// ---------------------------------------------------------------------------
const LFA_GIRLS: LMSPoint[] = [
  { x: 0, L: 1.0, M: 48.4, S: 0.0380 },
  { x: 30, L: 1.0, M: 53.0, S: 0.0365 },
  { x: 60, L: 1.0, M: 56.5, S: 0.0355 },
  { x: 91, L: 1.0, M: 59.5, S: 0.0349 },
  { x: 122, L: 1.0, M: 62.0, S: 0.0346 },
  { x: 152, L: 1.0, M: 64.0, S: 0.0345 },
  { x: 183, L: 1.0, M: 66.0, S: 0.0345 },
  { x: 213, L: 1.0, M: 68.0, S: 0.0346 },
  { x: 244, L: 1.0, M: 70.0, S: 0.0347 },
  { x: 274, L: 1.0, M: 72.0, S: 0.0349 },
  { x: 305, L: 1.0, M: 74.0, S: 0.0351 },
  { x: 335, L: 1.0, M: 76.0, S: 0.0353 },
  { x: 365, L: 1.0, M: 77.5, S: 0.0355 },
  { x: 430, L: 1.0, M: 80.5, S: 0.0358 },
  { x: 487, L: 1.0, M: 82.7, S: 0.0361 },
  { x: 548, L: 1.0, M: 85.0, S: 0.0364 },
  { x: 608, L: 1.0, M: 87.0, S: 0.0367 },
  { x: 670, L: 1.0, M: 89.0, S: 0.0370 },
  { x: 730, L: 1.0, M: 91.0, S: 0.0373 },
];

// ---------------------------------------------------------------------------
// Weight-for-age (0-24 months) — boys
// ---------------------------------------------------------------------------
const WFA_BOYS: LMSPoint[] = [
  { x: 0, L: -0.3, M: 3.35, S: 0.1257 },
  { x: 30, L: -0.3, M: 4.5, S: 0.1190 },
  { x: 60, L: -0.3, M: 5.6, S: 0.1160 },
  { x: 91, L: -0.3, M: 6.4, S: 0.1145 },
  { x: 122, L: -0.3, M: 7.0, S: 0.1138 },
  { x: 152, L: -0.3, M: 7.5, S: 0.1135 },
  { x: 183, L: -0.3, M: 8.0, S: 0.1135 },
  { x: 213, L: -0.3, M: 8.5, S: 0.1138 },
  { x: 244, L: -0.3, M: 8.9, S: 0.1143 },
  { x: 274, L: -0.3, M: 9.3, S: 0.1150 },
  { x: 305, L: -0.3, M: 9.6, S: 0.1158 },
  { x: 335, L: -0.3, M: 9.9, S: 0.1167 },
  { x: 365, L: -0.3, M: 10.2, S: 0.1177 },
  { x: 430, L: -0.3, M: 10.7, S: 0.1193 },
  { x: 487, L: -0.3, M: 11.1, S: 0.1207 },
  { x: 548, L: -0.3, M: 11.5, S: 0.1222 },
  { x: 608, L: -0.3, M: 11.9, S: 0.1238 },
  { x: 670, L: -0.3, M: 12.3, S: 0.1254 },
  { x: 730, L: -0.3, M: 12.7, S: 0.1270 },
];

// ---------------------------------------------------------------------------
// Weight-for-age (0-24 months) — girls
// ---------------------------------------------------------------------------
const WFA_GIRLS: LMSPoint[] = [
  { x: 0, L: -0.3, M: 3.2, S: 0.1285 },
  { x: 30, L: -0.3, M: 4.2, S: 0.1210 },
  { x: 60, L: -0.3, M: 5.1, S: 0.1170 },
  { x: 91, L: -0.3, M: 5.8, S: 0.1150 },
  { x: 122, L: -0.3, M: 6.4, S: 0.1140 },
  { x: 152, L: -0.3, M: 6.9, S: 0.1135 },
  { x: 183, L: -0.3, M: 7.3, S: 0.1135 },
  { x: 213, L: -0.3, M: 7.7, S: 0.1138 },
  { x: 244, L: -0.3, M: 8.1, S: 0.1143 },
  { x: 274, L: -0.3, M: 8.4, S: 0.1150 },
  { x: 305, L: -0.3, M: 8.7, S: 0.1158 },
  { x: 335, L: -0.3, M: 9.0, S: 0.1167 },
  { x: 365, L: -0.3, M: 9.3, S: 0.1177 },
  { x: 430, L: -0.3, M: 9.8, S: 0.1193 },
  { x: 487, L: -0.3, M: 10.2, S: 0.1207 },
  { x: 548, L: -0.3, M: 10.6, S: 0.1222 },
  { x: 608, L: -0.3, M: 11.0, S: 0.1238 },
  { x: 670, L: -0.3, M: 11.4, S: 0.1254 },
  { x: 730, L: -0.3, M: 11.8, S: 0.1270 },
];

// ---------------------------------------------------------------------------
// Weight-for-length (recumbent, 45-85 cm) — boys
// ---------------------------------------------------------------------------
const WFL_BOYS: LMSPoint[] = [
  { x: 45, L: -0.4, M: 2.4, S: 0.0780 },
  { x: 50, L: -0.4, M: 3.0, S: 0.0810 },
  { x: 55, L: -0.4, M: 3.8, S: 0.0840 },
  { x: 60, L: -0.4, M: 4.8, S: 0.0870 },
  { x: 65, L: -0.4, M: 6.0, S: 0.0900 },
  { x: 70, L: -0.4, M: 7.3, S: 0.0930 },
  { x: 75, L: -0.4, M: 8.5, S: 0.0960 },
  { x: 80, L: -0.4, M: 9.6, S: 0.0990 },
  { x: 85, L: -0.4, M: 10.7, S: 0.1020 },
];

// ---------------------------------------------------------------------------
// Weight-for-length (recumbent, 45-85 cm) — girls
// ---------------------------------------------------------------------------
const WFL_GIRLS: LMSPoint[] = [
  { x: 45, L: -0.4, M: 2.3, S: 0.0800 },
  { x: 50, L: -0.4, M: 2.9, S: 0.0830 },
  { x: 55, L: -0.4, M: 3.6, S: 0.0860 },
  { x: 60, L: -0.4, M: 4.5, S: 0.0890 },
  { x: 65, L: -0.4, M: 5.6, S: 0.0920 },
  { x: 70, L: -0.4, M: 6.8, S: 0.0950 },
  { x: 75, L: -0.4, M: 8.0, S: 0.0980 },
  { x: 80, L: -0.4, M: 9.1, S: 0.1010 },
  { x: 85, L: -0.4, M: 10.2, S: 0.1040 },
];

/**
 * Linear interpolation of L, M, S values for a given x (age_days or length_cm).
 */
function interpolateLms(table: LMSPoint[], x: number): { L: number; M: number; S: number } | null {
  if (table.length === 0) return null;
  if (x <= table[0].x) return { L: table[0].L, M: table[0].M, S: table[0].S };
  if (x >= table[table.length - 1].x) {
    const last = table[table.length - 1];
    return { L: last.L, M: last.M, S: last.S };
  }

  for (let i = 0; i < table.length - 1; i++) {
    const lo = table[i];
    const hi = table[i + 1];
    if (lo.x <= x && x <= hi.x) {
      const frac = (x - lo.x) / (hi.x - lo.x);
      return {
        L: lo.L + frac * (hi.L - lo.L),
        M: lo.M + frac * (hi.M - lo.M),
        S: lo.S + frac * (hi.S - lo.S),
      };
    }
  }
  return null;
}

/**
 * WHO LMS z-score formula:
 *   z = ((value / M) ** L - 1) / (L * S)   when L != 0
 *   z = ln(value / M) / S                   when L == 0
 *
 * Clamps extreme values to [-6, 6].
 */
function lmsZscore(value: number, L: number, M: number, S: number): number {
  if (value <= 0 || M <= 0 || S <= 0) return 0;
  let z: number;
  if (Math.abs(L) < 1e-9) {
    z = Math.log(value / M) / S;
  } else {
    z = (Math.pow(value / M, L) - 1) / (L * S);
  }
  z = Math.max(-6.0, Math.min(6.0, z));
  return Math.round(z * 100) / 100;
}

/**
 * Length-for-age z-score (HAZ).
 */
export function calculateHaz(sex: string, ageDays: number, lengthCm: number | null): number | null {
  if (lengthCm == null || lengthCm <= 0) return null;
  const table = sex === 'MALE' ? LFA_BOYS : LFA_GIRLS;
  const lms = interpolateLms(table, ageDays);
  if (!lms) return null;
  return lmsZscore(lengthCm, lms.L, lms.M, lms.S);
}

/**
 * Weight-for-age z-score (WAZ).
 */
export function calculateWaz(sex: string, ageDays: number, weightKg: number | null): number | null {
  if (weightKg == null || weightKg <= 0) return null;
  const table = sex === 'MALE' ? WFA_BOYS : WFA_GIRLS;
  const lms = interpolateLms(table, ageDays);
  if (!lms) return null;
  return lmsZscore(weightKg, lms.L, lms.M, lms.S);
}

/**
 * Weight-for-length z-score (WHZ).
 */
export function calculateWhz(sex: string, lengthCm: number | null, weightKg: number | null): number | null {
  if (weightKg == null || weightKg <= 0 || lengthCm == null || lengthCm <= 0) return null;
  const table = sex === 'MALE' ? WFL_BOYS : WFL_GIRLS;
  const lms = interpolateLms(table, lengthCm);
  if (!lms) return null;
  return lmsZscore(weightKg, lms.L, lms.M, lms.S);
}

export const WHO_LMS_VERSION = 'GMP-WHO-2006-v1';
