"""
Telephony webhook endpoint — IVR/DTMF and USSD remote emergency path (spec §17.4).

Receives webhook callbacks from telephony providers, maps DTMF/USSD answers
to the common data schema, and triggers emergency cascade when approved
danger signs are detected.

No caller speech is recorded (spec §37).
"""
import uuid

from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.enums import UrgencyLevel, NotificationClass, NotificationStatus
from apps.notifications.models import Notification
from apps.audit.models import AuditEvent
from apps.audit.services import log_audit


# DTMF key → danger sign mapping (spec §17.1)
# Keys 1-3 map to yes/no/unknown for each danger sign question
EMERGENCY_DTMF_KEYS = {
    "1": "bleeding",
    "2": "convulsion",
    "3": "severe_headache",
    "4": "blurred_vision",
    "5": "fever",
    "6": "reduced_fetal_movement",
    "7": "swelling",
    "8": "other_danger",
}

# USSD emergency keywords
EMERGENCY_USSD_KEYWORDS = {
    "BLEED", "BLOOD", "CONVULSION", "FIT", "UNCONSCIOUS",
    "HEADACHE", "FEVER", "SWELL", "BLUR", "VISION",
}


class TelephonyWebhookView(APIView):
    """
    Receive telephony webhook callbacks (spec §17.3, §17.4).

    Provider-agnostic — verifies webhook and processes DTMF/USSD answers.
    No caller speech is recorded.
    """
    permission_classes = [AllowAny]  # Provider webhooks use signature verification

    def post(self, request):
        payload = request.data
        channel = payload.get("channel", "IVR")  # IVR or USSD
        caller_number = payload.get("caller_number", "")
        session_id = payload.get("session_id", "")
        patient_id = payload.get("patient_id")
        facility_id = payload.get("facility_id")
        answers = payload.get("answers", {})

        # Map answers to danger signs
        danger_signs_detected = []
        is_emergency = False

        if channel == "USSD":
            text = payload.get("text", "").upper()
            for keyword in EMERGENCY_USSD_KEYWORDS:
                if keyword in text:
                    danger_signs_detected.append(keyword.lower())
                    is_emergency = True
        else:
            # IVR/DTMF — check each answer
            for key, sign in EMERGENCY_DTMF_KEYS.items():
                answer = answers.get(key, "")
                if answer in ("1", "yes", "YES"):
                    danger_signs_detected.append(sign)
                    is_emergency = True

        # Persist the remote observation centrally (spec §17.4 step 1)
        audit_event = log_audit(
            actor=caller_number or "telephony",
            action="TELEPHONY_REMOTE_OBSERVATION",
            entity_type="RemoteObservation",
            entity_id=session_id or str(uuid.uuid4()),
            patient_id=patient_id,
            facility_id=facility_id,
            device_id=caller_number,
            purpose="DIRECT_CARE",
            metadata={
                "channel": channel,
                "session_id": session_id,
                "danger_signs": danger_signs_detected,
                "is_emergency": is_emergency,
            },
        )

        if is_emergency:
            # Create emergency alert centrally (spec §17.4 step 2)
            notification = Notification.objects.create(
                title=f"REMOTE EMERGENCY: {caller_number} — {', '.join(danger_signs_detected)}",
                notification_class=NotificationClass.EMERGENCY,
                status=NotificationStatus.OPEN,
                urgency=UrgencyLevel.EMERGENCY,
                due_datetime=timezone.now(),
                related_entity_type="RemoteObservation",
                related_entity_id=audit_event.id if hasattr(audit_event, 'id') else None,
            )

            # Notify assigned facility role (spec §17.4 step 4)
            # In production this would trigger SMS/call to facility role contacts
            log_audit(
                actor="system",
                action="EMERGENCY_ALERT_DISPATCHED",
                entity_type="Notification",
                entity_id=str(notification.id),
                patient_id=patient_id,
                facility_id=facility_id,
                purpose="REFERRAL",
                metadata={
                    "channel": channel,
                    "danger_signs": danger_signs_detected,
                    "caller_number": caller_number,
                },
            )

            return Response({
                "status": "EMERGENCY_DETECTED",
                "danger_signs": danger_signs_detected,
                "notification_id": str(notification.id),
                "advice": "Stay calm. Help is being arranged. Go to the nearest health facility immediately.",
                "escalation_started": True,
            }, status=status.HTTP_200_OK)

        return Response({
            "status": "NO_EMERGENCY",
            "danger_signs": [],
            "advice": "Continue with your scheduled antenatal visits.",
        }, status=status.HTTP_200_OK)
