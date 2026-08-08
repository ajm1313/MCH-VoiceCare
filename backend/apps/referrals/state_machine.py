"""
Referral state machine — valid transitions per spec §18.3.

Defines the allowed state transitions and provides validation.
"""
from apps.core.enums import ReferralStatus


VALID_TRANSITIONS = {
    ReferralStatus.DRAFT: [ReferralStatus.REQUESTED, ReferralStatus.CANCELLED_BY_CLINICIAN],
    ReferralStatus.REQUESTED: [
        ReferralStatus.RECEIVING_FACILITY_NOTIFIED,
        ReferralStatus.ACCEPTED,
        ReferralStatus.DECLINED,
        ReferralStatus.NO_ACK_ESCALATED,
        ReferralStatus.CANCELLED_BY_CLINICIAN,
    ],
    ReferralStatus.RECEIVING_FACILITY_NOTIFIED: [
        ReferralStatus.ACCEPTED,
        ReferralStatus.DECLINED,
        ReferralStatus.NO_ACK_ESCALATED,
    ],
    ReferralStatus.ACCEPTED: [
        ReferralStatus.TRANSPORT_REQUESTED,
        ReferralStatus.IN_TRANSIT,
        ReferralStatus.ARRIVED,
        ReferralStatus.CANCELLED_BY_CLINICIAN,
    ],
    ReferralStatus.TRANSPORT_REQUESTED: [
        ReferralStatus.IN_TRANSIT,
        ReferralStatus.TRANSPORT_UNAVAILABLE,
        ReferralStatus.CANCELLED_BY_CLINICIAN,
    ],
    ReferralStatus.IN_TRANSIT: [
        ReferralStatus.ARRIVED,
        ReferralStatus.LOST_TO_FOLLOWUP,
    ],
    ReferralStatus.ARRIVED: [
        ReferralStatus.DISPOSITION_RECORDED,
    ],
    ReferralStatus.DISPOSITION_RECORDED: [
        ReferralStatus.CLOSED,
    ],
    ReferralStatus.CLOSED: [],
    # Exceptional states are terminal
    ReferralStatus.DECLINED: [ReferralStatus.REQUESTED],
    ReferralStatus.NO_ACK_ESCALATED: [ReferralStatus.ACCEPTED, ReferralStatus.DECLINED],
    ReferralStatus.TRANSPORT_UNAVAILABLE: [
        ReferralStatus.TRANSPORT_REQUESTED,
        ReferralStatus.CANCELLED_BY_CLINICIAN,
    ],
    ReferralStatus.CANCELLED_BY_CLINICIAN: [],
    ReferralStatus.LOST_TO_FOLLOWUP: [ReferralStatus.ARRIVED],
}


def is_valid_transition(from_status: str, to_status: str) -> bool:
    """Check if a state transition is valid per the state machine."""
    if from_status == to_status:
        return True
    allowed = VALID_TRANSITIONS.get(from_status, [])
    return to_status in allowed


def assert_valid_transition(from_status: str, to_status: str):
    """Raise ValueError if the transition is not valid."""
    if not is_valid_transition(from_status, to_status):
        raise ValueError(
            f"Invalid referral state transition: {from_status} → {to_status}"
        )
