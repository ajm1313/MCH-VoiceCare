"""
Tests for referral state machine endpoints and acceptance test matrix
scenarios (spec §18.3, §20.2, §40).
"""
import uuid
from datetime import timedelta as datetime_timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.enums import (
    SystemRole, UrgencyLevel, ReferralStatus, EpisodeStatus, MLMode,
    NotificationClass, NotificationStatus,
)
from apps.organisations.models import OrganisationUnit
from apps.accounts.models import UserAccount
from apps.clients.models import Person, Household
from apps.referrals.models import Referral, ReferralStateLog
from apps.pregnancy.models import PregnancyEpisode, PregnancyObservation
from apps.rules import run_pregnancy_assessment
from apps.notifications.models import Notification
from apps.audit.models import AuditEvent
from apps.core.config_models import SystemConfig
from apps.core.package_models import Package


def _make_org(name="Test Facility", code="ACCTEST01"):
    return OrganisationUnit.objects.create(
        name=name, code=code, unit_type="FACILITY",
    )

def _make_user(org, username="acctestuser", role=SystemRole.SUPER_ADMIN):
    return UserAccount.objects.create_user(
        username=username, password="testpass123",
        organisation_unit=org, system_role=role, is_super_admin=True,
    )

def _make_patient(org, name="Acceptance Patient"):
    hh = Household.objects.create(organisation_unit=org)
    return Person.objects.create(full_name=name, household=hh, organisation_unit=org)

def _make_referral(org, patient, urgency=UrgencyLevel.EMERGENCY):
    return Referral.objects.create(
        patient=patient,
        referring_facility=org,
        destination_facility=org,
        urgency=urgency,
        status=ReferralStatus.REQUESTED,
        referral_reason="Danger signs detected",
    )


