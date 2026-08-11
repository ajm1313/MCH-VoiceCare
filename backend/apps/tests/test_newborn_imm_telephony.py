"""
Newborn rule golden tests, immunisation defaulter rule tests,
and telephony webhook emergency cascade tests (spec §17.4, §29.2).
"""
from datetime import date, timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.enums import (
    SystemRole, UrgencyLevel, EpisodeStatus, Sex,
    NotificationClass, NotificationStatus, DefaulterStatus,
)
from apps.organisations.models import OrganisationUnit
from apps.accounts.models import UserAccount
from apps.clients.models import Person, Household
from apps.newborn.models import NewbornEpisode, NewbornObservation
from apps.newborn.rule_engine import run_newborn_assessment
from apps.immunisation.models import ChildImmunisationRecord, VaccineDose
from apps.immunisation.rule_engine import run_defaulter_assessment
from apps.notifications.models import Notification
from apps.audit.models import AuditEvent


def _make_org():
    return OrganisationUnit.objects.create(name="NB Test Org", code="NBTEST01", unit_type="FACILITY")

def _make_patient(org, name="Test Patient"):
    hh = Household.objects.create(organisation_unit=org)
    return Person.objects.create(full_name=name, household=hh, organisation_unit=org)

def _make_newborn(org, name="Test Baby", **kwargs):
    child = _make_patient(org, name=name)
    defaults = {"child": child, "status": EpisodeStatus.ACTIVE, "sex": Sex.FEMALE}
    defaults.update(kwargs)
    return NewbornEpisode.objects.create(**defaults)

def _make_obs(episode, **kwargs):
    return NewbornObservation.objects.create(newborn=episode, **kwargs)


# ──────────────────────────────────────────────────────────
# Newborn Rule Golden Tests
# ──────────────────────────────────────────────────────────

class NewbornRuleGoldenPositiveTests(TestCase):
    """Positive scenarios — rules fire when expected (spec §29.2)."""

    def test_extremely_low_birth_weight_emergency(self):
        org = _make_org()
        ep = _make_newborn(org, birth_weight_g=800)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)
        rule_ids = [r["ruleId"] for r in result["fired_rules"]]
        self.assertIn("WHO-NB-ELBW", rule_ids)

    def test_very_low_birth_weight_emergency(self):
        org = _make_org()
        ep = _make_newborn(org, birth_weight_g=1200)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_convulsions_emergency(self):
        org = _make_org()
        ep = _make_newborn(org)
        _make_obs(ep, convulsions=True)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_central_cyanosis_emergency(self):
        org = _make_org()
        ep = _make_newborn(org)
        _make_obs(ep, central_cyanosis=True)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_apnoea_emergency(self):
        org = _make_org()
        ep = _make_newborn(org)
        _make_obs(ep, apnoea_or_gasping=True)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_low_apgar_5min_emergency(self):
        org = _make_org()
        ep = _make_newborn(org, apgar_5_min=5)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_low_birth_weight_priority(self):
        org = _make_org()
        ep = _make_newborn(org, birth_weight_g=1800)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)

    def test_preterm_priority(self):
        org = _make_org()
        ep = _make_newborn(org, gestational_age_weeks=35)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)

    def test_mild_hypothermia_priority(self):
        org = _make_org()
        ep = _make_newborn(org)
        _make_obs(ep, temperature_c=35.5)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)

    def test_congenital_abnormality_priority(self):
        org = _make_org()
        ep = _make_newborn(org, congenital_abnormality=True)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)


