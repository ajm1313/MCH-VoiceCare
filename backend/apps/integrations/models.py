"""Integration models — external system configs and import batches."""
import uuid
from django.db import models
from apps.core.enums import IntegrationType, ImportStatus
from apps.core.models import TimeStampedModel


class IntegrationConfig(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    config_type = models.CharField(max_length=30, choices=IntegrationType.choices)
    provider_name = models.CharField(max_length=200)
    status = models.CharField(max_length=20, default="ACTIVE")
    base_url = models.URLField(blank=True)
    api_key_ref = models.CharField(max_length=200, blank=True, help_text="Reference to secret, not the key itself")
    config_data = models.JSONField(default=dict)

    class Meta:
        ordering = ["-created_at"]


class ImportBatch(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file_name = models.CharField(max_length=200)
    status = models.CharField(max_length=20, choices=ImportStatus.choices, default=ImportStatus.PENDING)
    total_records = models.PositiveIntegerField(default=0)
    valid_records = models.PositiveIntegerField(default=0)
    error_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-created_at"]


class ImportRecord(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    batch = models.ForeignKey(ImportBatch, on_delete=models.CASCADE, related_name="records")
    row_number = models.PositiveIntegerField()
    person_id = models.UUIDField(null=True, blank=True)
    status = models.CharField(max_length=20, default="COMMITTED")
    error_message = models.TextField(blank=True)
    raw_data = models.JSONField(default=dict)

    class Meta:
        ordering = ["row_number"]
