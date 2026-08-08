"""
Tests for package signature verification (spec §4.2, §24).

Verifies that:
- Ed25519 signatures are correctly validated
- Invalid signatures are rejected
- SHA-256 hash mismatches are rejected
- Unknown/revoked signing keys are rejected
- The bootstrap config endpoint includes signing keys
"""
import base64
import json

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.signing_models import SigningKey
from apps.core.signing_service import (
    compute_sha256,
    canonicalize_payload,
    verify_package_signature,
    get_verification_public_keys,
)
from apps.core.enums import SystemRole
from apps.organisations.models import OrganisationUnit
from apps.accounts.models import UserAccount


def _make_org():
    return OrganisationUnit.objects.create(
        name="Test Facility", code="SIGTEST01", unit_type="FACILITY",
    )


def _make_user(org):
    return UserAccount.objects.create_user(
        username="sigtester", password="testpass123",
        organisation_unit=org, system_role=SystemRole.SUPER_ADMIN, is_super_admin=True,
    )


def _generate_ed25519_keypair():
    """Generate an Ed25519 keypair and return (private_key, public_key_b64)."""
    private_key = Ed25519PrivateKey.generate()
    public_key_bytes = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    return private_key, base64.b64encode(public_key_bytes).decode("ascii")


def _sign_payload(private_key, payload: dict) -> str:
    """Sign a payload dict with an Ed25519 private key, return base64 signature."""
    canonical = canonicalize_payload(payload)
    signature = private_key.sign(canonical)
    return base64.b64encode(signature).decode("ascii")


class SigningKeyModelTest(TestCase):
    """Tests for the SigningKey model."""

    def test_create_signing_key(self):
        _, pub_b64 = _generate_ed25519_keypair()
        key = SigningKey.objects.create(
            key_id="test-key-1",
            public_key_base64=pub_b64,
        )
        self.assertEqual(key.algorithm, "Ed25519")
        self.assertEqual(key.status, "ACTIVE")
        self.assertIsNotNone(key.activated_at)

    def test_get_active_key(self):
        _, pub_b64 = _generate_ed25519_keypair()
        SigningKey.objects.create(key_id="key-a", public_key_base64=pub_b64)
        found = SigningKey.get_active_key("key-a")
        self.assertIsNotNone(found)
        self.assertEqual(found.key_id, "key-a")

    def test_revoked_key_not_returned(self):
        _, pub_b64 = _generate_ed25519_keypair()
        key = SigningKey.objects.create(key_id="key-b", public_key_base64=pub_b64)
        key.status = "REVOKED"
        key.save()
        self.assertIsNone(SigningKey.get_active_key("key-b"))


class SignatureVerificationTest(TestCase):
    """Tests for the signature verification service (spec §4.2)."""

    def setUp(self):
        self.private_key, pub_b64 = _generate_ed25519_keypair()
        self.signing_key = SigningKey.objects.create(
            key_id="verify-key-1",
            public_key_base64=pub_b64,
        )

    def test_valid_signature_accepted(self):
        payload = {"version": "1.0.0", "rules": ["R1", "R2"]}
        sig = _sign_payload(self.private_key, payload)
        canonical = canonicalize_payload(payload)
        sha = compute_sha256(canonical)

        result = verify_package_signature(payload, sig, "verify-key-1", sha)
        self.assertTrue(result)

    def test_tampered_payload_rejected(self):
        payload = {"version": "1.0.0", "rules": ["R1", "R2"]}
        sig = _sign_payload(self.private_key, payload)

        tampered = {"version": "1.0.1", "rules": ["R1", "R2"]}
        result = verify_package_signature(tampered, sig, "verify-key-1")
        self.assertFalse(result)

    def test_wrong_key_rejected(self):
        other_private, other_pub_b64 = _generate_ed25519_keypair()
        SigningKey.objects.create(key_id="other-key", public_key_base64=other_pub_b64)

        payload = {"version": "1.0.0"}
        sig = _sign_payload(self.private_key, payload)

        result = verify_package_signature(payload, sig, "other-key")
        self.assertFalse(result)

    def test_unknown_key_id_rejected(self):
        payload = {"version": "1.0.0"}
        sig = _sign_payload(self.private_key, payload)

        result = verify_package_signature(payload, sig, "nonexistent-key")
        self.assertFalse(result)

    def test_hash_mismatch_rejected(self):
        payload = {"version": "1.0.0"}
        sig = _sign_payload(self.private_key, payload)

        result = verify_package_signature(
            payload, sig, "verify-key-1",
            expected_sha256="0000000000000000000000000000000000000000000000000000000000000000",
        )
        self.assertFalse(result)

    def test_revoked_key_rejected(self):
        self.signing_key.status = "REVOKED"
        self.signing_key.save()

        payload = {"version": "1.0.0"}
        sig = _sign_payload(self.private_key, payload)

        result = verify_package_signature(payload, sig, "verify-key-1")
        self.assertFalse(result)


class BootstrapIncludesSigningKeysTest(TestCase):
    """Test that the config bootstrap endpoint includes signing keys."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_bootstrap_includes_signing_keys(self):
        _, pub_b64 = _generate_ed25519_keypair()
        SigningKey.objects.create(key_id="bootstrap-key-1", public_key_base64=pub_b64)

        resp = self.client.get("/api/v1/config/bootstrap")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("signing_keys", data)
        self.assertEqual(len(data["signing_keys"]), 1)
        self.assertEqual(data["signing_keys"][0]["keyId"], "bootstrap-key-1")
        self.assertEqual(data["signing_keys"][0]["algorithm"], "Ed25519")

    def test_get_verification_public_keys(self):
        _, pub_b64 = _generate_ed25519_keypair()
        SigningKey.objects.create(key_id="list-key-1", public_key_base64=pub_b64)
        SigningKey.objects.create(
            key_id="list-key-2", public_key_base64=pub_b64,
            status="REVOKED",
        )

        keys = get_verification_public_keys()
        active_keys = [k for k in keys if k["keyId"] == "list-key-1"]
        revoked_keys = [k for k in keys if k["keyId"] == "list-key-2"]
        self.assertEqual(len(active_keys), 1)
        self.assertEqual(len(revoked_keys), 0)
