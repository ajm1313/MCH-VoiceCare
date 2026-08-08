/**
 * Offline rule engine — MCHVC-SPEC-001 v1.1 §5, DEC-007.
 *
 * Runs deterministic protocol rules locally on the device so that urgency
 * classification works without internet. AI models run server-side only
 * after synchronisation (PRED-010, OFF-009).
 *
 * Non-averaging rule (§9): overall urgency equals the highest active
 * urgency across all rules; normal findings never cancel an emergency.
 */

import { getConfigNumber, getConfigString } from '../sync/configStore';
import { loadClinicalThresholds } from './clinicalThresholds';

export type UrgencyClass = 'RED' | 'ORANGE' | 'AMBER' | 'GREEN' | 'GREY';

export interface RuleResult {
  rule_id: string;
  urgency: UrgencyClass;
  action_text: string;
}

export interface AssessmentResult {
  minimum_class: UrgencyClass;
  triggered_rule_ids: string[];
  results: RuleResult[];
  recommended_action: string;
}

const URGENCY_RANK: Record<UrgencyClass, number> = {
  RED: 0,
  ORANGE: 1,
  AMBER: 2,
  GREEN: 3,
  GREY: 4,
};

function higher(a: UrgencyClass, b: UrgencyClass): UrgencyClass {
  return URGENCY_RANK[a] <= URGENCY_RANK[b] ? a : b;
}

interface Rule {
  rule_id: string;
  condition: (facts: Record<string, any>) => boolean;
  urgency: UrgencyClass;
  action_text: string;
}

// --- Pregnancy rules (aligned with backend pregnancy_rules.py) ---

