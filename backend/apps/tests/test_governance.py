"""
Tests for clinician override, consent preferences, package management,
and aggregate dashboard endpoints (spec §3.1, §24, §26, §27).
"""
import uuid

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.enums import SystemRole, UrgencyLevel, Language
from apps.organisations.models import OrganisationUnit
from apps.accounts.models import UserAccount
from apps.clients.models import Person, Household
from apps.core.package_models import Package
from apps.audit.models import AuditEvent


def _make_org():
    return OrganisationUnit.objects.create(
        name="Test Facility", code="PKGTEST01", unit_type="FACILITY",
    )

def _make_user(org, role=SystemRole.SUPER_ADMIN, is_super=True):
    return UserAccount.objects.create_user(
        username="pkgtester", password="testpass123",
        organisation_unit=org, system_role=role, is_super_admin=is_super,
    )

def _make_patient(org):
    hh = Household.objects.create(organisation_unit=org)
    return Person.objects.create(
        full_name="Test Patient", household=hh, organisation_unit=org,
    )


class ClinicianOverrideTests(TestCase):

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.patient = _make_patient(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_confirm_override(self):
        resp = self.client.post("/api/v1/clinical/override/", {
            "episode_type": "PregnancyEpisode",
            "episode_id": str(uuid.uuid4()),
            "prior_recommendation": UrgencyLevel.PRIORITY,
            "resulting_action": "CONFIRM",
            "override_reason": "Agreed with system recommendation",
            "patient_id": str(self.patient.id),
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertTrue(data["audit_logged"])

    def test_escalate_override(self):
        resp = self.client.post("/api/v1/clinical/override/", {
            "episode_type": "PregnancyEpisode",
            "episode_id": str(uuid.uuid4()),
            "prior_recommendation": UrgencyLevel.ROUTINE,
            "resulting_action": "ESCALATE",
            "override_reason": "Patient reported additional symptoms",
            "new_urgency": UrgencyLevel.PRIORITY,
        }, format="json")
        self.assertEqual(resp.status_code, 201)

    def test_emergency_cannot_be_deescalated(self):
        resp = self.client.post("/api/v1/clinical/override/", {
            "episode_type": "PregnancyEpisode",
            "episode_id": str(uuid.uuid4()),
            "prior_recommendation": UrgencyLevel.EMERGENCY,
            "resulting_action": "DEESCALATE",
            "override_reason": "False alarm",
        }, format="json")
        self.assertEqual(resp.status_code, 409)

    def test_override_creates_audit_event(self):
        self.client.post("/api/v1/clinical/override/", {
            "episode_type": "NewbornEpisode",
            "episode_id": str(uuid.uuid4()),
            "prior_recommendation": UrgencyLevel.PRIORITY,
            "resulting_action": "CONFIRM",
            "override_reason": "Confirmed",
        }, format="json")
        audit = AuditEvent.objects.filter(action="CLINICIAN_OVERRIDE").exists()
        self.assertTrue(audit)

    def test_override_requires_reason(self):
        resp = self.client.post("/api/v1/clinical/override/", {
            "episode_type": "PregnancyEpisode",
            "episode_id": str(uuid.uuid4()),
            "prior_recommendation": UrgencyLevel.ROUTINE,
            "resulting_action": "CONFIRM",
        }, format="json")
        self.assertEqual(resp.status_code, 400)


class ConsentPreferencesTests(TestCase):

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.patient = _make_patient(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_get_consent_preferences(self):
        resp = self.client.get(f"/api/v1/clients/persons/{self.patient.id}/consent_preferences/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("preferred_language", data)
        self.assertIn("sensitive_content_consent", data)
        self.assertIn("communication_opt_out", data)

    def test_update_consent_preferences(self):
        resp = self.client.patch(f"/api/v1/clients/persons/{self.patient.id}/consent_preferences/", {
            "preferred_language": Language.DAGBANI,
            "communication_opt_out": True,
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["preferred_language"], Language.DAGBANI)
        self.assertTrue(data["communication_opt_out"])

    def test_consent_update_creates_audit(self):
        self.client.patch(f"/api/v1/clients/persons/{self.patient.id}/consent_preferences/", {
            "communication_opt_out": True,
        }, format="json")
        audit = AuditEvent.objects.filter(
            action="CONSENT_PREFERENCE_UPDATED",
            entity_id=str(self.patient.id),
        ).exists()
        self.assertTrue(audit)


class PackageManagementTests(TestCase):

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_activate_package(self):
        resp = self.client.post("/api/v1/packages/activate/", {
            "package_id": "rules-v1",
            "package_type": "CLINICAL_RULES",
            "version": "1.0.0",
            "sha256": "a" * 64,
            "signing_key_id": "key-001",
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data["status"], "ACTIVE")
        self.assertEqual(data["version"], "1.0.0")

    def test_activate_replaces_previous(self):
        # Activate v1
        self.client.post("/api/v1/packages/activate/", {
            "package_id": "rules-v1",
            "package_type": "CLINICAL_RULES",
            "version": "1.0.0",
            "sha256": "a" * 64,
        }, format="json")
        # Activate v2
        resp = self.client.post("/api/v1/packages/activate/", {
            "package_id": "rules-v2",
            "package_type": "CLINICAL_RULES",
            "version": "2.0.0",
            "sha256": "b" * 64,
        }, format="json")
        data = resp.json()
        self.assertEqual(data["status"], "ACTIVE")
        self.assertEqual(data["previous_version"], "1.0.0")

        # v1 should be retired
        v1 = Package.objects.get(version="1.0.0", package_type="CLINICAL_RULES")
        self.assertEqual(v1.status, "RETIRED")

    def test_rollback(self):
        # Activate v1 then v2
        self.client.post("/api/v1/packages/activate/", {
            "package_id": "rules-v1",
            "package_type": "CLINICAL_RULES",
            "version": "1.0.0",
            "sha256": "a" * 64,
        }, format="json")
        self.client.post("/api/v1/packages/activate/", {
            "package_id": "rules-v2",
            "package_type": "CLINICAL_RULES",
            "version": "2.0.0",
            "sha256": "b" * 64,
        }, format="json")
        # Rollback
        resp = self.client.post("/api/v1/packages/rollback/", {
            "package_type": "CLINICAL_RULES",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ACTIVE")
        self.assertEqual(data["version"], "1.0.0")

    def test_rollback_no_previous(self):
        # Activate only one version
        self.client.post("/api/v1/packages/activate/", {
            "package_id": "rules-v1",
            "package_type": "CLINICAL_RULES",
            "version": "1.0.0",
            "sha256": "a" * 64,
        }, format="json")
        resp = self.client.post("/api/v1/packages/rollback/", {
            "package_type": "CLINICAL_RULES",
        }, format="json")
        self.assertEqual(resp.status_code, 409)

    def test_get_active_package(self):
        self.client.post("/api/v1/packages/activate/", {
            "package_id": "rules-v1",
            "package_type": "CLINICAL_RULES",
            "version": "1.0.0",
            "sha256": "a" * 64,
        }, format="json")
        resp = self.client.get("/api/v1/packages/CLINICAL_RULES/active/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ACTIVE")

    def test_get_active_package_not_found(self):
        resp = self.client.get("/api/v1/packages/OCR_MODEL/active/")
        self.assertEqual(resp.status_code, 404)

    def test_list_packages(self):
        self.client.post("/api/v1/packages/activate/", {
            "package_id": "rules-v1",
            "package_type": "CLINICAL_RULES",
            "version": "1.0.0",
            "sha256": "a" * 64,
        }, format="json")
        resp = self.client.get("/api/v1/packages/")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(len(resp.json()) >= 1)

    def test_activation_creates_audit(self):
        self.client.post("/api/v1/packages/activate/", {
            "package_id": "rules-v1",
            "package_type": "CLINICAL_RULES",
            "version": "1.0.0",
            "sha256": "a" * 64,
        }, format="json")
        audit = AuditEvent.objects.filter(action="PACKAGE_ACTIVATED").exists()
        self.assertTrue(audit)

    def test_rollback_creates_audit(self):
        self.client.post("/api/v1/packages/activate/", {
            "package_id": "rules-v1",
            "package_type": "CLINICAL_RULES",
            "version": "1.0.0",
            "sha256": "a" * 64,
        }, format="json")
        self.client.post("/api/v1/packages/activate/", {
            "package_id": "rules-v2",
            "package_type": "CLINICAL_RULES",
            "version": "2.0.0",
            "sha256": "b" * 64,
        }, format="json")
        self.client.post("/api/v1/packages/rollback/", {
            "package_type": "CLINICAL_RULES",
        }, format="json")
        audit = AuditEvent.objects.filter(action="PACKAGE_ROLLBACK").exists()
        self.assertTrue(audit)


class AggregateDashboardTests(TestCase):

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_dashboard_returns_200(self):
        resp = self.client.get("/api/v1/dashboard/aggregate/")
        self.assertEqual(resp.status_code, 200)

    def test_dashboard_has_aggregate_sections(self):
        resp = self.client.get("/api/v1/dashboard/aggregate/")
        data = resp.json()
        self.assertIn("pregnancy", data)
        self.assertIn("newborn", data)
        self.assertIn("immunisation", data)
        self.assertIn("referrals", data)
        self.assertIn("notifications", data)
        self.assertIn("audit", data)
        self.assertIn("organisations", data)

    def test_dashboard_no_patient_identifiers(self):
        """Aggregate dashboard MUST NOT expose patient identifiers (spec §21.2)."""
        resp = self.client.get("/api/v1/dashboard/aggregate/")
        data = resp.json()
        # Check that no patient-identifying fields are present
        self.assertNotIn("patients", data)
        self.assertNotIn("patient_names", data)
        self.assertNotIn("patient_ids", data)
        # All values should be integers (counts)
        for section in ["pregnancy", "newborn", "immunisation", "referrals", "notifications"]:
            for key, val in data[section].items():
                self.assertIsInstance(val, int, f"{section}.{key} should be int, got {type(val)}")
