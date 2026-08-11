"""
Tests for assessment API endpoints, telephony webhook, rule package,
device provisioning, and batch sync (spec §29).
"""
import uuid

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.enums import (
    SystemRole, UrgencyLevel, ReferralStatus, EpisodeStatus, MLMode,
)
from apps.organisations.models import OrganisationUnit
from apps.accounts.models import UserAccount
from apps.clients.models import Person, Household
from apps.pregnancy.models import PregnancyEpisode, PregnancyObservation
from apps.newborn.models import NewbornEpisode, NewbornObservation, BirthEpisode
from apps.immunisation.models import ChildImmunisationRecord, VaccineDose
from apps.growth.models import GrowthMeasurement
from apps.referrals.models import Referral
from apps.audit.models import AuditEvent


def _make_org():
    return OrganisationUnit.objects.create(
        name="Test Facility", code="EPITEST01", unit_type="FACILITY",
    )

def _make_user(org, role=SystemRole.SUPER_ADMIN, is_super=True):
    return UserAccount.objects.create_user(
        username="epitester", password="testpass123",
        organisation_unit=org, system_role=role, is_super_admin=is_super,
    )

def _make_patient(org, sex="FEMALE"):
    hh = Household.objects.create(organisation_unit=org)
    return Person.objects.create(
        full_name="Test Patient", sex=sex, household=hh, organisation_unit=org,
    )


