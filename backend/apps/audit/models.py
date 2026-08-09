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
    pregnancy_episode_id = models.UUIDField(null=True, blank=True, verbose_name="Pregnancy Episode ID")
    referral_episode_id = models.UUIDField(null=True, blank=True, verbose_name="Referral Episode ID")
    facility_id = models.UUIDField(null=True, blank=True)
    device_id = models.CharField(max_length=100, blank=True)
    purpose = models.CharField(max_length=50, default="DIRECT_CARE")
    metadata = models.JSONField(default=dict)
    occurred_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-occurred_at"]
        verbose_name = "Audit Event"
        verbose_name_plural = "Audit Events"

    def save(self, *args, **kwargs):
        """AuditEvent records are append-only — updates are forbidden (spec §23).

        Normal creation (no pk yet, or force_insert=True) is allowed.
        Any subsequent save on an existing record raises ValueError.
        """
        force_insert = kwargs.get("force_insert", False)
        if self.pk and not force_insert:
            raise ValueError("AuditEvent records are append-only and cannot be modified.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        """AuditEvent records are append-only — deletion is forbidden (spec §23)."""
        raise ValueError("AuditEvent records are append-only and cannot be deleted.")
