"""
Tests for the engagement-risk model (spec §14).

Verifies:
- Engagement scoring logic (HIGH/MEDIUM/LOW conditions)
- Action mapping by risk level
- Engagement does NOT affect clinical disposition (spec §14, §15)
- Stub assessor returns LOW
"""
import uuid

from django.test import TestCase

from apps.core.engagement_service import (
    EngagementRiskInput,
    EngagementRiskResult,
    EngagementRiskModel,
    EngagementRiskAssessor,
    StubEngagementRiskAssessor,
    EngagementRiskLevel,
    EngagementAction,
    ACTION_MAPPING,
    get_engagement_assessor,
    set_engagement_assessor,
    reset_engagement_assessor,
)
from apps.core.decision_service import build_unified_decision
from apps.core.enums import UrgencyLevel, ClinicalDisposition, MLMode
from apps.core.config_models import SystemConfig


def _make_input(**kwargs):
    """Create an EngagementRiskInput with sensible defaults."""
    defaults = dict(
        patient_id=str(uuid.uuid4()),
        pregnancy_episode_id=str(uuid.uuid4()),
        missed_anc_count=0,
        days_since_last_anc=0,
        referral_failed=False,
        contact_unreachable=False,
        distance_to_facility_km=0.0,
        preferred_language="en",
        last_contact_attempt_days=0,
    )
    defaults.update(kwargs)
    return EngagementRiskInput(**defaults)


class EngagementScoringTests(TestCase):
    """Tests for engagement risk scoring logic (spec §14)."""

    def setUp(self):
        self.model = EngagementRiskModel()

    def test_missed_anc_count_2_or_more_is_high(self):
        """missed_anc_count >= 2 → HIGH."""
        result = self.model.assess(_make_input(missed_anc_count=2))
        self.assertEqual(result.risk_level, EngagementRiskLevel.HIGH)

    def test_missed_anc_count_3_is_high(self):
        result = self.model.assess(_make_input(missed_anc_count=3))
        self.assertEqual(result.risk_level, EngagementRiskLevel.HIGH)

    def test_days_since_last_anc_over_56_is_high(self):
        """days_since_last_anc > 56 (8 weeks) → HIGH."""
        result = self.model.assess(_make_input(days_since_last_anc=57))
        self.assertEqual(result.risk_level, EngagementRiskLevel.HIGH)

    def test_days_since_last_anc_56_is_not_high(self):
        """days_since_last_anc == 56 is NOT high (boundary: > 56)."""
        result = self.model.assess(_make_input(days_since_last_anc=56))
        self.assertNotEqual(result.risk_level, EngagementRiskLevel.HIGH)

    def test_referral_failed_is_high(self):
        """referral_failed → HIGH."""
        result = self.model.assess(_make_input(referral_failed=True))
        self.assertEqual(result.risk_level, EngagementRiskLevel.HIGH)

    def test_contact_unreachable_with_days_over_14_is_medium(self):
        """contact_unreachable + days_since_last_anc > 14 → MEDIUM."""
        result = self.model.assess(
            _make_input(contact_unreachable=True, days_since_last_anc=15))
        self.assertEqual(result.risk_level, EngagementRiskLevel.MEDIUM)

    def test_contact_unreachable_with_days_14_is_not_medium(self):
        """Boundary: days_since_last_anc == 14 is NOT medium (> 14)."""
        result = self.model.assess(
            _make_input(contact_unreachable=True, days_since_last_anc=14))
        self.assertEqual(result.risk_level, EngagementRiskLevel.LOW)

    def test_distance_over_15km_with_missed_anc_is_medium(self):
        """distance > 15km + missed_anc >= 1 → MEDIUM."""
        result = self.model.assess(
            _make_input(distance_to_facility_km=20.0, missed_anc_count=1))
        self.assertEqual(result.risk_level, EngagementRiskLevel.MEDIUM)

    def test_distance_over_15km_without_missed_anc_is_low(self):
        """distance > 15km but missed_anc == 0 → LOW."""
        result = self.model.assess(
            _make_input(distance_to_facility_km=20.0, missed_anc_count=0))
        self.assertEqual(result.risk_level, EngagementRiskLevel.LOW)

    def test_no_risk_factors_is_low(self):
        """No risk factors → LOW."""
        result = self.model.assess(_make_input())
        self.assertEqual(result.risk_level, EngagementRiskLevel.LOW)

    def test_risk_score_in_range(self):
        """risk_score must be between 0 and 1."""
        for kwargs in [
            {},
            {"missed_anc_count": 5},
            {"days_since_last_anc": 100},
            {"referral_failed": True},
            {"contact_unreachable": True, "days_since_last_anc": 20},
            {"distance_to_facility_km": 30, "missed_anc_count": 1},
        ]:
            result = self.model.assess(_make_input(**kwargs))
            self.assertGreaterEqual(result.risk_score, 0.0)
            self.assertLessEqual(result.risk_score, 1.0)

    def test_high_score_at_least_0_7(self):
        result = self.model.assess(_make_input(missed_anc_count=2))
        self.assertGreaterEqual(result.risk_score, 0.7)

    def test_low_score_at_most_0_29(self):
        result = self.model.assess(_make_input())
        self.assertLessEqual(result.risk_score, 0.29)

    def test_medium_score_between_0_3_and_0_69(self):
        result = self.model.assess(
            _make_input(contact_unreachable=True, days_since_last_anc=20))
        self.assertGreaterEqual(result.risk_score, 0.3)
        self.assertLessEqual(result.risk_score, 0.69)

    def test_result_has_evaluated_at(self):
        result = self.model.assess(_make_input())
        self.assertTrue(result.evaluated_at)

    def test_result_has_reasons(self):
        result = self.model.assess(_make_input(missed_anc_count=2))
        self.assertTrue(len(result.reasons) > 0)

    def test_to_dict(self):
        result = self.model.assess(_make_input(missed_anc_count=2))
        d = result.to_dict()
        self.assertEqual(d["riskLevel"], EngagementRiskLevel.HIGH)
        self.assertEqual(d["risk_level"], EngagementRiskLevel.HIGH)
        self.assertIn("recommendedActions", d)
        self.assertIn("recommended_actions", d)


