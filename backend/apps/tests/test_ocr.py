"""
Tests for OCR API endpoints (spec §16, §25).

Verifies:
- Template registry list and detail
- OCR job creation, status, confirmation, rejection
- Safety-critical field confirmation requirement
- Scan retention purge eligibility
- Audit logging
"""
import uuid
from datetime import date

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.enums import SystemRole, Sex
from apps.core.ocr_models import DocumentTemplate, OCRJob
from apps.core.ocr_service import (
    StubOCRAdapter, set_ocr_adapter, OCRResult, ExtractedField,
)
from apps.organisations.models import OrganisationUnit
from apps.accounts.models import UserAccount
from apps.clients.models import Person, Household
from apps.audit.models import AuditEvent


def _make_org():
    return OrganisationUnit.objects.create(
        name="Test Facility", code="OCRTEST01", unit_type="FACILITY",
    )


def _make_user(org):
    return UserAccount.objects.create_user(
        username="ocrtester", password="testpass123",
        organisation_unit=org, system_role=SystemRole.SUPER_ADMIN, is_super_admin=True,
    )


def _make_person(org, name="Test Patient"):
    household = Household.objects.create(
        organisation_unit=org, household_name="Test Household",
    )
    return Person.objects.create(
        full_name=name, sex=Sex.FEMALE, date_of_birth=date(1990, 1, 1),
        phone="0240000000", preferred_language="en",
        organisation_unit=org, household=household,
    )


def _make_template():
    """Create a test CWC card template with safety-critical fields."""
    return DocumentTemplate.objects.create(
        template_id="ghs-cwc-card-v1",
        name="Ghana CWC Card",
        page_type="CWC_CARD",
        version="1.0",
        status="ACTIVE",
        field_definitions=[
            {
                "key": "child_name",
                "label": "Child Name",
                "type": "text",
                "required": True,
                "safety_critical": False,
                "confidence_threshold": 0.80,
            },
            {
                "key": "date_of_birth",
                "label": "Date of Birth",
                "type": "date",
                "required": True,
                "safety_critical": True,
                "confidence_threshold": 0.90,
            },
            {
                "key": "birth_weight_kg",
                "label": "Birth Weight (kg)",
                "type": "decimal",
                "required": False,
                "safety_critical": True,
                "confidence_threshold": 0.85,
                "range_min": 0.5,
                "range_max": 6.0,
            },
        ],
    )