class NewbornRuleGoldenNegativeTests(TestCase):
    """Negative scenarios — rules do NOT fire when not expected (spec §29.2)."""

    def test_normal_birth_weight_routine(self):
        org = _make_org()
        ep = _make_newborn(org, birth_weight_g=3200)
        _make_obs(ep, temperature_c=36.5, respiratory_rate_min=40, current_weight_g=3100)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.ROUTINE)

    def test_no_observation_abstain(self):
        """No observation → ABSTAIN (spec §3.1: missing critical fields)."""
        org = _make_org()
        ep = _make_newborn(org, birth_weight_g=3000, gestational_age_weeks=39)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.ABSTAIN)

    def test_normal_apgar_routine(self):
        org = _make_org()
        ep = _make_newborn(org, apgar_1_min=9, apgar_5_min=10, birth_weight_g=3100)
        _make_obs(ep, temperature_c=36.5, respiratory_rate_min=40, current_weight_g=3000)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.ROUTINE)

    def test_normal_temperature_routine(self):
        """Normal temp but missing RR and weight → ABSTAIN (spec §3.1)."""
        org = _make_org()
        ep = _make_newborn(org, birth_weight_g=3200)
        _make_obs(ep, temperature_c=37.0)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.ABSTAIN)


class NewbornRuleGoldenBoundaryTests(TestCase):
    """Boundary scenarios — exact threshold values (spec §29.2)."""

    def test_birth_weight_1000_exact_is_emergency(self):
        org = _make_org()
        ep = _make_newborn(org, birth_weight_g=1000)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_birth_weight_1001_is_emergency_vlbw(self):
        org = _make_org()
        ep = _make_newborn(org, birth_weight_g=1499)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_birth_weight_1500_exact_is_priority(self):
        org = _make_org()
        ep = _make_newborn(org, birth_weight_g=1500)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)

    def test_birth_weight_1999_is_priority(self):
        org = _make_org()
        ep = _make_newborn(org, birth_weight_g=1999)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)

    def test_birth_weight_2000_exact_is_priority(self):
        org = _make_org()
        ep = _make_newborn(org, birth_weight_g=2000)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)

    def test_birth_weight_2499_is_priority(self):
        org = _make_org()
        ep = _make_newborn(org, birth_weight_g=2499)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)

    def test_birth_weight_2500_exact_is_routine(self):
        org = _make_org()
        ep = _make_newborn(org, birth_weight_g=2500)
        _make_obs(ep, temperature_c=36.5, respiratory_rate_min=40, current_weight_g=2400)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.ROUTINE)

    def test_apgar_1_min_4_exact_is_priority(self):
        org = _make_org()
        ep = _make_newborn(org, apgar_1_min=4, birth_weight_g=3000)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)

    def test_apgar_1_min_3_is_emergency(self):
        org = _make_org()
        ep = _make_newborn(org, apgar_1_min=3, birth_weight_g=3000)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_temperature_35_exact_is_mild_hypothermia(self):
        org = _make_org()
        ep = _make_newborn(org, birth_weight_g=3000)
        _make_obs(ep, temperature_c=35.0)
        result = run_newborn_assessment(ep)
        rule_ids = [r["ruleId"] for r in result["fired_rules"]]
        self.assertIn("WHO-NB-MILD-HYPOTHERMIA", rule_ids)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)

    def test_temperature_36_exact_is_routine(self):
        org = _make_org()
        ep = _make_newborn(org, birth_weight_g=3000)
        _make_obs(ep, temperature_c=36.0, respiratory_rate_min=40, current_weight_g=2900)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.ROUTINE)


class NewbornRuleGoldenMissingDataTests(TestCase):
    """Missing-data scenarios (spec §29.2)."""

    def test_no_birth_weight_no_gestational_age(self):
        """No birth weight, no gestational age, no observation → ABSTAIN (spec §3.1)."""
        org = _make_org()
        ep = _make_newborn(org)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.ABSTAIN)

    def test_no_apgar_scores(self):
        """No Apgar scores and no observation → ABSTAIN (spec §3.1)."""
        org = _make_org()
        ep = _make_newborn(org, birth_weight_g=3000)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.ABSTAIN)

    def test_observation_no_vitals(self):
        """Observation with no vitals → ABSTAIN (spec §3.1: missing critical fields)."""
        org = _make_org()
        ep = _make_newborn(org, birth_weight_g=3000)
        _make_obs(ep)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.ABSTAIN)
        self.assertGreater(len(result["missingCriticalFields"]), 0)


