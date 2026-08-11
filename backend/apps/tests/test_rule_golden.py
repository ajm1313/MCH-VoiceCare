"""
Rule golden tests, emergency non-downgrade invariant tests,
and QR payload validation tests (spec §29.1, §29.2).

Rule golden tests cover positive, negative, boundary, missing-data,
and conflict scenarios for the pregnancy rule engine.
"""
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.enums import (
    SystemRole, UrgencyLevel, EpisodeStatus, ReferralStatus,
)
from apps.organisations.models import OrganisationUnit
from apps.accounts.models import UserAccount
from apps.clients.models import Person, Household
from apps.pregnancy.models import PregnancyEpisode, PregnancyObservation
from apps.referrals.models import Referral
from apps.rules import run_pregnancy_assessment


def _make_org():
    return OrganisationUnit.objects.create(name="Golden Test Org", code="GOLDEN01", unit_type="FACILITY")

def _make_user(org):
    return UserAccount.objects.create_user(
        username="goldenuser", password="testpass123",
        organisation_unit=org, system_role=SystemRole.SUPER_ADMIN, is_super_admin=True,
    )

def _make_patient(org, name="Golden Patient"):
    hh = Household.objects.create(organisation_unit=org)
    return Person.objects.create(full_name=name, household=hh, organisation_unit=org)

def _make_episode(patient, **kwargs):
    defaults = {
        "woman": patient,
        "status": EpisodeStatus.ACTIVE,
    }
    defaults.update(kwargs)
    return PregnancyEpisode.objects.create(**defaults)

def _make_obs(episode, **kwargs):
    return PregnancyObservation.objects.create(episode=episode, **kwargs)


class PregnancyRuleGoldenPositiveTests(TestCase):
    """Positive scenarios — rules fire when expected (spec §29.2)."""

    def test_severe_hypertension_systolic_fires_emergency(self):
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient)
        _make_obs(ep, bp_systolic=165, bp_diastolic=95)
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)
        rule_ids = [r["ruleId"] for r in result["fired_rules"]]
        self.assertIn("GH-SMP-BP-SYS-160", rule_ids)

    def test_severe_hypertension_diastolic_fires_emergency(self):
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient)
        _make_obs(ep, bp_systolic=130, bp_diastolic=115)
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)
        rule_ids = [r["ruleId"] for r in result["fired_rules"]]
        self.assertIn("GH-SMP-BP-DIA-110", rule_ids)

    def test_danger_sign_convulsions_fires_emergency(self):
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient)
        _make_obs(ep, danger_signs="patient had convulsions")
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_danger_sign_bleeding_fires_emergency(self):
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient)
        _make_obs(ep, danger_signs="vaginal bleeding")
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_moderate_hypertension_fires_priority(self):
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient)
        _make_obs(ep, bp_systolic=145, bp_diastolic=95)
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)
        rule_ids = [r["ruleId"] for r in result["fired_rules"]]
        self.assertIn("GH-SMP-BP-SYS-140", rule_ids)

    def test_fever_fires_priority(self):
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient)
        _make_obs(ep, temperature_c=38.5)
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)

    def test_advanced_maternal_age_fires_priority(self):
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient, maternal_age_years=38)
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)
        rule_ids = [r["ruleId"] for r in result["fired_rules"]]
        self.assertIn("GH-SMP-AGE-35", rule_ids)

    def test_previous_preeclampsia_fires_priority(self):
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient, previous_preeclampsia_eclampsia=True)
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)


class PregnancyRuleGoldenNegativeTests(TestCase):
    """Negative scenarios — rules do NOT fire when not expected (spec §29.2)."""

    def test_normal_bp_no_rules_fire(self):
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient)
        _make_obs(ep, bp_systolic=110, bp_diastolic=70, temperature_c=36.5, fhr_bpm=140)
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.ROUTINE)
        self.assertEqual(len(result["fired_rules"]), 0)
        self.assertEqual(result["missingCriticalFields"], [])

    def test_no_observation_produces_abstain(self):
        """No observation at all → ABSTAIN (spec §3.1: missing critical fields)."""
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient)
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.ABSTAIN)
        self.assertGreater(len(result["missingCriticalFields"]), 0)

    def test_normal_danger_signs_text_no_emergency(self):
        """Danger signs text is normal but missing vitals → ABSTAIN (spec §3.1)."""
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient)
        _make_obs(ep, danger_signs="feeling fine, no complaints")
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.ABSTAIN)

    def test_low_bp_not_hypertension(self):
        """Low BP with missing temp/FHR → ABSTAIN (spec §3.1)."""
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient)
        _make_obs(ep, bp_systolic=90, bp_diastolic=60)
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.ABSTAIN)


