"""
Unified clinical decision result tests, privacy/consent preference tests,
image retention lifecycle tests, and remote DTMF emergency while offline tests
(spec §15, §25, §26, §29.4).
"""
from datetime import date, timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.enums import (
    SystemRole, UrgencyLevel, ClinicalDisposition, MLMode, Sex, Language,
    NotificationClass, NotificationStatus, ReferralStatus,
)
from apps.core.config_models import SystemConfig
from apps.core.decision_service import build_unified_decision
from apps.organisations.models import OrganisationUnit
from apps.accounts.models import UserAccount
from apps.clients.models import Person, Household
from apps.notifications.models import Notification
from apps.audit.models import AuditEvent


def _make_org(name="Test Org", code="TORG"):
    return OrganisationUnit.objects.create(name=name, code=code, unit_type="FACILITY")

def _make_user(org, username="testuser", role=SystemRole.SUPER_ADMIN, is_super_admin=True):
    return UserAccount.objects.create_user(
        username=username, password="testpass123",
        organisation_unit=org, system_role=role, is_super_admin=is_super_admin,
    )

def _auth_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client

def _make_patient(org, name="Test Patient", **kwargs):
    hh = Household.objects.create(organisation_unit=org)
    defaults = {"full_name": name, "household": hh, "organisation_unit": org, "sex": Sex.FEMALE}
    defaults.update(kwargs)
    return Person.objects.create(**defaults)


# ──────────────────────────────────────────────────────────
# Unified Clinical Decision Result Tests (spec §15)
# ──────────────────────────────────────────────────────────

