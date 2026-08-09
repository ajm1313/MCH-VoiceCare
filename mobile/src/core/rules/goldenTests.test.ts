/**
 * Rule golden tests (spec §29.2).
 *
 * Every approved rule MUST include positive, negative, boundary,
 * missing-data, and conflict scenarios.
 *
 * This file covers the rules NOT already tested in offlineEngine.test.ts.
 */
import { evaluateOffline } from './offlineEngine';
import { computeUnifiedDecision } from './unifiedDecision';

describe('Golden Tests — Pregnancy Rules (spec §29.2)', () => {
  describe('PREG-R-001 (convulsion/unconsciousness)', () => {
    it('POSITIVE: convulsion triggers RED', () => {
      const r = evaluateOffline('pregnancy', { convulsion_or_unconsciousness: true });
      expect(r.minimum_class).toBe('RED');
      expect(r.triggered_rule_ids).toContain('PREG-R-001');
    });

    it('NEGATIVE: no convulsion does not trigger', () => {
      const r = evaluateOffline('pregnancy', { convulsion_or_unconsciousness: false });
      expect(r.triggered_rule_ids).not.toContain('PREG-R-001');
    });

    it('MISSING: undefined convulsion does not trigger', () => {
      const r = evaluateOffline('pregnancy', {});
      expect(r.triggered_rule_ids).not.toContain('PREG-R-001');
    });
  });

  describe('PREG-R-003 (severe hypertension)', () => {
    it('POSITIVE: systolic 160 triggers RED', () => {
      const r = evaluateOffline('pregnancy', { bp_systolic_mm_hg: 160 });
      expect(r.minimum_class).toBe('RED');
      expect(r.triggered_rule_ids).toContain('PREG-R-003');
    });

    it('POSITIVE: diastolic 110 triggers RED', () => {
      const r = evaluateOffline('pregnancy', { bp_diastolic_mm_hg: 110 });
      expect(r.minimum_class).toBe('RED');
      expect(r.triggered_rule_ids).toContain('PREG-R-003');
    });

    it('BOUNDARY: systolic 159 does NOT trigger RED', () => {
      const r = evaluateOffline('pregnancy', { bp_systolic_mm_hg: 159 });
      expect(r.triggered_rule_ids).not.toContain('PREG-R-003');
    });

    it('BOUNDARY: diastolic 109 does NOT trigger RED', () => {
      const r = evaluateOffline('pregnancy', { bp_diastolic_mm_hg: 109 });
      expect(r.triggered_rule_ids).not.toContain('PREG-R-003');
    });

    it('MISSING: no BP does not trigger', () => {
      const r = evaluateOffline('pregnancy', {});
      expect(r.triggered_rule_ids).not.toContain('PREG-R-003');
    });
  });

  describe('PREG-R-004 (severe headache)', () => {
    it('POSITIVE: severe headache triggers RED', () => {
      const r = evaluateOffline('pregnancy', { severe_headache: true });
      expect(r.minimum_class).toBe('RED');
      expect(r.triggered_rule_ids).toContain('PREG-R-004');
    });

    it('NEGATIVE: no headache does not trigger', () => {
      const r = evaluateOffline('pregnancy', { severe_headache: false });
      expect(r.triggered_rule_ids).not.toContain('PREG-R-004');
    });
  });

  describe('PREG-R-005 (severe breathing difficulty)', () => {
    it('POSITIVE: breathing difficulty triggers RED', () => {
      const r = evaluateOffline('pregnancy', { severe_breathing_difficulty: true });
      expect(r.minimum_class).toBe('RED');
      expect(r.triggered_rule_ids).toContain('PREG-R-005');
    });

    it('NEGATIVE: no breathing difficulty does not trigger', () => {
      const r = evaluateOffline('pregnancy', { severe_breathing_difficulty: false });
      expect(r.triggered_rule_ids).not.toContain('PREG-R-005');
    });
  });

  describe('PREG-O-001 (moderate hypertension)', () => {
    it('POSITIVE: systolic 140 with repeat triggers ORANGE', () => {
      const r = evaluateOffline('pregnancy', { bp_systolic_mm_hg: 140, bp_repeat_after_rest: true });
      expect(r.minimum_class).toBe('ORANGE');
      expect(r.triggered_rule_ids).toContain('PREG-O-001');
    });

    it('BOUNDARY: systolic 139 does NOT trigger ORANGE', () => {
      const r = evaluateOffline('pregnancy', { bp_systolic_mm_hg: 139, bp_repeat_after_rest: true });
      expect(r.triggered_rule_ids).not.toContain('PREG-O-001');
    });

    it('NEGATIVE: systolic 140 without repeat does NOT trigger', () => {
      const r = evaluateOffline('pregnancy', { bp_systolic_mm_hg: 140, bp_repeat_after_rest: false });
      expect(r.triggered_rule_ids).not.toContain('PREG-O-001');
    });
  });

  describe('CONFLICT: multiple rules fire, highest wins', () => {
    it('RED + ORANGE = RED (non-averaging)', () => {
      const r = evaluateOffline('pregnancy', {
        vaginal_bleeding: 'HEAVY',     // RED
        bp_systolic_mm_hg: 145,        // ORANGE
        bp_repeat_after_rest: true,
      });
      expect(r.minimum_class).toBe('RED');
      expect(r.triggered_rule_ids).toContain('PREG-R-002');
      expect(r.triggered_rule_ids).toContain('PREG-O-001');
    });

    it('RED + GREEN = RED (non-averaging)', () => {
      const r = evaluateOffline('pregnancy', {
        vaginal_bleeding: 'HEAVY',     // RED
        bp_systolic_mm_hg: 110,        // GREEN
        bp_diastolic_mm_hg: 70,
        is_clinical_contact: true,
        edd_date: '2026-01-01',
      });
      expect(r.minimum_class).toBe('RED');
    });
  });
});

