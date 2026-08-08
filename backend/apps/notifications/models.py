"""Notification and action record models."""
import uuid
from django.db import models
from apps.core.enums import NotificationClass, NotificationStatus, UrgencyLevel
from apps.core.models import TimeStampedModel


class Notification(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    notification_class = models.CharField(max_length=20, choices=NotificationClass.choices, default=NotificationClass.SYSTEM)
    status = models.CharField(max_length=20, choices=NotificationStatus.choices, default=NotificationStatus.OPEN)
    urgency = models.CharField(max_length=20, choices=UrgencyLevel.choices, default=UrgencyLevel.ROUTINE)
    due_datetime = models.DateTimeField(null=True, blank=True)
    related_entity_type = models.CharField(max_length=50, blank=True)
    related_entity_id = models.UUIDField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class ActionRecord(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    notification = models.ForeignKey(Notification, on_delete=models.CASCADE, related_name="actions")
    action_type = models.CharField(max_length=50)
    notes = models.TextField(blank=True)
    recorded_by = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-created_at"]
