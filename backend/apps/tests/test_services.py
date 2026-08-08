"""
Tests for audit service, notification service, referral state machine,
worklist endpoint, and config bootstrap (spec §29).
"""
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.enums import (
    SystemRole, UrgencyLevel, ReferralStatus, NotificationClass, NotificationStatus, MLMode,
)
from apps.organisations.models import OrganisationUnit
from apps.accounts.models import UserAccount
from apps.clients.models import Person, Household
from apps.audit.models import AuditEvent
from apps.audit.services import (
    log_audit, log_rule_evaluation, log_referral_created, log_referral_state_change,
    log_clinician_override, log_patient_view,
)
from apps.notifications.models import Notification
from apps.notifications.services import (
    create_emergency_notification, create_priority_notification,
    create_referral_notification, create_defaulter_notification,
    process_rule_assessment,
)
from apps.referrals.models import Referral, ReferralStateLog
from apps.referrals.state_machine import is_valid_transition, assert_valid_transition
from apps.core.config_models import SystemConfig


def _make_org():
    return OrganisationUnit.objects.create(
        name="Test Facility", code="SVC001", unit_type="FACILITY",
    )

def _make_user(org, role=SystemRole.SUPER_ADMIN, is_super=True):
    return UserAccount.objects.create_user(
        username="svctester", password="testpass123",
        organisation_unit=org, system_role=role, is_super_admin=is_super,
    )

def _make_patient(org):
    hh = Household.objects.create(organisation_unit=org)
    return Person.objects.create(
        full_name="Test Patient", sex="FEMALE", household=hh, organisation_unit=org,
    )


class AuditServiceTests(TestCase):

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)

    def test_log_audit_creates_event(self):
        event = log_audit(actor="user1", action="TEST_ACTION", entity_type="TestEntity")
        self.assertEqual(event.action, "TEST_ACTION")
        self.assertEqual(event.actor, "user1")
        self.assertTrue(AuditEvent.objects.filter(id=event.id).exists())

    def test_log_rule_evaluation(self):
        event = log_rule_evaluation(
            actor="user1", episode_type="PregnancyEpisode",
            episode_id="abc-123", disposition="EMERGENCY",
            fired_rules=[{"ruleId": "RULE1"}],
        )
        self.assertEqual(event.action, "RULE_EVALUATION")
        self.assertEqual(event.metadata["disposition"], "EMERGENCY")

    def test_log_referral_created(self):
        event = log_referral_created(
            actor="user1", referral_id="ref-123",
            urgency="EMERGENCY",
        )
        self.assertEqual(event.action, "REFERRAL_CREATED")
        self.assertEqual(event.metadata["urgency"], "EMERGENCY")

    def test_log_referral_state_change(self):
        event = log_referral_state_change(
            actor="user1", referral_id="ref-123",
            from_status="DRAFT", to_status="REQUESTED",
        )
        self.assertEqual(event.action, "REFERRAL_STATE_CHANGE")
        self.assertEqual(event.metadata["from_status"], "DRAFT")
        self.assertEqual(event.metadata["to_status"], "REQUESTED")

    def test_log_clinician_override(self):
        event = log_clinician_override(
            actor="user1", episode_type="PregnancyEpisode",
            episode_id="ep-123",
            prior_recommendation="EMERGENCY",
            resulting_action="ROUTINE",
            reason="Patient refused transfer",
        )
        self.assertEqual(event.action, "CLINICIAN_OVERRIDE")
        self.assertEqual(event.metadata["reason"], "Patient refused transfer")

    def test_log_patient_view(self):
        import uuid
        event = log_patient_view(actor="user1", patient_id=uuid.uuid4())
        self.assertEqual(event.action, "PATIENT_VIEW")


