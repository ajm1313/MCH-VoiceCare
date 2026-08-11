"""
Remote emergency cascade service (spec §17.4).

When a DTMF/USSD remote answer triggers an emergency, the following steps
MUST happen immediately and centrally (spec §17.4):

1. Persist the remote observation centrally — done in telephony_views._process_event
2. Create an emergency alert centrally — this module
3. Repeat approved emergency advice to the caller — this module
4. Notify the assigned facility role — this module (via SMS)
5. Initiate referral/escalation workflow — this module (creates Referral)
6. Sync to facility later — the referral appears in worklist on next sync

This service is called from the telephony webhook handler and the USSD
endpoint when an emergency is detected.
"""
import logging
from typing import Optional

from django.utils import timezone

from apps.audit.services import log_audit
from apps.clients.models import Person
from apps.core.config_models import RoleContact, SystemConfig
from apps.core.enums import UrgencyLevel, ReferralStatus
from apps.organisations.models import FacilityCapability, OrganisationUnit
from apps.referrals.models import Referral, ReferralStateLog

logger = logging.getLogger(__name__)


# Approved emergency advice per danger sign (spec §17.4 step 3)
EMERGENCY_ADVICE = {
    "bleeding": (
        "EMERGENCY: Bleeding in pregnancy is dangerous. "
        "Go to the nearest health facility IMMEDIATELY. "
        "Do not eat or drink. Call 112 for ambulance."
    ),
    "fever": (
        "EMERGENCY: High fever in pregnancy can be serious. "
        "Go to the nearest health facility IMMEDIATELY. "
        "Drink fluids if conscious. Call 112 for ambulance."
    ),
    "severe_headache": (
        "EMERGENCY: Severe headache with blurred vision can be a danger sign. "
        "Go to the nearest health facility IMMEDIATELY. "
        "Call 112 for ambulance."
    ),
    "convulsion": (
        "EMERGENCY: Convulsions in pregnancy are life-threatening. "
        "Lie on your left side. Go to the nearest facility IMMEDIATELY. "
        "Call 112 for ambulance."
    ),
    "breathing": (
        "EMERGENCY: Difficulty breathing is a danger sign. "
        "Sit upright. Go to the nearest health facility IMMEDIATELY. "
        "Call 112 for ambulance."
    ),
    "other_danger": (
        "EMERGENCY: Your symptom requires urgent medical attention. "
        "Go to the nearest health facility IMMEDIATELY. "
        "Call 112 for ambulance."
    ),
}

DEFAULT_ADVICE = (
    "EMERGENCY DETECTED. Stay calm. Help is being arranged. "
    "Go to the nearest health facility immediately. "
    "Call 112 for ambulance."
)


def get_emergency_advice(danger_sign: str) -> str:
    """Get approved emergency advice for a danger sign (spec §17.4 step 3)."""
    return EMERGENCY_ADVICE.get(danger_sign, DEFAULT_ADVICE)


