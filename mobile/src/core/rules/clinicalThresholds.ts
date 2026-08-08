/**
 * Clinical thresholds — spec §33.
 *
 * All clinical thresholds that MUST NOT be hard-coded in source code.
 * Each threshold has a config key (synced from the backend SystemConfig)
 * and a safe default value that is used when the config is not yet synced
 * or the key is missing.
 *
 * The defaults below reflect the Ghana Safe Motherhood Protocol / WHO
 * reference values. They MUST be overridden by GHS-approved configuration
 * before production deployment.
 */
import { getConfigNumber } from '../sync/configStore';

// --- Threshold definitions: [factKey, configKey, defaultValue] ---
const THRESHOLD_DEFS: Array<[string, string, number]> = [
  // Pregnancy — blood pressure
  ['cfg_bp_sys_emergency', 'BP_SYS_EMERGENCY', 160],
  ['cfg_bp_dia_emergency', 'BP_DIA_EMERGENCY', 110],
  ['cfg_bp_sys_elevated', 'BP_SYS_ELEVATED', 140],
  ['cfg_bp_dia_elevated', 'BP_DIA_ELEVATED', 90],

  // Pregnancy — haemoglobin
  ['cfg_hb_severe_low', 'HB_SEVERE_LOW', 7.0],
  ['cfg_hb_moderate_high', 'HB_MODERATE_HIGH', 10.9],

  // Pregnancy — gestational age (in days)
  ['cfg_ga_near_term_days', 'GA_NEAR_TERM_DAYS', 238],
  ['cfg_ga_birth_plan_days', 'GA_BIRTH_PLAN_DAYS', 196],
  ['cfg_ga_post_20w_days', 'GA_POST_20W_DAYS', 140],
  ['cfg_ga_preterm_days', 'GA_PRETERM_DAYS', 259],

  // Pregnancy — maternal age / parity
  ['cfg_maternal_age_young', 'MATERNAL_AGE_YOUNG', 18],
  ['cfg_maternal_age_advanced', 'MATERNAL_AGE_ADVANCED', 35],
  ['cfg_parity_high', 'PARITY_HIGH', 5],
  ['cfg_uterine_discrepancy_weeks', 'UTERINE_DISCREPANCY_WEEKS', 2],

  // Newborn — vital signs
  ['cfg_nb_rr_high', 'NB_RR_HIGH', 60],
  ['cfg_nb_temp_fever', 'NB_TEMP_FEVER', 37.5],
  ['cfg_nb_temp_hypo', 'NB_TEMP_HYPO', 35.5],
  ['cfg_nb_temp_mild_low', 'NB_TEMP_MILD_LOW', 36.5],

  // Newborn — jaundice / weight / gestation
  ['cfg_nb_jaundice_early_hours', 'NB_JAUNDICE_EARLY_HOURS', 24],
  ['cfg_nb_lbw_g', 'NB_LBW_G', 2500],
  ['cfg_nb_preterm_weeks', 'NB_PRETERM_WEEKS', 37],
  ['cfg_nb_rom_hours', 'NB_ROM_HOURS', 18],
  ['cfg_nb_lbw_referral_g', 'NB_LBW_REFERRAL_G', 1800],

  // Newborn — already in injectConfigThresholds but kept for completeness
  ['cfg_chps_lbw_referral_g', 'CHPS_LBW_REFERRAL_G', 1800],
  ['cfg_jaundice_persist_days', 'JAUNDICE_PERSIST_DAYS', 14],
  ['cfg_newborn_urine_hours', 'NEWBORN_URINE_HOURS', 24],
  ['cfg_newborn_meconium_hours', 'NEWBORN_MECONIUM_HOURS', 24],

  // Growth — SD score thresholds
  ['cfg_growth_severe_low_sd', 'GROWTH_SEVERE_LOW_SD', -3],
  ['cfg_growth_moderate_low_sd', 'GROWTH_MODERATE_LOW_SD', -2],
  ['cfg_growth_mild_low_sd', 'GROWTH_MILD_LOW_SD', -1],
  ['cfg_growth_high_sd', 'GROWTH_HIGH_SD', 2],
  ['cfg_growth_static_count', 'GROWTH_STATIC_COUNT', 2],
  ['cfg_growth_weight_loss_pct', 'GROWTH_WEIGHT_LOSS_PCT', 10],
  ['cfg_growth_age_limit_months', 'GROWTH_AGE_LIMIT_MONTHS', 24],

  // Immunisation
  ['cfg_imm_long_defaulter_days', 'IMM_LONG_DEFAULTER_DAYS', 30],
  ['cfg_imm_multi_overdue_count', 'IMM_MULTI_OVERDUE_COUNT', 3],
  ['cfg_imm_missed_sessions_high', 'IMM_MISSED_SESSIONS_HIGH', 2],
  ['cfg_imm_age_limit_months', 'IMM_AGE_LIMIT_MONTHS', 24],
  ['cfg_defaulter_grace_days', 'DEFAULTER_GRACE_DAYS', 7],

  // FHR (already in injectConfigThresholds but kept for completeness)
  ['cfg_fhr_low', 'FHR_LOW', 110],
  ['cfg_fhr_high', 'FHR_HIGH', 160],
];

/**
 * Load all clinical thresholds from the config store and return them
 * as a fact-key → value map. Values use the config store value if
 * available and non-negative; otherwise the safe default is used.
 */
export function loadClinicalThresholds(): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [factKey, configKey, defaultValue] of THRESHOLD_DEFS) {
    const val = getConfigNumber(configKey, defaultValue);
    result[factKey] = val;
  }
  return result;
}

/**
 * Get a single threshold value by its fact key.
 */
export function getThreshold(factKey: string): number | undefined {
  const def = THRESHOLD_DEFS.find(d => d[0] === factKey);
  if (!def) return undefined;
  return getConfigNumber(def[1], def[2]);
}

/**
 * All threshold fact keys, for testing and debugging.
 */
export function getThresholdKeys(): string[] {
  return THRESHOLD_DEFS.map(d => d[0]);
}
