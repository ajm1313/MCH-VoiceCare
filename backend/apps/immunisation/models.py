"""
Immunisation models — child registration, vaccine doses, CWC sessions, defaulters.
"""
import uuid

from django.db import models

from apps.core.enums import (
    DefaulterStatus, TraceStatus, CWCSessionType, CWCSessionStatus,
)
from apps.core.models import TimeStampedModel
from apps.clients.models import Person


class ChildImmunisationRecord(TimeStampedModel):
    """Immunisation enrolment record for a child under 2."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    child = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="immunisation_records")
    primary_caregiver = models.ForeignKey(
        Person, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="immunisation_dependents",
    )
    date_of_birth = models.DateField(null=True, blank=True)
    cwc_card_number = models.CharField(max_length=50, blank=True)
    residence_status = models.CharField(max_length=30, blank=True)
    current_chps = models.CharField(max_length=200, blank=True)

    # Tracking
    next_due_date = models.DateField(null=True, blank=True)
    defaulter_status = models.CharField(
        max_length=20, choices=DefaulterStatus.choices, default=DefaulterStatus.ACTIVE,
    )
    overdue_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Immunisation: {self.child.full_name}"


class VaccineDose(TimeStampedModel):
    """A single vaccine dose administered to a child."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    child_record = models.ForeignKey(
        ChildImmunisationRecord, on_delete=models.CASCADE, related_name="doses",
    )
    vaccine_code = models.CharField(max_length=50)
    vaccine_name = models.CharField(max_length=100, blank=True)
    dose_number = models.PositiveIntegerField()
    administration_date = models.DateField()
    batch_lot = models.CharField(max_length=50, blank=True)
    product_name = models.CharField(max_length=100, blank=True)
    route_site = models.CharField(max_length=50, blank=True)
    administered_by = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-administration_date"]


class CWCSession(TimeStampedModel):
    """Child Welfare Clinic session."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    facility_name = models.CharField(max_length=200)
    session_date = models.DateField()
    session_type = models.CharField(max_length=20, choices=CWCSessionType.choices, default=CWCSessionType.FIXED)
    status = models.CharField(max_length=20, choices=CWCSessionStatus.choices, default=CWCSessionStatus.PLANNED)
    expected_count = models.PositiveIntegerField(default=0)
    attended_count = models.PositiveIntegerField(default=0)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-session_date"]


class CWCSessionAttendance(TimeStampedModel):
    """Attendance record for a child at a CWC session."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(CWCSession, on_delete=models.CASCADE, related_name="attendance")
    child = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="cwc_attendance")
    attended = models.BooleanField(default=False)
    doses_given = models.JSONField(default=list)
    growth_recorded = models.BooleanField(default=False)
    notes = models.TextField(blank=True)

    class Meta:
        unique_together = [("session", "child")]


class DefaulterEpisode(TimeStampedModel):
    """A defaulter episode for a child missing immunisation."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    child_record = models.ForeignKey(
        ChildImmunisationRecord, on_delete=models.CASCADE, related_name="defaulter_episodes",
    )
    child_name = models.CharField(max_length=200, blank=True)
    defaulter_status = models.CharField(
        max_length=20, choices=DefaulterStatus.choices, default=DefaulterStatus.ACTIVE,
    )
    days_overdue = models.PositiveIntegerField(default=0)
    last_visit_date = models.DateField(null=True, blank=True)
    next_due_date = models.DateField(null=True, blank=True)
    reason = models.TextField(blank=True)
    trace_status = models.CharField(max_length=20, choices=TraceStatus.choices, default=TraceStatus.PENDING)
    traced_at = models.DateTimeField(null=True, blank=True)
    trace_notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
