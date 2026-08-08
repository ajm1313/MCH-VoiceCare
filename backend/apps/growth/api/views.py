"""Growth API views."""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from apps.growth.models import GrowthMeasurement
from apps.growth.api.serializers import GrowthMeasurementSerializer
from apps.core.mixins import RelatedOrgScopedViewSet
from apps.growth.rule_engine import run_growth_assessment
from apps.audit.services import log_rule_evaluation
from apps.notifications.services import process_rule_assessment


class GrowthMeasurementViewSet(RelatedOrgScopedViewSet, viewsets.ModelViewSet):
    queryset = GrowthMeasurement.objects.all().select_related("child")
    serializer_class = GrowthMeasurementSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["child", "indicator"]
    search_fields = ["child__full_name"]
    org_lookup = "child__organisation_unit"

    @action(detail=True, methods=["post"])
    def assess(self, request, pk=None):
        """Run the growth monitoring rule engine."""
        measurement = self.get_object()
        result = run_growth_assessment(measurement)

        if "indicator" in result:
            measurement.indicator = result["indicator"]
            measurement.save(update_fields=["indicator", "updated_at"])

        log_rule_evaluation(
            actor=request.user.username,
            episode_type="GrowthMeasurement",
            episode_id=measurement.id,
            disposition=result["disposition"],
            fired_rules=result["fired_rules"],
            patient_id=measurement.child_id,
            actor_role=request.user.system_role,
        )

        process_rule_assessment(
            result, "GrowthMeasurement", measurement.id,
            patient_name=measurement.child.full_name,
            patient_id=measurement.child_id,
        )

        return Response({
            "disposition": result["disposition"],
            "fired_rules": result["fired_rules"],
            "recommended_action": result["recommended_action"],
            "rule_set_version": result["rule_set_version"],
        }, status=status.HTTP_200_OK)
