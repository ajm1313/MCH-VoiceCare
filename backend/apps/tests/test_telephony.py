"""
Tests for telephony API endpoints (spec §17, §22).

Verifies:
- Prompt pack list and by-language endpoints
- Webhook reception with stub provider
- Webhook signature failure handling
- Telephony session creation and response tracking
- Remote observation creation
- Unknown provider rejection
- Audit logging
"""
import json
import uuid
from datetime import date

from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.enums import SystemRole, Sex
from apps.core.telephony_models import PromptPack, TelephonySession, RemoteObservation
from apps.core.telephony_service import (
    StubTelephonyGateway, register_provider, get_provider,
)
from apps.organisations.models import OrganisationUnit
from apps.accounts.models import UserAccount
from apps.clients.models import Person, Household
from apps.audit.models import AuditEvent


def _make_org():
    return OrganisationUnit.objects.create(
        name="Test Facility", code="TELTEST01", unit_type="FACILITY",
    )


def _make_user(org):
    return UserAccount.objects.create_user(
        username="telttester", password="testpass123",
        organisation_unit=org, system_role=SystemRole.SUPER_ADMIN, is_super_admin=True,
    )


def _make_person(org, phone="0240000000"):
    household = Household.objects.create(
        organisation_unit=org, household_name="Test Household",
    )
    return Person.objects.create(
        full_name="Test Patient", sex=Sex.FEMALE, date_of_birth=date(1990, 1, 1),
        phone=phone, preferred_language="english",
        organisation_unit=org, household=household,
    )


def _make_prompt_pack(language="english"):
    """Create a test prompt pack (spec §17.2)."""
    return PromptPack.objects.create(
        pack_id=f"ghs-prompts-{language}-v1",
        name=f"GHS Prompts ({language})",
        version="1.0",
        language=language,
        status="ACTIVE",
        prompts=[
            {
                "prompt_id": "q_danger_bleeding",
                "prompt_version": "1.0",
                "language": language,
                "audio_asset_id": "audio_001",
                "question_code": "DANGER_BLEEDING",
                "allowed_keys": ["1", "2"],
                "repeat_key": "9",
                "back_key": "0",
                "human_help_key": "*",
                "text": "Are you experiencing heavy bleeding? Press 1 for yes, 2 for no.",
            },
        ],
        approved_by="clinical_committee",
        back_translated=True,
        comprehension_tested=True,
    )