const PREGNANCY_RULES: Rule[] = [
  // RED — PREG-R-001..012
  {
    rule_id: 'PREG-R-001',
    condition: f => f.convulsion_or_unconsciousness === true,
    urgency: 'RED',
    action_text: 'Immediate worker alert; urgent referral; do not await AI.',
  },
  {
    rule_id: 'PREG-R-002',
    condition: f => f.vaginal_bleeding === 'HEAVY' || f.suspected_shock_or_collapse === true,
    urgency: 'RED',
    action_text: 'Immediate referral pathway and transport escalation.',
  },
  {
    rule_id: 'PREG-R-003',
    condition: f => (f.bp_systolic_mm_hg != null && f.bp_systolic_mm_hg >= f.cfg_bp_sys_emergency) || (f.bp_diastolic_mm_hg != null && f.bp_diastolic_mm_hg >= f.cfg_bp_dia_emergency),
    urgency: 'RED',
    action_text: 'Urgent referral under hypertensive-disorder protocol.',
  },
  {
    rule_id: 'PREG-R-004',
    condition: f => (f.severe_headache === true || f.visual_disturbance === true || f.epigastric_pain === true) && ((f.bp_systolic_mm_hg != null && f.bp_systolic_mm_hg >= f.cfg_bp_sys_elevated) || (f.bp_diastolic_mm_hg != null && f.bp_diastolic_mm_hg >= f.cfg_bp_dia_elevated) || (f.bp_systolic_mm_hg == null && f.bp_diastolic_mm_hg == null)),
    urgency: 'RED',
    action_text: 'Immediate clinical verification; urgent referral if confirmed or worker judges severe.',
  },
  {
    rule_id: 'PREG-R-005',
    condition: f => f.severe_breathing_difficulty === true || f.suspected_shock_or_collapse === true,
    urgency: 'RED',
    action_text: 'Immediate referral.',
  },
  {
    rule_id: 'PREG-R-006',
    condition: f => f.severe_abdominal_pain === true,
    urgency: 'RED',
    action_text: 'Immediate referral.',
  },
  {
    rule_id: 'PREG-R-007',
    condition: f => f.suspected_sepsis === true,
    urgency: 'RED',
    action_text: 'Immediate referral.',
  },
  {
    rule_id: 'PREG-R-008',
    condition: f => f.suspected_cord_prolapse === true,
    urgency: 'RED',
    action_text: 'Immediate obstetric referral.',
  },
  {
    rule_id: 'PREG-R-009',
    condition: f => (f.hb_g_dl != null && f.hb_g_dl < f.cfg_hb_severe_low) || f.severe_anaemia_symptoms_unstable === true,
    urgency: 'RED',
    action_text: 'Urgent referral to capable facility.',
  },
  {
    rule_id: 'PREG-R-010',
    condition: f => f.fetal_movement_status === 'ABSENT' && (f.fetal_heart_rate === 0 || f.fetal_heart_seriously_abnormal === true),
    urgency: 'RED',
    action_text: 'Urgent referral.',
  },
  {
    rule_id: 'PREG-R-011',
    condition: f => f.worker_judgement_critical === true,
    urgency: 'RED',
    action_text: 'Document rationale and initiate emergency pathway.',
  },
  {
    rule_id: 'PREG-R-012',
    condition: f => f.emergency_referral_incomplete === true,
    urgency: 'RED',
    action_text: 'Escalate closed-loop referral and transport support.',
  },
  // ORANGE — PREG-O-001..015
  {
    rule_id: 'PREG-O-001',
    condition: f => {
      const sys = f.bp_systolic_mm_hg;
      const dia = f.bp_diastolic_mm_hg;
      const elevated = (sys != null && sys >= f.cfg_bp_sys_elevated && sys < f.cfg_bp_sys_emergency) || (dia != null && dia >= f.cfg_bp_dia_elevated && dia < f.cfg_bp_dia_emergency);
      return elevated && f.bp_repeat_after_rest === true && !(sys != null && sys >= f.cfg_bp_sys_emergency) && !(dia != null && dia >= f.cfg_bp_dia_emergency);
    },
    urgency: 'ORANGE',
    action_text: 'Same-day clinician/midwife assessment.',
  },
  {
    rule_id: 'PREG-O-002',
    condition: f => f.vaginal_bleeding === 'SPOTTING' || f.vaginal_bleeding === 'LIGHT',
    urgency: 'ORANGE',
    action_text: 'Same-day assessment; escalate if worsening.',
  },
  {
    rule_id: 'PREG-O-003',
    condition: f => (f.fetal_movement_status === 'REDUCED' || f.fetal_movement_status === 'ABSENT') && (f.gestational_age_days == null || f.gestational_age_days > f.cfg_ga_post_20w_days) && f.definitive_fetal_assessment_done !== true && !(f.fetal_movement_status === 'ABSENT' && (f.fetal_heart_rate === 0 || f.fetal_heart_seriously_abnormal === true)),
    urgency: 'ORANGE',
    action_text: 'Same-day fetal assessment.',
  },
  {
    rule_id: 'PREG-O-004',
    condition: f => f.fluid_leakage === 'SUSPECTED' || f.fluid_leakage === 'CONFIRMED',
    urgency: 'ORANGE',
    action_text: 'Same-day assessment/referral according to gestation and condition.',
  },
  {
    rule_id: 'PREG-O-005',
    condition: f => f.contractions === 'REGULAR' && f.gestational_age_days != null && f.gestational_age_days < f.cfg_ga_preterm_days,
    urgency: 'ORANGE',
    action_text: 'Urgent same-day preterm-labour assessment.',
  },
  {
    rule_id: 'PREG-O-006',
    condition: f => f.fever_or_severe_illness === true && f.suspected_sepsis !== true,
    urgency: 'ORANGE',
    action_text: 'Same-day clinical assessment/testing.',
  },
  {
    rule_id: 'PREG-O-007',
    condition: f => f.anaemia_symptoms === true && (f.hb_g_dl == null || f.hb_g_dl >= 7.0),
    urgency: 'ORANGE',
    action_text: 'Same-day Hb/clinical assessment.',
  },
  {
    rule_id: 'PREG-O-008',
    condition: f => (f.uterine_size_discrepancy_weeks != null && Math.abs(f.uterine_size_discrepancy_weeks) > f.cfg_uterine_discrepancy_weeks) || f.growth_trend_static === true,
    urgency: 'ORANGE',
    action_text: 'Clinical/ultrasound assessment according to protocol.',
  },
  {
    rule_id: 'PREG-O-009',
    condition: f => f.fetal_heart_rate != null && f.cfg_fhr_low != null && f.cfg_fhr_high != null && (f.fetal_heart_rate < f.cfg_fhr_low || f.fetal_heart_rate > f.cfg_fhr_high) && f.fhr_repeat_confirmed === true,
    urgency: 'ORANGE',
    action_text: 'Urgent fetal assessment; threshold is required local configuration.',
  },
  {
    rule_id: 'PREG-O-010',
    condition: f => f.persistent_vomiting_dehydration === true,
    urgency: 'ORANGE',
    action_text: 'Same-day assessment.',
  },
  {
    rule_id: 'PREG-O-011',
    condition: f => f.jaundice_or_liver_symptoms === true,
    urgency: 'ORANGE',
    action_text: 'Same-day assessment.',
  },
  {
    rule_id: 'PREG-O-012',
    condition: f => f.offensive_discharge_with_fever_pain === true,
    urgency: 'ORANGE',
    action_text: 'Same-day infection assessment.',
  },
  {
    rule_id: 'PREG-O-013',
    condition: f => {
      const ga = f.gestational_age_days;
      const nearTerm = ga != null && ga >= f.cfg_ga_near_term_days;
      const abnormalLie = (f.presentation === 'BREECH' || f.presentation === 'TRANSVERSE' || f.presentation === 'OTHER') && nearTerm;
      const multiple = f.fetal_number === 'MULTIPLE';
      return (abnormalLie || multiple) && f.delivery_plan_approved !== true;
    },
    urgency: 'ORANGE',
    action_text: 'Specialist/delivery-plan assessment.',
  },
  {
    rule_id: 'PREG-O-014',
    condition: f => f.critical_lab_result === true,
    urgency: 'ORANGE',
    action_text: 'Same-day review; exact critical values configured.',
  },
  {
    rule_id: 'PREG-O-015',
    condition: f => f.urgent_referral_incomplete_stable === true,
    urgency: 'ORANGE',
    action_text: 'Escalate contact and referral completion.',
  },
  // AMBER — PREG-A-001..020
  {
    rule_id: 'PREG-A-001',
    condition: f => (f.previous_caesarean_count != null && f.previous_caesarean_count > 0) || f.previous_uterine_surgery === true,
    urgency: 'AMBER',
    action_text: 'Enhanced care and delivery plan.',
  },
  {
    rule_id: 'PREG-A-002',
    condition: f => f.previous_stillbirth === true || f.previous_neonatal_death === true,
    urgency: 'AMBER',
    action_text: 'Enhanced surveillance.',
  },
  {
    rule_id: 'PREG-A-003',
    condition: f => f.previous_pph === true || f.previous_obstructed_labour === true,
    urgency: 'AMBER',
    action_text: 'Delivery and referral readiness plan.',
  },
  {
    rule_id: 'PREG-A-004',
    condition: f => f.previous_preeclampsia_eclampsia === true,
    urgency: 'AMBER',
    action_text: 'Enhanced BP surveillance.',
  },
  {
    rule_id: 'PREG-A-005',
    condition: f => f.chronic_hypertension === true,
    urgency: 'AMBER',
    action_text: 'Specialist plan and monitoring.',
  },
  {
    rule_id: 'PREG-A-006',
    condition: f => f.diabetes === 'PRE_EXISTING' || f.diabetes === 'GESTATIONAL' || f.diabetes === 'SUSPECTED',
    urgency: 'AMBER',
    action_text: 'Specialist plan and monitoring.',
  },
  {
    rule_id: 'PREG-A-007',
    condition: f => f.sickle_cell_status === 'DISEASE',
    urgency: 'AMBER',
    action_text: 'Enhanced multidisciplinary care.',
  },
  {
    rule_id: 'PREG-A-008',
    condition: f => f.cardiac_disease === true || f.renal_disease === true || f.epilepsy === true,
    urgency: 'AMBER',
    action_text: 'Specialist care plan.',
  },
  {
    rule_id: 'PREG-A-009',
    condition: f => f.hb_g_dl != null && f.hb_g_dl >= f.cfg_hb_severe_low && f.hb_g_dl <= f.cfg_hb_moderate_high,
    urgency: 'AMBER',
    action_text: 'Treatment/follow-up under protocol and repeat Hb.',
  },
  {
    rule_id: 'PREG-A-010',
    condition: f => f.fetal_number === 'MULTIPLE',
    urgency: 'AMBER',
    action_text: 'Planned higher-level delivery and more frequent surveillance.',
  },
  {
    rule_id: 'PREG-A-011',
    condition: f => f.presentation === 'BREECH' || f.presentation === 'TRANSVERSE' || f.presentation === 'OTHER',
    urgency: 'AMBER',
    action_text: 'Delivery planning and reassessment.',
  },
  {
    rule_id: 'PREG-A-012',
    condition: f => f.maternal_age_years != null && f.maternal_age_years < f.cfg_maternal_age_young,
    urgency: 'AMBER',
    action_text: 'Enhanced clinical and social support.',
  },
  {
    rule_id: 'PREG-A-013',
    condition: f => f.maternal_age_years != null && f.maternal_age_years > f.cfg_maternal_age_advanced && f.gravidity === 1,
    urgency: 'AMBER',
    action_text: 'Enhanced surveillance.',
  },
  {
    rule_id: 'PREG-A-014',
    condition: f => f.parity != null && f.parity > f.cfg_parity_high,
    urgency: 'AMBER',
    action_text: 'Enhanced delivery readiness.',
  },
  {
    rule_id: 'PREG-A-015',
    condition: f => f.late_booking_or_missed_anc === true,
    urgency: 'AMBER',
    action_text: 'Active follow-up.',
  },
  {
    rule_id: 'PREG-A-016',
    condition: f => f.rhesus_status === 'NEGATIVE',
    urgency: 'AMBER',
    action_text: 'Referral/testing plan.',
  },
  {
    rule_id: 'PREG-A-017',
    condition: f => f.severe_access_barrier === true,
    urgency: 'AMBER',
    action_text: 'Individualised access and emergency plan.',
  },
  {
    rule_id: 'PREG-A-018',
    condition: f => f.gestational_age_days != null && f.gestational_age_days >= f.cfg_ga_birth_plan_days && f.birth_plan_complete === false,
    urgency: 'AMBER',
    action_text: 'Birth-preparedness task.',
  },
  {
    rule_id: 'PREG-A-019',
    condition: f => f.infection_followup_incomplete === true,
    urgency: 'AMBER',
    action_text: 'Confidential follow-up task.',
  },
  {
    rule_id: 'PREG-A-020',
    condition: f => f.specialist_recommendation_incomplete === true,
    urgency: 'AMBER',
    action_text: 'Track completion and escalate if time-critical.',
  },
  // GREY — PREG-G-001..007
  {
    rule_id: 'PREG-G-001',
    condition: f => f.gestational_age_days == null && f.edd_date == null,
    urgency: 'GREY',
    action_text: 'Dating assessment task.',
  },
  {
    rule_id: 'PREG-G-002',
    condition: f => f.is_clinical_contact === true && f.bp_systolic_mm_hg == null && f.bp_diastolic_mm_hg == null,
    urgency: 'GREY',
    action_text: 'Measurement task; do not assign GREEN.',
  },
  {
    rule_id: 'PREG-G-003',
    condition: f => f.hb_required_by_protocol === true && f.hb_g_dl == null,
    urgency: 'GREY',
    action_text: 'Test/data verification task.',
  },
  {
    rule_id: 'PREG-G-004',
    condition: f => f.gestational_age_days != null && f.gestational_age_days > f.cfg_ga_post_20w_days && (f.fetal_movement_status == null || f.fetal_movement_status === 'UNKNOWN'),
    urgency: 'GREY',
    action_text: 'Clinical assessment task.',
  },
  {
    rule_id: 'PREG-G-005',
    condition: f => f.symptom_not_understood === true,
    urgency: 'GREY',
    action_text: 'Human callback in preferred language.',
  },
  {
    rule_id: 'PREG-G-006',
    condition: f => f.records_conflicting === true,
    urgency: 'GREY',
    action_text: 'Identity/data reconciliation.',
  },
  {
    rule_id: 'PREG-G-007',
    condition: f => f.client_uncontactable === true,
    urgency: 'GREY',
    action_text: 'Tracing task based on risk and due care.',
  },
];

