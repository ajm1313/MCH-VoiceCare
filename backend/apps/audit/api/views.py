"""Audit API views."""
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema
from apps.audit.models import AuditEvent
from apps.audit.api.serializers import AuditEventSerializer


@extend_schema(tags=["audit"])
class AuditEventViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditEvent.objects.all().order_by("-occurred_at")
    serializer_class = AuditEventSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["action", "actor", "entity_type"]
