"""Referral models — state machine per spec §18.3."""
import uuid
from django.db import models
from apps.core.enums import ReferralStatus, UrgencyLevel
from apps.core.models import TimeStampedModel
from apps.clients.models import Person
from apps.organisations.models import OrganisationUnit


class Referral(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="referrals")
    pregnancy_episode = models.ForeignKey(
        "pregnancy.PregnancyEpisode", on_delete=models.SET_NULL, null=True, blank=True,
    )
    newborn_episode = models.ForeignKey(
        "newborn.NewbornEpisode", on_delete=models.SET_NULL, null=True, blank=True,
    )
    referral_reason = models.TextField(blank=True)
    referring_facility = models.ForeignKey(
        OrganisationUnit, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="outgoing_referrals",
    )
    destination_facility = models.ForeignKey(
        OrganisationUnit, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="incoming_referrals",
    )
    status = models.CharField(
        max_length=40, choices=ReferralStatus.choices, default=ReferralStatus.DRAFT,
    )
    urgency = models.CharField(
        max_length=20, choices=UrgencyLevel.choices, default=UrgencyLevel.ROUTINE,
    )
    pre_referral_care = models.TextField(blank=True)

    # Transport (spec §18.3)
    transport_mode = models.CharField(max_length=50, blank=True)
    estimated_transport_time_minutes = models.PositiveIntegerField(null=True, blank=True)
    transport_requested_at = models.DateTimeField(null=True, blank=True)
    in_transit_at = models.DateTimeField(null=True, blank=True)

    qr_token = models.CharField(max_length=200, blank=True)
    short_code = models.CharField(max_length=20, blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    arrived_at = models.DateTimeField(null=True, blank=True)
    disposition = models.TextField(blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.CharField(max_length=200, blank=True)

    # Optimistic concurrency (spec §19.4) — FHIR meta.versionId / ETag
    version = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Referral: {self.patient.full_name} ({self.status})"


class ReferralStateLog(TimeStampedModel):
    """Append-only log of referral state transitions."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    referral = models.ForeignKey(Referral, on_delete=models.CASCADE, related_name="state_logs")
    from_status = models.CharField(max_length=40, blank=True)
    to_status = models.CharField(max_length=40)
    actor = models.CharField(max_length=200, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