class NewbornRuleGoldenConflictTests(TestCase):
    """Conflict scenarios — multiple rules fire, highest severity wins (spec §29.2)."""

    def test_emergency_overrides_priority(self):
        org = _make_org()
        ep = _make_newborn(org, birth_weight_g=1800, congenital_abnormality=True)
        _make_obs(ep, convulsions=True)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)
        self.assertTrue(len(result["fired_rules"]) >= 2)

    def test_multiple_emergency_rules_stay_emergency(self):
        org = _make_org()
        ep = _make_newborn(org, birth_weight_g=800, apgar_5_min=3)
        _make_obs(ep, convulsions=True, central_cyanosis=True)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)
        self.assertTrue(len(result["fired_rules"]) >= 4)

    def test_multiple_priority_rules_stay_priority(self):
        org = _make_org()
        ep = _make_newborn(org, birth_weight_g=1800, congenital_abnormality=True,
                           missed_postnatal_contact=True)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)
        self.assertTrue(len(result["fired_rules"]) >= 3)


# ──────────────────────────────────────────────────────────
# Immunisation Defaulter Rule Tests
# ──────────────────────────────────────────────────────────

class ImmunisationDefaulterTests(TestCase):
    """Test immunisation defaulter assessment (spec §29.2, §12)."""

    def _make_child_record(self, org, dob="DEFAULT", **kwargs):
        child = _make_patient(org, name="Imm Child")
        if dob == "DEFAULT":
            dob = date.today() - timedelta(days=100)
        defaults = {"child": child, "date_of_birth": dob}
        defaults.update(kwargs)
        return ChildImmunisationRecord.objects.create(**defaults)

    def test_no_overdue_vaccines_low_risk(self):
        org = _make_org()
        record = self._make_child_record(org, dob=date.today() - timedelta(days=10))
        result = run_defaulter_assessment(record)
        self.assertEqual(result["risk_level"], "LOW")

    def test_severely_overdue_vaccine_critical(self):
        org = _make_org()
        record = self._make_child_record(org, dob=date.today() - timedelta(days=200))
        result = run_defaulter_assessment(record)
        self.assertEqual(result["risk_level"], "CRITICAL")
        rule_ids = [r["ruleId"] for r in result["fired_rules"]]
        self.assertIn("GHS-EPI-SEVERE-OVERDUE", rule_ids)

    def test_moderately_overdue_vaccine(self):
        org = _make_org()
        record = self._make_child_record(org, dob=date.today() - timedelta(days=80))
        result = run_defaulter_assessment(record)
        self.assertIn(result["risk_level"], ("HIGH", "CRITICAL"))

    def test_migratory_family_flag(self):
        org = _make_org()
        record = self._make_child_record(org, dob=date.today() - timedelta(days=10),
                                         residence_status="migratory")
        result = run_defaulter_assessment(record)
        rule_ids = [r["ruleId"] for r in result["fired_rules"]]
        self.assertIn("GHS-EPI-MIGRATORY", rule_ids)

    def test_up_to_date_child_routine(self):
        org = _make_org()
        record = self._make_child_record(org, dob=date.today() - timedelta(days=50))
        VaccineDose.objects.create(
            child_record=record, vaccine_code="BCG", dose_number=1,
            administration_date=date.today() - timedelta(days=45),
        )
        VaccineDose.objects.create(
            child_record=record, vaccine_code="OPV", dose_number=1,
            administration_date=date.today() - timedelta(days=45),
        )
        VaccineDose.objects.create(
            child_record=record, vaccine_code="PENTA", dose_number=1,
            administration_date=date.today() - timedelta(days=45),
        )
        result = run_defaulter_assessment(record)
        self.assertEqual(result["risk_level"], "LOW")

    def test_missing_vaccines_list_populated(self):
        org = _make_org()
        record = self._make_child_record(org, dob=date.today() - timedelta(days=200))
        result = run_defaulter_assessment(record)
        self.assertTrue(len(result["missing_vaccines"]) > 0)

    def test_no_date_of_birth_returns_low(self):
        org = _make_org()
        record = self._make_child_record(org, dob=None, overdue_count=0)
        result = run_defaulter_assessment(record)
        self.assertEqual(result["risk_level"], "LOW")

    def test_recommended_action_present(self):
        org = _make_org()
        record = self._make_child_record(org, dob=date.today() - timedelta(days=100))
        result = run_defaulter_assessment(record)
        self.assertTrue(result["recommended_action"])


