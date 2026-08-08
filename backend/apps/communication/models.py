"""Communication models — campaigns, templates, logs."""
import uuid
from django.db import models
from apps.core.enums import CampaignChannel, CampaignStatus, Language
from apps.core.models import TimeStampedModel


class MessageTemplate(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    channel = models.CharField(max_length=20, choices=CampaignChannel.choices, default=CampaignChannel.SMS)
    language = models.CharField(max_length=10, choices=Language.choices, default=Language.ENGLISH)
    content = models.TextField()
    status = models.CharField(max_length=20, default="DRAFT")

    class Meta:
        ordering = ["-created_at"]


class CommunicationCampaign(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    channel = models.CharField(max_length=20, choices=CampaignChannel.choices, default=CampaignChannel.SMS)
    status = models.CharField(max_length=20, choices=CampaignStatus.choices, default=CampaignStatus.DRAFT)
    template = models.ForeignKey(MessageTemplate, on_delete=models.SET_NULL, null=True, blank=True)
    audience_count = models.PositiveIntegerField(default=0)
    scheduled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class CommunicationLog(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    campaign = models.ForeignKey(CommunicationCampaign, on_delete=models.SET_NULL, null=True, blank=True, related_name="logs")
    recipient = models.CharField(max_length=200)
    channel = models.CharField(max_length=20, choices=CampaignChannel.choices)
    status = models.CharField(max_length=20, default="PENDING")
    sent_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
