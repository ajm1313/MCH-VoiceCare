"""
Tests for the additional FHIR R4 resources: Organization, Location,
and QuestionnaireResponse (spec §8.3).
"""
import uuid

from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.organisations.models import OrganisationUnit, FacilityCapability
from apps.accounts.models import UserAccount
from apps.clients.models import Person, Household
from apps.pregnancy.models import PregnancyEpisode, PregnancyAssessment
from apps.core.enums import SystemRole, UrgencyLevel
from apps.fhir.serializers import (
    organisation_to_fhir,
    organisation_to_location,
    assessment_to_questionnaire_response,
)


def _make_user_and_client():
    org = OrganisationUnit.objects.create(
        name="Test Facility", code="FHIR_NEW_001", unit_type="FACILITY",
    )
    user = UserAccount.objects.create_user(
        username="fhinewtester", password="testpass123",
        organisation_unit=org, system_role=SystemRole.SUPER_ADMIN, is_super_admin=True,
    )
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client, org, user


def _make_org_hierarchy():
    region = OrganisationUnit.objects.create(
        name="Test Region", code="REG_NEW_001", unit_type="REGION",
    )
    district = OrganisationUnit.objects.create(
        name="Test District", code="DIST_NEW_001", unit_type="DISTRICT",
        parent=region,
    )
    facility = OrganisationUnit.objects.create(
        name="Test Clinic", code="FAC_NEW_001", unit_type="FACILITY",
        parent=district, latitude="9.400000", longitude="-0.850000",
    )
    return region, district, facility


# ── Serializer tests ──

class OrganizationSerializerTests(TestCase):
    """Test FHIR Organization serializer (spec §8.3)."""

    def test_organization_serializer_basic(self):
        org = OrganisationUnit.objects.create(
            name="Test Org", code="ORG001", unit_type="FACILITY",
        )
        result = organisation_to_fhir(org)
        self.assertEqual(result["resourceType"], "Organization")
        self.assertEqual(result["name"], "Test Org")
        self.assertEqual(result["identifier"][0]["value"], "ORG001")
        self.assertTrue(result["active"])

    def test_organization_serializer_with_parent(self):
        region, district, facility = _make_org_hierarchy()
        result = organisation_to_fhir(facility)
        self.assertEqual(result["resourceType"], "Organization")
        self.assertEqual(result["partOf"]["reference"], f"Organization/{district.id}")

    def test_organization_serializer_inactive(self):
        org = OrganisationUnit.objects.create(
            name="Closed Org", code="ORG002", unit_type="FACILITY", status="INACTIVE",
        )
        result = organisation_to_fhir(org)
        self.assertFalse(result["active"])


class LocationSerializerTests(TestCase):
    """Test FHIR Location serializer (spec §8.3)."""

    def test_location_serializer_basic(self):
        org = OrganisationUnit.objects.create(
            name="Test Location", code="LOC001", unit_type="FACILITY",
        )
        result = organisation_to_location(org)
        self.assertEqual(result["resourceType"], "Location")
        self.assertEqual(result["name"], "Test Location")
        self.assertEqual(result["status"], "active")
        self.assertEqual(result["managingOrganization"]["reference"], f"Organization/{org.id}")

    def test_location_serializer_with_coordinates(self):
        org = OrganisationUnit.objects.create(
            name="Geo Facility", code="LOC002", unit_type="FACILITY",
            latitude="9.400000", longitude="-0.850000",
        )
        result = organisation_to_location(org)
        self.assertEqual(result["position"]["latitude"], 9.4)
        self.assertEqual(result["position"]["longitude"], -0.85)

    def test_location_serializer_with_parent(self):
        region, district, facility = _make_org_hierarchy()
        result = organisation_to_location(facility)
        self.assertEqual(result["partOf"]["reference"], f"Location/{district.id}")

    def test_location_serializer_includes_path_address(self):
        region, district, facility = _make_org_hierarchy()
        result = organisation_to_location(facility)
        self.assertIn("address", result)
        self.assertIn("Test Region", result["address"]["text"])