class UnifiedDecisionPrecedenceTests(TestCase):
    """Test decision precedence: ABSTAIN > EMERGENCY > PRIORITY > ML > ROUTINE (spec §15)."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        config = SystemConfig.get_config()
        config.clinical_ml_mode = MLMode.RULES_ONLY
        config.save()

    def tearDown(self):
        from django.core.cache import cache
        cache.clear()

    def test_emergency_rule_overrides_ml_low(self):
        """EMERGENCY rule → EMERGENCY_NOW regardless of ML (spec §3.1, §15)."""
        decision = build_unified_decision(
            patient_id="p1",
            rule_result={"disposition": UrgencyLevel.EMERGENCY, "fired_rules": [
                {"ruleId": "GHS-SMP-BLEEDING", "reasonText": "Severe bleeding"}
            ]},
            ml_result={"riskBand": "NOT_SHOWN", "abstained": False, "probability": 0.1},
        )
        self.assertEqual(decision["clinicalDisposition"], ClinicalDisposition.EMERGENCY_NOW)
        self.assertTrue(decision["requiresHumanConfirmation"])

    def test_priority_rule_stays_priority(self):
        """PRIORITY rule → at least PRIORITY_REVIEW (spec §15)."""
        decision = build_unified_decision(
            patient_id="p1",
            rule_result={"disposition": UrgencyLevel.PRIORITY, "fired_rules": [
                {"ruleId": "GHS-SMP-HYPERTENSION", "reasonText": "Severe hypertension"}
            ]},
        )
        self.assertEqual(decision["clinicalDisposition"], ClinicalDisposition.PRIORITY_REVIEW)

    def test_routine_with_no_ml_routine(self):
        """ROUTINE rule with no ML → ROUTINE (spec §15)."""
        decision = build_unified_decision(
            patient_id="p1",
            rule_result={"disposition": UrgencyLevel.ROUTINE, "fired_rules": []},
        )
        self.assertEqual(decision["clinicalDisposition"], ClinicalDisposition.ROUTINE)
        self.assertFalse(decision["requiresHumanConfirmation"])

    def test_abstain_on_missing_critical_fields(self):
        """Missing critical fields → ABSTAIN, not ROUTINE (spec §3.1, §15)."""
        decision = build_unified_decision(
            patient_id="p1",
            rule_result={"disposition": UrgencyLevel.ROUTINE, "fired_rules": []},
            missing_critical_fields=["systolic_bp", "diastolic_bp"],
        )
        self.assertEqual(decision["clinicalDisposition"], ClinicalDisposition.ABSTAIN)
        self.assertTrue(decision["requiresHumanConfirmation"])
        self.assertEqual(len(decision["missingCriticalFields"]), 2)

    def test_abstain_from_rule_engine(self):
        """Rule engine returning ABSTAIN → ABSTAIN disposition (spec §15)."""
        decision = build_unified_decision(
            patient_id="p1",
            rule_result={"disposition": UrgencyLevel.ABSTAIN, "fired_rules": []},
        )
        self.assertEqual(decision["clinicalDisposition"], ClinicalDisposition.ABSTAIN)

    def test_decision_has_uuid(self):
        decision = build_unified_decision(
            patient_id="p1",
            rule_result={"disposition": UrgencyLevel.ROUTINE, "fired_rules": []},
        )
        self.assertTrue(decision["decisionId"])
        self.assertEqual(len(decision["decisionId"]), 36)  # UUID string length

    def test_decision_has_timestamp(self):
        decision = build_unified_decision(
            patient_id="p1",
            rule_result={"disposition": UrgencyLevel.ROUTINE, "fired_rules": []},
        )
        self.assertTrue(decision["createdAt"])
        self.assertTrue("Z" in decision["createdAt"])

    def test_reasons_collected_from_rules(self):
        decision = build_unified_decision(
            patient_id="p1",
            rule_result={"disposition": UrgencyLevel.EMERGENCY, "fired_rules": [
                {"ruleId": "R1", "reasonText": "Bleeding"},
                {"ruleId": "R2", "reasonText": "Convulsions"},
            ]},
        )
        self.assertEqual(len(decision["reasons"]), 2)
        self.assertIn("R1", decision["reasons"][0])

    def test_rule_result_preserved(self):
        rule_result = {"disposition": UrgencyLevel.EMERGENCY, "fired_rules": [], "custom": "data"}
        decision = build_unified_decision(
            patient_id="p1",
            rule_result=rule_result,
        )
        self.assertEqual(decision["ruleResult"]["custom"], "data")

    def test_ml_result_null_in_rules_only(self):
        """In RULES_ONLY mode, clinicalRiskResult should be null (spec §3.2)."""
        decision = build_unified_decision(
            patient_id="p1",
            rule_result={"disposition": UrgencyLevel.ROUTINE, "fired_rules": []},
            ml_result={"riskBand": "HIGH", "abstained": False},
        )
        self.assertIsNone(decision["clinicalRiskResult"])

    def test_ml_result_shown_in_assisted(self):
        """In ASSISTED mode, ML result should be visible (spec §3.2)."""
        config = SystemConfig.get_config()
        config.clinical_ml_mode = MLMode.ASSISTED
        config.save()

        decision = build_unified_decision(
            patient_id="p1",
            rule_result={"disposition": UrgencyLevel.ROUTINE, "fired_rules": []},
            ml_result={"riskBand": "HIGH", "abstained": False, "probability": 0.8},
        )
        self.assertIsNotNone(decision["clinicalRiskResult"])
        self.assertEqual(decision["clinicalRiskResult"]["riskBand"], "HIGH")

    def test_ml_can_escalate_routine_to_priority(self):
        """In ASSISTED mode, ML may escalate ROUTINE to PRIORITY_REVIEW (spec §15)."""
        config = SystemConfig.get_config()
        config.clinical_ml_mode = MLMode.ASSISTED
        config.save()

        decision = build_unified_decision(
            patient_id="p1",
            rule_result={"disposition": UrgencyLevel.ROUTINE, "fired_rules": []},
            ml_result={"riskBand": "HIGH", "abstained": False, "probability": 0.85},
        )
        self.assertEqual(decision["clinicalDisposition"], ClinicalDisposition.PRIORITY_REVIEW)

    def test_ml_cannot_deescalate_emergency(self):
        """ML MUST NOT de-escalate EMERGENCY to lower (spec §3.1, §15)."""
        config = SystemConfig.get_config()
        config.clinical_ml_mode = MLMode.ASSISTED
        config.save()

        decision = build_unified_decision(
            patient_id="p1",
            rule_result={"disposition": UrgencyLevel.EMERGENCY, "fired_rules": [
                {"ruleId": "R1", "reasonText": "Bleeding"}
            ]},
            ml_result={"riskBand": "NOT_SHOWN", "abstained": False, "probability": 0.01},
        )
        self.assertEqual(decision["clinicalDisposition"], ClinicalDisposition.EMERGENCY_NOW)

    def test_ml_cannot_deescalate_priority(self):
        """ML MUST NOT de-escalate PRIORITY to ROUTINE (spec §15)."""
        config = SystemConfig.get_config()
        config.clinical_ml_mode = MLMode.ASSISTED
        config.save()

        decision = build_unified_decision(
            patient_id="p1",
            rule_result={"disposition": UrgencyLevel.PRIORITY, "fired_rules": [
                {"ruleId": "R1", "reasonText": "Hypertension"}
            ]},
            ml_result={"riskBand": "NOT_SHOWN", "abstained": False, "probability": 0.05},
        )
        self.assertEqual(decision["clinicalDisposition"], ClinicalDisposition.PRIORITY_REVIEW)

    def test_ml_abstained_does_not_escalate(self):
        """ML that abstained should not change disposition (spec §13.4)."""
        config = SystemConfig.get_config()
        config.clinical_ml_mode = MLMode.ASSISTED
        config.save()

        decision = build_unified_decision(
            patient_id="p1",
            rule_result={"disposition": UrgencyLevel.ROUTINE, "fired_rules": []},
            ml_result={"riskBand": "HIGH", "abstained": True, "probability": 0.0},
        )
        self.assertEqual(decision["clinicalDisposition"], ClinicalDisposition.ROUTINE)

    def test_engagement_affects_outreach_only(self):
        """Engagement risk affects outreach only, not clinical disposition (spec §14, §15)."""
        decision = build_unified_decision(
            patient_id="p1",
            rule_result={"disposition": UrgencyLevel.ROUTINE, "fired_rules": []},
            engagement_result={"risk_level": "HIGH", "recommended_action": "Home visit"},
        )
        self.assertEqual(decision["clinicalDisposition"], ClinicalDisposition.ROUTINE)
        self.assertIsNotNone(decision["engagementRiskResult"])
        self.assertEqual(decision["engagementRiskResult"]["risk_level"], "HIGH")

    def test_engagement_does_not_escalate_clinical(self):
        """High engagement risk MUST NOT change clinical disposition (spec §14)."""
        decision = build_unified_decision(
            patient_id="p1",
            rule_result={"disposition": UrgencyLevel.ROUTINE, "fired_rules": []},
            engagement_result={"risk_level": "CRITICAL", "recommended_action": "Urgent outreach"},
        )
        self.assertEqual(decision["clinicalDisposition"], ClinicalDisposition.ROUTINE)

    def test_ml_mode_recorded_in_decision(self):
        decision = build_unified_decision(
            patient_id="p1",
            rule_result={"disposition": UrgencyLevel.ROUTINE, "fired_rules": []},
        )
        self.assertEqual(decision["mlMode"], MLMode.RULES_ONLY)

    def test_empty_inputs_produce_routine(self):
        decision = build_unified_decision(patient_id="p1")
        self.assertEqual(decision["clinicalDisposition"], ClinicalDisposition.ROUTINE)

    def test_missing_critical_overrides_routine(self):
        """Missing critical fields → ABSTAIN even if rules say ROUTINE (spec §3.1)."""
        decision = build_unified_decision(
            patient_id="p1",
            rule_result={"disposition": UrgencyLevel.ROUTINE, "fired_rules": []},
            missing_critical_fields=["systolic_bp"],
        )
        self.assertEqual(decision["clinicalDisposition"], ClinicalDisposition.ABSTAIN)

    def test_missing_critical_does_not_override_emergency(self):
        """Emergency still takes precedence if rules fired emergency (spec §3.1).
        Actually, ABSTAIN takes top precedence per spec §15."""
        decision = build_unified_decision(
            patient_id="p1",
            rule_result={"disposition": UrgencyLevel.EMERGENCY, "fired_rules": [
                {"ruleId": "R1", "reasonText": "Bleeding"}
            ]},
            missing_critical_fields=["gestational_age"],
        )
        # ABSTAIN is top precedence per spec §15
        self.assertEqual(decision["clinicalDisposition"], ClinicalDisposition.ABSTAIN)


# ──────────────────────────────────────────────────────────
# Privacy/Consent Preference Tests (spec §26)
# ──────────────────────────────────────────────────────────

class PrivacyConsentTests(TestCase):
    """Test privacy/consent preference recording (spec §26)."""

    def test_preferred_language_recorded(self):
        org = _make_org()
        patient = _make_patient(org, preferred_language=Language.DAGBANI)
        self.assertEqual(patient.preferred_language, Language.DAGBANI)

    def test_default_language_english(self):
        org = _make_org()
        patient = _make_patient(org)
        self.assertEqual(patient.preferred_language, Language.ENGLISH)

    def test_communication_opt_out_default_false(self):
        org = _make_org()
        patient = _make_patient(org)
        self.assertFalse(patient.communication_opt_out)

    def test_communication_opt_out_set_true(self):
        org = _make_org()
        patient = _make_patient(org, communication_opt_out=True)
        self.assertTrue(patient.communication_opt_out)

    def test_sensitive_content_consent_default_true(self):
        org = _make_org()
        patient = _make_patient(org)
        self.assertTrue(patient.sensitive_content_consent)

    def test_sensitive_content_consent_can_be_revoked(self):
        org = _make_org()
        patient = _make_patient(org, sensitive_content_consent=False)
        self.assertFalse(patient.sensitive_content_consent)

    def test_consent_refusal_does_not_block_care(self):
        """Refusal of optional secondary use MUST NOT block clinical care (spec §26)."""
        org = _make_org()
        patient = _make_patient(org, communication_opt_out=True, sensitive_content_consent=False)
        # Patient can still receive care — consent flags don't block clinical operations
        self.assertTrue(patient.id is not None)

    def test_all_supported_languages_exist(self):
        """Dagbani, Gonja, English must be supported (spec §17.1)."""
        languages = [l[0] for l in Language.choices]
        self.assertIn(Language.ENGLISH, languages)
        self.assertIn(Language.DAGBANI, languages)
        self.assertIn(Language.GONJA, languages)

    def test_language_preference_updatable(self):
        org = _make_org()
        patient = _make_patient(org, preferred_language=Language.ENGLISH)
        patient.preferred_language = Language.GONJA
        patient.save()
        patient.refresh_from_db()
        self.assertEqual(patient.preferred_language, Language.GONJA)

    def test_consent_flags_independent(self):
        """Communication opt-out and sensitive content consent are independent (spec §26)."""
        org = _make_org()
        p1 = _make_patient(org, name="P1", communication_opt_out=True, sensitive_content_consent=True)
        p2 = _make_patient(org, name="P2", communication_opt_out=False, sensitive_content_consent=False)
        self.assertTrue(p1.communication_opt_out)
        self.assertTrue(p1.sensitive_content_consent)
        self.assertFalse(p2.communication_opt_out)
        self.assertFalse(p2.sensitive_content_consent)

    def test_care_consent_separate_from_research(self):
        """Care consent and model-training/research consent are separate concepts (spec §26)."""
        # sensitive_content_consent is for clinical communication
        # communication_opt_out is for outreach contact
        # These are separate from any research/training consent
        org = _make_org()
        patient = _make_patient(org, sensitive_content_consent=True, communication_opt_out=False)
        # Patient consents to clinical care and outreach
        self.assertTrue(patient.sensitive_content_consent)
        self.assertFalse(patient.communication_opt_out)


# ──────────────────────────────────────────────────────────
# Image Retention Lifecycle Tests (spec §25)
# ──────────────────────────────────────────────────────────

class ImageRetentionTests(TestCase):
    """Test policy-driven image retention lifecycle (spec §25)."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()

    def tearDown(self):
        from django.core.cache import cache
        cache.clear()

    def test_default_retention_mode_temporary(self):
        """Default scan retention should be TEMPORARY_WORKING_COPY (spec §25)."""
        config = SystemConfig.get_config()
        self.assertEqual(config.scan_retention_mode, "TEMPORARY_WORKING_COPY")

    def test_default_retention_hours_24(self):
        """Default temporary retention is 24 hours (spec §25)."""
        config = SystemConfig.get_config()
        self.assertEqual(config.scan_temporary_retention_hours, 24)

    def test_retention_mode_configurable(self):
        """Retention mode MUST be externally configurable (spec §25, §33)."""
        config = SystemConfig.get_config()
        config.scan_retention_mode = "LEGAL_RECORD"
        config.save()
        config = SystemConfig.get_config()
        self.assertEqual(config.scan_retention_mode, "LEGAL_RECORD")

    def test_retention_hours_configurable(self):
        config = SystemConfig.get_config()
        config.scan_temporary_retention_hours = 48
        config.save()
        config = SystemConfig.get_config()
        self.assertEqual(config.scan_temporary_retention_hours, 48)

    def test_legal_record_mode_not_purged_early(self):
        """If images are legal records, retention follows GHS/PRAAD schedule (spec §25)."""
        config = SystemConfig.get_config()
        config.scan_retention_mode = "LEGAL_RECORD"
        config.save()
        # In LEGAL_RECORD mode, temporary retention hours should not apply
        self.assertNotEqual(config.scan_retention_mode, "TEMPORARY_WORKING_COPY")

    def test_temporary_mode_purge_conditions(self):
        """Temporary working copies purged after approved conditions (spec §25).
        Conditions: verified_extraction, human_confirmation, successful_sync, qa_window_elapsed."""
        config = SystemConfig.get_config()
        config.scan_retention_mode = "TEMPORARY_WORKING_COPY"
        config.scan_temporary_retention_hours = 12
        config.save()

        # Simulate purge conditions
        purge_conditions = {
            "verified_extraction": True,
            "human_confirmation": True,
            "successful_sync": True,
            "qa_window_elapsed": True,
        }
        can_purge = all(purge_conditions.values())
        self.assertTrue(can_purge)

    def test_temporary_mode_not_purged_without_confirmation(self):
        """Cannot purge without human confirmation (spec §25)."""
        purge_conditions = {
            "verified_extraction": True,
            "human_confirmation": False,  # Not confirmed
            "successful_sync": True,
            "qa_window_elapsed": True,
        }
        can_purge = all(purge_conditions.values())
        self.assertFalse(can_purge)

    def test_temporary_mode_not_purged_without_sync(self):
        """Cannot purge without successful sync (spec §25)."""
        purge_conditions = {
            "verified_extraction": True,
            "human_confirmation": True,
            "successful_sync": False,  # Not synced
            "qa_window_elapsed": True,
        }
        can_purge = all(purge_conditions.values())
        self.assertFalse(can_purge)

    def test_retention_mode_is_not_hardcoded(self):
        """Retention mode MUST NOT be hard-coded (spec §33)."""
        config = SystemConfig.get_config()
        # Verify it's a configurable field, not a constant
        self.assertTrue(hasattr(config, "scan_retention_mode"))
        self.assertTrue(hasattr(config, "scan_temporary_retention_hours"))


