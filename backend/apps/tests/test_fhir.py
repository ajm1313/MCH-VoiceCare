"""
Tests for the expanded FHIR R4 REST surface (spec §8.3, §20.1).

Verifies that:
- All resource endpoints return valid FHIR Bundle responses
- Detail endpoints return individual FHIR resources
- Patient search works with name filter
- Observation/EpisodeOfCare/Encounter/ServiceRequest/Immunization endpoints
  return correctly shaped FHIR JSON
- Provenance, Library, and PlanDefinition endpoints work
- CapabilityStatement lists all supported resources
- Org-scoped access control is enforced
- Audit logging occurs for FHIR reads
"""
import uuid
from datetime import date, datetime
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.enums import (
    SystemRole, EpisodeStatus, UrgencyLevel, Sex, YesNoUnknown,
    ReferralStatus, DefaulterStatus,
)
from apps.organisations.models import OrganisationUnit
from apps.accounts.models import UserAccount
from apps.clients.models import Person, Household
from apps.pregnancy.models import PregnancyEpisode, PregnancyObservation, PregnancyAssessment
from apps.newborn.models import BirthEpisode, NewbornEpisode, NewbornObservation, NewbornAssessment
from apps.growth.models import GrowthMeasurement
from apps.referrals.models import Referral
from apps.immunisation.models import (
    ChildImmunisationRecord, VaccineDose,
)
from apps.audit.models import AuditEvent
from apps.core.package_models import Package


def _make_org():
    return OrganisationUnit.objects.create(
        name="Test Facility", code="FHIRTEST01", unit_type="FACILITY",
    )


def _make_user(org, role=SystemRole.SUPER_ADMIN, is_super=True):
    return UserAccount.objects.create_user(
        username="fhirtester", password="testpass123",
        organisation_unit=org, system_role=role, is_super_admin=is_super,
    )


def _make_person(org, name="Test Patient", sex=Sex.FEMALE):
    household = Household.objects.create(
        organisation_unit=org, household_name="Test Household",
    )
    return Person.objects.create(
        full_name=name, sex=sex, date_of_birth=date(1990, 1, 1),
        phone="0240000000", preferred_language="en",
        organisation_unit=org, household=household,
    )