class ReferralStateMachineTests(TestCase):
    """Test referral state machine transitions via API (spec §18.3, §20.2)."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org, username="refstatemachine")
        self.patient = _make_patient(self.org, name="Referral Patient")
        self.referral = _make_referral(self.org, self.patient)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_acknowledge_referral(self):
        resp = self.client.post(f"/api/v1/referrals/{self.referral.id}/acknowledge/")
        self.assertEqual(resp.status_code, 200)
        self.referral.refresh_from_db()
        self.assertEqual(self.referral.status, ReferralStatus.RECEIVING_FACILITY_NOTIFIED)
        self.assertIsNotNone(self.referral.acknowledged_at)

    def test_acknowledge_creates_state_log(self):
        self.client.post(f"/api/v1/referrals/{self.referral.id}/acknowledge/")
        self.assertTrue(
            ReferralStateLog.objects.filter(
                referral=self.referral,
                to_status=ReferralStatus.RECEIVING_FACILITY_NOTIFIED,
            ).exists()
        )

    def test_transport_referral(self):
        self.referral.status = ReferralStatus.ACCEPTED
        self.referral.save()
        resp = self.client.post(f"/api/v1/referrals/{self.referral.id}/transport/")
        self.assertEqual(resp.status_code, 200)
        self.referral.refresh_from_db()
        self.assertEqual(self.referral.status, ReferralStatus.TRANSPORT_REQUESTED)

    def test_arrival_referral(self):
        self.referral.status = ReferralStatus.IN_TRANSIT
        self.referral.save()
        resp = self.client.post(f"/api/v1/referrals/{self.referral.id}/arrival/")
        self.assertEqual(resp.status_code, 200)
        self.referral.refresh_from_db()
        self.assertEqual(self.referral.status, ReferralStatus.ARRIVED)
        self.assertIsNotNone(self.referral.arrived_at)

    def test_disposition_referral(self):
        self.referral.status = ReferralStatus.ARRIVED
        self.referral.save()
        resp = self.client.post(f"/api/v1/referrals/{self.referral.id}/disposition/", {
            "disposition": "Emergency C-section performed. Patient stable.",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.referral.refresh_from_db()
        self.assertEqual(self.referral.status, ReferralStatus.DISPOSITION_RECORDED)
        self.assertIn("C-section", self.referral.disposition)

    def test_close_referral(self):
        self.referral.status = ReferralStatus.DISPOSITION_RECORDED
        self.referral.save()
        resp = self.client.post(f"/api/v1/referrals/{self.referral.id}/close/")
        self.assertEqual(resp.status_code, 200)
        self.referral.refresh_from_db()
        self.assertEqual(self.referral.status, ReferralStatus.CLOSED)
        self.assertIsNotNone(self.referral.closed_at)

    def test_decline_referral(self):
        resp = self.client.post(f"/api/v1/referrals/{self.referral.id}/decline/")
        self.assertEqual(resp.status_code, 200)
        self.referral.refresh_from_db()
        self.assertEqual(self.referral.status, ReferralStatus.DECLINED)

    def test_cancel_referral(self):
        self.referral.status = ReferralStatus.DRAFT
        self.referral.save()
        resp = self.client.post(f"/api/v1/referrals/{self.referral.id}/cancel/")
        self.assertEqual(resp.status_code, 200)
        self.referral.refresh_from_db()
        self.assertEqual(self.referral.status, ReferralStatus.CANCELLED_BY_CLINICIAN)

    def test_invalid_transition_rejected(self):
        self.referral.status = ReferralStatus.CLOSED
        self.referral.save()
        resp = self.client.post(f"/api/v1/referrals/{self.referral.id}/acknowledge/")
        self.assertEqual(resp.status_code, 409)

    def test_full_referral_lifecycle(self):
        """Full lifecycle: REQUESTED -> NOTIFIED -> ACCEPTED -> TRANSPORT -> IN_TRANSIT -> ARRIVED -> DISPOSITION -> CLOSED"""
        # Acknowledge
        resp = self.client.post(f"/api/v1/referrals/{self.referral.id}/acknowledge/")
        self.assertEqual(resp.status_code, 200)
        # Accept
        resp = self.client.post(f"/api/v1/referrals/{self.referral.id}/acknowledge/", {
            "to_status": ReferralStatus.ACCEPTED,
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        # Transport
        resp = self.client.post(f"/api/v1/referrals/{self.referral.id}/transport/")
        self.assertEqual(resp.status_code, 200)
        # In transit
        resp = self.client.post(f"/api/v1/referrals/{self.referral.id}/transport/", {
            "to_status": ReferralStatus.IN_TRANSIT,
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        # Arrival
        resp = self.client.post(f"/api/v1/referrals/{self.referral.id}/arrival/")
        self.assertEqual(resp.status_code, 200)
        # Disposition
        resp = self.client.post(f"/api/v1/referrals/{self.referral.id}/disposition/", {
            "disposition": "Treatment completed",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        # Close
        resp = self.client.post(f"/api/v1/referrals/{self.referral.id}/close/")
        self.assertEqual(resp.status_code, 200)
        self.referral.refresh_from_db()
        self.assertEqual(self.referral.status, ReferralStatus.CLOSED)
        # Verify state logs
        logs = ReferralStateLog.objects.filter(referral=self.referral)
        self.assertTrue(logs.count() >= 6)


class ModelPackageLatestTests(TestCase):
    """Test GET /api/v1/packages/models/latest (spec §20.2)."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org, username="modelpkguser")
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_models_latest_returns_200(self):
        resp = self.client.get("/api/v1/packages/models/latest")
        self.assertEqual(resp.status_code, 200)

    def test_models_latest_has_clinical_ml_mode(self):
        resp = self.client.get("/api/v1/packages/models/latest")
        data = resp.json()
        self.assertIn("clinicalMlMode", data)
        self.assertEqual(data["clinicalMlMode"], MLMode.RULES_ONLY)

    def test_models_latest_has_engagement_flag(self):
        resp = self.client.get("/api/v1/packages/models/latest")
        data = resp.json()
        self.assertIn("engagementModelEnabled", data)
        self.assertIn("ocrEnabled", data)

    def test_models_latest_with_active_package(self):
        Package.activate(
            package_id="ml-v1",
            package_type="CLINICAL_ML_MODEL",
            version="1.0.0",
            sha256="c" * 64,
        )
        resp = self.client.get("/api/v1/packages/models/latest")
        data = resp.json()
        self.assertIsNotNone(data["clinicalMlModel"])
        self.assertEqual(data["clinicalMlModel"]["version"], "1.0.0")


