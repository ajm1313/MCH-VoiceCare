"""Pregnancy API views."""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema

from apps.pregnancy.models import PregnancyEpisode, PregnancyObservation, PregnancyAssessment
from apps.pregnancy.api.serializers import (
    PregnancyEpisodeSerializer, PregnancyObservationSerializer, PregnancyAssessmentSerializer,
)
from apps.core.mixins import RelatedOrgScopedViewSet
from apps.rules import run_pregnancy_assessment
from apps.audit.services import log_rule_evaluation
from apps.notifications.services import process_rule_assessment


@extend_schema(tags=["pregnancy"])
class PregnancyEpisodeViewSet(RelatedOrgScopedViewSet, viewsets.ModelViewSet):
    queryset = PregnancyEpisode.objects.all().select_related("woman")
    serializer_class = PregnancyEpisodeSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["woman", "status"]
    search_fields = ["woman__full_name"]
    org_lookup = "woman__organisation_unit"

    @action(detail=True, methods=["post"])
    def assess(self, request, pk=None):
        """Run the pregnancy rule engine and persist the assessment."""
        episode = self.get_object()
        result = run_pregnancy_assessment(episode)

        assessment = PregnancyAssessment.objects.create(
            episode=episode,
            disposition=result["disposition"],
            fired_rules=result["fired_rules"],
            recommended_action=result["recommended_action"],
            rule_set_version=result["rule_set_version"],
        )

        episode.current_urgency = result["disposition"]
        episode.save(update_fields=["current_urgency", "updated_at"])

        log_rule_evaluation(
            actor=request.user.username,
            episode_type="PregnancyEpisode",
            episode_id=episode.id,
            disposition=result["disposition"],
            fired_rules=result["fired_rules"],
            patient_id=episode.woman_id,
            actor_role=request.user.system_role,
        )

        process_rule_assessment(
            result, "PregnancyEpisode", episode.id,
            patient_name=episode.woman.full_name,
            patient_id=episode.woman_id,
        )

        return Response({
            "assessment_id": str(assessment.id),
            "disposition": result["disposition"],
            "fired_rules": result["fired_rules"],
            "recommended_action": result["recommended_action"],
            "rule_set_version": result["rule_set_version"],
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["pregnancy"])
class PregnancyObservationViewSet(RelatedOrgScopedViewSet, viewsets.ModelViewSet):
    queryset = PregnancyObservation.objects.all().select_related("episode")
    serializer_class = PregnancyObservationSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["episode"]
    org_lookup = "episode__woman__organisation_unit"


@extend_schema(tags=["pregnancy"])
class PregnancyAssessmentViewSet(RelatedOrgScopedViewSet, viewsets.ReadOnlyModelViewSet):
    queryset = PregnancyAssessment.objects.all().select_related("episode")
    serializer_class = PregnancyAssessmentSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["episode", "disposition"]
    org_lookup = "episode__woman__organisation_unit"
