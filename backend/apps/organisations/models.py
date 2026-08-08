"""
Organisation hierarchy: Region / District / Sub-district / Facility (spec §21.1).
"""
import uuid

from django.db import models

from apps.core.enums import OrganisationUnitType, FacilityType
from apps.core.models import TimeStampedModel


class OrganisationUnit(TimeStampedModel):
    """Hierarchical organisation unit — region, district, sub-district, or facility."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=50, unique=True, blank=True)
    unit_type = models.CharField(
        max_length=20,
        choices=OrganisationUnitType.choices,
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
    )
    facility_type = models.CharField(
        max_length=30,
        choices=FacilityType.choices,
        blank=True,
        default="",
    )
    latitude = models.DecimalField(
        max_digits=10, decimal_places=7, null=True, blank=True
    )
    longitude = models.DecimalField(
        max_digits=10, decimal_places=7, null=True, blank=True
    )
    status = models.CharField(max_length=20, default="ACTIVE")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["unit_type", "name"]

    def __str__(self):
        return f"{self.name} ({self.get_unit_type_display()})"

    @property
    def path(self) -> str:
        """Return full hierarchical path like /Northern/Tolon/Sub-X/Facility-Y."""
        parts = [self.name]
        node = self.parent
        while node:
            parts.append(node.name)
            node = node.parent
        return "/" + "/".join(reversed(parts))


class FacilityCapability(TimeStampedModel):
    """Facility capability registry (spec §18.1)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    facility = models.ForeignKey(
        OrganisationUnit,
        on_delete=models.CASCADE,
        related_name="capabilities",
        limit_choices_to={"unit_type": OrganisationUnitType.FACILITY},
    )
    maternity_triage_24_7 = models.BooleanField(default=False)
    bemonc = models.BooleanField(default=False, help_text="Basic Emergency Obstetric Care")
    cemonc = models.BooleanField(default=False, help_text="Comprehensive Emergency Obstetric Care")
    theatre = models.BooleanField(default=False)
    blood = models.BooleanField(default=False)
    specialist_obstetrics = models.BooleanField(default=False)
    newborn_support = models.BooleanField(default=False)
    primary_referral_destination = models.ForeignKey(
        OrganisationUnit,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="primary_referrals_from",
    )
    backup_referral_destination = models.ForeignKey(
        OrganisationUnit,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="backup_referrals_from",
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    verification_expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["facility__name"]

    def __str__(self):
        return f"Capabilities for {self.facility.name}"