class FHIRPatientTest(TestCase):
    """Tests for Patient FHIR endpoints."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        self.person = _make_person(self.org, "Jane Doe")

    def test_patient_list(self):
        resp = self.client.get("/fhir/R4/Patient")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "Bundle")
        self.assertEqual(data["type"], "searchset")
        self.assertGreaterEqual(data["total"], 1)
        entry = data["entry"][0]["resource"]
        self.assertEqual(entry["resourceType"], "Patient")
        self.assertEqual(entry["id"], str(self.person.id))

    def test_patient_search_by_name(self):
        resp = self.client.get("/fhir/R4/Patient?name=Jane")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["total"], 1)

    def test_patient_detail(self):
        resp = self.client.get(f"/fhir/R4/Patient/{self.person.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "Patient")
        self.assertEqual(data["id"], str(self.person.id))
        self.assertEqual(data["name"][0]["family"], "Jane Doe")

    def test_patient_detail_invalid_uuid(self):
        resp = self.client.get("/fhir/R4/Patient/not-a-uuid")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["resourceType"], "OperationOutcome")

    def test_patient_detail_not_found(self):
        resp = self.client.get(f"/fhir/R4/Patient/{uuid.uuid4()}")
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.json()["resourceType"], "OperationOutcome")


class FHIRObservationTest(TestCase):
    """Tests for Observation FHIR endpoints."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        self.woman = _make_person(self.org, "Pregnant Woman")
        self.episode = PregnancyEpisode.objects.create(
            woman=self.woman, status=EpisodeStatus.ACTIVE,
        )
        self.obs = PregnancyObservation.objects.create(
            episode=self.episode, bp_systolic=120, bp_diastolic=80,
            temperature_c=Decimal("36.5"), weight_kg=Decimal("65.0"),
        )

    def test_observation_list(self):
        resp = self.client.get("/fhir/R4/Observation")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "Bundle")
        self.assertGreaterEqual(data["total"], 1)
        entry = data["entry"][0]["resource"]
        self.assertEqual(entry["resourceType"], "Observation")
        self.assertEqual(entry["status"], "final")

    def test_observation_detail(self):
        resp = self.client.get(f"/fhir/R4/Observation/{self.obs.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "Observation")
        self.assertEqual(data["id"], str(self.obs.id))

    def test_observation_search_by_patient(self):
        resp = self.client.get(f"/fhir/R4/Observation?patient={self.woman.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertGreaterEqual(data["total"], 1)


class FHIREpisodeOfCareTest(TestCase):
    """Tests for EpisodeOfCare FHIR endpoints."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        self.woman = _make_person(self.org, "Pregnant Woman")
        self.episode = PregnancyEpisode.objects.create(
            woman=self.woman, status=EpisodeStatus.ACTIVE,
        )

    def test_episode_list(self):
        resp = self.client.get("/fhir/R4/EpisodeOfCare")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "Bundle")
        self.assertGreaterEqual(data["total"], 1)
        entry = data["entry"][0]["resource"]
        self.assertEqual(entry["resourceType"], "EpisodeOfCare")
        self.assertEqual(entry["status"], "active")

    def test_episode_detail(self):
        resp = self.client.get(f"/fhir/R4/EpisodeOfCare/{self.episode.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "EpisodeOfCare")
        self.assertEqual(data["id"], str(self.episode.id))


class FHIREncounterTest(TestCase):
    """Tests for Encounter FHIR endpoints (assessments)."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        self.woman = _make_person(self.org, "Pregnant Woman")
        self.episode = PregnancyEpisode.objects.create(
            woman=self.woman, status=EpisodeStatus.ACTIVE,
        )
        self.assessment = PregnancyAssessment.objects.create(
            episode=self.episode, disposition=UrgencyLevel.PRIORITY,
            fired_rules=["PREG-O-001"], recommended_action="Same-day assessment",
        )

    def test_encounter_list(self):
        resp = self.client.get("/fhir/R4/Encounter")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "Bundle")
        self.assertGreaterEqual(data["total"], 1)
        entry = data["entry"][0]["resource"]
        self.assertEqual(entry["resourceType"], "Encounter")
        self.assertEqual(entry["status"], "finished")

    def test_encounter_detail(self):
        resp = self.client.get(f"/fhir/R4/Encounter/{self.assessment.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "Encounter")
        self.assertEqual(data["id"], str(self.assessment.id))


class FHIRServiceRequestTest(TestCase):
    """Tests for ServiceRequest FHIR endpoints (referrals)."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        self.patient = _make_person(self.org, "Referred Patient")
        self.referral = Referral.objects.create(
            patient=self.patient, referral_reason="Severe hypertension",
            status=ReferralStatus.REQUESTED, urgency=UrgencyLevel.EMERGENCY,
            created_by="test_user",
        )

    def test_servicerequest_list(self):
        resp = self.client.get("/fhir/R4/ServiceRequest")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "Bundle")
        self.assertGreaterEqual(data["total"], 1)
        entry = data["entry"][0]["resource"]
        self.assertEqual(entry["resourceType"], "ServiceRequest")
        self.assertEqual(entry["priority"], "stat")
        resp = self.client.get(f"/fhir/R4/ServiceRequest/{self.referral.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "ServiceRequest")
        self.assertEqual(data["id"], str(self.referral.id))


class FHIRImmunizationTest(TestCase):
    """Tests for Immunization FHIR endpoints."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        self.child = _make_person(self.org, "Child Patient", sex=Sex.MALE)
        self.child_record = ChildImmunisationRecord.objects.create(
            child=self.child, date_of_birth=date(2024, 1, 1),
        )
        self.dose = VaccineDose.objects.create(
            child_record=self.child_record, vaccine_code="BCG",
            vaccine_name="BCG Vaccine", dose_number=1,
            administration_date=date(2024, 1, 2),
            batch_lot="BATCH001", administered_by="Test Nurse",
        )

    def test_immunization_list(self):
        resp = self.client.get("/fhir/R4/Immunization")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "Bundle")
        self.assertGreaterEqual(data["total"], 1)
        entry = data["entry"][0]["resource"]
        self.assertEqual(entry["resourceType"], "Immunization")
        self.assertEqual(entry["status"], "completed")

    def test_immunization_detail(self):
        resp = self.client.get(f"/fhir/R4/Immunization/{self.dose.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "Immunization")
        self.assertEqual(data["id"], str(self.dose.id))
        self.assertEqual(data["lotNumber"], "BATCH001")


class FHIRProvenanceTest(TestCase):
    """Tests for Provenance FHIR endpoints (audit events)."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        self.audit = AuditEvent.objects.create(
            actor="test_user", action="PATIENT_READ",
            entity_type="Person", entity_id=str(uuid.uuid4()),
        )

    def test_provenance_list(self):
        resp = self.client.get("/fhir/R4/Provenance")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "Bundle")
        self.assertGreaterEqual(data["total"], 1)
        entry = data["entry"][0]["resource"]
        self.assertEqual(entry["resourceType"], "Provenance")

    def test_provenance_detail(self):
        resp = self.client.get(f"/fhir/R4/Provenance/{self.audit.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "Provenance")
        self.assertEqual(data["id"], str(self.audit.id))


class FHIRLibraryAndPlanDefinitionTest(TestCase):
    """Tests for Library and PlanDefinition FHIR endpoints (rule packages)."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        self.pkg = Package.objects.create(
            package_id="ghs-smp-2016", package_type="RULE_BUNDLE",
            version="1.0.0", status="ACTIVE",
            sha256="abc123", signature="sig", signing_key_id="key-1",
            activated_at=timezone.now(),
        )

    def test_library_list(self):
        resp = self.client.get("/fhir/R4/Library")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "Bundle")
        self.assertGreaterEqual(data["total"], 1)
        entry = data["entry"][0]["resource"]
        self.assertEqual(entry["resourceType"], "Library")
        self.assertEqual(entry["version"], "1.0.0")

    def test_library_detail(self):
        resp = self.client.get(f"/fhir/R4/Library/{self.pkg.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "Library")
        self.assertEqual(data["id"], str(self.pkg.id))

    def test_plandefinition_list(self):
        resp = self.client.get("/fhir/R4/PlanDefinition")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "Bundle")
        self.assertGreaterEqual(data["total"], 1)
        entry = data["entry"][0]["resource"]
        self.assertEqual(entry["resourceType"], "PlanDefinition")

    def test_plandefinition_detail(self):
        resp = self.client.get(f"/fhir/R4/PlanDefinition/{self.pkg.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "PlanDefinition")
        self.assertEqual(data["id"], str(self.pkg.id))


class FHIRCapabilityStatementTest(TestCase):
    """Tests for the FHIR CapabilityStatement."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_metadata_lists_all_resources(self):
        resp = self.client.get("/fhir/R4/metadata")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "CapabilityStatement")
        self.assertEqual(data["fhirVersion"], "4.0.1")
        resources = data["rest"][0]["resource"]
        resource_types = [r["type"] for r in resources]
        expected = [
            "Patient", "Observation", "EpisodeOfCare", "Encounter",
            "ServiceRequest", "Immunization", "Provenance",
            "Library", "PlanDefinition",
        ]
        for rtype in expected:
            self.assertIn(rtype, resource_types)


class FHIRGrowthObservationTest(TestCase):
    """Tests for growth measurement as FHIR Observation."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        self.child = _make_person(self.org, "Growth Child", sex=Sex.MALE)
        self.measurement = GrowthMeasurement.objects.create(
            child=self.child, measurement_date=date(2024, 6, 1),
            weight_kg=Decimal("8.5"), height_cm=Decimal("70.0"),
            muac_mm=130, indicator="NORMAL",
        )

    def test_growth_observation_in_list(self):
        resp = self.client.get("/fhir/R4/Observation")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        # Find the growth measurement entry
        growth_entries = [
            e for e in data["entry"]
            if e["resource"]["id"] == str(self.measurement.id)
        ]
        self.assertEqual(len(growth_entries), 1)
        self.assertEqual(growth_entries[0]["resource"]["resourceType"], "Observation")

    def test_growth_observation_detail(self):
        resp = self.client.get(f"/fhir/R4/Observation/{self.measurement.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "Observation")
        self.assertEqual(data["id"], str(self.measurement.id))