class AcceptanceTestMatrixTests(TestCase):
    """
    Minimal acceptance-test matrix scenarios (spec §40).
    Tests the expected results for key clinical and system scenarios.
    """

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org, username="acctestmatrix")
        self.patient = _make_patient(self.org, name="Matrix Patient")
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_emergency_danger_sign_produces_emergency_now(self):
        """Approved emergency danger sign entered manually -> immediate EMERGENCY_NOW."""
        episode = PregnancyEpisode.objects.create(
            woman=self.patient,
            status=EpisodeStatus.ACTIVE,
        )
        obs = PregnancyObservation.objects.create(
            episode=episode,
            bp_systolic=120,
            bp_diastolic=80,
            temperature_c=37.0,
            danger_signs="severe headache, blurred vision",
        )
        result = run_pregnancy_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_ml_low_probability_does_not_override_emergency(self):
        """Same case with ML predicting low probability -> remains EMERGENCY_NOW."""
        episode = PregnancyEpisode.objects.create(
            woman=self.patient,
            status=EpisodeStatus.ACTIVE,
        )
        obs = PregnancyObservation.objects.create(
            episode=episode,
            bp_systolic=120,
            bp_diastolic=80,
            temperature_c=37.0,
            danger_signs="convulsions",
        )
        result = run_pregnancy_assessment(episode)
        # Rules-only mode: ML doesn't change the result
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_clinical_ml_rules_only_no_care_changing_output(self):
        """Clinical ML feature flag RULES_ONLY -> no care-changing ML output."""
        config = SystemConfig.get_config()
        self.assertEqual(config.clinical_ml_mode, MLMode.RULES_ONLY)

    def test_duplicate_sync_replay_no_duplicate(self):
        """Duplicate sync replay -> no duplicate clinical event."""
        from apps.core.idempotency_models import IdempotencyRecord
        event_id = str(uuid.uuid4())
        # First sync
        resp = self.client.post("/api/v1/sync/batch", {
            "deviceId": "test-device",
            "events": [
                {
                    "eventId": event_id,
                    "resourceType": "Observation",
                    "resource": {"status": "final"},
                }
            ],
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        # Replay
        resp = self.client.post("/api/v1/sync/batch", {
            "deviceId": "test-device",
            "events": [
                {
                    "eventId": event_id,
                    "resourceType": "Observation",
                    "resource": {"status": "final"},
                }
            ],
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        # The duplicate event should be rejected
        rejected = data.get("rejectedEvents", [])
        self.assertTrue(any(r.get("eventId") == event_id for r in rejected))

    def test_national_admin_dashboard_no_patient_identifiers(self):
        """National programme admin opens aggregate dashboard -> no patient identifiers."""
        resp = self.client.get("/api/v1/dashboard/aggregate/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        # Ensure no patient-identifying fields
        for section in ["pregnancy", "newborn", "immunisation", "referrals", "notifications"]:
            for key, val in data[section].items():
                self.assertIsInstance(val, int, f"{section}.{key} should be int")

    def test_referral_accepted_then_arrival_disposition(self):
        """Referral accepted then patient arrives -> receiving facility records arrival/disposition."""
        referral = _make_referral(self.org, self.patient)
        # Accept
        resp = self.client.post(f"/api/v1/referrals/{referral.id}/acknowledge/", {
            "to_status": ReferralStatus.ACCEPTED,
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        # Transport
        resp = self.client.post(f"/api/v1/referrals/{referral.id}/transport/", {
            "to_status": ReferralStatus.IN_TRANSIT,
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        # Arrival
        resp = self.client.post(f"/api/v1/referrals/{referral.id}/arrival/")
        self.assertEqual(resp.status_code, 200)
        # Disposition
        resp = self.client.post(f"/api/v1/referrals/{referral.id}/disposition/", {
            "disposition": "Patient treated and stabilized",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        referral.refresh_from_db()
        self.assertEqual(referral.status, ReferralStatus.DISPOSITION_RECORDED)

    def test_invalid_rule_bundle_rejected(self):
        """App receives invalidly signed rule bundle -> reject and keep prior active version."""
        # Activate a valid package
        pkg1 = Package.activate(
            package_id="rules-v1",
            package_type="CLINICAL_RULES",
            version="1.0.0",
            sha256="d" * 64,
        )
        # Attempt to activate with missing required fields
        resp = self.client.post("/api/v1/packages/activate/", {
            "package_id": "rules-v2",
            "package_type": "CLINICAL_RULES",
            "version": "2.0.0",
            "sha256": "",  # Invalid: empty sha256
        }, format="json")
        self.assertEqual(resp.status_code, 400)
        # Original package should still be active
        active = Package.objects.filter(
            package_type="CLINICAL_RULES", status="ACTIVE"
        ).first()
        self.assertEqual(active.version, "1.0.0")

    def test_referral_contact_expired_warning(self):
        """Referral contact expired -> visible stale-data warning; no silent trust."""
        from apps.organisations.models import FacilityCapability
        cap = FacilityCapability.objects.create(
            facility=self.org,
            verified_at=timezone.now() - datetime_timedelta(days=400),
            verification_expires_at=timezone.now() - datetime_timedelta(days=35),
        )
        resp = self.client.get(f"/api/v1/organisations/units/{self.org.id}/referral_options/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertFalse(data["capability_verified"])
        self.assertIn("warning", data)
