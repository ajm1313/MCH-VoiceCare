/**
 * Growth assessment service — mobile offline (§51, DEC-007).
 *
 * Ported from backend/apps/growth/services.py. Calculates z-scores
 * (HAZ, WAZ, WHZ) using WHO LMS tables, classifies malnutrition
 * indicators including MUAC, and applies non-averaging worst-indicator
 * selection.
 */
import { calculateHaz, calculateWaz, calculateWhz, WHO_LMS_VERSION } from './whoLms';

export type GrowthIndicator =
  | 'NORMAL'
  | 'SEVERELY_STUNTED'
  | 'STUNTED'
  | 'SEVERELY_UNDERWEIGHT'
  | 'UNDERWEIGHT'
  | 'SAM'
  | 'MAM'
  | 'SEVERE_WASTING'
  | 'MODERATE_WASTING';

export interface GrowthAssessmentInput {
  sex: string;
  ageDays: number;
  weightKg: number | null;
  lengthCm: number | null;
  heightCm: number | null;
  muacMm: number | null;
  bilateralOedema: boolean;
}

export interface GrowthAssessmentResult {
  haz: number | null;
  waz: number | null;
  whz: number | null;
  indicator: GrowthIndicator;
  ruleSetVersion: string;
}

function classifyZscore(
  z: number | null,
  severeLabel: GrowthIndicator,
  moderateLabel: GrowthIndicator,
): GrowthIndicator {
  if (z == null) return 'NORMAL';
  if (z < -3) return severeLabel;
  if (z < -2) return moderateLabel;
  return 'NORMAL';
}

function classifyMuac(muacMm: number | null, oedema: boolean): GrowthIndicator {
  if (oedema) return 'SAM';
  if (muacMm == null) return 'NORMAL';
  if (muacMm < 115) return 'SAM';
  if (muacMm < 125) return 'MAM';
  return 'NORMAL';
}

const INDICATOR_SEVERITY: Record<GrowthIndicator, number> = {
  NORMAL: 0,
  STUNTED: 1,
  UNDERWEIGHT: 1,
  MODERATE_WASTING: 1,
  MAM: 2,
  SEVERELY_STUNTED: 2,
  SEVERELY_UNDERWEIGHT: 2,
  SEVERE_WASTING: 2,
  SAM: 3,
};

function worstIndicator(indicators: GrowthIndicator[]): GrowthIndicator {
  let worst: GrowthIndicator = 'NORMAL';
  for (const ind of indicators) {
    if (INDICATOR_SEVERITY[ind] > INDICATOR_SEVERITY[worst]) {
      worst = ind;
    }
  }
  return worst;
}

export function runGrowthAssessment(input: GrowthAssessmentInput): GrowthAssessmentResult {
  const lengthOrHeight = input.lengthCm ?? input.heightCm;

  const haz = calculateHaz(input.sex, input.ageDays, lengthOrHeight);
  const waz = calculateWaz(input.sex, input.ageDays, input.weightKg);
  const whz = calculateWhz(input.sex, lengthOrHeight, input.weightKg);

  const muacIndicator = classifyMuac(input.muacMm, input.bilateralOedema);
  const hazInd = classifyZscore(haz, 'SEVERELY_STUNTED', 'STUNTED');
  const wazInd = classifyZscore(waz, 'SEVERELY_UNDERWEIGHT', 'UNDERWEIGHT');
  const whzInd = classifyZscore(whz, 'SEVERE_WASTING', 'MODERATE_WASTING');

  const indicator = worstIndicator([muacIndicator, hazInd, wazInd, whzInd]);

  return {
    haz,
    waz,
    whz,
    indicator,
    ruleSetVersion: WHO_LMS_VERSION,
  };
}