// --- Newborn rules (aligned with backend newborn_rules.py) ---

const NEWBORN_RULES: Rule[] = [
  // RED — NEO-R-001..013
  {
    rule_id: 'NEO-R-001',
    condition: f => f.feeding_status === 'UNABLE' || f.feeding_status === 'STOPPED' || (f.feeding_status === 'POOR' && f.marked_illness === true),
    urgency: 'RED',
    action_text: 'Immediate urgent assessment/referral.',
  },
  {
    rule_id: 'NEO-R-002',
    condition: f => f.convulsions === true,
    urgency: 'RED',
    action_text: 'Immediate referral.',
  },
  {
    rule_id: 'NEO-R-003',
    condition: f => f.movement_status === 'NONE' || f.movement_status === 'ONLY_WHEN_STIMULATED',
    urgency: 'RED',
    action_text: 'Immediate referral.',
  },
  {
    rule_id: 'NEO-R-004',
    condition: f => f.respiratory_rate_min != null && f.respiratory_rate_min >= f.cfg_nb_rr_high && f.rr_repeat_confirmed === true,
    urgency: 'RED',
    action_text: 'Immediate assessment/referral.',
  },
  {
    rule_id: 'NEO-R-005',
    condition: f => f.severe_chest_indrawing === true || f.grunting === true || f.apnoea_or_gasping === true || f.central_cyanosis === true,
    urgency: 'RED',
    action_text: 'Immediate referral.',
  },
  {
    rule_id: 'NEO-R-006',
    condition: f => f.temperature_c != null && f.temperature_c >= f.cfg_nb_temp_fever,
    urgency: 'RED',
    action_text: 'Urgent severe-infection assessment/referral.',
  },
  {
    rule_id: 'NEO-R-007',
    condition: f => f.temperature_c != null && f.temperature_c < f.cfg_nb_temp_hypo,
    urgency: 'RED',
    action_text: 'Urgent assessment/referral while maintaining warmth under approved protocol.',
  },
  {
    rule_id: 'NEO-R-008',
    condition: f => (f.jaundice_onset_age_hours != null && f.jaundice_onset_age_hours <= f.cfg_nb_jaundice_early_hours) || f.yellow_palms_soles === true,
    urgency: 'RED',
    action_text: 'Urgent jaundice assessment/referral.',
  },
  {
    rule_id: 'NEO-R-009',
    condition: f => f.umbilical_status === 'REDNESS_EXTENDS_TO_ABDOMEN',
    urgency: 'RED',
    action_text: 'Urgent infection referral.',
  },
  {
    rule_id: 'NEO-R-010',
    condition: f => f.bulging_fontanelle === true || f.skin_pustules_extent === 'EXTENSIVE' || f.suspected_severe_infection === true,
    urgency: 'RED',
    action_text: 'Immediate referral.',
  },
  {
    rule_id: 'NEO-R-011',
    condition: f => f.vomiting === 'GREEN' || f.vomiting === 'BLOODY' || f.abdominal_distension === true,
    urgency: 'RED',
    action_text: 'Immediate referral.',
  },
  {
    rule_id: 'NEO-R-012',
    condition: f => {
      const bw = f.birth_weight_g;
      const threshold = f.cfg_chps_lbw_referral_g ?? f.cfg_nb_lbw_referral_g;
      if (bw == null || bw >= threshold) return false;
      const unstable = f.worker_judgement_critical === true || f.apnoea_or_gasping === true || f.central_cyanosis === true || f.convulsions === true || (f.temperature_c != null && f.temperature_c < 35.5) || f.feeding_status === 'UNABLE' || f.feeding_status === 'STOPPED';
      return unstable;
    },
    urgency: 'RED',
    action_text: 'Refer to capability-appropriate newborn care; unstable = RED.',
  },
  {
    rule_id: 'NEO-R-013',
    condition: f => f.worker_judgement_critical === true,
    urgency: 'RED',
    action_text: 'Document rationale and refer immediately.',
  },
  // ORANGE — NEO-O-001..014
  {
    rule_id: 'NEO-O-001',
    condition: f => f.temperature_c != null && f.temperature_c >= f.cfg_nb_temp_hypo && f.temperature_c < f.cfg_nb_temp_mild_low && !(f.temperature_c < f.cfg_nb_temp_hypo),
    urgency: 'ORANGE',
    action_text: 'Same-day assessment and repeat temperature.',
  },
  {
    rule_id: 'NEO-O-002',
    condition: f => f.recurrent_hypothermia_despite_warming === true,
    urgency: 'ORANGE',
    action_text: 'Same-day higher-level assessment.',
  },
  {
    rule_id: 'NEO-O-003',
    condition: f => f.feeding_status === 'POOR' && f.marked_illness !== true,
    urgency: 'ORANGE',
    action_text: 'Same-day feeding and illness assessment.',
  },
  {
    rule_id: 'NEO-O-004',
    condition: f => f.jaundice_onset_age_hours != null && f.jaundice_onset_age_hours > f.cfg_nb_jaundice_early_hours && !((f.jaundice_onset_age_hours != null && f.jaundice_onset_age_hours <= f.cfg_nb_jaundice_early_hours) || f.yellow_palms_soles === true) && f.yellow_palms_soles !== true,
    urgency: 'ORANGE',
    action_text: 'Same-day clinical assessment according to age.',
  },
  {
    rule_id: 'NEO-O-005',
    condition: f => f.cfg_jaundice_persist_days != null && f.jaundice_onset_age_hours != null && f.age_hours != null && (f.age_hours - f.jaundice_onset_age_hours) >= f.cfg_jaundice_persist_days * 24,
    urgency: 'ORANGE',
    action_text: 'Assessment; configuration required.',
  },
  {
    rule_id: 'NEO-O-006',
    condition: f => f.umbilical_status === 'RED' || f.umbilical_status === 'PUS',
    urgency: 'ORANGE',
    action_text: 'Same-day local-infection assessment.',
  },
  {
    rule_id: 'NEO-O-007',
    condition: f => f.skin_pustules_extent === 'LOCAL' || f.eye_discharge === 'PURULENT' || f.eye_discharge === 'SWOLLEN',
    urgency: 'ORANGE',
    action_text: 'Same-day assessment.',
  },
  {
    rule_id: 'NEO-O-008',
    condition: f => (f.vomiting === 'REPEATED' || f.vomiting === 'SMALL') && f.vomiting !== 'GREEN' && f.vomiting !== 'BLOODY',
    urgency: 'ORANGE',
    action_text: 'Same-day assessment.',
  },
  {
    rule_id: 'NEO-O-009',
    condition: f => f.movement_status === 'REDUCED',
    urgency: 'ORANGE',
    action_text: 'Same-day assessment.',
  },
  {
    rule_id: 'NEO-O-010',
    condition: f => f.respiratory_abnormality_needs_verification === true,
    urgency: 'ORANGE',
    action_text: 'Repeat and same-day assessment.',
  },
  {
    rule_id: 'NEO-O-011',
    condition: f => {
      const bw = f.birth_weight_g;
      const threshold = f.cfg_chps_lbw_referral_g ?? f.cfg_nb_lbw_referral_g;
      if (bw == null || bw >= threshold) return false;
      const unstable = f.worker_judgement_critical === true || f.apnoea_or_gasping === true || f.central_cyanosis === true || f.convulsions === true || (f.temperature_c != null && f.temperature_c < 35.5) || f.feeding_status === 'UNABLE' || f.feeding_status === 'STOPPED';
      return !unstable;
    },
    urgency: 'ORANGE',
    action_text: 'Feeding/growth assessment; threshold is configurable.',
  },
  {
    rule_id: 'NEO-O-012',
    condition: f => {
      const age = f.age_hours;
      if (age == null) return false;
      const noUrine = f.urine_passed === 'NO' && f.cfg_newborn_urine_hours != null && age >= f.cfg_newborn_urine_hours;
      const noMeconium = f.meconium_passed === 'NO' && f.cfg_newborn_meconium_hours != null && age >= f.cfg_newborn_meconium_hours;
      return noUrine || noMeconium;
    },
    urgency: 'ORANGE',
    action_text: 'Urgent clinical assessment; thresholds configurable.',
  },
  {
    rule_id: 'NEO-O-013',
    condition: f => f.place_of_birth === 'HOME' && f.newborn_exam_done !== true,
    urgency: 'ORANGE',
    action_text: 'Same-day newborn examination.',
  },
  {
    rule_id: 'NEO-O-014',
    condition: f => f.discharged_sick_small === true && f.missed_early_followup === true,
    urgency: 'ORANGE',
    action_text: 'Same-day contact/assessment.',
  },
  // AMBER — NEO-A-001..016
  {
    rule_id: 'NEO-A-001',
    condition: f => f.gestational_age_weeks != null && f.gestational_age_weeks < f.cfg_nb_preterm_weeks,
    urgency: 'AMBER',
    action_text: 'Enhanced follow-up and KMC/feeding plan.',
  },
  {
    rule_id: 'NEO-A-002',
    condition: f => f.birth_weight_g != null && f.birth_weight_g < f.cfg_nb_lbw_g,
    urgency: 'AMBER',
    action_text: 'Enhanced follow-up.',
  },
  {
    rule_id: 'NEO-A-003',
    condition: f => f.multiple_birth_order != null && f.multiple_birth_order > 1,
    urgency: 'AMBER',
    action_text: 'Feeding, warmth and growth follow-up.',
  },
  {
    rule_id: 'NEO-A-004',
    condition: f => f.resuscitation_required === true && f.worker_judgement_critical !== true,
    urgency: 'AMBER',
    action_text: 'Early review and neurological/feeding surveillance.',
  },
  {
    rule_id: 'NEO-A-005',
    condition: f => f.previous_newborn_unit_admission === true,
    urgency: 'AMBER',
    action_text: 'Discharge/counter-referral follow-up.',
  },
  {
    rule_id: 'NEO-A-006',
    condition: f => f.maternal_major_chronic_illness === true,
    urgency: 'AMBER',
    action_text: 'Individual clinical plan.',
  },
  {
    rule_id: 'NEO-A-007',
    condition: f => f.maternal_infection_exposure_task === true,
    urgency: 'AMBER',
    action_text: 'Confidential exposure-management follow-up.',
  },
  {
    rule_id: 'NEO-A-008',
    condition: f => f.maternal_fever_labour === true || (f.rupture_membranes_hours != null && f.rupture_membranes_hours > f.cfg_nb_rom_hours),
    urgency: 'AMBER',
    action_text: 'Infection surveillance.',
  },
  {
    rule_id: 'NEO-A-009',
    condition: f => f.congenital_abnormality === true,
    urgency: 'AMBER',
    action_text: 'Specialist and functional follow-up.',
  },
  {
    rule_id: 'NEO-A-010',
    condition: f => f.complex_feeding_plan === true,
    urgency: 'AMBER',
    action_text: 'Feeding competency and weight monitoring.',
  },
  {
    rule_id: 'NEO-A-011',
    condition: f => f.kmc_status === 'STARTED' || f.kmc_status === 'CONTINUING' || f.kmc_status === 'INTERRUPTED',
    urgency: 'AMBER',
    action_text: 'KMC duration, temperature and weight tasks.',
  },
  {
    rule_id: 'NEO-A-012',
    condition: f => f.maternal_ability_to_care === 'UNABLE' || f.maternal_death === true,
    urgency: 'AMBER',
    action_text: 'Alternative caregiver and feeding plan.',
  },
  {
    rule_id: 'NEO-A-013',
    condition: f => f.severe_access_barrier === true,
    urgency: 'AMBER',
    action_text: 'More proactive home follow-up.',
  },
  {
    rule_id: 'NEO-A-014',
    condition: f => f.missed_postnatal_contact === true,
    urgency: 'AMBER',
    action_text: 'Recover contact.',
  },
  {
    rule_id: 'NEO-A-015',
    condition: f => f.essential_care_complete === false,
    urgency: 'AMBER',
    action_text: 'Complete/verify according to protocol.',
  },
  {
    rule_id: 'NEO-A-016',
    condition: f => f.discharged === true && f.next_follow_up_datetime == null,
    urgency: 'AMBER',
    action_text: 'Create dated care-plan task.',
  },
  // GREY — NEO-G-001..007
  {
    rule_id: 'NEO-G-001',
    condition: f => f.birth_weight_g == null,
    urgency: 'GREY',
    action_text: 'Obtain/verify weight.',
  },
  {
    rule_id: 'NEO-G-002',
    condition: f => f.gestational_age_weeks == null,
    urgency: 'GREY',
    action_text: 'Clinical/dating assessment.',
  },
  {
    rule_id: 'NEO-G-003',
    condition: f => f.is_required_contact === true && f.temperature_c == null,
    urgency: 'GREY',
    action_text: 'Measure temperature.',
  },
  {
    rule_id: 'NEO-G-004',
    condition: f => f.is_danger_assessment === true && f.respiratory_rate_min == null,
    urgency: 'GREY',
    action_text: 'Count for full minute.',
  },
  {
    rule_id: 'NEO-G-005',
    condition: f => f.feeding_status == null || f.feeding_status === 'UNKNOWN',
    urgency: 'GREY',
    action_text: 'Observe or verify feeding.',
  },
  {
    rule_id: 'NEO-G-006',
    condition: f => f.symptom_not_understood === true,
    urgency: 'GREY',
    action_text: 'Human callback; never reassure automatically.',
  },
  {
    rule_id: 'NEO-G-007',
    condition: f => f.current_location_status === 'UNKNOWN' || f.caregiver_uncontactable === true,
    urgency: 'GREY',
    action_text: 'Urgent tracing based on age and prior risk.',
  },
];