class NotificationServiceTests(TestCase):

    def setUp(self):
        self.org = _make_org()

    def test_emergency_notification_created(self):
        import uuid
        notif = create_emergency_notification(
            "PregnancyEpisode", uuid.uuid4(),
            patient_name="Jane Doe",
            fired_rules=[{"ruleId": "RULE1"}],
            disposition="EMERGENCY",
        )
        self.assertEqual(notif.notification_class, NotificationClass.EMERGENCY)
        self.assertEqual(notif.urgency, UrgencyLevel.EMERGENCY)
        self.assertIn("EMERGENCY", notif.title)

    def test_priority_notification_created(self):
        import uuid
        notif = create_priority_notification(
            "NewbornEpisode", uuid.uuid4(),
            patient_name="Baby Smith",
        )
        self.assertEqual(notif.urgency, UrgencyLevel.PRIORITY)
        self.assertIn("Priority", notif.title)

    def test_process_rule_assessment_emergency(self):
        import uuid
        notif = process_rule_assessment(
            {"disposition": UrgencyLevel.EMERGENCY, "fired_rules": []},
            "PregnancyEpisode", uuid.uuid4(), patient_name="Jane",
        )
        self.assertIsNotNone(notif)
        self.assertEqual(notif.urgency, UrgencyLevel.EMERGENCY)

    def test_process_rule_assessment_routine_returns_none(self):
        import uuid
        notif = process_rule_assessment(
            {"disposition": UrgencyLevel.ROUTINE, "fired_rules": []},
            "PregnancyEpisode", uuid.uuid4(),
        )
        self.assertIsNone(notif)

    def test_referral_notification(self):
        patient = _make_patient(self.org)
        referral = Referral.objects.create(
            patient=patient, referring_facility=self.org,
            urgency=UrgencyLevel.EMERGENCY,
        )
        notif = create_referral_notification(referral, "created")
        self.assertEqual(notif.notification_class, NotificationClass.EMERGENCY)
        self.assertIn("EMERGENCY REFERRAL", notif.title)


class ReferralStateMachineTests(TestCase):

    def test_valid_transition_draft_to_requested(self):
        self.assertTrue(is_valid_transition("DRAFT", "REQUESTED"))

    def test_valid_transition_requested_to_accepted(self):
        self.assertTrue(is_valid_transition("REQUESTED", "ACCEPTED"))

    def test_invalid_transition_draft_to_arrived(self):
        self.assertFalse(is_valid_transition("DRAFT", "ARRIVED"))

    def test_invalid_transition_closed_to_anything(self):
        self.assertFalse(is_valid_transition("CLOSED", "REQUESTED"))

    def test_assert_valid_raises(self):
        with self.assertRaises(ValueError):
            assert_valid_transition("DRAFT", "ARRIVED")

    def test_same_status_is_valid(self):
        self.assertTrue(is_valid_transition("ACCEPTED", "ACCEPTED"))