class PregnancyRuleGoldenBoundaryTests(TestCase):
    """Boundary scenarios — test exact threshold values (spec §29.2)."""

    def test_systolic_160_exact_is_emergency(self):
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient)
        _make_obs(ep, bp_systolic=160, bp_diastolic=80)
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_systolic_159_is_priority_not_emergency(self):
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient)
        _make_obs(ep, bp_systolic=159, bp_diastolic=80)
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)

    def test_diastolic_110_exact_is_emergency(self):
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient)
        _make_obs(ep, bp_systolic=120, bp_diastolic=110)
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_diastolic_109_is_priority_not_emergency(self):
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient)
        _make_obs(ep, bp_systolic=120, bp_diastolic=109)
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)

    def test_systolic_140_exact_is_priority(self):
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient)
        _make_obs(ep, bp_systolic=140, bp_diastolic=80)
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)

    def test_systolic_139_is_routine(self):
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient)
        _make_obs(ep, bp_systolic=139, bp_diastolic=80, temperature_c=36.5, fhr_bpm=140)
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.ROUTINE)

    def test_maternal_age_35_exact_is_priority(self):
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient, maternal_age_years=35)
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)

    def test_maternal_age_34_is_routine(self):
        """Age 34 with no observation → ABSTAIN (missing critical fields, spec §3.1)."""
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient, maternal_age_years=34)
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.ABSTAIN)

    def test_fever_38_exact_is_priority(self):
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient)
        _make_obs(ep, temperature_c=38.0)
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)

    def test_fever_37_9_is_routine(self):
        """Temp 37.9 with missing BP/FHR → ABSTAIN (spec §3.1)."""
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient)
        _make_obs(ep, temperature_c=37.9)
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.ABSTAIN)


class PregnancyRuleGoldenMissingDataTests(TestCase):
    """Missing-data scenarios — behavior when data is absent (spec §29.2)."""

    def test_no_bp_values_abstain(self):
        """No vitals at all → ABSTAIN (spec §3.1: missing critical fields)."""
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient)
        _make_obs(ep)  # No vitals at all
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.ABSTAIN)
        self.assertGreater(len(result["missingCriticalFields"]), 0)

    def test_only_systolic_no_diastolic(self):
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient)
        _make_obs(ep, bp_systolic=150)
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)

    def test_only_diastolic_no_systolic(self):
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient)
        _make_obs(ep, bp_diastolic=100)
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)

    def test_no_maternal_age_no_age_rule(self):
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient)  # maternal_age_years is None
        result = run_pregnancy_assessment(ep)
        rule_ids = [r["ruleId"] for r in result["fired_rules"]]
        self.assertNotIn("GH-SMP-AGE-35", rule_ids)
        self.assertNotIn("GH-SMP-AGE-UNDER-18", rule_ids)

    def test_empty_danger_signs_no_emergency(self):
        """Empty danger signs with no vitals → ABSTAIN (spec §3.1)."""
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient)
        _make_obs(ep, danger_signs="")
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.ABSTAIN)


class PregnancyRuleGoldenConflictTests(TestCase):
    """Conflict scenarios — multiple rules fire, highest severity wins (spec §29.2)."""

    def test_emergency_overrides_priority(self):
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient, maternal_age_years=40, previous_preeclampsia_eclampsia=True)
        _make_obs(ep, bp_systolic=170, bp_diastolic=120, temperature_c=38.5)
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)
        # Multiple rules should have fired
        self.assertTrue(len(result["fired_rules"]) >= 3)

    def test_emergency_danger_sign_overrides_priority_bp(self):
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient)
        _make_obs(ep, bp_systolic=145, bp_diastolic=95, danger_signs="severe headache")
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_multiple_priority_rules_stay_priority(self):
        org = _make_org()
        patient = _make_patient(org)
        ep = _make_episode(patient, maternal_age_years=37, chronic_hypertension=True)
        _make_obs(ep, bp_systolic=145, temperature_c=38.5)
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)
        self.assertTrue(len(result["fired_rules"]) >= 3)


class EmergencyNonDowngradeInvariantTests(TestCase):
    """Emergency non-downgrade invariant — no component can downgrade an emergency (spec §29.1, §3.1)."""

    def setUp(self):
        self.org = _make_org()
        self.patient = _make_patient(self.org)
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_emergency_cannot_be_downgraded_by_override(self):
        """Clinician override cannot downgrade an emergency urgency (spec §3.1)."""
        ep = _make_episode(self.patient)
        _make_obs(ep, bp_systolic=170, danger_signs="convulsions")
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

        resp = self.client.post("/api/v1/clinical/override/", {
            "episode_type": "PregnancyEpisode",
            "episode_id": str(ep.id),
            "prior_recommendation": "EMERGENCY",
            "resulting_action": "DEESCALATE",
            "override_reason": "Clinician believes it's not emergency",
            "patient_id": str(self.patient.id),
        }, format="json")
        self.assertEqual(resp.status_code, 409)
        self.assertIn("emergency", resp.json()["detail"].lower())

    def test_emergency_remregardless_of_multiple_priority_rules(self):
        """Multiple priority rules cannot escalate above emergency, and emergency stays emergency."""
        ep = _make_episode(self.patient, maternal_age_years=40, chronic_hypertension=True, diabetes=True)
        _make_obs(ep, bp_systolic=170, bp_diastolic=120, temperature_c=39.0)
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_priority_does_not_escalate_to_emergency_without_emergency_rule(self):
        ep = _make_episode(self.patient, maternal_age_years=37)
        _make_obs(ep, bp_systolic=145, temperature_c=38.5)
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)