// --- Growth rules (aligned with backend growth_rules.py) ---

const GROWTH_RULES: Rule[] = [
  // RED — GRO-R-001..003
  {
    rule_id: 'GRO-R-001',
    condition: f => f.weight_for_age_sd != null && f.weight_for_age_sd <= f.cfg_growth_severe_low_sd,
    urgency: 'RED',
    action_text: 'Severe acute malnutrition — urgent referral to therapeutic feeding programme.',
  },
  {
    rule_id: 'GRO-R-002',
    condition: f => f.weight_for_height_sd != null && f.weight_for_height_sd <= f.cfg_growth_severe_low_sd,
    urgency: 'RED',
    action_text: 'Severe wasting — urgent referral.',
  },
  {
    rule_id: 'GRO-R-003',
    condition: f => f.height_for_age_sd != null && f.height_for_age_sd <= f.cfg_growth_severe_low_sd && f.stunting_confirmed === true,
    urgency: 'RED',
    action_text: 'Severe stunting with complications — urgent specialist referral.',
  },
  // ORANGE — GRO-O-001..006
  {
    rule_id: 'GRO-O-001',
    condition: f => f.weight_for_age_sd != null && f.weight_for_age_sd > f.cfg_growth_severe_low_sd && f.weight_for_age_sd <= f.cfg_growth_moderate_low_sd,
    urgency: 'ORANGE',
    action_text: 'Moderate acute malnutrition — supplementary feeding and same-day assessment.',
  },
  {
    rule_id: 'GRO-O-002',
    condition: f => f.weight_for_height_sd != null && f.weight_for_height_sd > f.cfg_growth_severe_low_sd && f.weight_for_height_sd <= f.cfg_growth_moderate_low_sd,
    urgency: 'ORANGE',
    action_text: 'Moderate wasting — supplementary feeding programme.',
  },
  {
    rule_id: 'GRO-O-003',
    condition: f => f.weight_for_height_sd != null && f.weight_for_height_sd >= f.cfg_growth_high_sd,
    urgency: 'ORANGE',
    action_text: 'Possible oedema or overweight — clinical assessment.',
  },
  {
    rule_id: 'GRO-O-004',
    condition: f => f.height_for_age_sd != null && f.height_for_age_sd > f.cfg_growth_severe_low_sd && f.height_for_age_sd <= f.cfg_growth_moderate_low_sd,
    urgency: 'ORANGE',
    action_text: 'Moderate stunting — nutrition counselling and growth monitoring.',
  },
  {
    rule_id: 'GRO-O-005',
    condition: f => f.weight_trend_static === true && f.consecutive_static_measurements != null && f.consecutive_static_measurements >= f.cfg_growth_static_count,
    urgency: 'ORANGE',
    action_text: 'Growth faltering — same-day assessment and feeding review.',
  },
  {
    rule_id: 'GRO-O-006',
    condition: f => f.weight_loss_percent != null && f.weight_loss_percent >= f.cfg_growth_weight_loss_pct,
    urgency: 'ORANGE',
    action_text: 'Significant weight loss — urgent nutritional assessment.',
  },
  // AMBER — GRO-A-001..004
  {
    rule_id: 'GRO-A-001',
    condition: f => f.weight_for_age_sd != null && f.weight_for_age_sd > f.cfg_growth_moderate_low_sd && f.weight_for_age_sd <= f.cfg_growth_mild_low_sd,
    urgency: 'AMBER',
    action_text: 'Mild underweight — enhanced growth monitoring.',
  },
  {
    rule_id: 'GRO-A-002',
    condition: f => f.height_for_age_sd != null && f.height_for_age_sd > f.cfg_growth_moderate_low_sd && f.height_for_age_sd <= f.cfg_growth_mild_low_sd,
    urgency: 'AMBER',
    action_text: 'Mild stunting — nutrition counselling.',
  },
  {
    rule_id: 'GRO-A-003',
    condition: f => f.premature_birth === true,
    urgency: 'AMBER',
    action_text: 'Corrected-age growth monitoring until age 2.',
  },
  {
    rule_id: 'GRO-A-004',
    condition: f => f.missing_growth_measurement === true && f.age_months != null && f.age_months <= f.cfg_growth_age_limit_months,
    urgency: 'AMBER',
    action_text: 'Growth measurement overdue — schedule measurement.',
  },
  // GREY — GRO-G-001..003
  {
    rule_id: 'GRO-G-001',
    condition: f => f.weight_for_age_sd == null && f.weight_kg != null,
    urgency: 'GREY',
    action_text: 'Calculate weight-for-age SD score.',
  },
  {
    rule_id: 'GRO-G-002',
    condition: f => f.height_for_age_sd == null && f.height_cm != null,
    urgency: 'GREY',
    action_text: 'Calculate height-for-age SD score.',
  },
  {
    rule_id: 'GRO-G-003',
    condition: f => f.weight_kg == null && f.height_cm == null,
    urgency: 'GREY',
    action_text: 'Growth measurement needed.',
  },
];

