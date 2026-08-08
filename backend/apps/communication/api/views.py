"""Communication API views."""
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from apps.communication.models import MessageTemplate, CommunicationCampaign, CommunicationLog
from apps.communication.api.serializers import (
    MessageTemplateSerializer, CommunicationCampaignSerializer, CommunicationLogSerializer,
)


class MessageTemplateViewSet(viewsets.ModelViewSet):
    queryset = MessageTemplate.objects.all()
    serializer_class = MessageTemplateSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["channel", "language", "status"]


class CommunicationCampaignViewSet(viewsets.ModelViewSet):
    queryset = CommunicationCampaign.objects.all()
    serializer_class = CommunicationCampaignSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["status", "channel"]


class CommunicationLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = CommunicationLog.objects.all()
    serializer_class = CommunicationLogSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["campaign", "status"]
