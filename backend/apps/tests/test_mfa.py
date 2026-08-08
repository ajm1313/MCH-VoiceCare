"""
Tests for MFA endpoints (spec §22).

Verifies:
- MFA setup generates secret and recovery codes
- TOTP verification enables MFA
- MFA status reflects enabled state
- Privileged roles are flagged as requiring MFA
- Recovery codes work and are consumed
- MFA disable with TOTP code or password
- Audit logging
"""
import base64
import hashlib
import hmac
import struct
import time
import uuid

from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.enums import SystemRole
from apps.accounts.models import UserAccount
from apps.accounts.mfa_models import (
    MFAFactor, is_privileged_role, user_has_mfa_enabled, mfa_required_for_user,
)
from apps.organisations.models import OrganisationUnit
from apps.audit.models import AuditEvent


def _make_org():
    return OrganisationUnit.objects.create(
        name="Test Facility", code="MFATEST01", unit_type="FACILITY",
    )


def _make_user(org, role=SystemRole.SUPER_ADMIN):
    return UserAccount.objects.create_user(
        username="mfatester", password="testpass123",
        organisation_unit=org, system_role=role, is_super_admin=True,
    )


def _generate_valid_totp(secret: str) -> str:
    """Generate a valid TOTP code for the current time step."""
    secret_bytes = base64.b32decode(secret, casefold=True)
    step = int(time.time() // 30)
    msg = struct.pack(">Q", step)
    h = hmac.new(secret_bytes, msg, hashlib.sha1).digest()
    offset = h[-1] & 0x0F
    code = struct.unpack(">I", h[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(code % 1000000).zfill(6)


class MFASetupTest(TestCase):
    """Tests for MFA setup endpoint (spec §22)."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_setup_generates_secret(self):
        resp = self.client.post("/api/v1/accounts/mfa/setup", {}, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("secret", data)
        self.assertIn("otpauthUri", data)
        self.assertEqual(len(data["recoveryCodes"]), 10)
        self.assertIn("factorId", data)

    def test_setup_when_already_enabled(self):
        # First setup
        resp1 = self.client.post("/api/v1/accounts/mfa/setup", {}, format="json")
        factor = MFAFactor.objects.get(id=resp1.json()["factorId"])
        factor.enable()

        # Second setup should fail
        resp2 = self.client.post("/api/v1/accounts/mfa/setup", {}, format="json")
        self.assertEqual(resp2.status_code, 400)

    def test_setup_audit_log(self):
        self.client.post("/api/v1/accounts/mfa/setup", {}, format="json")
        audit = AuditEvent.objects.filter(action="MFA_SETUP_INITIATED").first()
        self.assertIsNotNone(audit)


class MFAVerifyTest(TestCase):
    """Tests for MFA verification endpoint (spec §22)."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

        # Setup MFA
        resp = self.client.post("/api/v1/accounts/mfa/setup", {}, format="json")
        self.factor_id = resp.json()["factorId"]
        self.secret = resp.json()["secret"]
        self.recovery_codes = resp.json()["recoveryCodes"]

    def test_verify_valid_code(self):
        code = _generate_valid_totp(self.secret)
        resp = self.client.post("/api/v1/accounts/mfa/verify", {
            "factorId": self.factor_id,
            "code": code,
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "enabled")

        # Verify factor is enabled
        factor = MFAFactor.objects.get(id=self.factor_id)
        self.assertTrue(factor.enabled)

    def test_verify_invalid_code(self):
        resp = self.client.post("/api/v1/accounts/mfa/verify", {
            "factorId": self.factor_id,
            "code": "000000",
        }, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_verify_audit_log(self):
        code = _generate_valid_totp(self.secret)
        self.client.post("/api/v1/accounts/mfa/verify", {
            "factorId": self.factor_id,
            "code": code,
        }, format="json")
        audit = AuditEvent.objects.filter(action="MFA_ENABLED").first()
        self.assertIsNotNone(audit)


class MFAStatusTest(TestCase):
    """Tests for MFA status endpoint (spec §22)."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org, role=SystemRole.SUPER_ADMIN)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_status_not_enabled(self):
        resp = self.client.get("/api/v1/accounts/mfa/status")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertFalse(data["enabled"])
        self.assertTrue(data["required"])
        self.assertTrue(data["isPrivilegedRole"])

    def test_status_enabled(self):
        # Setup and enable
        resp = self.client.post("/api/v1/accounts/mfa/setup", {}, format="json")
        factor = MFAFactor.objects.get(id=resp.json()["factorId"])
        factor.enable()

        resp = self.client.get("/api/v1/accounts/mfa/status")
        data = resp.json()
        self.assertTrue(data["enabled"])
        self.assertFalse(data["required"])


class MFARecoveryTest(TestCase):
    """Tests for MFA recovery codes (spec §22)."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

        resp = self.client.post("/api/v1/accounts/mfa/setup", {}, format="json")
        self.factor = MFAFactor.objects.get(id=resp.json()["factorId"])
        self.factor.enable()
        self.recovery_codes = resp.json()["recoveryCodes"]

    def test_valid_recovery_code(self):
        resp = self.client.post("/api/v1/accounts/mfa/recovery", {
            "recoveryCode": self.recovery_codes[0],
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "verified")

    def test_invalid_recovery_code(self):
        resp = self.client.post("/api/v1/accounts/mfa/recovery", {
            "recoveryCode": "INVALID12345",
        }, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_recovery_code_consumed(self):
        # Use the code
        self.client.post("/api/v1/accounts/mfa/recovery", {
            "recoveryCode": self.recovery_codes[0],
        }, format="json")

        # Try to use it again — should fail
        resp = self.client.post("/api/v1/accounts/mfa/recovery", {
            "recoveryCode": self.recovery_codes[0],
        }, format="json")
        self.assertEqual(resp.status_code, 400)


class MFADisableTest(TestCase):
    """Tests for MFA disable endpoint (spec §22)."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

        resp = self.client.post("/api/v1/accounts/mfa/setup", {}, format="json")
        self.factor = MFAFactor.objects.get(id=resp.json()["factorId"])
        self.factor.enable()
        self.secret = resp.json()["secret"]

    def test_disable_with_totp(self):
        code = _generate_valid_totp(self.secret)
        resp = self.client.post("/api/v1/accounts/mfa/disable", {"code": code}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.factor.refresh_from_db()
        self.assertFalse(self.factor.enabled)

    def test_disable_with_password(self):
        resp = self.client.post("/api/v1/accounts/mfa/disable", {"password": "testpass123"}, format="json")
        self.assertEqual(resp.status_code, 200)

    def test_disable_without_verification(self):
        resp = self.client.post("/api/v1/accounts/mfa/disable", {}, format="json")
        self.assertEqual(resp.status_code, 400)


class MFAHelperTest(TestCase):
    """Tests for MFA helper functions (spec §22)."""

    def test_is_privileged_role(self):
        self.assertTrue(is_privileged_role(SystemRole.SUPER_ADMIN))
        self.assertTrue(is_privileged_role(SystemRole.REGIONAL_ADMIN))
        self.assertTrue(is_privileged_role(SystemRole.DISTRICT_ADMIN))
        self.assertFalse(is_privileged_role(SystemRole.FACILITY_CLINICAL_USER))
        self.assertFalse(is_privileged_role(SystemRole.READ_ONLY))

    def test_mfa_required_for_privileged_without_mfa(self):
        org = _make_org()
        user = _make_user(org, role=SystemRole.REGIONAL_ADMIN)
        self.assertTrue(mfa_required_for_user(user))

    def test_mfa_not_required_for_facility_user(self):
        org = _make_org()
        user = _make_user(org, role=SystemRole.FACILITY_CLINICAL_USER)
        self.assertFalse(mfa_required_for_user(user))

    def test_mfa_not_required_when_enabled(self):
        org = _make_org()
        user = _make_user(org, role=SystemRole.SUPER_ADMIN)
        MFAFactor.objects.create(user=user, secret="JBSWY3DPEHPK3PXP", enabled=True)
        self.assertFalse(mfa_required_for_user(user))


class MLMonitoringTest(TestCase):
    """Tests for ML monitoring endpoint (spec §27.2)."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_monitoring_requires_admin(self):
        # Create a facility user
        from apps.core.enums import SystemRole
        facility_user = UserAccount.objects.create_user(
            username="facilityuser", password="testpass123",
            organisation_unit=self.org, system_role=SystemRole.FACILITY_CLINICAL_USER,
        )
        refresh = RefreshToken.for_user(facility_user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

        resp = self.client.get("/api/v1/ml/monitoring")
        self.assertEqual(resp.status_code, 403)

    def test_monitoring_returns_metrics(self):
        resp = self.client.get("/api/v1/ml/monitoring")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("predictions", data)
        self.assertIn("safety", data)
        self.assertIn("risk_band_distribution_7d", data)
        self.assertIn("alerts", data)
