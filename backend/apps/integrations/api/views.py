"""Integration API views."""
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from apps.integrations.models import IntegrationConfig, ImportBatch, ImportRecord
from apps.integrations.api.serializers import (
    IntegrationConfigSerializer, ImportBatchSerializer, ImportRecordSerializer,
)
from apps.core.mixins import ReadOnlyUnlessWriterMixin
from drf_spectacular.utils import extend_schema


@extend_schema(tags=["integrations"])
class IntegrationConfigViewSet(ReadOnlyUnlessWriterMixin, viewsets.ModelViewSet):
    queryset = IntegrationConfig.objects.all()
    serializer_class = IntegrationConfigSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["config_type", "status"]


@extend_schema(tags=["integrations"])
class ImportBatchViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ImportBatch.objects.all()
    serializer_class = ImportBatchSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["status"]


@extend_schema(tags=["integrations"])
class ImportRecordViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ImportRecord.objects.all()
    serializer_class = ImportRecordSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["batch", "status"]
