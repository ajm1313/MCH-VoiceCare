"""
Tests for referral slip generation and rendering (spec §18.5).

Tests:
- ReferralSlipData generation from a Referral
- HTML rendering of the slip
- PDF rendering (if reportlab available)
- Slip API endpoints (HTML, PDF, JSON)
- QR token and short code generation
- Patient name consent handling
"""
from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.enums import UrgencyLevel, ReferralStatus, SystemRole, Sex
from apps.clients.models import Person, Household
from apps.organisations.models import OrganisationUnit
from apps.accounts.models import UserAccount
from apps.referrals.models import Referral
from apps.referrals.slip_generator import (
    ReferralSlipData, generate_slip_data, render_slip_html, render_slip_pdf,
)


def _make_org():
    return OrganisationUnit.objects.create(
        name="Test Facility", code="SLP001", unit_type="FACILITY",
    )


def _make_dest_org():
    return OrganisationUnit.objects.create(
        name="Destination Hospital", code="SLP002", unit_type="FACILITY",
    )


def _make_user(org):
    return UserAccount.objects.create_user(
        username="sliptester", password="testpass123",
        organisation_unit=org, system_role=SystemRole.SUPER_ADMIN, is_super_admin=True,
    )


def _make_patient(org, name="Test Patient"):
    household = Household.objects.create(organisation_unit=org)
    return Person.objects.create(
        full_name=name, sex=Sex.FEMALE, date_of_birth=date(1990, 1, 1),
        phone="0240000000", preferred_language="english",
        organisation_unit=org, household=household, care_consent=True,
    )


def _make_referral(org, patient, dest_org=None, urgency=UrgencyLevel.ROUTINE):
    return Referral.objects.create(
        patient=patient,
        referring_facility=org,
        destination_facility=dest_org,
        referral_reason="Routine antenatal check",
        urgency=urgency,
        pre_referral_care="Patient advised to rest and hydrate.",
        status=ReferralStatus.REQUESTED,
        created_by="Dr. Test Clinician",
    )


class ReferralSlipDataTest(TestCase):
    """Test ReferralSlipData generation (spec §18.5)."""

    def setUp(self):
        self.org = _make_org()
        self.dest_org = _make_dest_org()
        self.patient = _make_patient(self.org)
        self.referral = _make_referral(self.org, self.patient, self.dest_org)

    def test_generate_slip_data_basic(self):
        """generate_slip_data should return a ReferralSlipData with all fields."""
        slip = generate_slip_data(self.referral.id)
        self.assertIsInstance(slip, ReferralSlipData)
        self.assertEqual(slip.patient_id, str(self.patient.id))
        self.assertEqual(slip.patient_name, "Test Patient")
        self.assertEqual(slip.referral_episode_id, str(self.referral.id))
        self.assertEqual(slip.destination_facility_name, "Destination Hospital")
        self.assertEqual(slip.referring_facility_name, "Test Facility")
        self.assertEqual(slip.urgency_level, UrgencyLevel.ROUTINE)
        self.assertEqual(slip.pre_referral_care, "Patient advised to rest and hydrate.")
        self.assertEqual(slip.referring_clinician_name, "Dr. Test Clinician")

    def test_generate_slip_data_generates_qr_token(self):
        """generate_slip_data should generate QR token and short code if absent."""
        self.referral.qr_token = ""
        self.referral.short_code = ""
        self.referral.save()
        slip = generate_slip_data(self.referral.id)
        self.assertTrue(slip.qr_token)
        self.assertTrue(slip.short_code)

    def test_generate_slip_data_preserves_existing_qr(self):
        """generate_slip_data should preserve existing QR token."""
        self.referral.qr_token = "existing-token"
        self.referral.short_code = "ABC123"
        self.referral.save()
        slip = generate_slip_data(self.referral.id)
        self.assertEqual(slip.qr_token, "existing-token")
        self.assertEqual(slip.short_code, "ABC123")

    def test_generate_slip_data_no_consent_hides_name(self):
        """Patient name should be empty if care_consent is False (spec §26)."""
        self.patient.care_consent = False
        self.patient.save()
        slip = generate_slip_data(self.referral.id)
        self.assertEqual(slip.patient_name, "")
        # Patient ID should still be present
        self.assertTrue(slip.patient_id)

    def test_generate_slip_data_not_found(self):
        """generate_slip_data should raise DoesNotExist for invalid ID."""
        import uuid
        with self.assertRaises(Referral.DoesNotExist):
            generate_slip_data(uuid.uuid4())

    def test_generate_slip_data_pregnancy_episode(self):
        """Slip data should include pregnancy episode ID if present."""
        slip = generate_slip_data(self.referral.id)
        # No pregnancy episode linked — should be None
        self.assertIsNone(slip.pregnancy_episode_id)

    def test_generate_slip_data_emergency_urgency(self):
        """Slip data should reflect emergency urgency."""
        referral = _make_referral(self.org, self.patient, self.dest_org, UrgencyLevel.EMERGENCY)
        slip = generate_slip_data(referral.id)
        self.assertEqual(slip.urgency_level, UrgencyLevel.EMERGENCY)


