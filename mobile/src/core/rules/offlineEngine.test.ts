/**
 * Tests for the offline rule engine (§5, DEC-007).
 */
import { evaluateOffline, injectConfigThresholds } from './offlineEngine';
import { computeUnifiedDecision } from './unifiedDecision';

describe('offlineEngine — pregnancy rules', () => {
  it('returns GREEN when no danger signs', () => {
    const result = evaluateOffline('pregnancy', {
      bp_systolic_mm_hg: 110,
      bp_diastolic_mm_hg: 70,
      is_clinical_contact: true,
      edd_date: '2026-01-01',
    });
    expect(result.minimum_class).toBe('GREEN');
    expect(result.triggered_rule_ids).toHaveLength(0);
  });

  it('triggers RED for heavy vaginal bleeding', () => {
    const result = evaluateOffline('pregnancy', { vaginal_bleeding: 'HEAVY' });
    expect(result.minimum_class).toBe('RED');
    expect(result.triggered_rule_ids).toContain('PREG-R-002');
  });

  it('triggers RED for severe hypertension (systolic ≥ 160)', () => {
    const result = evaluateOffline('pregnancy', { bp_systolic_mm_hg: 165 });
    expect(result.minimum_class).toBe('RED');
    expect(result.triggered_rule_ids).toContain('PREG-R-003');
  });

  it('triggers AMBER for moderate hypertension (140–159) with repeat', () => {
    const result = evaluateOffline('pregnancy', { bp_systolic_mm_hg: 145, bp_repeat_after_rest: true });
    expect(result.minimum_class).toBe('ORANGE');
    expect(result.triggered_rule_ids).toContain('PREG-O-001');
  });

  it('triggers PREG-G-002 when BP missing at clinical contact', () => {
    const result = evaluateOffline('pregnancy', {
      is_clinical_contact: true,
      edd_date: '2026-01-01',
    });
    expect(result.triggered_rule_ids).toContain('PREG-G-002');
    expect(result.results.find(r => r.rule_id === 'PREG-G-002')?.urgency).toBe('GREY');
  });

  it('non-averaging: highest urgency wins', () => {
    const result = evaluateOffline('pregnancy', {
      vaginal_bleeding: 'HEAVY',
      bp_systolic_mm_hg: 145,
      bp_repeat_after_rest: true,
    });
    expect(result.minimum_class).toBe('RED');
    expect(result.triggered_rule_ids).toContain('PREG-R-002');
    expect(result.triggered_rule_ids).toContain('PREG-O-001');
  });

  it('worker judgement critical overrides to RED', () => {
    const result = evaluateOffline('pregnancy', {
      worker_judgement_critical: true,
      bp_systolic_mm_hg: 110,
      is_clinical_contact: true,
      edd_date: '2026-01-01',
    });
    expect(result.minimum_class).toBe('RED');
    expect(result.triggered_rule_ids).toContain('PREG-R-011');
  });
});

describe('offlineEngine — newborn rules', () => {
  it('returns GREEN when no danger signs', () => {
    const result = evaluateOffline('newborn', {
      temperature_c: 36.8,
      respiratory_rate_min: 40,
      birth_weight_g: 3200,
      gestational_age_weeks: 39,
      feeding_status: 'NORMAL',
    });
    expect(result.minimum_class).toBe('GREEN');
    expect(result.triggered_rule_ids).toHaveLength(0);
  });

  it('triggers RED for severe chest indrawing', () => {
    const result = evaluateOffline('newborn', { severe_chest_indrawing: true });
    expect(result.minimum_class).toBe('RED');
    expect(result.triggered_rule_ids).toContain('NEO-R-005');
  });

  it('triggers RED for hypothermia (< 35.5°C)', () => {
    const result = evaluateOffline('newborn', { temperature_c: 35.0 });
    expect(result.minimum_class).toBe('RED');
    expect(result.triggered_rule_ids).toContain('NEO-R-007');
  });

  it('triggers RED for fever (≥ 37.5°C)', () => {
    const result = evaluateOffline('newborn', { temperature_c: 38.0 });
    expect(result.minimum_class).toBe('RED');
    expect(result.triggered_rule_ids).toContain('NEO-R-006');
  });

  it('triggers RED for fast breathing (RR ≥ 60)', () => {
    const result = evaluateOffline('newborn', { respiratory_rate_min: 65, rr_repeat_confirmed: true });
    expect(result.minimum_class).toBe('RED');
    expect(result.triggered_rule_ids).toContain('NEO-R-004');
  });

  it('triggers RED for convulsions', () => {
    const result = evaluateOffline('newborn', { convulsions: true });
    expect(result.minimum_class).toBe('RED');
    expect(result.triggered_rule_ids).toContain('NEO-R-002');
  });

  it('worker judgement critical triggers RED', () => {
    const result = evaluateOffline('newborn', {
      worker_judgement_critical: true,
      temperature_c: 36.8,
    });
    expect(result.minimum_class).toBe('RED');
    expect(result.triggered_rule_ids).toContain('NEO-R-013');
  });

  it('multiple triggers: highest urgency wins (non-averaging)', () => {
    const result = evaluateOffline('newborn', {
      severe_chest_indrawing: true,
      convulsions: true,
      temperature_c: 38.0,
    });
    expect(result.minimum_class).toBe('RED');
    expect(result.triggered_rule_ids).toContain('NEO-R-002');
    expect(result.triggered_rule_ids).toContain('NEO-R-005');
    expect(result.triggered_rule_ids).toContain('NEO-R-006');
  });
});