class OCRTemplateTest(TestCase):
    """Tests for OCR template registry endpoints."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        self.template = _make_template()

    def test_template_list(self):
        resp = self.client.get("/api/v1/ocr/templates")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertGreaterEqual(data["count"], 1)
        self.assertEqual(data["results"][0]["templateId"], "ghs-cwc-card-v1")

    def test_template_list_filter_by_page_type(self):
        resp = self.client.get("/api/v1/ocr/templates?pageType=CWC_CARD")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["count"], 1)

    def test_template_detail(self):
        resp = self.client.get(f"/api/v1/ocr/templates/{self.template.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["name"], "Ghana CWC Card")
        self.assertEqual(len(data["fieldDefinitions"]), 3)

    def test_template_detail_not_found(self):
        resp = self.client.get(f"/api/v1/ocr/templates/{uuid.uuid4()}")
        self.assertEqual(resp.status_code, 404)


class OCRJobTest(TestCase):
    """Tests for OCR job lifecycle (spec §16, §25)."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        self.patient = _make_person(self.org)
        self.template = _make_template()
        # Use stub adapter
        set_ocr_adapter(StubOCRAdapter())

    def test_create_ocr_job_with_stub_adapter(self):
        resp = self.client.post("/api/v1/ocr/jobs", {
            "patientId": str(self.patient.id),
            "templateId": str(self.template.id),
            "episode": "NEWBORN",
            "imagePath": "/tmp/test_image.jpg",
            "imageHash": "abc123",
            "capturedBy": "test_user",
            "deviceId": "device-001",
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data["status"], "EXTRACTED")
        self.assertEqual(data["episode"], "NEWBORN")
        self.assertEqual(data["capturedBy"], "test_user")
        self.assertIsNotNone(data["purgeEligibleAt"])

    def test_create_ocr_job_invalid_patient(self):
        resp = self.client.post("/api/v1/ocr/jobs", {
            "patientId": "not-a-uuid",
            "templateId": str(self.template.id),
        }, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_create_ocr_job_template_not_found(self):
        resp = self.client.post("/api/v1/ocr/jobs", {
            "patientId": str(self.patient.id),
            "templateId": str(uuid.uuid4()),
        }, format="json")
        self.assertEqual(resp.status_code, 404)

    def test_ocr_job_detail(self):
        # Create job
        create_resp = self.client.post("/api/v1/ocr/jobs", {
            "patientId": str(self.patient.id),
            "templateId": str(self.template.id),
        }, format="json")
        job_id = create_resp.json()["id"]

        resp = self.client.get(f"/api/v1/ocr/jobs/{job_id}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["id"], job_id)

    def test_ocr_job_list(self):
        # Create a job
        self.client.post("/api/v1/ocr/jobs", {
            "patientId": str(self.patient.id),
            "templateId": str(self.template.id),
        }, format="json")

        resp = self.client.get("/api/v1/ocr/jobs/list")
        self.assertEqual(resp.status_code, 200)
        self.assertGreaterEqual(resp.json()["count"], 1)

    def test_ocr_job_list_filter_by_patient(self):
        self.client.post("/api/v1/ocr/jobs", {
            "patientId": str(self.patient.id),
            "templateId": str(self.template.id),
        }, format="json")

        resp = self.client.get(f"/api/v1/ocr/jobs/list?patientId={self.patient.id}")
        self.assertEqual(resp.status_code, 200)
        self.assertGreaterEqual(resp.json()["count"], 1)


class OCRJobConfirmTest(TestCase):
    """Tests for OCR job confirmation (spec §16.6)."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        self.patient = _make_person(self.org)
        self.template = _make_template()

        # Create a job with extracted fields directly
        self.job = OCRJob.objects.create(
            patient=self.patient,
            template=self.template,
            episode="NEWBORN",
            status="EXTRACTED",
            extracted_fields=[
                {
                    "key": "child_name",
                    "value": "Baby Kofi",
                    "confidence": 0.95,
                    "safety_critical": False,
                    "human_confirmed": False,
                },
                {
                    "key": "date_of_birth",
                    "value": "2024-06-15",
                    "confidence": 0.92,
                    "safety_critical": True,
                    "human_confirmed": False,
                },
            ],
        )

    def test_confirm_job(self):
        resp = self.client.post(f"/api/v1/ocr/jobs/{self.job.id}/confirm", {
            "confirmedBy": "nurse_amma",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "CONFIRMED")
        self.assertEqual(data["confirmedBy"], "nurse_amma")
        # All fields should be confirmed
        for field in data["extractedFields"]:
            self.assertTrue(field["human_confirmed"])

    def test_confirm_job_with_corrections(self):
        resp = self.client.post(f"/api/v1/ocr/jobs/{self.job.id}/confirm", {
            "confirmedBy": "nurse_amma",
            "fieldCorrections": {
                "date_of_birth": "2024-06-16",  # Corrected by 1 day
            },
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "CONFIRMED")
        # Find the corrected field
        dob_field = [f for f in data["extractedFields"] if f["key"] == "date_of_birth"][0]
        self.assertEqual(dob_field["corrected_value"], "2024-06-16")
        self.assertTrue(dob_field["human_confirmed"])

    def test_confirm_job_wrong_status(self):
        self.job.status = "CONFIRMED"
        self.job.save()
        resp = self.client.post(f"/api/v1/ocr/jobs/{self.job.id}/confirm", {}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_has_unconfirmed_safety_critical(self):
        self.assertTrue(self.job.has_unconfirmed_safety_critical)
        # Confirm the job
        self.job.mark_confirmed("test_user")
        self.assertFalse(self.job.has_unconfirmed_safety_critical)


class OCRJobRejectTest(TestCase):
    """Tests for OCR job rejection (spec §16.6)."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        self.patient = _make_person(self.org)
        self.template = _make_template()

        self.job = OCRJob.objects.create(
            patient=self.patient,
            template=self.template,
            status="EXTRACTED",
            extracted_fields=[
                {"key": "child_name", "value": "Baby Kofi", "confidence": 0.50,
                 "safety_critical": False, "human_confirmed": False},
            ],
        )

    def test_reject_job(self):
        resp = self.client.post(f"/api/v1/ocr/jobs/{self.job.id}/reject", {
            "reason": "Low confidence extraction",
            "rejectedBy": "nurse_amma",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "REJECTED")
        self.assertEqual(data["rejectionReason"], "Low confidence extraction")

    def test_reject_job_wrong_status(self):
        self.job.status = "CONFIRMED"
        self.job.save()
        resp = self.client.post(f"/api/v1/ocr/jobs/{self.job.id}/reject", {}, format="json")
        self.assertEqual(resp.status_code, 400)


class OCRJobRetentionTest(TestCase):
    """Tests for scan retention (spec §25)."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.patient = _make_person(self.org)
        self.template = _make_template()

    def test_purge_eligible_after_retention_window(self):
        from datetime import timedelta
        from django.utils import timezone

        job = OCRJob.objects.create(
            patient=self.patient,
            template=self.template,
            status="EXTRACTED",
            purge_eligible_at=timezone.now() - timedelta(hours=1),  # Past
        )
        self.assertTrue(job.is_purge_eligible)

    def test_purge_not_eligible_before_window(self):
        from datetime import timedelta
        from django.utils import timezone

        job = OCRJob.objects.create(
            patient=self.patient,
            template=self.template,
            status="EXTRACTED",
            purge_eligible_at=timezone.now() + timedelta(hours=24),  # Future
        )
        self.assertFalse(job.is_purge_eligible)

    def test_purge_not_eligible_if_already_purged(self):
        from datetime import timedelta
        from django.utils import timezone

        job = OCRJob.objects.create(
            patient=self.patient,
            template=self.template,
            status="EXPIRED",
            purge_eligible_at=timezone.now() - timedelta(hours=1),
            purged_at=timezone.now(),
        )
        self.assertFalse(job.is_purge_eligible)


class OCRAuditLogTest(TestCase):
    """Tests for OCR audit logging (spec §23)."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        self.patient = _make_person(self.org)
        self.template = _make_template()
        set_ocr_adapter(StubOCRAdapter())

    def test_audit_log_on_job_creation(self):
        self.client.post("/api/v1/ocr/jobs", {
            "patientId": str(self.patient.id),
            "templateId": str(self.template.id),
        }, format="json")

        audit = AuditEvent.objects.filter(action="OCR_JOB_CREATED").first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.actor, "ocrtester")

    def test_audit_log_on_job_confirmation(self):
        job = OCRJob.objects.create(
            patient=self.patient, template=self.template,
            status="EXTRACTED", extracted_fields=[],
        )
        self.client.post(f"/api/v1/ocr/jobs/{job.id}/confirm", {}, format="json")

        audit = AuditEvent.objects.filter(action="OCR_JOB_CONFIRMED").first()
        self.assertIsNotNone(audit)