class EngagementActionMappingTests(TestCase):
    """Tests for action mapping by risk level (spec §14)."""

    def test_high_actions(self):
        """HIGH → [CALL_PATIENT, CHO_OUTREACH, HOME_VISIT]."""
        model = EngagementRiskModel()
        result = model.assess(_make_input(missed_anc_count=2))
        self.assertEqual(result.risk_level, EngagementRiskLevel.HIGH)
        self.assertEqual(result.recommended_actions, [
            EngagementAction.CALL_PATIENT,
            EngagementAction.CHO_OUTREACH,
            EngagementAction.HOME_VISIT,
        ])

    def test_medium_actions(self):
        """MEDIUM → [REMINDER_SMS, CALL_PATIENT]."""
        model = EngagementRiskModel()
        result = model.assess(
            _make_input(contact_unreachable=True, days_since_last_anc=20))
        self.assertEqual(result.risk_level, EngagementRiskLevel.MEDIUM)
        self.assertEqual(result.recommended_actions, [
            EngagementAction.REMINDER_SMS,
            EngagementAction.CALL_PATIENT,
        ])

    def test_low_actions(self):
        """LOW → [REMINDER_SMS]."""
        model = EngagementRiskModel()
        result = model.assess(_make_input())
        self.assertEqual(result.risk_level, EngagementRiskLevel.LOW)
        self.assertEqual(result.recommended_actions, [EngagementAction.REMINDER_SMS])

    def test_action_mapping_constant(self):
        self.assertEqual(ACTION_MAPPING[EngagementRiskLevel.HIGH], [
            EngagementAction.CALL_PATIENT,
            EngagementAction.CHO_OUTREACH,
            EngagementAction.HOME_VISIT,
        ])
        self.assertEqual(ACTION_MAPPING[EngagementRiskLevel.MEDIUM], [
            EngagementAction.REMINDER_SMS,
            EngagementAction.CALL_PATIENT,
        ])
        self.assertEqual(ACTION_MAPPING[EngagementRiskLevel.LOW], [
            EngagementAction.REMINDER_SMS,
        ])


class StubEngagementAssessorTests(TestCase):
    """Tests for the stub engagement assessor."""

    def test_stub_returns_low(self):
        stub = StubEngagementRiskAssessor()
        result = stub.assess(_make_input(missed_anc_count=5))
        self.assertEqual(result.risk_level, EngagementRiskLevel.LOW)
        self.assertEqual(result.recommended_actions, [EngagementAction.REMINDER_SMS])

    def test_stub_satisfies_protocol(self):
        stub = StubEngagementRiskAssessor()
        # Protocol check — should have assess method
        self.assertTrue(hasattr(stub, "assess"))