// --- Immunisation rules (aligned with backend immunisation_rules.py) ---

const IMMUNISATION_RULES: Rule[] = [
  // RED — IMM-R-001..002
  {
    rule_id: 'IMM-R-001',
    condition: f => f.aefi_severe_reaction === true,
    urgency: 'RED',
    action_text: 'Severe AEFI — immediate referral and adverse event reporting.',
  },
  {
    rule_id: 'IMM-R-002',
    condition: f => f.cold_chain_breach_confirmed === true && f.doses_administered_from_breach === true,
    urgency: 'RED',
    action_text: 'Cold chain breach with doses administered — immediate recall and revaccination plan.',
  },
  // ORANGE — IMM-O-001..006
  {
    rule_id: 'IMM-O-001',
    condition: f => f.defaulter_status === 'ACTIVE' && f.days_overdue != null && f.days_overdue >= f.cfg_imm_long_defaulter_days,
    urgency: 'ORANGE',
    action_text: 'Long-term defaulter — urgent tracing and catch-up vaccination.',
  },
  {
    rule_id: 'IMM-O-002',
    condition: f => f.aefi_mild_reaction === true && f.aefi_severe_reaction !== true,
    urgency: 'ORANGE',
    action_text: 'Mild AEFI — same-day assessment and adverse event reporting.',
  },
  {
    rule_id: 'IMM-O-003',
    condition: f => f.cold_chain_breach_confirmed === true && f.doses_administered_from_breach !== true,
    urgency: 'ORANGE',
    action_text: 'Cold chain breach — same-day assessment and vaccine disposal.',
  },
  {
    rule_id: 'IMM-O-004',
    condition: f => f.overdue_vaccine_count != null && f.overdue_vaccine_count >= f.cfg_imm_multi_overdue_count,
    urgency: 'ORANGE',
    action_text: 'Multiple overdue vaccines — urgent catch-up plan.',
  },
  {
    rule_id: 'IMM-O-005',
    condition: f => f.missed_cwc_sessions != null && f.missed_cwc_sessions >= f.cfg_imm_missed_sessions_high,
    urgency: 'ORANGE',
    action_text: 'Multiple missed CWC sessions — tracing and catch-up.',
  },
  {
    rule_id: 'IMM-O-006',
    condition: f => f.cfg_defaulter_grace_days != null && f.days_overdue != null && f.days_overdue >= f.cfg_defaulter_grace_days && f.defaulter_status !== 'ACTIVE',
    urgency: 'ORANGE',
    action_text: 'Defaulter threshold reached — initiate tracing protocol.',
  },
  // AMBER — IMM-A-001..004
  {
    rule_id: 'IMM-A-001',
    condition: f => f.defaulter_status === 'ACTIVE' && f.days_overdue != null && f.days_overdue < f.cfg_imm_long_defaulter_days,
    urgency: 'AMBER',
    action_text: 'Recent defaulter — contact and schedule catch-up.',
  },
  {
    rule_id: 'IMM-A-002',
    condition: f => f.overdue_vaccine_count != null && f.overdue_vaccine_count >= 1 && f.overdue_vaccine_count < f.cfg_imm_multi_overdue_count,
    urgency: 'AMBER',
    action_text: 'Overdue vaccine — schedule catch-up vaccination.',
  },
  {
    rule_id: 'IMM-A-003',
    condition: f => f.missed_cwc_sessions != null && f.missed_cwc_sessions === 1,
    urgency: 'AMBER',
    action_text: 'Missed CWC session — follow-up contact.',
  },
  {
    rule_id: 'IMM-A-004',
    condition: f => f.premature_birth === true && f.bcg_given !== true,
    urgency: 'AMBER',
    action_text: 'Premature infant without BCG — assess for vaccination eligibility.',
  },
  // GREY — IMM-G-001..003
  {
    rule_id: 'IMM-G-001',
    condition: f => f.vaccine_history_incomplete === true,
    urgency: 'GREY',
    action_text: 'Verify immunisation history.',
  },
  {
    rule_id: 'IMM-G-002',
    condition: f => f.next_due_vaccine == null && f.age_months != null && f.age_months <= f.cfg_imm_age_limit_months,
    urgency: 'GREY',
    action_text: 'Immunisation schedule lookup needed.',
  },
  {
    rule_id: 'IMM-G-003',
    condition: f => f.caregiver_uncontactable === true,
    urgency: 'GREY',
    action_text: 'Tracing task for immunisation follow-up.',
  },
];