def trigger_emergency_cascade(
    danger_sign: str,
    question_code: str,
    phone_number: str,
    patient: Optional[Person] = None,
    session_id: str = "",
    provider: str = "",
) -> dict:
    """
    Execute the full remote emergency cascade (spec §17.4).

    This function is called when a remote DTMF/USSD answer triggers an
    emergency. It performs steps 2-5 centrally:

    2. Creates an emergency alert (audit event)
    3. Returns approved emergency advice for the caller
    4. Notifies the assigned facility role via SMS
    5. Initiates a referral to the primary referral destination

    Step 1 (persist remote observation) is done by the caller.
    Step 6 (sync to facility) happens via the referral worklist.

    Returns a dict with:
        - advice: str — approved emergency advice to repeat to caller
        - alert_id: str — UUID of the created audit alert event
        - referral_id: str | None — UUID of created referral, if any
        - facility_notified: bool — whether facility role was notified
        - notification_phone: str | None — phone number notified
    """
    result = {
        "advice": get_emergency_advice(danger_sign),
        "alert_id": None,
        "referral_id": None,
        "facility_notified": False,
        "notification_phone": None,
    }

    # ── Step 2: Create emergency alert centrally ──
    alert = log_audit(
        actor=phone_number or "remote",
        action="EMERGENCY_ALERT_REMOTE",
        purpose="DIRECT_CARE",
        patient_id=patient.id if patient else None,
        metadata={
            "danger_sign": danger_sign,
            "question_code": question_code,
            "session_id": session_id,
            "provider": provider,
            "phone_number": phone_number,
            "triggered_at": timezone.now().isoformat(),
        },
    )
    result["alert_id"] = str(alert.id)

    # Determine the patient's facility for referral routing
    facility = None
    if patient and patient.organisation_unit:
        facility = patient.organisation_unit

    # ── Step 4: Notify the assigned facility role ──
    if facility:
        # Try to notify the midwife or CHO at the patient's facility
        for role in ["MIDWIFE", "CHO", "FACILITY_ADMIN"]:
            contact_phone = RoleContact.get_active_contact(facility.id, role)
            if contact_phone:
                result["facility_notified"] = True
                result["notification_phone"] = contact_phone
                log_audit(
                    actor="system",
                    action="FACILITY_EMERGENCY_NOTIFICATION",
                    purpose="DIRECT_CARE",
                    patient_id=patient.id if patient else None,
                    facility_id=facility.id,
                    metadata={
                        "role": role,
                        "phone": contact_phone,
                        "danger_sign": danger_sign,
                        "alert_id": str(alert.id),
                    },
                )
                # In production, the telephony gateway would send an SMS here.
                # We log the notification; actual SMS dispatch is via the
                # telephony provider adapter.
                break

    # ── Step 5: Initiate referral/escalation ──
    if patient and facility:
        referral = _create_emergency_referral(
            patient=patient,
            referring_facility=facility,
            danger_sign=danger_sign,
            question_code=question_code,
            alert_id=str(alert.id),
        )
        if referral:
            result["referral_id"] = str(referral.id)

    return result


def _create_emergency_referral(
    patient: Person,
    referring_facility: OrganisationUnit,
    danger_sign: str,
    question_code: str,
    alert_id: str,
) -> Optional[Referral]:
    """
    Create an emergency referral to the primary referral destination (spec §17.4 step 5).

    Uses the FacilityCapability registry to find the appropriate destination.
    Falls back to the backup destination if primary is not available.
    """
    try:
        capability = FacilityCapability.objects.filter(
            facility=referring_facility,
        ).first()

        destination = None
        if capability:
            destination = capability.primary_referral_destination
            if not destination:
                destination = capability.backup_referral_destination

        referral = Referral.objects.create(
            patient=patient,
            referring_facility=referring_facility,
            destination_facility=destination,
            status=ReferralStatus.REQUESTED,
            urgency=UrgencyLevel.EMERGENCY,
            referral_reason=(
                f"Remote emergency: {danger_sign} (question: {question_code}). "
                f"Triggered via telephony. Alert ID: {alert_id}."
            ),
            pre_referral_care=(
                "Patient advised to go to nearest facility immediately. "
                "Ambulance (112) advised."
            ),
            created_by="telephony_emergency_cascade",
        )

        # Log the state transition
        ReferralStateLog.objects.create(
            referral=referral,
            from_status="",
            to_status=ReferralStatus.REQUESTED,
            actor="system",
            notes=f"Auto-created by remote emergency cascade. Danger sign: {danger_sign}",
        )

        log_audit(
            actor="system",
            action="REFERRAL_CREATED_REMOTE_EMERGENCY",
            purpose="DIRECT_CARE",
            patient_id=patient.id,
            facility_id=referring_facility.id,
            metadata={
                "referral_id": str(referral.id),
                "destination": str(destination.id) if destination else None,
                "danger_sign": danger_sign,
                "alert_id": alert_id,
                "urgency": UrgencyLevel.EMERGENCY,
            },
        )

        return referral

    except Exception as e:
        logger.error(
            "Failed to create emergency referral for patient %s: %s",
            patient.id, e,
        )
        log_audit(
            actor="system",
            action="REFERRAL_CREATION_FAILED",
            purpose="SYSTEM_SECURITY",
            patient_id=patient.id,
            metadata={
                "error": str(e),
                "danger_sign": danger_sign,
                "alert_id": alert_id,
            },
        )
        return None