class QuestionnaireResponseSerializerTests(TestCase):
    """Test FHIR QuestionnaireResponse serializer (spec §8.3)."""

    def test_questionnaire_response_from_assessment(self):
        org = OrganisationUnit.objects.create(
            name="Test Org", code="QR001", unit_type="FACILITY",
        )
        household = Household.objects.create(organisation_unit=org)
        person = Person.objects.create(
            full_name="Test Woman", organisation_unit=org,
            household=household, date_of_birth="1990-01-01", sex="F",
        )
        episode = PregnancyEpisode.objects.create(
            woman=person, lmp_date="2025-01-01",
        )
        assessment = PregnancyAssessment.objects.create(
            episode=episode,
            disposition=UrgencyLevel.EMERGENCY,
            fired_rules=[
                {"ruleId": "R001", "severity": "EMERGENCY", "reasonText": "Severe hypertension"},
            ],
            recommended_action="Refer to hospital immediately",
            rule_set_version="v1.0",
        )
        result = assessment_to_questionnaire_response(assessment)
        self.assertEqual(result["resourceType"], "QuestionnaireResponse")
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["subject"]["reference"], f"Patient/{person.id}")
        # Should have disposition item
        items = result["item"]
        link_ids = [i["linkId"] for i in items]
        self.assertIn("DISPOSITION", link_ids)
        self.assertIn("RECOMMENDED_ACTION", link_ids)
        self.assertIn("RULE_SET_VERSION", link_ids)
        self.assertIn("FIRED_RULES", link_ids)

    def test_questionnaire_response_empty_assessment(self):
        org = OrganisationUnit.objects.create(
            name="Test Org", code="QR002", unit_type="FACILITY",
        )
        household = Household.objects.create(organisation_unit=org)
        person = Person.objects.create(
            full_name="Test Woman 2", organisation_unit=org,
            household=household, date_of_birth="1990-01-01", sex="F",
        )
        episode = PregnancyEpisode.objects.create(
            woman=person, lmp_date="2025-01-01",
        )
        assessment = PregnancyAssessment.objects.create(
            episode=episode,
            disposition=UrgencyLevel.ROUTINE,
            fired_rules=[],
            recommended_action="",
            rule_set_version="v1.0",
        )
        result = assessment_to_questionnaire_response(assessment)
        self.assertEqual(result["resourceType"], "QuestionnaireResponse")
        # Should still have disposition and rule_set_version
        link_ids = [i["linkId"] for i in (result["item"] or [])]
        self.assertIn("DISPOSITION", link_ids)
        self.assertIn("RULE_SET_VERSION", link_ids)
        # No fired rules section
        self.assertNotIn("FIRED_RULES", link_ids)


# ── API endpoint tests ──

