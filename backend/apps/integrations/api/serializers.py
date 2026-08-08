"""Integration API serializers."""
from rest_framework import serializers
from apps.integrations.models import IntegrationConfig, ImportBatch, ImportRecord


class IntegrationConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = IntegrationConfig
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ImportBatchSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportBatch
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ImportRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportRecord
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]
