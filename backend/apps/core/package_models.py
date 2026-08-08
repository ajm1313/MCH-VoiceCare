"""
Package management model — versioned clinical rule bundles, ML models,
OCR models, telephony prompt packs, and configuration packages (spec §24).

Each package has sha256, signature, status (staged|active|retired|revoked).
Activation is transactional — if validation fails, previous active package
remains in use.
"""
import uuid

from django.db import models, transaction
from django.utils import timezone

from apps.core.models import TimeStampedModel


PACKAGE_TYPES = [
    ("CLINICAL_RULES", "Clinical Rule Bundle"),
    ("CLINICAL_ML_MODEL", "Clinical ML Model"),
    ("ENGAGEMENT_MODEL", "Engagement Model"),
    ("OCR_MODEL", "OCR Model"),
    ("MCH_TEMPLATE", "MCH Template Definition"),
    ("TELEPHONY_PROMPT", "Telephony Prompt Pack"),
    ("REFERRAL_DIRECTORY", "Referral Capability/Contact Directory"),
    ("APP_CONFIG", "Application Configuration"),
]

PACKAGE_STATUS = [
    ("STAGED", "Staged"),
    ("ACTIVE", "Active"),
    ("RETIRED", "Retired"),
    ("REVOKED", "Revoked"),
]


class Package(TimeStampedModel):
    """A versioned, signed package (spec §24)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    package_id = models.CharField(max_length=200, verbose_name="Package ID")
    package_type = models.CharField(max_length=50, choices=PACKAGE_TYPES)
    version = models.CharField(max_length=50, verbose_name="Semver Version")
    created_at_pkg = models.DateTimeField(default=timezone.now)
    effective_from = models.DateTimeField(null=True, blank=True)
    minimum_app_version = models.CharField(max_length=50, blank=True)
    sha256 = models.CharField(max_length=64, verbose_name="SHA-256 Hash")
    signature = models.TextField(blank=True, verbose_name="Package Signature")
    signing_key_id = models.CharField(max_length=100, blank=True)
    previous_version = models.CharField(max_length=50, blank=True)
    status = models.CharField(max_length=20, choices=PACKAGE_STATUS, default="STAGED")
    payload = models.JSONField(default=dict, blank=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    retired_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["package_type", "status"]),
            models.Index(fields=["package_id", "version"]),
        ]

    def __str__(self):
        return f"{self.package_type} {self.version} ({self.status})"

    @classmethod
    @transaction.atomic
    def activate(cls, package_id, package_type, version, **kwargs):
        """
        Transactional activation (spec §24).
        Retires the current active package and activates the new one.
        If any step fails, the previous active package remains in use.
        """
        # Get or create the new package
        new_pkg = cls.objects.create(
            package_id=package_id,
            package_type=package_type,
            version=version,
            status="STAGED",
            **kwargs,
        )

        # Find and retire the current active package
        current = cls.objects.filter(
            package_type=package_type,
            status="ACTIVE",
        ).first()

        if current:
            current.status = "RETIRED"
            current.retired_at = timezone.now()
            current.save(update_fields=["status", "retired_at", "updated_at"])
            new_pkg.previous_version = current.version

        # Activate the new package
        new_pkg.status = "ACTIVE"
        new_pkg.activated_at = timezone.now()
        new_pkg.save(update_fields=["status", "activated_at", "previous_version", "updated_at"])

        return new_pkg

    @classmethod
    @transaction.atomic
    def rollback(cls, package_type):
        """
        Rollback to the previous version (spec §24).
        Retires the current active package and re-activates the previous one.
        """
        current = cls.objects.filter(
            package_type=package_type,
            status="ACTIVE",
        ).first()

        if not current or not current.previous_version:
            raise ValueError("No previous version available for rollback.")

        previous = cls.objects.filter(
            package_type=package_type,
            version=current.previous_version,
            status="RETIRED",
        ).first()

        if not previous:
            raise ValueError(f"Previous version {current.previous_version} not found or not retired.")

        # Retire current
        current.status = "RETIRED"
        current.retired_at = timezone.now()
        current.save(update_fields=["status", "retired_at", "updated_at"])

        # Re-activate previous
        previous.status = "ACTIVE"
        previous.activated_at = timezone.now()
        previous.retired_at = None
        previous.save(update_fields=["status", "activated_at", "retired_at", "updated_at"])

        return previous