class FHIROrganizationAPITests(TestCase):
    """Test FHIR Organization API endpoints (spec §8.3, §20.1)."""

    def setUp(self):
        self.client, self.org, self.user = _make_user_and_client()

    def test_organization_list(self):
        resp = self.client.get("/fhir/R4/Organization")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "Bundle")
        self.assertEqual(data["type"], "searchset")
        self.assertGreaterEqual(len(data["entry"]), 1)

    def test_organization_list_filter_by_name(self):
        resp = self.client.get("/fhir/R4/Organization", {"name": "Test Facility"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data["entry"]), 1)
        self.assertEqual(data["entry"][0]["resource"]["name"], "Test Facility")

    def test_organization_detail(self):
        resp = self.client.get(f"/fhir/R4/Organization/{self.org.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "Organization")
        self.assertEqual(data["name"], "Test Facility")

    def test_organization_detail_not_found(self):
        fake_id = str(uuid.uuid4())
        resp = self.client.get(f"/fhir/R4/Organization/{fake_id}")
        self.assertEqual(resp.status_code, 404)

    def test_organization_detail_invalid_uuid(self):
        resp = self.client.get("/fhir/R4/Organization/not-a-uuid")
        self.assertEqual(resp.status_code, 400)


class FHIRLocationAPITests(TestCase):
    """Test FHIR Location API endpoints (spec §8.3, §20.1)."""

    def setUp(self):
        self.client, self.org, self.user = _make_user_and_client()

    def test_location_list(self):
        resp = self.client.get("/fhir/R4/Location")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "Bundle")
        self.assertGreaterEqual(len(data["entry"]), 1)

    def test_location_detail(self):
        resp = self.client.get(f"/fhir/R4/Location/{self.org.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "Location")
        self.assertEqual(data["name"], "Test Facility")

    def test_location_detail_not_found(self):
        fake_id = str(uuid.uuid4())
        resp = self.client.get(f"/fhir/R4/Location/{fake_id}")
        self.assertEqual(resp.status_code, 404)


class FHIRQuestionnaireResponseAPITests(TestCase):
    """Test FHIR QuestionnaireResponse API endpoints (spec §8.3, §20.1)."""

    def setUp(self):
        self.client, self.org, self.user = _make_user_and_client()
        household = Household.objects.create(organisation_unit=self.org)
        self.person = Person.objects.create(
            full_name="QR Test Woman", organisation_unit=self.org,
            household=household, date_of_birth="1990-01-01", sex="F",
        )
        episode = PregnancyEpisode.objects.create(
            woman=self.person, lmp_date="2025-01-01",
        )
        self.assessment = PregnancyAssessment.objects.create(
            episode=episode,
            disposition=UrgencyLevel.EMERGENCY,
            fired_rules=[
                {"ruleId": "R001", "severity": "EMERGENCY", "reasonText": "Severe hypertension"},
            ],
            recommended_action="Refer to hospital",
            rule_set_version="v1.0",
        )

    def test_questionnaire_response_list(self):
        resp = self.client.get("/fhir/R4/QuestionnaireResponse")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "Bundle")
        self.assertGreaterEqual(len(data["entry"]), 1)

    def test_questionnaire_response_list_filter_by_patient(self):
        resp = self.client.get("/fhir/R4/QuestionnaireResponse", {"patient": str(self.person.id)})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertGreaterEqual(len(data["entry"]), 1)
        self.assertEqual(data["entry"][0]["resource"]["subject"]["reference"], f"Patient/{self.person.id}")

    def test_questionnaire_response_detail(self):
        resp = self.client.get(f"/fhir/R4/QuestionnaireResponse/{self.assessment.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "QuestionnaireResponse")
        self.assertEqual(data["status"], "completed")

    def test_questionnaire_response_detail_not_found(self):
        fake_id = str(uuid.uuid4())
        resp = self.client.get(f"/fhir/R4/QuestionnaireResponse/{fake_id}")
        self.assertEqual(resp.status_code, 404)


class FHIRCapabilityStatementNewResourcesTests(TestCase):
    """Test that the CapabilityStatement includes the new resource types."""

    def setUp(self):
        self.client, self.org, self.user = _make_user_and_client()

    def test_capability_statement_includes_organization(self):
        resp = self.client.get("/fhir/R4/metadata")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        resource_types = [r["type"] for r in data["rest"][0]["resource"]]
        self.assertIn("Organization", resource_types)

    def test_capability_statement_includes_location(self):
        resp = self.client.get("/fhir/R4/metadata")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        resource_types = [r["type"] for r in data["rest"][0]["resource"]]
        self.assertIn("Location", resource_types)

    def test_capability_statement_includes_questionnaire_response(self):
        resp = self.client.get("/fhir/R4/metadata")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        resource_types = [r["type"] for r in data["rest"][0]["resource"]]
        self.assertIn("QuestionnaireResponse", resource_types)
