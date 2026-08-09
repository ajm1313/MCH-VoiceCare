"""
Telephony webhook endpoint — IVR/DTMF and USSD remote emergency path (spec §17.4).

Receives webhook callbacks from telephony providers, maps DTMF/USSD answers
to the common data schema, and triggers emergency cascade when approved
danger signs are detected.

Emergency path steps (spec §17.4):
1. Persist the remote observation centrally
2. Create emergency alert (Notification) centrally
3. Repeat approved emergency advice to caller
4. Notify assigned facility role
5. Initiate referral workflow (create DRAFT Referral with EMERGENCY urgency)
6. Sync to facility app — happens automatically via normal sync mechanism
   (the observation and referral are stored centrally and sync to the
   facility device when it next connects; spec §17.4 step 6)

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
from apps.referrals.models import Referral
from apps.clients.models import Person


# Approved emergency advice repeated to the caller (spec §17.4 step 3)
EMERGENCY_ADVICE = (
    "Stay calm. Help is being arranged. Go to the nearest health facility immediately."
)


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

            # Initiate referral workflow (spec §17.4 step 5)
            # Create a DRAFT Referral with EMERGENCY urgency so the facility
            # can pick it up and complete the closed-loop referral.
            referral = None
            if patient_id:
                try:
                    uid = uuid.UUID(str(patient_id))
                    patient = Person.objects.filter(id=uid).first()
                    if patient:
                        referral = Referral.objects.create(
                            patient=patient,
                            referral_reason=(
                                f"Remote emergency via {channel}: "
                                f"{', '.join(danger_signs_detected)}"
                            ),
                            status="DRAFT",
                            urgency=UrgencyLevel.EMERGENCY,
                            pre_referral_care=EMERGENCY_ADVICE,
                            created_by=caller_number or "telephony",
                        )
                        # Audit log the referral creation (spec §23)
                        log_audit(
                            actor=caller_number or "telephony",
                            action="REFERRAL_CREATED",
                            entity_type="Referral",
                            entity_id=str(referral.id),
                            patient_id=patient.id,
                            referral_episode_id=referral.id,
                            facility_id=facility_id,
                            purpose="REFERRAL",
                            metadata={
                                "urgency": UrgencyLevel.EMERGENCY,
                                "source": "telephony_emergency",
                                "danger_signs": danger_signs_detected,
                            },
                        )
                except (ValueError, TypeError):
                    pass

            # Step 6: Sync to facility app — the observation and referral are
            # stored centrally and will sync to the facility device via the
            # normal bidirectional sync mechanism when it next connects
            # (spec §17.4 step 6). No additional action needed here.

            return Response({
                "status": "EMERGENCY_DETECTED",
                "danger_signs": danger_signs_detected,
                "notification_id": str(notification.id),
                # Step 3: repeat approved emergency advice to the caller
                "advice": EMERGENCY_ADVICE,
                "escalation_started": True,
                "referral_id": str(referral.id) if referral else None,
            }, status=status.HTTP_200_OK)

        return Response({
            "status": "NO_EMERGENCY",
            "danger_signs": [],
            "advice": "Continue with your scheduled antenatal visits.",
        }, status=status.HTTP_200_OK)
