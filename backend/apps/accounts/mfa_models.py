"""
MFA models — TOTP-based multi-factor authentication (spec §22).

Privileged admin roles SHOULD require MFA when online (spec §22).
This implements TOTP-based MFA using the standard 30-second window.
"""
import base64
import hashlib
import hmac
import struct
import time
import uuid

from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel
from apps.core.enums import SystemRole


class MFAFactor(TimeStampedModel):
    """
    A TOTP MFA factor for a user (spec §22).

    Stores the shared secret and recovery codes.
    The secret is stored as a base32-encoded string.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        "accounts.UserAccount", on_delete=models.CASCADE, related_name="mfa_factors",
    )
    secret = models.CharField(max_length=64, verbose_name="Base32-encoded TOTP secret")
    label = models.CharField(max_length=100, default="Default TOTP")
    enabled = models.BooleanField(default=False)
    verified_at = models.DateTimeField(null=True, blank=True)

    # Recovery codes (hashed) for backup access
    recovery_codes_hashed = models.JSONField(default=list)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"MFA for {self.user.username} ({'enabled' if self.enabled else 'disabled'})"

    @staticmethod
    def generate_secret() -> str:
        """Generate a random TOTP secret (base32-encoded)."""
        import secrets
        raw = secrets.token_bytes(20)
        return base64.b32encode(raw).decode("utf-8")

    @staticmethod
    def generate_recovery_codes(count=10) -> list:
        """Generate recovery codes (returns plaintext codes)."""
        import secrets
        return [secrets.token_hex(8).upper() for _ in range(count)]

    @staticmethod
    def hash_recovery_code(code: str) -> str:
        """Hash a recovery code for storage."""
        return hashlib.sha256(code.encode()).hexdigest()

    def set_recovery_codes(self, codes: list) -> None:
        """Store hashed recovery codes."""
        self.recovery_codes_hashed = [self.hash_recovery_code(c) for c in codes]
        self.save(update_fields=["recovery_codes_hashed", "updated_at"])

    def verify_recovery_code(self, code: str) -> bool:
        """Verify and consume a recovery code."""
        hashed = self.hash_recovery_code(code.upper().strip())
        if hashed in self.recovery_codes_hashed:
            # Consume the code (remove it)
            self.recovery_codes_hashed.remove(hashed)
            self.save(update_fields=["recovery_codes_hashed", "updated_at"])
            return True
        return False

    def verify_totp(self, code: str, window: int = 1) -> bool:
        """
        Verify a TOTP code against the secret.

        Args:
            code: 6-digit TOTP code from the authenticator app
            window: Number of time steps to check before/after current (default 1)

        Returns:
            True if the code is valid within the window
        """
        if not code or not code.isdigit() or len(code) != 6:
            return False

        try:
            secret_bytes = base64.b32decode(self.secret, casefold=True)
        except Exception:
            return False

        current_step = int(time.time() // 30)

        # Check current step and window
        for offset in range(-window, window + 1):
            step = current_step + offset
            expected = self._generate_totp(secret_bytes, step)
            if hmac.compare_digest(str(expected).zfill(6), code):
                return True

        return False

    @staticmethod
    def _generate_totp(secret_bytes: bytes, step: int) -> int:
        """Generate a TOTP code for a given time step."""
        msg = struct.pack(">Q", step)
        h = hmac.new(secret_bytes, msg, hashlib.sha1).digest()
        offset = h[-1] & 0x0F
        code = struct.unpack(">I", h[offset:offset + 4])[0] & 0x7FFFFFFF
        return code % 1000000

    def enable(self) -> None:
        """Mark the MFA factor as enabled and verified."""
        self.enabled = True
        self.verified_at = timezone.now()
        self.save(update_fields=["enabled", "verified_at", "updated_at"])

    def disable(self) -> None:
        """Disable the MFA factor."""
        self.enabled = False
        self.verified_at = None
        self.save(update_fields=["enabled", "verified_at", "updated_at"])


def is_privileged_role(system_role: str) -> bool:
    """Check if a role requires MFA (spec §22)."""
    return system_role in (
        SystemRole.SUPER_ADMIN,
        SystemRole.REGIONAL_ADMIN,
        SystemRole.DISTRICT_ADMIN,
        SystemRole.SUBDISTRICT_ADMIN,
    )


def user_has_mfa_enabled(user) -> bool:
    """Check if a user has at least one enabled MFA factor."""
    return user.mfa_factors.filter(enabled=True).exists()


def mfa_required_for_user(user) -> bool:
    """
    Check if MFA is required for this user (spec §22).

    Privileged admin roles SHOULD require MFA when online.
    """
    return is_privileged_role(user.system_role) and not user_has_mfa_enabled(user)
