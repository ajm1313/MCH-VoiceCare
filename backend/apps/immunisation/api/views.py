"""Immunisation API views."""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema

from apps.immunisation.models import (
    ChildImmunisationRecord, VaccineDose, CWCSession, CWCSessionAttendance, DefaulterEpisode,
)
from apps.immunisation.api.serializers import (
    ChildImmunisationRecordSerializer, VaccineDoseSerializer,
    CWCSessionSerializer, CWCSessionAttendanceSerializer, DefaulterEpisodeSerializer,
)
from apps.core.mixins import RelatedOrgScopedViewSet
from apps.immunisation.rule_engine import run_defaulter_assessment
from apps.audit.services import log_audit
from apps.notifications.services import create_defaulter_notification


@extend_schema(tags=["immunisation"])
class ChildImmunisationRecordViewSet(RelatedOrgScopedViewSet, viewsets.ModelViewSet):
    queryset = ChildImmunisationRecord.objects.all().select_related("child")
    serializer_class = ChildImmunisationRecordSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["child", "defaulter_status"]
    search_fields = ["child__full_name", "cwc_card_number"]
    org_lookup = "child__organisation_unit"

    @action(detail=True, methods=["post"])
    def assess(self, request, pk=None):
        """Run the immunisation defaulter prediction engine."""
        record = self.get_object()
        result = run_defaulter_assessment(record)

        record.defaulter_status = result["defaulter_status"]
        record.overdue_count = len(result["missing_vaccines"])
        record.save(update_fields=["defaulter_status", "overdue_count", "updated_at"])

        log_audit(
            actor=request.user.username,
            action="DEFaulTER_ASSESSMENT",
            actor_role=request.user.system_role,
            entity_type="ChildImmunisationRecord",
            entity_id=str(record.id),
            patient_id=record.child_id,
            purpose="DIRECT_CARE",
            metadata={
                "risk_level": result["risk_level"],
                "defaulter_status": result["defaulter_status"],
                "overdue_count": len(result["missing_vaccines"]),
            },
        )

        create_defaulter_notification(record, result)

        return Response({
            "risk_level": result["risk_level"],
            "defaulter_status": result["defaulter_status"],
            "overdue_count": len(result["missing_vaccines"]),
            "missing_vaccines": result["missing_vaccines"],
            "recommended_action": result["recommended_action"],
            "rule_set_version": result["rule_set_version"],
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["immunisation"])
class VaccineDoseViewSet(RelatedOrgScopedViewSet, viewsets.ModelViewSet):
    queryset = VaccineDose.objects.all().select_related("child_record")
    serializer_class = VaccineDoseSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["child_record", "vaccine_code"]
    org_lookup = "child_record__child__organisation_unit"


@extend_schema(tags=["immunisation"])
class CWCSessionViewSet(viewsets.ModelViewSet):
    queryset = CWCSession.objects.all()
    serializer_class = CWCSessionSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["status", "session_type"]


@extend_schema(tags=["immunisation"])
class CWCSessionAttendanceViewSet(RelatedOrgScopedViewSet, viewsets.ModelViewSet):
    queryset = CWCSessionAttendance.objects.all().select_related("session", "child")
    serializer_class = CWCSessionAttendanceSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["session", "child", "attended"]
    org_lookup = "child__organisation_unit"


@extend_schema(tags=["immunisation"])
class DefaulterEpisodeViewSet(RelatedOrgScopedViewSet, viewsets.ModelViewSet):
    queryset = DefaulterEpisode.objects.all().select_related("child_record")
    serializer_class = DefaulterEpisodeSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["defaulter_status", "trace_status"]
    org_lookup = "child_record__child__organisation_unit"
