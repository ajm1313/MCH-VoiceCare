"""Communication API serializers."""
from rest_framework import serializers
from apps.communication.models import MessageTemplate, CommunicationCampaign, CommunicationLog


class MessageTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MessageTemplate
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class CommunicationCampaignSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommunicationCampaign
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class CommunicationLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommunicationLog
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]
