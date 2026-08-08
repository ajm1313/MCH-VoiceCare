"""Report API serializers."""
from rest_framework import serializers
from apps.reports.models import Report, ScheduledReport


class ReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = Report
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at", "generated_at"]


class ScheduledReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScheduledReport
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]
