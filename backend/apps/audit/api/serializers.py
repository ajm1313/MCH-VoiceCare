"""Audit API serializers."""
from rest_framework import serializers
from apps.audit.models import AuditEvent


class AuditEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditEvent
        fields = "__all__"
        read_only_fields = ["id", "occurred_at", "created_at", "updated_at"]