describe('offlineEngine — growth rules', () => {
  it('returns GREEN when growth is normal', () => {
    const result = evaluateOffline('growth', {
      weight_for_age_sd: 0.5,
      height_for_age_sd: 0.3,
      weight_for_height_sd: 0.2,
      weight_kg: 8.5,
      height_cm: 72,
    });
    expect(result.minimum_class).toBe('GREEN');
    expect(result.triggered_rule_ids).toHaveLength(0);
  });

  it('triggers RED for severe acute malnutrition (WFA ≤ -3 SD)', () => {
    const result = evaluateOffline('growth', { weight_for_age_sd: -3.5 });
    expect(result.minimum_class).toBe('RED');
    expect(result.triggered_rule_ids).toContain('GRO-R-001');
  });

  it('triggers ORANGE for moderate wasting (WFH -2 to -3 SD)', () => {
    const result = evaluateOffline('growth', { weight_for_height_sd: -2.5 });
    expect(result.minimum_class).toBe('ORANGE');
    expect(result.triggered_rule_ids).toContain('GRO-O-002');
  });

  it('triggers AMBER for mild underweight (WFA -1 to -2 SD)', () => {
    const result = evaluateOffline('growth', { weight_for_age_sd: -1.5 });
    expect(result.minimum_class).toBe('AMBER');
    expect(result.triggered_rule_ids).toContain('GRO-A-001');
  });

  it('triggers GREY when weight and height missing', () => {
    const result = evaluateOffline('growth', {});
    expect(result.triggered_rule_ids).toContain('GRO-G-003');
  });
});

describe('offlineEngine — immunisation rules', () => {
  it('returns GREEN when no issues', () => {
    const result = evaluateOffline('immunisation', {
      overdue_vaccine_count: 0,
      missed_cwc_sessions: 0,
      age_months: 12,
      next_due_vaccine: 'OPV3',
      vaccine_code: 'OPV3',
      dose_number: 3,
    });
    expect(result.minimum_class).toBe('GREEN');
    expect(result.triggered_rule_ids).toHaveLength(0);
  });

  it('triggers RED for severe AEFI', () => {
    const result = evaluateOffline('immunisation', { aefi_severe_reaction: true });
    expect(result.minimum_class).toBe('RED');
    expect(result.triggered_rule_ids).toContain('IMM-R-001');
  });

  it('triggers ORANGE for long-term defaulter (≥ 30 days)', () => {
    const result = evaluateOffline('immunisation', {
      defaulter_status: 'ACTIVE',
      days_overdue: 45,
    });
    expect(result.minimum_class).toBe('ORANGE');
    expect(result.triggered_rule_ids).toContain('IMM-O-001');
  });

  it('triggers AMBER for single overdue vaccine', () => {
    const result = evaluateOffline('immunisation', { overdue_vaccine_count: 1 });
    expect(result.minimum_class).toBe('AMBER');
    expect(result.triggered_rule_ids).toContain('IMM-A-002');
  });
});

describe('injectConfigThresholds', () => {
  it('does not override existing config values in facts', () => {
    const facts = { cfg_fhr_low: 100, fetal_heart_rate: 90 };
    const enriched = injectConfigThresholds(facts);
    expect(enriched.cfg_fhr_low).toBe(100);
  });
});

describe('computeUnifiedDecision', () => {
  it('uses rule engine result when no ML or engagement', () => {
    const decision = computeUnifiedDecision('pregnancy', {
      vaginal_bleeding: 'HEAVY',
    });
    expect(decision.final_urgency).toBe('RED');
    expect(decision.backend_urgency).toBe('EMERGENCY');
    expect(decision.sources_used).toContain('rule_engine');
    expect(decision.clinician_override_available).toBe(true);
  });

  it('non-downgrade: ML cannot de-escalate rule result', () => {
    const decision = computeUnifiedDecision(
      'pregnancy',
      { vaginal_bleeding: 'HEAVY' },
      { urgency: 'ROUTINE', confidence: 0.9, model_version: 'v1', recommendation: 'Routine' },
    );
    expect(decision.final_urgency).toBe('RED');
  });

  it('engagement HIGH risk escalates at most to AMBER', () => {
    const decision = computeUnifiedDecision(
      'pregnancy',
      { bp_systolic_mm_hg: 110, bp_diastolic_mm_hg: 70, is_clinical_contact: true, edd_date: '2026-01-01' },
      null,
      { risk_tier: 'HIGH', engagement_score: 0.8, recommendation: 'High risk follow-up' },
    );
    expect(decision.final_urgency).toBe('AMBER');
  });
});
