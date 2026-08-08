"""Audit event model — append-only (spec §23)."""
import uuid
from django.db import models
from apps.core.models import TimeStampedModel


class AuditEvent(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.CharField(max_length=200)
    actor_role = models.CharField(max_length=50, blank=True)
    action = models.CharField(max_length=100)
    entity_type = models.CharField(max_length=50, blank=True)
    entity_id = models.CharField(max_length=100, blank=True)
    patient_id = models.UUIDField(null=True, blank=True)
    facility_id = models.UUIDField(null=True, blank=True)
    device_id = models.CharField(max_length=100, blank=True)
    purpose = models.CharField(max_length=50, default="DIRECT_CARE")
    metadata = models.JSONField(default=dict)
    occurred_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-occurred_at"]
        verbose_name = "Audit Event"
        verbose_name_plural = "Audit Events"