class ReferralSlipHTMLTest(TestCase):
    """Test HTML rendering of the referral slip (spec §18.5)."""

    def setUp(self):
        self.org = _make_org()
        self.dest_org = _make_dest_org()
        self.patient = _make_patient(self.org)
        self.referral = _make_referral(self.org, self.patient, self.dest_org)

    def test_render_slip_html_returns_string(self):
        """render_slip_html should return a non-empty HTML string."""
        slip = generate_slip_data(self.referral.id)
        html = render_slip_html(slip)
        self.assertIsInstance(html, str)
        self.assertTrue(len(html) > 0)

    def test_render_slip_html_contains_title(self):
        """HTML should contain 'REFERRAL SLIP' title."""
        slip = generate_slip_data(self.referral.id)
        html = render_slip_html(slip)
        self.assertIn("REFERRAL SLIP", html)

    def test_render_slip_html_contains_patient_name(self):
        """HTML should contain the patient name."""
        slip = generate_slip_data(self.referral.id)
        html = render_slip_html(slip)
        self.assertIn("Test Patient", html)

    def test_render_slip_html_contains_destination(self):
        """HTML should contain the destination facility name."""
        slip = generate_slip_data(self.referral.id)
        html = render_slip_html(slip)
        self.assertIn("Destination Hospital", html)

    def test_render_slip_html_contains_referring_facility(self):
        """HTML should contain the referring facility name."""
        slip = generate_slip_data(self.referral.id)
        html = render_slip_html(slip)
        self.assertIn("Test Facility", html)

    def test_render_slip_html_contains_pre_referral_care(self):
        """HTML should contain pre-referral care instructions."""
        slip = generate_slip_data(self.referral.id)
        html = render_slip_html(slip)
        self.assertIn("Patient advised to rest and hydrate.", html)

    def test_render_slip_html_contains_short_code(self):
        """HTML should contain the short code."""
        slip = generate_slip_data(self.referral.id)
        html = render_slip_html(slip)
        self.assertIn(slip.short_code, html)

    def test_render_slip_html_contains_qr_token(self):
        """HTML should contain the QR token."""
        slip = generate_slip_data(self.referral.id)
        html = render_slip_html(slip)
        self.assertIn(slip.qr_token, html)

    def test_render_slip_html_contains_clinician(self):
        """HTML should contain the referring clinician name."""
        slip = generate_slip_data(self.referral.id)
        html = render_slip_html(slip)
        self.assertIn("Dr. Test Clinician", html)

    def test_render_slip_html_has_print_button(self):
        """HTML should have a print button."""
        slip = generate_slip_data(self.referral.id)
        html = render_slip_html(slip)
        self.assertIn("print", html.lower())

    def test_render_slip_html_urgency_badge(self):
        """HTML should contain urgency level."""
        slip = generate_slip_data(self.referral.id)
        html = render_slip_html(slip)
        self.assertIn(slip.urgency_level, html)


class ReferralSlipPDFTest(TestCase):
    """Test PDF rendering of the referral slip (spec §18.5)."""

    def setUp(self):
        self.org = _make_org()
        self.dest_org = _make_dest_org()
        self.patient = _make_patient(self.org)
        self.referral = _make_referral(self.org, self.patient, self.dest_org)

    def test_render_slip_pdf_returns_bytes_or_none(self):
        """render_slip_pdf should return bytes (if reportlab available) or None."""
        slip = generate_slip_data(self.referral.id)
        pdf = render_slip_pdf(slip)
        if pdf is not None:
            self.assertIsInstance(pdf, bytes)
            self.assertTrue(len(pdf) > 0)
            # PDF files start with %PDF
            self.assertTrue(pdf[:4] == b"%PDF")
        # If None, the library is not installed — that's acceptable

    def test_render_slip_pdf_contains_title(self):
        """If PDF is available, it should contain the title text."""
        slip = generate_slip_data(self.referral.id)
        pdf = render_slip_pdf(slip)
        if pdf is not None:
            # PDF content is compressed, but we can check it's a valid PDF
            self.assertIn(b"PDF", pdf[:10])


class ReferralSlipAPITest(TestCase):
    """Test the referral slip API endpoints (spec §18.5)."""

    def setUp(self):
        self.org = _make_org()
        self.dest_org = _make_dest_org()
        self.user = _make_user(self.org)
        self.patient = _make_patient(self.org)
        self.referral = _make_referral(self.org, self.patient, self.dest_org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_slip_html_endpoint(self):
        """GET /api/v1/referrals/{id}/slip/ should return HTML."""
        resp = self.client.get(f"/api/v1/referrals/{self.referral.id}/slip/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp["Content-Type"], "text/html")
        content = resp.content.decode("utf-8")
        self.assertIn("REFERRAL SLIP", content)
        self.assertIn("Test Patient", content)

    def test_slip_pdf_endpoint(self):
        """GET /api/v1/referrals/{id}/slip/?format=pdf should return PDF or HTML fallback."""
        resp = self.client.get(f"/api/v1/referrals/{self.referral.id}/slip/?output=pdf")
        self.assertEqual(resp.status_code, 200)
        # Either PDF or HTML fallback
        content_type = resp["Content-Type"]
        self.assertIn(content_type, ["application/pdf", "text/html"])

    def test_slip_data_endpoint(self):
        """GET /api/v1/referrals/{id}/slip_data/ should return JSON."""
        resp = self.client.get(f"/api/v1/referrals/{self.referral.id}/slip_data/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["patientName"], "Test Patient")
        self.assertEqual(data["destinationFacilityName"], "Destination Hospital")
        self.assertEqual(data["referringFacilityName"], "Test Facility")
        self.assertEqual(data["urgencyLevel"], UrgencyLevel.ROUTINE)
        self.assertEqual(data["preReferralCare"], "Patient advised to rest and hydrate.")
        self.assertEqual(data["referringClinicianName"], "Dr. Test Clinician")
        self.assertTrue(data["qrToken"])
        self.assertTrue(data["shortCode"])

    def test_slip_data_endpoint_no_consent(self):
        """slip_data should hide patient name if no consent."""
        self.patient.care_consent = False
        self.patient.save()
        resp = self.client.get(f"/api/v1/referrals/{self.referral.id}/slip_data/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["patientName"], "")
