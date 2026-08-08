"""Newborn API views."""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.newborn.models import BirthEpisode, NewbornEpisode, NewbornObservation, NewbornAssessment
from apps.newborn.api.serializers import (
    BirthEpisodeSerializer, NewbornEpisodeSerializer,
    NewbornObservationSerializer, NewbornAssessmentSerializer,
)
from apps.core.mixins import RelatedOrgScopedViewSet
from apps.newborn.rule_engine import run_newborn_assessment
from apps.audit.services import log_rule_evaluation
from apps.notifications.services import process_rule_assessment


class BirthEpisodeViewSet(RelatedOrgScopedViewSet, viewsets.ModelViewSet):
    queryset = BirthEpisode.objects.all().select_related("mother", "pregnancy")
    serializer_class = BirthEpisodeSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["mother", "pregnancy"]
    org_lookup = "mother__organisation_unit"


class NewbornEpisodeViewSet(RelatedOrgScopedViewSet, viewsets.ModelViewSet):
    queryset = NewbornEpisode.objects.all().select_related("child", "mother")
    serializer_class = NewbornEpisodeSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["child", "mother", "status"]
    search_fields = ["child__full_name"]
    org_lookup = ["child__organisation_unit", "mother__organisation_unit"]

    @action(detail=True, methods=["post"])
    def assess(self, request, pk=None):
        """Run the newborn rule engine and persist the assessment."""
        episode = self.get_object()
        result = run_newborn_assessment(episode)

        assessment = NewbornAssessment.objects.create(
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
            episode_type="NewbornEpisode",
            episode_id=episode.id,
            disposition=result["disposition"],
            fired_rules=result["fired_rules"],
            patient_id=episode.child_id,
            actor_role=request.user.system_role,
        )

        process_rule_assessment(
            result, "NewbornEpisode", episode.id,
            patient_name=episode.child.full_name,
            patient_id=episode.child_id,
        )

        return Response({
            "assessment_id": str(assessment.id),
            "disposition": result["disposition"],
            "fired_rules": result["fired_rules"],
            "recommended_action": result["recommended_action"],
            "rule_set_version": result["rule_set_version"],
        }, status=status.HTTP_200_OK)


class NewbornObservationViewSet(RelatedOrgScopedViewSet, viewsets.ModelViewSet):
    queryset = NewbornObservation.objects.all().select_related("newborn")
    serializer_class = NewbornObservationSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["newborn"]
    org_lookup = "newborn__child__organisation_unit"


class NewbornAssessmentViewSet(RelatedOrgScopedViewSet, viewsets.ReadOnlyModelViewSet):
    queryset = NewbornAssessment.objects.all().select_related("episode")
    serializer_class = NewbornAssessmentSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["episode", "disposition"]
    org_lookup = "episode__child__organisation_unit"