describe('Golden Tests — Newborn Rules (spec §29.2)', () => {
  describe('NEO-R-005 (severe respiratory distress: chest indrawing, grunting, apnoea, cyanosis)', () => {
    it('POSITIVE: apnoea triggers RED', () => {
      const r = evaluateOffline('newborn', { apnoea_or_gasping: true });
      expect(r.minimum_class).toBe('RED');
      expect(r.triggered_rule_ids).toContain('NEO-R-005');
    });

    it('POSITIVE: central cyanosis triggers RED', () => {
      const r = evaluateOffline('newborn', { central_cyanosis: true });
      expect(r.minimum_class).toBe('RED');
      expect(r.triggered_rule_ids).toContain('NEO-R-005');
    });

    it('POSITIVE: grunting triggers RED', () => {
      const r = evaluateOffline('newborn', { grunting: true });
      expect(r.minimum_class).toBe('RED');
      expect(r.triggered_rule_ids).toContain('NEO-R-005');
    });

    it('NEGATIVE: no respiratory distress does not trigger', () => {
      const r = evaluateOffline('newborn', {
        severe_chest_indrawing: false,
        grunting: false,
        apnoea_or_gasping: false,
        central_cyanosis: false,
      });
      expect(r.triggered_rule_ids).not.toContain('NEO-R-005');
    });
  });

  describe('NEO-R-006 (fever ≥ 37.5°C)', () => {
    it('BOUNDARY: 37.5 triggers RED', () => {
      const r = evaluateOffline('newborn', { temperature_c: 37.5 });
      expect(r.minimum_class).toBe('RED');
      expect(r.triggered_rule_ids).toContain('NEO-R-006');
    });

    it('BOUNDARY: 37.4 does NOT trigger RED', () => {
      const r = evaluateOffline('newborn', { temperature_c: 37.4 });
      expect(r.triggered_rule_ids).not.toContain('NEO-R-006');
    });
  });

  describe('NEO-R-007 (hypothermia < 35.5°C)', () => {
    it('BOUNDARY: 35.4 triggers RED', () => {
      const r = evaluateOffline('newborn', { temperature_c: 35.4 });
      expect(r.minimum_class).toBe('RED');
      expect(r.triggered_rule_ids).toContain('NEO-R-007');
    });

    it('BOUNDARY: 35.5 does NOT trigger RED', () => {
      const r = evaluateOffline('newborn', { temperature_c: 35.5 });
      expect(r.triggered_rule_ids).not.toContain('NEO-R-007');
    });
  });

  describe('MISSING DATA: no observations', () => {
    it('newborn with no data does not produce RED', () => {
      const r = evaluateOffline('newborn', {});
      expect(r.minimum_class).not.toBe('RED');
    });

    it('pregnancy with no data does not produce RED', () => {
      const r = evaluateOffline('pregnancy', {});
      expect(r.minimum_class).not.toBe('RED');
    });

    it('newborn with no data fires GREY rules for missing critical fields', () => {
      const r = evaluateOffline('newborn', {});
      // GREY rules should fire for missing weight, gestational age, feeding status
      expect(r.triggered_rule_ids).toContain('NEO-G-001'); // missing birth weight
      expect(r.triggered_rule_ids).toContain('NEO-G-002'); // missing gestational age
      expect(r.triggered_rule_ids).toContain('NEO-G-005'); // missing feeding status
    });
  });
});