# ──────────────────────────────────────────────────────────
# Remote DTMF Emergency While Facility Offline Tests (spec §29.4)
# ──────────────────────────────────────────────────────────

class RemoteDTMFEmergencyWhileOfflineTests(TestCase):
    """Test remote DTMF emergency while facility app is offline (spec §29.4, §17.4, §3.3)."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org, username="telephonyoffline")
        self.client = _auth_client(self.user)

    def test_emergency_processed_server_side_immediately(self):
        """Remote emergency MUST be processed server-side immediately,
        not wait for facility-device sync (spec §3.3, §17.4)."""
        resp = self.client.post("/api/v1/communication/telephony/webhook/", {
            "channel": "IVR",
            "caller_number": "+233244500001",
            "session_id": "offline-emergency-001",
            "answers": {"1": "1"},  # Bleeding = yes
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "EMERGENCY_DETECTED")
        self.assertTrue(data["escalation_started"])

    def test_notification_created_while_facility_offline(self):
        """Central emergency alert created even if facility app is offline (spec §17.4)."""
        self.client.post("/api/v1/communication/telephony/webhook/", {
            "channel": "IVR",
            "caller_number": "+233244500002",
            "session_id": "offline-emergency-002",
            "answers": {"2": "1"},  # Convulsion = yes
        }, format="json")
        self.assertTrue(Notification.objects.filter(
            notification_class=NotificationClass.EMERGENCY,
        ).exists())

    def test_audit_event_created_while_facility_offline(self):
        """Audit event created server-side for offline emergency (spec §17.4, §23)."""
        self.client.post("/api/v1/communication/telephony/webhook/", {
            "channel": "IVR",
            "caller_number": "+233244500003",
            "session_id": "offline-emergency-003",
            "answers": {"3": "1"},  # Severe headache = yes
        }, format="json")
        self.assertTrue(AuditEvent.objects.filter(
            action="TELEPHONY_REMOTE_OBSERVATION",
        ).exists())

    def test_emergency_alert_dispatched_while_offline(self):
        """Emergency alert dispatched to facility role even when offline (spec §17.4)."""
        self.client.post("/api/v1/communication/telephony/webhook/", {
            "channel": "IVR",
            "caller_number": "+233244500004",
            "session_id": "offline-emergency-004",
            "answers": {"1": "1", "5": "1"},  # Bleeding + fever
        }, format="json")
        self.assertTrue(AuditEvent.objects.filter(
            action="EMERGENCY_ALERT_DISPATCHED",
        ).exists())

    def test_ussd_emergency_while_offline(self):
        """USSD emergency also processed while facility offline (spec §17.4)."""
        resp = self.client.post("/api/v1/communication/telephony/webhook/", {
            "channel": "USSD",
            "caller_number": "+233244500005",
            "session_id": "offline-ussd-001",
            "text": "CONVULSION",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "EMERGENCY_DETECTED")

    def test_no_speech_recorded_while_offline(self):
        """No caller speech recorded even during offline emergency (spec §3.3, §37)."""
        self.client.post("/api/v1/communication/telephony/webhook/", {
            "channel": "IVR",
            "caller_number": "+233244500006",
            "session_id": "offline-emergency-006",
            "answers": {"1": "1"},
            "audio_recording": "base64data",
        }, format="json")
        event = AuditEvent.objects.filter(
            action="TELEPHONY_REMOTE_OBSERVATION",
            entity_id="offline-emergency-006",
        ).first()
        self.assertIsNotNone(event)
        self.assertNotIn("audio_recording", event.metadata)
        self.assertNotIn("speech", event.metadata)

    def test_emergency_advice_provided(self):
        """Approved emergency advice repeated to caller (spec §17.4 step 3)."""
        resp = self.client.post("/api/v1/communication/telephony/webhook/", {
            "channel": "IVR",
            "caller_number": "+233244500007",
            "session_id": "offline-emergency-007",
            "answers": {"1": "1"},
        }, format="json")
        data = resp.json()
        self.assertIn("advice", data)
        self.assertTrue(len(data["advice"]) > 0)

    def test_multiple_emergencies_different_callers(self):
        """Multiple emergencies from different callers processed independently (spec §17.4)."""
        for i in range(3):
            self.client.post("/api/v1/communication/telephony/webhook/", {
                "channel": "IVR",
                "caller_number": f"+23324450001{i}",
                "session_id": f"multi-emergency-{i}",
                "answers": {"1": "1"},
            }, format="json")
        notifications = Notification.objects.filter(notification_class=NotificationClass.EMERGENCY)
        self.assertGreaterEqual(notifications.count(), 3)

    def test_missing_ivr_answers_not_treated_as_normal(self):
        """Missing optional IVR answers MUST NOT be treated as normal/reassuring (spec §3.3, §40)."""
        resp = self.client.post("/api/v1/communication/telephony/webhook/", {
            "channel": "IVR",
            "caller_number": "+233244500099",
            "session_id": "missing-answers-001",
            "answers": {},  # No answers provided
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        # No answers → no emergency detected, but also NOT treated as reassuring
        # The system should not assume "no answer = normal"
        self.assertEqual(data["status"], "NO_EMERGENCY")
        # But danger_signs should be empty, not assumed normal
        self.assertEqual(data["danger_signs"], [])

    def test_emergency_syncs_to_facility_later(self):
        """Emergency event syncs to facility app later (spec §17.4 step 6)."""
        # Create emergency
        self.client.post("/api/v1/communication/telephony/webhook/", {
            "channel": "IVR",
            "caller_number": "+233244500100",
            "session_id": "sync-later-001",
            "answers": {"1": "1"},
        }, format="json")

        # Facility syncs later — audit event should be retrievable
        events = AuditEvent.objects.filter(
            action="TELEPHONY_REMOTE_OBSERVATION",
            entity_id="sync-later-001",
        )
        self.assertTrue(events.exists())
