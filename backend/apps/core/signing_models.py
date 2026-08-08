"""
Package signing key management (spec §4.2, §24).

Each signing key pair is versioned. The public key is stored server-side and
used by both the backend (to verify package signatures on activation) and the
mobile app (to verify downloaded rule/model/config packages before activation).

Signing algorithm: Ed25519 (RFC 8032). Private keys are NEVER stored in the
database or repository — they are held out-of-band by the approved signing
authority and used only by the signing tooling.
"""
import uuid

from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel


class SigningKey(TimeStampedModel):
    """
    A public signing key used to verify package signatures (spec §24).

    Only the public key is stored. The corresponding private key is held
    out-of-band by the approved signing authority.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key_id = models.CharField(max_length=100, unique=True, verbose_name="Key ID")
    public_key_base64 = models.TextField(verbose_name="Public Key (base64-encoded Ed25519)")
    algorithm = models.CharField(max_length=20, default="Ed25519")
    status = models.CharField(
        max_length=20,
        choices=[("ACTIVE", "Active"), ("REVOKED", "Revoked"), ("SUPERSEDED", "Superseded")],
        default="ACTIVE",
    )
    activated_at = models.DateTimeField(default=timezone.now)
    revoked_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-activated_at"]
        indexes = [models.Index(fields=["key_id", "status"], name="signing_key_id_status_idx")]

    def __str__(self):
        return f"{self.key_id} ({self.algorithm}, {self.status})"

    @classmethod
    def get_active_key(cls, key_id: str) -> "SigningKey | None":
        """Return the active signing key for the given key_id, or None."""
        return cls.objects.filter(key_id=key_id, status="ACTIVE").first()
