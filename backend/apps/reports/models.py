"""Report models — generated reports and scheduled reports."""
import uuid
from django.db import models
from apps.core.enums import ReportType, ReportStatus
from apps.core.models import TimeStampedModel


class Report(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    report_type = models.CharField(max_length=50, choices=ReportType.choices)
    period_start = models.DateField(null=True, blank=True)
    period_end = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=ReportStatus.choices, default=ReportStatus.PENDING)
    generated_at = models.DateTimeField(null=True, blank=True)
    data_snapshot = models.JSONField(default=dict)

    class Meta:
        ordering = ["-created_at"]


class ScheduledReport(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    report_type = models.CharField(max_length=50, choices=ReportType.choices)
    frequency = models.CharField(max_length=20, default="MONTHLY")
    next_run = models.DateTimeField(null=True, blank=True)
    last_run = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, default="ACTIVE")

    class Meta:
        ordering = ["-created_at"]