const RULE_SETS: Record<string, Rule[]> = {
  pregnancy: PREGNANCY_RULES,
  newborn: NEWBORN_RULES,
  growth: GROWTH_RULES,
  immunisation: IMMUNISATION_RULES,
};

// --- Config injection (spec §33: thresholds MUST be externally configurable) ---

export function injectConfigThresholds(facts: Record<string, any>): Record<string, any> {
  const enriched = { ...facts };

  // Inject all clinical thresholds from the config store (spec §33).
  // Only inject if the fact key is not already set by the caller.
  const thresholds = loadClinicalThresholds();
  for (const [key, value] of Object.entries(thresholds)) {
    if (enriched[key] == null) {
      enriched[key] = value;
    }
  }

  // String config values
  const mlMode = getConfigString('CLINICAL_ML_MODE', '');
  if (enriched.cfg_ml_mode == null && mlMode) {
    enriched.cfg_ml_mode = mlMode;
  }

  return enriched;
}

export function evaluateOffline(
  module: 'pregnancy' | 'newborn' | 'growth' | 'immunisation',
  facts: Record<string, any>,
): AssessmentResult {
  const rules = RULE_SETS[module] || [];
  const enrichedFacts = injectConfigThresholds(facts);
  const triggered: RuleResult[] = [];

  for (const rule of rules) {
    try {
      if (rule.condition(enrichedFacts)) {
        triggered.push({
          rule_id: rule.rule_id,
          urgency: rule.urgency,
          action_text: rule.action_text,
        });
      }
    } catch {
      // Fact missing — skip silently
    }
  }

  let minClass: UrgencyClass = 'GREEN';
  const triggeredIds: string[] = [];
  let action = 'Routine monitoring; danger-sign education continues.';

  if (triggered.length > 0) {
    for (const t of triggered) {
      minClass = higher(minClass, t.urgency);
      triggeredIds.push(t.rule_id);
    }
    const highest = triggered.find(t => t.urgency === minClass);
    action = highest?.action_text || action;
  }

  return {
    minimum_class: minClass,
    triggered_rule_ids: triggeredIds,
    results: triggered,
    recommended_action: action,
  };
}