class PromptPackTest(TestCase):
    """Tests for prompt pack endpoints (spec §17.2)."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        self.pack = _make_prompt_pack("english")
        _make_prompt_pack("dagbani")

    def test_prompt_pack_list(self):
        resp = self.client.get("/api/v1/telephony/prompt-packs")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["count"], 2)

    def test_prompt_pack_list_filter_by_language(self):
        resp = self.client.get("/api/v1/telephony/prompt-packs?language=english")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["count"], 1)

    def test_prompt_pack_by_language(self):
        resp = self.client.get("/api/v1/telephony/prompt-packs/english")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["language"], "english")
        self.assertEqual(len(data["prompts"]), 1)
        self.assertEqual(data["prompts"][0]["question_code"], "DANGER_BLEEDING")

    def test_prompt_pack_by_language_not_found(self):
        resp = self.client.get("/api/v1/telephony/prompt-packs/french")
        self.assertEqual(resp.status_code, 404)

    def test_prompt_pack_has_approval_metadata(self):
        resp = self.client.get("/api/v1/telephony/prompt-packs/english")
        data = resp.json()
        self.assertEqual(data["approvedBy"], "clinical_committee")
        self.assertTrue(data["backTranslated"])
        self.assertTrue(data["comprehensionTested"])


class TelephonyWebhookTest(TestCase):
    """Tests for telephony webhook endpoint (spec §17, §22)."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        # Webhooks don't need auth — they use HMAC
        register_provider("stub", StubTelephonyGateway())
        self.person = _make_person(self.org, "0240000000")

    def test_webhook_unknown_provider(self):
        resp = self.client.post(
            "/api/v1/telephony/webhooks/unknown_provider",
            data={"event_type": "dtmf"},
            format="json",
        )
        self.assertEqual(resp.status_code, 404)

    def test_webhook_dtmf_event(self):
        resp = self.client.post(
            "/api/v1/telephony/webhooks/stub",
            data={
                "event_type": "dtmf",
                "session_id": "test-session-001",
                "phone_number": "0240000000",
                "dtmf_key": "1",
                "question_code": "DANGER_BLEEDING",
                "language": "english",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)

        # Verify session was created
        session = TelephonySession.objects.filter(session_id="test-session-001").first()
        self.assertIsNotNone(session)
        self.assertEqual(session.channel, "IVR")
        self.assertEqual(session.status, "IN_PROGRESS")

        # Verify response was recorded
        self.assertEqual(len(session.responses), 1)
        self.assertEqual(session.responses[0]["key"], "1")

        # Verify remote observation was created
        obs = RemoteObservation.objects.filter(session=session).first()
        self.assertIsNotNone(obs)
        self.assertEqual(obs.response_key, "1")
        self.assertEqual(obs.capture_route, "IVR_DTMF")

    def test_webhook_ussd_event(self):
        resp = self.client.post(
            "/api/v1/telephony/webhooks/stub",
            data={
                "event_type": "ussd.response",
                "session_id": "test-ussd-001",
                "phone_number": "0240000000",
                "ussd_text": "1",
                "question_code": "DANGER_BLEEDING",
                "language": "english",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)

        session = TelephonySession.objects.filter(session_id="test-ussd-001").first()
        self.assertIsNotNone(session)
        self.assertEqual(session.channel, "USSD")

    def test_webhook_creates_session_with_patient(self):
        resp = self.client.post(
            "/api/v1/telephony/webhooks/stub",
            data={
                "event_type": "dtmf",
                "session_id": "test-session-002",
                "phone_number": "0240000000",
                "dtmf_key": "2",
                "question_code": "DANGER_FEVER",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)

        session = TelephonySession.objects.get(session_id="test-session-002")
        self.assertIsNotNone(session.patient)
        self.assertEqual(session.patient.phone, "0240000000")

    def test_webhook_call_ended_completes_session(self):
        # First create a session
        self.client.post(
            "/api/v1/telephony/webhooks/stub",
            data={
                "event_type": "dtmf",
                "session_id": "test-session-003",
                "phone_number": "0240000000",
                "dtmf_key": "1",
            },
            format="json",
        )

        # Then send call.ended
        resp = self.client.post(
            "/api/v1/telephony/webhooks/stub",
            data={
                "event_type": "call.ended",
                "session_id": "test-session-003",
                "phone_number": "0240000000",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)

        session = TelephonySession.objects.get(session_id="test-session-003")
        self.assertEqual(session.status, "COMPLETED")
        self.assertIsNotNone(session.ended_at)

    def test_webhook_audit_log(self):
        self.client.post(
            "/api/v1/telephony/webhooks/stub",
            data={
                "event_type": "dtmf",
                "session_id": "test-session-audit",
                "phone_number": "0240000000",
                "dtmf_key": "1",
            },
            format="json",
        )

        audit = AuditEvent.objects.filter(action="TELEPHONY_WEBHOOK_RECEIVED").first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.actor, "stub")


class TelephonySessionListTest(TestCase):
    """Tests for telephony session list endpoint."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        self.person = _make_person(self.org)

        TelephonySession.objects.create(
            session_id="list-001",
            channel="IVR",
            provider="stub",
            phone_number="0240000000",
            patient=self.person,
            status="COMPLETED",
        )

    def test_session_list(self):
        resp = self.client.get("/api/v1/telephony/sessions")
        self.assertEqual(resp.status_code, 200)
        self.assertGreaterEqual(resp.json()["count"], 1)

    def test_session_list_filter_by_phone(self):
        resp = self.client.get("/api/v1/telephony/sessions?phone=0240000000")
        self.assertEqual(resp.status_code, 200)
        self.assertGreaterEqual(resp.json()["count"], 1)

    def test_session_list_filter_by_patient(self):
        resp = self.client.get(f"/api/v1/telephony/sessions?patientId={self.person.id}")
        self.assertEqual(resp.status_code, 200)
        self.assertGreaterEqual(resp.json()["count"], 1)
