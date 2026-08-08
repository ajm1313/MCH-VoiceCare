"""
Base models with UUID PKs, timestamps, and audit fields.
"""
import uuid

from django.db import models

from .enums import SyncStatus


class TimeStampedModel(models.Model):
    """Abstract base with created_at / updated_at."""
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class UUIDModel(TimeStampedModel):
    """Abstract base with UUID PK."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class SyncedModel(UUIDModel):
    """Abstract base with sync_status for offline-first records."""
    sync_status = models.CharField(
        max_length=20,
        choices=SyncStatus.choices,
        default=SyncStatus.SYNCED,
    )

    class Meta:
        abstract = True
