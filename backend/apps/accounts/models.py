"""
UserAccount model — custom user with role-based access (spec §21).
Device model — device provisioning and revocation (spec §22.1).
"""
import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models

from apps.core.enums import SystemRole
from apps.core.models import TimeStampedModel


class UserAccount(AbstractUser):
    """Custom user with MCH VoiceCare-specific fields."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Extra profile fields
    full_name = models.CharField(max_length=200, blank=True)
    mobile_number = models.CharField(max_length=20, blank=True)
    is_super_admin = models.BooleanField(default=False)

    # System role (spec §21.2)
    system_role = models.CharField(
        max_length=30,
        choices=SystemRole.choices,
        default=SystemRole.FACILITY_CLINICAL_USER,
    )

    # Link to organisation unit (facility or higher)
    organisation_unit = models.ForeignKey(
        "organisations.OrganisationUnit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="users",
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date_joined"]

    def __str__(self):
        return self.full_name or self.username

    @property
    def is_facility_level_only(self) -> bool:
        return self.system_role in (
            SystemRole.FACILITY_CLINICAL_USER,
            SystemRole.READ_ONLY,
        )

    @property
    def role_code(self) -> str:
        return self.system_role

    @property
    def role_name(self) -> str:
        return self.get_system_role_display()

    @property
    def role_level(self) -> int:
        levels = {
            SystemRole.SUPER_ADMIN: 0,
            SystemRole.REGIONAL_ADMIN: 1,
            SystemRole.DISTRICT_ADMIN: 2,
            SystemRole.SUBDISTRICT_ADMIN: 3,
            SystemRole.FACILITY_CLINICAL_USER: 4,
            SystemRole.READ_ONLY: 5,
        }
        return levels.get(self.system_role, 5)


class UserRoleScope(models.Model):
    """Role-scope assignment linking a user to a role at a specific org unit."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        UserAccount,
        on_delete=models.CASCADE,
        related_name="role_scopes",
    )
    role_code = models.CharField(max_length=30, choices=SystemRole.choices)
    scope_unit = models.ForeignKey(
        "organisations.OrganisationUnit",
        on_delete=models.CASCADE,
        related_name="user_scopes",
    )
    assigned_by = models.ForeignKey(
        UserAccount,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="scope_assignments",
    )
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-assigned_at"]
        unique_together = [("user", "role_code", "scope_unit")]

    def __str__(self):
        return f"{self.user.username} — {self.get_role_code_display()} @ {self.scope_unit}"


class Device(TimeStampedModel):
    """Registered mobile device for offline-first provisioning (spec §22.1).

    Tracks device identity, facility assignment, public key, minimum
    supported app version, and revocation status.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device_id = models.CharField(max_length=200, unique=True, verbose_name="Device ID")
    facility = models.ForeignKey(
        "organisations.OrganisationUnit",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="devices",
    )
    public_key = models.TextField(blank=True, verbose_name="Public Key")
    minimum_app_version = models.CharField(max_length=50, blank=True)
    is_revoked = models.BooleanField(default=False)
    revoked_at = models.DateTimeField(null=True, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.device_id} ({'revoked' if self.is_revoked else 'active'})"

    def revoke(self):
        """Mark this device as revoked."""
        from django.utils import timezone
        self.is_revoked = True
        self.revoked_at = timezone.now()
        self.save(update_fields=["is_revoked", "revoked_at", "updated_at"])
