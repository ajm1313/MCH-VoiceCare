"""
Tests for sync idempotency — duplicate push returns same result,
different body with same key returns 409 (spec §19.3, §29).
"""
import uuid

from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.enums import SystemRole
from apps.organisations.models import OrganisationUnit
from apps.accounts.models import UserAccount
from apps.core.idempotency_models import IdempotencyRecord


class SyncIdempotencyTests(TestCase):

    def setUp(self):
        self.org = OrganisationUnit.objects.create(
            name="Test Facility", code="SYNC01", unit_type="FACILITY",
        )
        self.user = UserAccount.objects.create_user(
            username="synctester",
            password="testpass123",
            full_name="Sync Tester",
            organisation_unit=self.org,
            system_role=SystemRole.SUPER_ADMIN,
            is_super_admin=True,
        )
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_push_without_key_works(self):
        resp = self.client.post("/api/v1/sync/", {
            "records": {"persons": []}
        }, format="json")
        self.assertEqual(resp.status_code, 200)

    def test_duplicate_key_returns_same_result(self):
        key = f"test-key-{uuid.uuid4().hex[:8]}"
        body = {"records": {"persons": [{"full_name": "Idempotency Test", "sex": "FEMALE"}]}}

        resp1 = self.client.post(
            "/api/v1/sync/", body, format="json",
            HTTP_IDEMPOTENCY_KEY=key,
        )
        self.assertEqual(resp1.status_code, 200)
        result1 = resp1.json()

        resp2 = self.client.post(
            "/api/v1/sync/", body, format="json",
            HTTP_IDEMPOTENCY_KEY=key,
        )
        self.assertEqual(resp2.status_code, 200)
        result2 = resp2.json()

        self.assertEqual(result1, result2)

    def test_same_key_different_body_returns_409(self):
        key = f"conflict-key-{uuid.uuid4().hex[:8]}"
        body1 = {"records": {"persons": [{"full_name": "Person A", "sex": "FEMALE"}]}}
        body2 = {"records": {"persons": [{"full_name": "Person B", "sex": "MALE"}]}}

        resp1 = self.client.post(
            "/api/v1/sync/", body1, format="json",
            HTTP_IDEMPOTENCY_KEY=key,
        )
        self.assertEqual(resp1.status_code, 200)

        resp2 = self.client.post(
            "/api/v1/sync/", body2, format="json",
            HTTP_IDEMPOTENCY_KEY=key,
        )
        self.assertEqual(resp2.status_code, 409)

    def test_pull_returns_synced_at(self):
        resp = self.client.get("/api/v1/sync/?entities=persons")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("synced_at", data)
        self.assertIn("records", data)

    def test_pull_with_since_filter(self):
        resp = self.client.get("/api/v1/sync/?since=2025-01-01T00:00:00Z&entities=persons")
        self.assertEqual(resp.status_code, 200)

    def test_idempotency_record_stored(self):
        key = f"stored-key-{uuid.uuid4().hex[:8]}"
        body = {"records": {"persons": []}}
        self.client.post(
            "/api/v1/sync/", body, format="json",
            HTTP_IDEMPOTENCY_KEY=key,
        )
        self.assertTrue(IdempotencyRecord.objects.filter(key=key).exists())