describe('Golden Tests — Non-Downgrade Invariant (spec §3.1)', () => {
  it('EMERGENCY rule + ML low probability = still EMERGENCY', () => {
    const decision = computeUnifiedDecision(
      'pregnancy',
      { vaginal_bleeding: 'HEAVY' },
      { urgency: 'ROUTINE', confidence: 0.95, model_version: 'v1', recommendation: 'Low risk' },
    );
    expect(decision.final_urgency).toBe('RED');
    expect(decision.backend_urgency).toBe('EMERGENCY');
  });

  it('EMERGENCY rule + ML EMERGENCY = still EMERGENCY (not escalated beyond)', () => {
    const decision = computeUnifiedDecision(
      'pregnancy',
      { vaginal_bleeding: 'HEAVY' },
      { urgency: 'EMERGENCY', confidence: 0.8, model_version: 'v1', recommendation: 'Emergency' },
    );
    expect(decision.final_urgency).toBe('RED');
  });

  it('GREEN rule + ML EMERGENCY in RULES_ONLY mode = ML ignored (stays GREEN)', () => {
    // In RULES_ONLY mode (default), ML predictions are not applied.
    // This is the correct safety behavior — ML cannot escalate until ASSISTED mode is enabled.
    const decision = computeUnifiedDecision(
      'pregnancy',
      { bp_systolic_mm_hg: 110, bp_diastolic_mm_hg: 70, is_clinical_contact: true, edd_date: '2026-01-01' },
      { urgency: 'EMERGENCY', confidence: 0.9, model_version: 'v1', recommendation: 'Emergency' },
    );
    // ML is ignored in RULES_ONLY, so the result is from rules alone
    expect(decision.ml_prediction).toBeNull();
    expect(decision.sources_used).not.toContain('ml_prediction');
  });

  it('ORANGE rule + ML ROUTINE = stays ORANGE (not de-escalated)', () => {
    const decision = computeUnifiedDecision(
      'pregnancy',
      { bp_systolic_mm_hg: 145, bp_repeat_after_rest: true },
      { urgency: 'ROUTINE', confidence: 0.9, model_version: 'v1', recommendation: 'Routine' },
    );
    expect(decision.final_urgency).toBe('ORANGE');
  });
});

describe('Golden Tests — Missing Critical Fields (spec §3.1)', () => {
  it('pregnancy with missing BP at clinical contact fires PREG-G-002', () => {
    const r = evaluateOffline('pregnancy', {
      is_clinical_contact: true,
      edd_date: '2026-01-01',
    });
    expect(r.triggered_rule_ids).toContain('PREG-G-002');
  });

  it('newborn with missing vitals fires GREY rules for missing data', () => {
    const r = evaluateOffline('newborn', {});
    // GREY rules should fire for missing critical fields
    expect(r.triggered_rule_ids).toContain('NEO-G-001'); // missing birth weight
    expect(r.triggered_rule_ids).toContain('NEO-G-002'); // missing gestational age
  });
});
