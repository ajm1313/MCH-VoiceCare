"""Report API views."""
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from apps.reports.models import Report, ScheduledReport
from apps.reports.api.serializers import ReportSerializer, ScheduledReportSerializer
from apps.core.mixins import ReadOnlyUnlessWriterMixin


class ReportViewSet(ReadOnlyUnlessWriterMixin, viewsets.ModelViewSet):
    queryset = Report.objects.all()
    serializer_class = ReportSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["report_type", "status"]


class ScheduledReportViewSet(ReadOnlyUnlessWriterMixin, viewsets.ModelViewSet):
    queryset = ScheduledReport.objects.all()
    serializer_class = ScheduledReportSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["status", "frequency"]