class PregnancyAssessAPITests(TestCase):

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.patient = _make_patient(self.org)
        self.episode = PregnancyEpisode.objects.create(
            woman=self.patient, lmp_date=timezone.now().date(),
        )
        PregnancyObservation.objects.create(
            episode=self.episode,
            bp_systolic=170, bp_diastolic=115,
            danger_signs="severe headache",
        )
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_assess_endpoint_returns_disposition(self):
        resp = self.client.post(f"/api/v1/pregnancy/episodes/{self.episode.id}/assess/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("disposition", data)
        self.assertIn("fired_rules", data)
        self.assertIn("rule_set_version", data)

    def test_assess_emergency_detected(self):
        resp = self.client.post(f"/api/v1/pregnancy/episodes/{self.episode.id}/assess/")
        data = resp.json()
        self.assertEqual(data["disposition"], UrgencyLevel.EMERGENCY)

    def test_assess_creates_audit_event(self):
        self.client.post(f"/api/v1/pregnancy/episodes/{self.episode.id}/assess/")
        audit = AuditEvent.objects.filter(
            action="RULE_EVALUATION",
            entity_type="PregnancyEpisode",
        ).exists()
        self.assertTrue(audit)

    def test_assess_updates_episode_urgency(self):
        self.client.post(f"/api/v1/pregnancy/episodes/{self.episode.id}/assess/")
        self.episode.refresh_from_db()
        self.assertEqual(self.episode.current_urgency, UrgencyLevel.EMERGENCY)


class NewbornAssessAPITests(TestCase):

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.mother = _make_patient(self.org, sex="FEMALE")
        self.child = Person.objects.create(
            full_name="Baby Test", sex="MALE",
            household=self.mother.household, organisation_unit=self.org,
            date_of_birth=timezone.now().date(),
        )
        self.episode = NewbornEpisode.objects.create(
            child=self.child, mother=self.mother,
            birth_weight_g=1200, gestational_age_weeks=30,
        )
        NewbornObservation.objects.create(
            newborn=self.episode,
            convulsions=True,
            central_cyanosis=True,
        )
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_assess_endpoint_returns_disposition(self):
        resp = self.client.post(f"/api/v1/newborn/episodes/{self.episode.id}/assess/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("disposition", data)
        self.assertEqual(data["disposition"], UrgencyLevel.EMERGENCY)


class GrowthAssessAPITests(TestCase):

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.child = Person.objects.create(
            full_name="Child Test", sex="FEMALE",
            household=Household.objects.create(organisation_unit=self.org),
            organisation_unit=self.org,
            date_of_birth=timezone.now().date(),
        )
        self.measurement = GrowthMeasurement.objects.create(
            child=self.child,
            measurement_date=timezone.now().date(),
            muac_mm=100,
            weight_kg=5.0,
            height_cm=70.0,
        )
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_assess_endpoint_returns_disposition(self):
        resp = self.client.post(f"/api/v1/growth/measurements/{self.measurement.id}/assess/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("disposition", data)
        self.assertEqual(data["disposition"], UrgencyLevel.EMERGENCY)


class ImmunisationAssessAPITests(TestCase):

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.child = Person.objects.create(
            full_name="Imm Child", sex="MALE",
            household=Household.objects.create(organisation_unit=self.org),
            organisation_unit=self.org,
            date_of_birth=timezone.now().date(),
        )
        self.record = ChildImmunisationRecord.objects.create(
            child=self.child,
            cwc_card_number="CWC001",
        )
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_assess_endpoint_returns_risk(self):
        resp = self.client.post(f"/api/v1/immunisation/children/{self.record.id}/assess/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("risk_level", data)
        self.assertIn("defaulter_status", data)
        self.assertIn("missing_vaccines", data)


class TelephonyWebhookTests(TestCase):

    def setUp(self):
        self.client = APIClient()

    def test_no_emergency_response(self):
        resp = self.client.post("/api/v1/communication/telephony/webhook/", {
            "channel": "IVR",
            "caller_number": "+233123456789",
            "session_id": "sess-001",
            "answers": {},
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "NO_EMERGENCY")

    def test_emergency_detected_dtmf(self):
        resp = self.client.post("/api/v1/communication/telephony/webhook/", {
            "channel": "IVR",
            "caller_number": "+233123456789",
            "session_id": "sess-002",
            "answers": {"1": "1"},  # bleeding = yes
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "EMERGENCY_DETECTED")
        self.assertIn("bleeding", data["danger_signs"])
        self.assertTrue(data["escalation_started"])

    def test_emergency_detected_ussd(self):
        resp = self.client.post("/api/v1/communication/telephony/webhook/", {
            "channel": "USSD",
            "caller_number": "+233123456789",
            "session_id": "sess-003",
            "text": "I have BLEED and CONVULSION",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "EMERGENCY_DETECTED")
        self.assertIn("bleed", data["danger_signs"])

    def test_telephony_no_speech_recorded(self):
        """No audio/speech field should be stored (spec §37)."""
        resp = self.client.post("/api/v1/communication/telephony/webhook/", {
            "channel": "IVR",
            "caller_number": "+233123456789",
            "session_id": "sess-004",
            "answers": {"1": "1"},
        }, format="json")
        data = resp.json()
        self.assertNotIn("recording", data)
        self.assertNotIn("audio", data)
        self.assertNotIn("speech", data)

    def test_audit_event_created(self):
        self.client.post("/api/v1/communication/telephony/webhook/", {
            "channel": "IVR",
            "caller_number": "+233123456789",
            "session_id": "sess-005",
            "answers": {"1": "1"},
        }, format="json")
        audit = AuditEvent.objects.filter(
            action="TELEPHONY_REMOTE_OBSERVATION",
        ).exists()
        self.assertTrue(audit)


class RulePackageAPITests(TestCase):

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_rule_package_returns_200(self):
        resp = self.client.get("/api/v1/packages/rules/latest")
        self.assertEqual(resp.status_code, 200)

    def test_rule_package_has_rule_sets(self):
        resp = self.client.get("/api/v1/packages/rules/latest")
        data = resp.json()
        self.assertIn("ruleSets", data)
        self.assertTrue(len(data["ruleSets"]) >= 5)

    def test_rule_package_has_pregnancy(self):
        resp = self.client.get("/api/v1/packages/rules/latest")
        data = resp.json()
        names = [rs["name"] for rs in data["ruleSets"]]
        self.assertIn("pregnancy", names)
        self.assertIn("newborn", names)
        self.assertIn("growth", names)

    def test_rule_package_has_ml_mode(self):
        resp = self.client.get("/api/v1/packages/rules/latest")
        data = resp.json()
        self.assertEqual(data["clinicalMlMode"], MLMode.RULES_ONLY)


class DeviceProvisionAPITests(TestCase):

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_provision_returns_200(self):
        resp = self.client.post("/api/v1/accounts/auth/device-provision/", {
            "device_id": "test-device-001",
            "device_model": "Samsung Galaxy A14",
            "os_version": "Android 14",
            "app_version": "1.0.0",
        }, format="json")
        self.assertEqual(resp.status_code, 200)

    def test_provision_returns_config(self):
        resp = self.client.post("/api/v1/accounts/auth/device-provision/", {
            "device_id": "test-device-002",
        }, format="json")
        data = resp.json()
        self.assertTrue(data["provisioned"])
        self.assertIn("config", data)
        self.assertIn("feature_flags", data["config"])
        self.assertIn("active_rule_bundle_version", data["config"])

    def test_provision_creates_audit(self):
        self.client.post("/api/v1/accounts/auth/device-provision/", {
            "device_id": "test-device-003",
        }, format="json")
        audit = AuditEvent.objects.filter(
            action="DEVICE_PROVISIONED",
            entity_id="test-device-003",
        ).exists()
        self.assertTrue(audit)

    def test_provision_requires_device_id(self):
        resp = self.client.post("/api/v1/accounts/auth/device-provision/", {}, format="json")
        self.assertEqual(resp.status_code, 400)


class BatchSyncAPITests(TestCase):

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_batch_sync_empty_events(self):
        resp = self.client.post("/api/v1/sync/batch", {
            "deviceId": "test-device",
            "events": [],
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["acceptedEventIds"], [])
        self.assertEqual(data["rejectedEvents"], [])
        self.assertIn("nextServerCursor", data)

    def test_batch_sync_unknown_resource_rejected(self):
        resp = self.client.post("/api/v1/sync/batch", {
            "deviceId": "test-device",
            "events": [
                {"eventId": str(uuid.uuid4()), "resourceType": "UnknownType", "resource": {}},
            ],
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data["rejectedEvents"]), 1)
        self.assertEqual(data["rejectedEvents"][0]["code"], "VALIDATION_ERROR")

    def test_batch_sync_returns_server_changes_with_cursor(self):
        resp = self.client.post("/api/v1/sync/batch", {
            "deviceId": "test-device",
            "lastServerCursor": timezone.now().isoformat(),
            "events": [],
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("serverChanges", data)
        self.assertIn("nextServerCursor", data)

    def test_batch_sync_clinician_override_accepted(self):
        """ClinicianOverride resource type is accepted via batch sync (spec §10.2 #14)."""
        from apps.audit.models import AuditEvent
        episode_id = str(uuid.uuid4())
        resp = self.client.post("/api/v1/sync/batch", {
            "deviceId": "test-device",
            "events": [
                {
                    "eventId": str(uuid.uuid4()),
                    "resourceType": "ClinicianOverride",
                    "resource": {
                        "episode_type": "PregnancyEpisode",
                        "episode_id": episode_id,
                        "prior_recommendation": "PRIORITY_REVIEW",
                        "resulting_action": "CONFIRM",
                        "override_reason": "Patient stable on re-check",
                    },
                },
            ],
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data["acceptedEventIds"]), 1)
        self.assertEqual(len(data["rejectedEvents"]), 0)
        # Verify audit event was created
        audit = AuditEvent.objects.filter(
            action="CLINICIAN_OVERRIDE",
            entity_id=episode_id,
        ).first()
        self.assertIsNotNone(audit, "Audit event should be created for override")

    def test_batch_sync_clinician_override_emergency_deescalate_rejected(self):
        """Non-downgrade invariant enforced for synced overrides (spec §3.1)."""
        resp = self.client.post("/api/v1/sync/batch", {
            "deviceId": "test-device",
            "events": [
                {
                    "eventId": str(uuid.uuid4()),
                    "resourceType": "ClinicianOverride",
                    "resource": {
                        "episode_type": "PregnancyEpisode",
                        "episode_id": str(uuid.uuid4()),
                        "prior_recommendation": "EMERGENCY",
                        "resulting_action": "DEESCALATE",
                        "override_reason": "Rule fired in error",
                    },
                },
            ],
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data["rejectedEvents"]), 1)
        self.assertEqual(data["rejectedEvents"][0]["code"], "CONFLICT")