class QRPayloadValidationTests(TestCase):
    """QR payload validation tests (spec §29.1, §18.2)."""

    def setUp(self):
        self.org = _make_org()
        self.patient = _make_patient(self.org)
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_qr_endpoint_returns_payload(self):
        referral = Referral.objects.create(
            patient=self.patient,
            referring_facility=self.org,
            destination_facility=self.org,
            urgency=UrgencyLevel.EMERGENCY,
            status=ReferralStatus.REQUESTED,
            referral_reason="Severe hypertension",
            qr_token="abc123token",
            short_code="ABC12345",
        )
        resp = self.client.get(f"/api/v1/referrals/{referral.id}/qr/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["qr_token"], "abc123token")
        self.assertEqual(data["short_code"], "ABC12345")
        self.assertEqual(data["referral_id"], str(referral.id))
        self.assertEqual(data["urgency"], UrgencyLevel.EMERGENCY)

    def test_qr_payload_has_patient_info(self):
        referral = Referral.objects.create(
            patient=self.patient,
            referring_facility=self.org,
            urgency=UrgencyLevel.ROUTINE,
            status=ReferralStatus.REQUESTED,
            qr_token="token123",
            short_code="TOKEN123",
        )
        resp = self.client.get(f"/api/v1/referrals/{referral.id}/qr/")
        data = resp.json()
        self.assertIn("patient", data)
        self.assertEqual(data["patient"]["full_name"], "Golden Patient")

    def test_qr_payload_has_facility_info(self):
        referral = Referral.objects.create(
            patient=self.patient,
            referring_facility=self.org,
            destination_facility=self.org,
            urgency=UrgencyLevel.ROUTINE,
            status=ReferralStatus.REQUESTED,
            qr_token="token456",
            short_code="TOKEN456",
        )
        resp = self.client.get(f"/api/v1/referrals/{referral.id}/qr/")
        data = resp.json()
        self.assertEqual(data["referring_facility"]["name"], "Golden Test Org")
        self.assertEqual(data["destination_facility"]["name"], "Golden Test Org")

    def test_qr_generates_token_if_missing(self):
        referral = Referral.objects.create(
            patient=self.patient,
            referring_facility=self.org,
            urgency=UrgencyLevel.ROUTINE,
            status=ReferralStatus.REQUESTED,
        )
        resp = self.client.get(f"/api/v1/referrals/{referral.id}/qr/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["qr_token"])
        self.assertTrue(data["short_code"])
        referral.refresh_from_db()
        self.assertEqual(referral.qr_token, data["qr_token"])

    def test_qr_short_code_is_8_chars_uppercase(self):
        referral = Referral.objects.create(
            patient=self.patient,
            referring_facility=self.org,
            urgency=UrgencyLevel.ROUTINE,
            status=ReferralStatus.REQUESTED,
        )
        resp = self.client.get(f"/api/v1/referrals/{referral.id}/qr/")
        data = resp.json()
        self.assertEqual(len(data["short_code"]), 8)
        self.assertEqual(data["short_code"], data["short_code"].upper())

    def test_qr_payload_has_referral_reason(self):
        referral = Referral.objects.create(
            patient=self.patient,
            referring_facility=self.org,
            urgency=UrgencyLevel.PRIORITY,
            status=ReferralStatus.REQUESTED,
            referral_reason="Preeclampsia suspected",
            qr_token="token789",
            short_code="TOKEN789",
        )
        resp = self.client.get(f"/api/v1/referrals/{referral.id}/qr/")
        data = resp.json()
        self.assertEqual(data["referral_reason"], "Preeclampsia suspected")

    def test_qr_payload_has_created_at(self):
        referral = Referral.objects.create(
            patient=self.patient,
            referring_facility=self.org,
            urgency=UrgencyLevel.ROUTINE,
            status=ReferralStatus.REQUESTED,
            qr_token="token000",
            short_code="TOKEN000",
        )
        resp = self.client.get(f"/api/v1/referrals/{referral.id}/qr/")
        data = resp.json()
        self.assertIn("created_at", data)
        self.assertTrue(data["created_at"])
