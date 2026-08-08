"""
Clinician override/confirmation API endpoint (spec §3.1, §23).

A clinician can confirm or override a system-generated clinical decision.
All overrides MUST store actor, timestamp, reason, prior recommendation,
and resulting action (spec §3.1).
"""
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import log_clinician_override
from apps.core.enums import UrgencyLevel


OVERRIDE_ACTIONS = {
    "CONFIRM": "Clinician confirmed the system recommendation.",
    "ESCALATE": "Clinician escalated to higher urgency.",
    "DEESCALATE": "Clinician de-escalated to lower urgency (with documented justification).",
    "REJECT": "Clinician rejected the system recommendation entirely.",
}


class ClinicianOverrideSerializer(serializers.Serializer):
    episode_type = serializers.ChoiceField(choices=["PregnancyEpisode", "NewbornEpisode", "GrowthMeasurement"])
    episode_id = serializers.UUIDField()
    prior_recommendation = serializers.CharField(max_length=50)
    resulting_action = serializers.ChoiceField(choices=list(OVERRIDE_ACTIONS.keys()))
    override_reason = serializers.CharField(max_length=500, required=True)
    new_urgency = serializers.ChoiceField(
        choices=UrgencyLevel.choices, required=False, allow_blank=True,
    )
    patient_id = serializers.UUIDField(required=False, allow_null=True)


class ClinicianOverrideView(APIView):
    """
    POST /api/v1/clinical/override/

    Records a clinician confirmation or override of a system-generated
    clinical decision. Creates an append-only audit event with actor,
    timestamp, reason, prior recommendation, and resulting action.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ClinicianOverrideSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = request.user

        # Emergency rules cannot be de-escalated by override (spec §3.1)
        if (data["prior_recommendation"] == UrgencyLevel.EMERGENCY
                and data["resulting_action"] == "DEESCALATE"):
            return Response({
                "detail": "Emergency rules cannot be de-escalated by clinician override. "
                          "Use REJECT with documented justification if the rule fired in error.",
            }, status=status.HTTP_409_CONFLICT)

        event = log_clinician_override(
            actor=user.username,
            actor_role=user.system_role,
            episode_type=data["episode_type"],
            episode_id=data["episode_id"],
            prior_recommendation=data["prior_recommendation"],
            resulting_action=data["resulting_action"],
            reason=data["override_reason"],
            patient_id=data.get("patient_id"),
        )

        return Response({
            "override_id": str(event.id),
            "action": data["resulting_action"],
            "description": OVERRIDE_ACTIONS[data["resulting_action"]],
            "recorded": True,
            "audit_logged": True,
        }, status=status.HTTP_201_CREATED)