class EngagementAssessorAccessorTests(TestCase):
    """Tests for get/set/reset engagement assessor."""

    def setUp(self):
        reset_engagement_assessor()

    def tearDown(self):
        reset_engagement_assessor()

    def test_default_assessor_is_engagement_model(self):
        reset_engagement_assessor()
        assessor = get_engagement_assessor()
        self.assertIsInstance(assessor, EngagementRiskModel)

    def test_set_and_reset(self):
        stub = StubEngagementRiskAssessor()
        set_engagement_assessor(stub)
        self.assertIs(get_engagement_assessor(), stub)
        reset_engagement_assessor()
        self.assertIsNot(get_engagement_assessor(), stub)


class EngagementDoesNotChangeClinicalDispositionTests(TestCase):
    """Tests that engagement does NOT affect clinicalDisposition (spec §14, §15)."""

    def setUp(self):
        reset_engagement_assessor()

    def test_engagement_does_not_change_clinical_disposition(self):
        """Engagement HIGH risk must not change a ROUTINE clinical disposition."""
        engagement_result = EngagementRiskResult(
            risk_level=EngagementRiskLevel.HIGH,
            risk_score=0.9,
            recommended_actions=[
                EngagementAction.CALL_PATIENT,
                EngagementAction.CHO_OUTREACH,
                EngagementAction.HOME_VISIT,
            ],
            reasons=["High engagement risk"],
            evaluated_at="2026-01-01T00:00:00Z",
        ).to_dict()

        decision = build_unified_decision(
            patient_id=str(uuid.uuid4()),
            pregnancy_episode_id=str(uuid.uuid4()),
            rule_result={"disposition": UrgencyLevel.ROUTINE, "fired_rules": []},
            ml_result={},
            engagement_result=engagement_result,
        )

        # Clinical disposition must remain ROUTINE despite HIGH engagement
        self.assertEqual(decision["clinicalDisposition"], ClinicalDisposition.ROUTINE)
        # But engagement result is included for outreach
        self.assertIsNotNone(decision["engagementRiskResult"])
        self.assertEqual(
            decision["engagement_risk_result"]["risk_level"],
            EngagementRiskLevel.HIGH)

    def test_engagement_does_not_downgrade_emergency(self):
        """Engagement must not downgrade an EMERGENCY disposition."""
        engagement_result = EngagementRiskResult(
            risk_level=EngagementRiskLevel.LOW,
            risk_score=0.1,
            recommended_actions=[EngagementAction.REMINDER_SMS],
            reasons=["Low engagement risk"],
            evaluated_at="2026-01-01T00:00:00Z",
        ).to_dict()

        decision = build_unified_decision(
            patient_id=str(uuid.uuid4()),
            pregnancy_episode_id=str(uuid.uuid4()),
            rule_result={"disposition": UrgencyLevel.EMERGENCY, "fired_rules": []},
            ml_result={},
            engagement_result=engagement_result,
        )

        self.assertEqual(decision["clinicalDisposition"], ClinicalDisposition.EMERGENCY_NOW)

    def test_engagement_does_not_escalate_routine_to_priority(self):
        """Even HIGH engagement must not escalate ROUTINE to PRIORITY_REVIEW."""
        engagement_result = EngagementRiskResult(
            risk_level=EngagementRiskLevel.HIGH,
            risk_score=0.95,
            recommended_actions=[
                EngagementAction.CALL_PATIENT,
                EngagementAction.CHO_OUTREACH,
                EngagementAction.HOME_VISIT,
            ],
            reasons=["High engagement risk"],
            evaluated_at="2026-01-01T00:00:00Z",
        ).to_dict()

        decision = build_unified_decision(
            patient_id=str(uuid.uuid4()),
            pregnancy_episode_id=str(uuid.uuid4()),
            rule_result={"disposition": UrgencyLevel.ROUTINE, "fired_rules": []},
            ml_result={},
            engagement_result=engagement_result,
        )

        self.assertEqual(decision["clinicalDisposition"], ClinicalDisposition.ROUTINE)

    def test_engagement_input_triggers_assessor(self):
        """If engagement_result is None but engagement_input is provided, the
        assessor is called."""
        eng_input = _make_input(missed_anc_count=3)
        decision = build_unified_decision(
            patient_id=str(uuid.uuid4()),
            pregnancy_episode_id=str(uuid.uuid4()),
            rule_result={"disposition": UrgencyLevel.ROUTINE, "fired_rules": []},
            ml_result={},
            engagement_result=None,
            engagement_input=eng_input,
        )

        # Assessor should have been called, producing a HIGH engagement result
        self.assertIsNotNone(decision["engagementRiskResult"])
        self.assertEqual(
            decision["engagement_risk_result"]["risk_level"],
            EngagementRiskLevel.HIGH)
        # But clinical disposition unchanged
        self.assertEqual(decision["clinicalDisposition"], ClinicalDisposition.ROUTINE)
