"""
Referral escalation cascade service (spec §18.4).

Automated escalation cascade:
1. notify midwife/CHO
2. contact receiving facility
3. activate ambulance
4. escalate to backup after timeout
5. alternative transport
6. close after result

This module provides ``run_escalation_check`` which should be called
periodically (e.g. via the ``run_escalation`` management command or cron).
It inspects referrals whose acknowledgement / escalation timeouts have
elapsed and advances them through the escalation cascade, recording an
append-only state log entry and an audit event for every transition.
"""
from datetime import timedelta

from django.utils import timezone

from apps.referrals.models import Referral, ReferralStateLog
from apps.referrals.state_machine import assert_valid_transition
from apps.core.config_models import SystemConfig
from apps.core.enums import ReferralStatus
from apps.audit.services import log_audit


def transition_referral(referral, to_status, actor="system", notes=""):
    """Execute a validated state transition on a referral.

    Saves the new status, appends a :class:`ReferralStateLog` entry and
    writes an audit event.  Raises ``ValueError`` if the transition is
    not permitted by the state machine.
    """
    from_status = referral.status
    assert_valid_transition(from_status, to_status)

    referral.status = to_status
    referral.version = (referral.version or 0) + 1
    referral.save(update_fields=["status", "version", "updated_at"])

    ReferralStateLog.objects.create(
        referral=referral,
        from_status=from_status,
        to_status=to_status,
        actor=actor,
        notes=notes,
    )

    log_audit(
        actor=actor,
        action="REFERRAL_STATE_CHANGE",
        entity_type="Referral",
        entity_id=str(referral.id),
        patient_id=referral.patient_id,
        facility_id=getattr(referral.destination_facility, "id", None),
        purpose="REFERRAL",
        metadata={
            "from_status": from_status,
            "to_status": to_status,
            "notes": notes,
        },
    )
    return referral


def run_escalation_check():
    """Check for referrals that need escalation based on configured timeouts.

    This should be called periodically (e.g., via management command or cron).

    Returns a list of dicts describing each escalation performed:
        ``{'referral_id': str, 'action': str, 'reason': str}``
    """
    config = SystemConfig.get_config()
    ack_timeout = timedelta(minutes=config.referral_ack_timeout_minutes)
    escalation_timeout = timedelta(minutes=config.referral_escalation_timeout_minutes)
    now = timezone.now()

    escalated = []

    # 1. REQUESTED past ack timeout → NO_ACK_ESCALATED
    overdue_ack = Referral.objects.filter(
        status=ReferralStatus.REQUESTED,
        created_at__lt=now - ack_timeout,
    )
    for ref in overdue_ack:
        transition_referral(
            ref, ReferralStatus.NO_ACK_ESCALATED,
            actor="system",
            notes="Automated escalation: acknowledgement timeout exceeded",
        )
        escalated.append({
            "referral_id": str(ref.id),
            "action": ReferralStatus.NO_ACK_ESCALATED,
            "reason": "ack_timeout",
        })

    # 2. NO_ACK_ESCALATED past escalation timeout → TRANSPORT_UNAVAILABLE
    overdue_escalation = Referral.objects.filter(
        status=ReferralStatus.NO_ACK_ESCALATED,
        created_at__lt=now - ack_timeout - escalation_timeout,
    )
    for ref in overdue_escalation:
        transition_referral(
            ref, ReferralStatus.TRANSPORT_UNAVAILABLE,
            actor="system",
            notes="Automated escalation: escalation timeout exceeded",
        )
        escalated.append({
            "referral_id": str(ref.id),
            "action": ReferralStatus.TRANSPORT_UNAVAILABLE,
            "reason": "escalation_timeout",
        })

    return escalated
