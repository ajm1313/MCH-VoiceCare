"""
Tests for capability re-verification queue, config update endpoint,
and monitoring/observability health endpoint (spec §27, §32, §33).
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.enums import SystemRole, MLMode, UrgencyLevel, ReferralStatus
from apps.organisations.models import OrganisationUnit, FacilityCapability
from apps.accounts.models import UserAccount
from apps.clients.models import Person, Household
from apps.referrals.models import Referral
from apps.notifications.models import Notification
from apps.core.config_models import SystemConfig
from apps.audit.models import AuditEvent


def _make_org(name="Monitor Test Org", code="MONTEST01"):
    return OrganisationUnit.objects.create(name=name, code=code, unit_type="FACILITY")


def _make_user(org, role=SystemRole.SUPER_ADMIN, username="monuser", is_super=True):
    return UserAccount.objects.create_user(
        username=username, password="testpass123",
        organisation_unit=org, system_role=role, is_super_admin=is_super,
    )


class CapabilityReverificationTests(TestCase):
    """Test expired capabilities queue and re-verification (spec §32)."""

    def setUp(self):
        self.org = _make_org()
        self.admin = _make_user(self.org, username="capadmin", role=SystemRole.DISTRICT_ADMIN, is_super=False)
        self.readonly = _make_user(self.org, role=SystemRole.READ_ONLY, username="capreadonly", is_super=False)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.admin)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_expired_capabilities_list(self):
        FacilityCapability.objects.create(
            facility=self.org,
            verified_at=timezone.now() - timedelta(days=400),
            verification_expires_at=timezone.now() - timedelta(days=35),
        )
        resp = self.client.get("/api/v1/organisations/units/expired_capabilities/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["total"], 1)
        self.assertEqual(data["expired"][0]["facility_name"], "Monitor Test Org")
        self.assertTrue(data["expired"][0]["days_expired"] > 0)

    def test_expired_capabilities_empty(self):
        FacilityCapability.objects.create(
            facility=self.org,
            verified_at=timezone.now(),
            verification_expires_at=timezone.now() + timedelta(days=90),
        )
        resp = self.client.get("/api/v1/organisations/units/expired_capabilities/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["total"], 0)

    def test_reverify_capabilities(self):
        FacilityCapability.objects.create(
            facility=self.org,
            verified_at=timezone.now() - timedelta(days=400),
            verification_expires_at=timezone.now() - timedelta(days=35),
        )
        resp = self.client.post(
            f"/api/v1/organisations/units/{self.org.id}/reverify_capabilities/",
            {"expiry_months": 3}, format="json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["reverified"])
        cap = FacilityCapability.objects.get(facility=self.org)
        self.assertIsNotNone(cap.verified_at)
        self.assertTrue(cap.verification_expires_at > timezone.now())

    def test_reverify_creates_audit(self):
        FacilityCapability.objects.create(
            facility=self.org,
            verified_at=timezone.now() - timedelta(days=400),
            verification_expires_at=timezone.now() - timedelta(days=35),
        )
        self.client.post(
            f"/api/v1/organisations/units/{self.org.id}/reverify_capabilities/",
            {"expiry_months": 3}, format="json",
        )
        self.assertTrue(
            AuditEvent.objects.filter(action="CAPABILITY_REVERIFIED").exists()
        )

    def test_reverify_no_capability_record(self):
        resp = self.client.post(
            f"/api/v1/organisations/units/{self.org.id}/reverify_capabilities/",
            {"expiry_months": 3}, format="json",
        )
        self.assertEqual(resp.status_code, 404)

    def test_readonly_cannot_reverify(self):
        FacilityCapability.objects.create(
            facility=self.org,
            verified_at=timezone.now() - timedelta(days=400),
            verification_expires_at=timezone.now() - timedelta(days=35),
        )
        client = APIClient()
        refresh = RefreshToken.for_user(self.readonly)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        resp = client.post(
            f"/api/v1/organisations/units/{self.org.id}/reverify_capabilities/",
            {"expiry_months": 3}, format="json",
        )
        self.assertEqual(resp.status_code, 403)


class ConfigUpdateTests(TestCase):
    """Test PATCH /api/v1/config/ for admin config changes (spec §33)."""

    def setUp(self):
        self.org = _make_org()
        self.admin = _make_user(self.org, username="configadmin", role=SystemRole.DISTRICT_ADMIN, is_super=False)
        self.readonly = _make_user(self.org, role=SystemRole.READ_ONLY, username="configreadonly", is_super=False)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.admin)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_update_sync_batch_size(self):
        resp = self.client.patch("/api/v1/config/", {
            "sync_batch_size": 200,
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["updated"])
        self.assertIn("sync_batch_size", data["changed_fields"])
        config = SystemConfig.get_config()
        self.assertEqual(config.sync_batch_size, 200)

    def test_update_creates_audit(self):
        self.client.patch("/api/v1/config/", {
            "referral_ack_timeout_minutes": 45,
        }, format="json")
        self.assertTrue(
            AuditEvent.objects.filter(action="CONFIG_UPDATED").exists()
        )

    def test_update_feature_flag(self):
        resp = self.client.patch("/api/v1/config/", {
            "ocr_enabled": False,
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        config = SystemConfig.get_config()
        self.assertFalse(config.ocr_enabled)

    def test_speech_capture_cannot_be_enabled(self):
        resp = self.client.patch("/api/v1/config/", {
            "speech_capture_enabled": True,
        }, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("speech_capture_enabled", resp.json()["detail"])

    def test_no_fields_provided(self):
        resp = self.client.patch("/api/v1/config/", {}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_invalid_integer_value(self):
        resp = self.client.patch("/api/v1/config/", {
            "sync_batch_size": "not-a-number",
        }, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_readonly_cannot_update_config(self):
        client = APIClient()
        refresh = RefreshToken.for_user(self.readonly)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        resp = client.patch("/api/v1/config/", {
            "sync_batch_size": 200,
        }, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_update_ml_mode(self):
        resp = self.client.patch("/api/v1/config/", {
            "clinical_ml_mode": MLMode.SILENT,
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        config = SystemConfig.get_config()
        self.assertEqual(config.clinical_ml_mode, MLMode.SILENT)
        # Reset for other tests
        config.clinical_ml_mode = MLMode.RULES_ONLY
        config.save()


class MonitoringHealthTests(TestCase):
    """Test GET /api/v1/monitoring/health/ (spec §27)."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org, username="monhealth")
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_health_returns_200(self):
        resp = self.client.get("/api/v1/monitoring/health/")
        self.assertEqual(resp.status_code, 200)

    def test_health_has_technical_section(self):
        resp = self.client.get("/api/v1/monitoring/health/")
        data = resp.json()
        self.assertIn("technical", data)
        self.assertIn("sync_success_24h", data["technical"])
        self.assertIn("active_packages", data["technical"])
        self.assertIn("expired_capability_verifications", data["technical"])

    def test_health_has_clinical_safety_section(self):
        resp = self.client.get("/api/v1/monitoring/health/")
        data = resp.json()
        self.assertIn("clinical_safety", data)
        self.assertIn("emergency_alerts_24h", data["clinical_safety"])
        self.assertIn("open_referrals", data["clinical_safety"])
        self.assertIn("clinician_overrides_7d", data["clinical_safety"])

    def test_health_has_system_section(self):
        resp = self.client.get("/api/v1/monitoring/health/")
        data = resp.json()
        self.assertIn("system", data)
        self.assertIn("clinical_ml_mode", data["system"])
        self.assertTrue(data["system"]["rules_only"])

    def test_health_counts_emergency_alerts(self):
        Notification.objects.create(
            title="Emergency", urgency=UrgencyLevel.EMERGENCY,
        )
        resp = self.client.get("/api/v1/monitoring/health/")
        data = resp.json()
        self.assertTrue(data["clinical_safety"]["emergency_alerts_24h"] >= 1)

    def test_health_counts_expired_capabilities(self):
        FacilityCapability.objects.create(
            facility=self.org,
            verified_at=timezone.now() - timedelta(days=400),
            verification_expires_at=timezone.now() - timedelta(days=35),
        )
        resp = self.client.get("/api/v1/monitoring/health/")
        data = resp.json()
        self.assertTrue(data["technical"]["expired_capability_verifications"] >= 1)

    def test_health_no_patient_identifiers(self):
        resp = self.client.get("/api/v1/monitoring/health/")
        data = resp.json()
        # All values should be integers or simple strings, no patient data
        for section in ["technical", "clinical_safety", "system"]:
            for key, val in data[section].items():
                self.assertNotIn("patient", key.lower())
                self.assertNotIn("name", key.lower())