# ──────────────────────────────────────────────────────────
# Telephony Webhook Tests
# ──────────────────────────────────────────────────────────

class TelephonyWebhookTests(TestCase):
    """Test telephony webhook — IVR/DTMF and USSD emergency cascade (spec §17.4)."""

    def setUp(self):
        self.org = _make_org()
        self.user = UserAccount.objects.create_user(
            username="telephonyuser", password="testpass123",
            organisation_unit=self.org, system_role=SystemRole.SUPER_ADMIN,
            is_super_admin=True,
        )
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_ivr_emergency_dtmf_creates_notification(self):
        resp = self.client.post("/api/v1/communication/telephony/webhook/", {
            "channel": "IVR",
            "caller_number": "+233244567890",
            "session_id": "sess-001",
            "answers": {"1": "1"},
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "EMERGENCY_DETECTED")
        self.assertTrue(data["escalation_started"])
        self.assertTrue(Notification.objects.filter(
            notification_class=NotificationClass.EMERGENCY,
        ).exists())

    def test_ivr_no_emergency(self):
        resp = self.client.post("/api/v1/communication/telephony/webhook/", {
            "channel": "IVR",
            "caller_number": "+233244567890",
            "session_id": "sess-002",
            "answers": {"1": "2"},
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "NO_EMERGENCY")

    def test_ussd_emergency_keyword(self):
        resp = self.client.post("/api/v1/communication/telephony/webhook/", {
            "channel": "USSD",
            "caller_number": "+233244567890",
            "session_id": "sess-003",
            "text": "BLEED",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "EMERGENCY_DETECTED")
        self.assertIn("bleed", data["danger_signs"])

    def test_ussd_no_emergency_keyword(self):
        resp = self.client.post("/api/v1/communication/telephony/webhook/", {
            "channel": "USSD",
            "caller_number": "+233244567890",
            "session_id": "sess-004",
            "text": "HELLO",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "NO_EMERGENCY")

    def test_telephony_creates_audit_event(self):
        self.client.post("/api/v1/communication/telephony/webhook/", {
            "channel": "IVR",
            "caller_number": "+233244567890",
            "session_id": "sess-005",
            "answers": {"1": "1"},
        }, format="json")
        self.assertTrue(AuditEvent.objects.filter(
            action="TELEPHONY_REMOTE_OBSERVATION",
        ).exists())

    def test_emergency_telephony_dispatches_alert(self):
        self.client.post("/api/v1/communication/telephony/webhook/", {
            "channel": "IVR",
            "caller_number": "+233244567890",
            "session_id": "sess-006",
            "answers": {"2": "1"},
        }, format="json")
        self.assertTrue(AuditEvent.objects.filter(
            action="EMERGENCY_ALERT_DISPATCHED",
        ).exists())

    def test_no_speech_recorded(self):
        """Verify no audio/speech data is stored (spec §37)."""
        resp = self.client.post("/api/v1/communication/telephony/webhook/", {
            "channel": "IVR",
            "caller_number": "+233244567890",
            "session_id": "sess-007",
            "answers": {"1": "1"},
            "audio_recording": "base64audiodata",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        event = AuditEvent.objects.filter(action="TELEPHONY_REMOTE_OBSERVATION").first()
        self.assertNotIn("audio_recording", event.metadata)
        self.assertNotIn("speech", event.metadata)

    def test_multiple_dtmf_emergency_signs(self):
        resp = self.client.post("/api/v1/communication/telephony/webhook/", {
            "channel": "IVR",
            "caller_number": "+233244567890",
            "session_id": "sess-008",
            "answers": {"1": "1", "2": "1", "3": "1"},
        }, format="json")
        data = resp.json()
        self.assertEqual(data["status"], "EMERGENCY_DETECTED")
        self.assertTrue(len(data["danger_signs"]) >= 3)
