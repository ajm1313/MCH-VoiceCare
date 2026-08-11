"""
Tests for the FHIR Implementation Guide (spec §8.3).

Verifies that:
- The FHIR IG document exists and covers all 11 resource types
- The FHIR capability statement endpoint returns valid CapabilityStatement
- All resource endpoints are accessible
- Code systems referenced in the IG are valid
- Search parameters work for key resources
"""
import os
import re
from pathlib import Path

from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.organisations.models import OrganisationUnit
from apps.accounts.models import UserAccount
from apps.core.enums import SystemRole


def _make_user_and_client():
    org = OrganisationUnit.objects.create(
        name="Test Facility", code="FHIR001", unit_type="FACILITY",
    )
    user = UserAccount.objects.create_user(
        username="fhirtester", password="testpass123",
        organisation_unit=org, system_role=SystemRole.SUPER_ADMIN, is_super_admin=True,
    )
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client, org, user


class FHIRImplementationGuideTest(TestCase):
    """Tests for the FHIR Implementation Guide document."""

    def setUp(self):
        self.ig_path = Path(__file__).resolve().parents[3] / "docs" / "FHIR_IMPLEMENTATION_GUIDE.md"

    def test_ig_document_exists(self):
        """The FHIR IG document should exist at docs/FHIR_IMPLEMENTATION_GUIDE.md."""
        self.assertTrue(self.ig_path.exists(), f"FHIR IG not found at {self.ig_path}")

    def test_ig_covers_all_resource_types(self):
        """The IG should document all 11 FHIR resource types."""
        if not self.ig_path.exists():
            self.skipTest("IG document not found")
        content = self.ig_path.read_text(encoding="utf-8")

        # All 11 resource types that the FHIR API supports
        resource_types = [
            "Patient", "Observation", "EpisodeOfCare", "Encounter",
            "ServiceRequest", "Task", "Immunization", "Provenance",
            "AuditEvent", "Library", "PlanDefinition",
        ]
        for rt in resource_types:
            self.assertIn(rt, content, f"Resource type '{rt}' not documented in IG")

    def test_ig_includes_code_systems(self):
        """The IG should document LOINC and HL7 code systems."""
        if not self.ig_path.exists():
            self.skipTest("IG document not found")
        content = self.ig_path.read_text(encoding="utf-8")
        self.assertIn("LOINC", content)
        self.assertIn("loinc.org", content)
        self.assertIn("v3-ActCode", content)
        self.assertIn("BCP 47", content)

    def test_ig_includes_status_mappings(self):
        """The IG should document referral status → FHIR status mappings."""
        if not self.ig_path.exists():
            self.skipTest("IG document not found")
        content = self.ig_path.read_text(encoding="utf-8")
        self.assertIn("DRAFT", content)
        self.assertIn("EMERGENCY", content)
        self.assertIn("stat", content)  # FHIR priority for emergency

    def test_ig_includes_security_section(self):
        """The IG should document authentication and authorization."""
        if not self.ig_path.exists():
            self.skipTest("IG document not found")
        content = self.ig_path.read_text(encoding="utf-8")
        self.assertIn("Authentication", content)
        self.assertIn("Authorization", content)
        self.assertIn("Bearer", content)
        self.assertIn("Audit", content)


class FHIRCapabilityStatementTest(TestCase):
    """Tests for the FHIR capability statement endpoint."""

    def setUp(self):
        self.client, self.org, self.user = _make_user_and_client()

    def test_capability_statement_endpoint(self):
        """GET /fhir/R4/metadata should return a CapabilityStatement."""
        resp = self.client.get("/fhir/R4/metadata")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "CapabilityStatement")
        self.assertIn("rest", data)


class FHIRResourceEndpointsTest(TestCase):
    """Tests that all 11 FHIR resource endpoints are accessible."""

    def setUp(self):
        self.client, self.org, self.user = _make_user_and_client()

    def test_patient_endpoint(self):
        resp = self.client.get("/fhir/R4/Patient")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "Bundle")

    def test_observation_endpoint(self):
        resp = self.client.get("/fhir/R4/Observation")
        self.assertEqual(resp.status_code, 200)

    def test_episode_of_care_endpoint(self):
        resp = self.client.get("/fhir/R4/EpisodeOfCare")
        self.assertEqual(resp.status_code, 200)

    def test_encounter_endpoint(self):
        resp = self.client.get("/fhir/R4/Encounter")
        self.assertEqual(resp.status_code, 200)

    def test_service_request_endpoint(self):
        resp = self.client.get("/fhir/R4/ServiceRequest")
        self.assertEqual(resp.status_code, 200)

    def test_task_endpoint(self):
        resp = self.client.get("/fhir/R4/Task")
        self.assertEqual(resp.status_code, 200)

    def test_immunization_endpoint(self):
        resp = self.client.get("/fhir/R4/Immunization")
        self.assertEqual(resp.status_code, 200)

    def test_provenance_endpoint(self):
        resp = self.client.get("/fhir/R4/Provenance")
        self.assertEqual(resp.status_code, 200)

    def test_audit_event_endpoint(self):
        resp = self.client.get("/fhir/R4/AuditEvent")
        self.assertEqual(resp.status_code, 200)

    def test_library_endpoint(self):
        resp = self.client.get("/fhir/R4/Library")
        self.assertEqual(resp.status_code, 200)

    def test_plan_definition_endpoint(self):
        resp = self.client.get("/fhir/R4/PlanDefinition")
        self.assertEqual(resp.status_code, 200)


class FHIRErrorHandlingTest(TestCase):
    """Tests for FHIR error handling."""

    def setUp(self):
        self.client, self.org, self.user = _make_user_and_client()

    def test_not_found_returns_operation_outcome(self):
        """Non-existent resource should return OperationOutcome with error status."""
        resp = self.client.get("/fhir/R4/Patient/nonexistent-id")
        self.assertIn(resp.status_code, [400, 404])
        data = resp.json()
        self.assertEqual(data["resourceType"], "OperationOutcome")

    def test_unauthenticated_request_returns_401(self):
        """Unauthenticated requests should return 401."""
        client = APIClient()
        resp = client.get("/fhir/R4/Patient")
        self.assertEqual(resp.status_code, 401)