class ReferralAPITests(TestCase):

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.patient = _make_patient(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_create_referral_auto_classifies(self):
        """Creating a referral with emergency reason auto-classifies urgency."""
        resp = self.client.post("/api/v1/referrals/", {
            "patient": str(self.patient.id),
            "referring_facility": str(self.org.id),
            "referral_reason": "severe bleeding and haemorrhage",
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data["urgency"], UrgencyLevel.EMERGENCY)
        self.assertTrue(data["qr_token"])
        self.assertTrue(data["short_code"])

    def test_acknowledge_referral(self):
        referral = Referral.objects.create(
            patient=self.patient, referring_facility=self.org,
            status=ReferralStatus.REQUESTED,
        )
        resp = self.client.post(f"/api/v1/referrals/{referral.id}/acknowledge/", {
            "to_status": ReferralStatus.ACCEPTED,
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        referral.refresh_from_db()
        self.assertEqual(referral.status, ReferralStatus.ACCEPTED)
        self.assertIsNotNone(referral.acknowledged_at)

    def test_invalid_transition_returns_409(self):
        referral = Referral.objects.create(
            patient=self.patient, referring_facility=self.org,
            status=ReferralStatus.DRAFT,
        )
        resp = self.client.post(f"/api/v1/referrals/{referral.id}/arrival/", format="json")
        self.assertEqual(resp.status_code, 409)

    def test_transport_action(self):
        referral = Referral.objects.create(
            patient=self.patient, referring_facility=self.org,
            status=ReferralStatus.ACCEPTED,
        )
        resp = self.client.post(f"/api/v1/referrals/{referral.id}/transport/", {
            "to_status": ReferralStatus.TRANSPORT_REQUESTED,
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        referral.refresh_from_db()
        self.assertEqual(referral.status, ReferralStatus.TRANSPORT_REQUESTED)

    def test_close_action(self):
        referral = Referral.objects.create(
            patient=self.patient, referring_facility=self.org,
            status=ReferralStatus.DISPOSITION_RECORDED,
        )
        resp = self.client.post(f"/api/v1/referrals/{referral.id}/close/", format="json")
        self.assertEqual(resp.status_code, 200)
        referral.refresh_from_db()
        self.assertEqual(referral.status, ReferralStatus.CLOSED)
        self.assertIsNotNone(referral.closed_at)

    def test_state_log_has_from_status(self):
        referral = Referral.objects.create(
            patient=self.patient, referring_facility=self.org,
            status=ReferralStatus.REQUESTED,
        )
        self.client.post(f"/api/v1/referrals/{referral.id}/acknowledge/", {
            "to_status": ReferralStatus.ACCEPTED,
        }, format="json")
        log = ReferralStateLog.objects.filter(referral=referral).first()
        self.assertEqual(log.from_status, ReferralStatus.REQUESTED)
        self.assertEqual(log.to_status, ReferralStatus.ACCEPTED)


class WorklistAPITests(TestCase):

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_worklist_returns_200(self):
        resp = self.client.get("/api/v1/worklists/my")
        self.assertEqual(resp.status_code, 200)

    def test_worklist_has_expected_sections(self):
        resp = self.client.get("/api/v1/worklists/my")
        data = resp.json()
        self.assertIn("notifications", data)
        self.assertIn("referrals", data)
        self.assertIn("emergencies", data)
        self.assertIn("defaulters", data)
        self.assertIn("summary", data)
        self.assertIn("generated_at", data)


class ConfigBootstrapTests(TestCase):

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_config_bootstrap_returns_200(self):
        resp = self.client.get("/api/v1/config/bootstrap")
        self.assertEqual(resp.status_code, 200)

    def test_config_has_feature_flags(self):
        resp = self.client.get("/api/v1/config/bootstrap")
        data = resp.json()
        self.assertIn("feature_flags", data)
        self.assertIn("ocr_enabled", data["feature_flags"])
        self.assertIn("speech_capture_enabled", data["feature_flags"])

    def test_config_ml_mode_defaults_rules_only(self):
        resp = self.client.get("/api/v1/config/bootstrap")
        data = resp.json()
        self.assertEqual(data["clinical_ml_mode"], MLMode.RULES_ONLY)
        self.assertTrue(data["ml_mode_is_rules_only"])

    def test_config_speech_capture_disabled_by_default(self):
        resp = self.client.get("/api/v1/config/bootstrap")
        data = resp.json()
        self.assertFalse(data["feature_flags"]["speech_capture_enabled"])


class FacilityReferralOptionsTests(TestCase):

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_referral_options_no_capability(self):
        """Facility without capability record returns warning."""
        resp = self.client.get(f"/api/v1/organisations/units/{self.org.id}/referral_options/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIsNone(data["capabilities"])
        self.assertIn("warning", data)

    def test_referral_options_with_capability(self):
        """Facility with capability record returns capabilities."""
        from apps.organisations.models import FacilityCapability
        dest = OrganisationUnit.objects.create(
            name="Dest Facility", code="DEST01", unit_type="FACILITY",
        )
        FacilityCapability.objects.create(
            facility=self.org,
            cemonc=True,
            primary_referral_destination=dest,
            verified_at=timezone.now(),
        )
        resp = self.client.get(f"/api/v1/organisations/units/{self.org.id}/referral_options/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["capabilities"]["cemonc"])
        self.assertEqual(data["primary_destination"]["name"], "Dest Facility")
        self.assertTrue(data["capability_verified"])
