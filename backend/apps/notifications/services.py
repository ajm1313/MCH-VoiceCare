"""
Notification service — auto-create notifications when clinical
rule engines detect emergencies or priority conditions (spec §18.4).

Also provides helpers for referral state notifications.
"""
from django.utils import timezone

from apps.core.enums import NotificationClass, NotificationStatus, UrgencyLevel
from apps.notifications.models import Notification


def create_emergency_notification(
    episode_type: str,
    episode_id,
    patient_name: str = "",
    patient_id=None,
    fired_rules: list = None,
    disposition: str = "",
):
    """
    Create an emergency notification when a rule engine returns EMERGENCY.
    Returns the created Notification instance.
    """
    title = f"EMERGENCY: {episode_type} — {patient_name}" if patient_name else f"EMERGENCY: {episode_type}"
    rule_summary = ""
    if fired_rules:
        rule_ids = [r.get("ruleId", "") for r in fired_rules[:3]]
        rule_summary = f" Rules: {', '.join(rule_ids)}"

    return Notification.objects.create(
        title=title,
        notification_class=NotificationClass.EMERGENCY,
        status=NotificationStatus.OPEN,
        urgency=UrgencyLevel.EMERGENCY,
        due_datetime=timezone.now(),
        related_entity_type=episode_type,
        related_entity_id=episode_id,
    )


def create_priority_notification(
    episode_type: str,
    episode_id,
    patient_name: str = "",
    patient_id=None,
    fired_rules: list = None,
    disposition: str = "",
):
    """
    Create a priority notification when a rule engine returns PRIORITY.
    Returns the created Notification instance.
    """
    title = f"Priority review: {episode_type} — {patient_name}" if patient_name else f"Priority review: {episode_type}"

    return Notification.objects.create(
        title=title,
        notification_class=NotificationClass.SYSTEM,
        status=NotificationStatus.OPEN,
        urgency=UrgencyLevel.PRIORITY,
        due_datetime=timezone.now() + timezone.timedelta(hours=48),
        related_entity_type=episode_type,
        related_entity_id=episode_id,
    )


def create_referral_notification(referral, action: str = "created"):
    """Create a notification for a referral event."""
    urgency = referral.urgency
    title = f"Referral {action}: {referral.patient.full_name}"
    if urgency == UrgencyLevel.EMERGENCY:
        title = f"EMERGENCY REFERRAL: {referral.patient.full_name}"
        notif_class = NotificationClass.EMERGENCY
        due = timezone.now()
    else:
        notif_class = NotificationClass.REFERRAL
        due = timezone.now() + timezone.timedelta(hours=24)

    return Notification.objects.create(
        title=title,
        notification_class=notif_class,
        status=NotificationStatus.OPEN,
        urgency=urgency,
        due_datetime=due,
        related_entity_type="Referral",
        related_entity_id=referral.id,
    )


def create_defaulter_notification(record, assessment: dict):
    """Create a notification for an immunisation defaulter."""
    risk = assessment.get("risk_level", "LOW")
    if risk not in ("CRITICAL", "HIGH"):
        return None

    title = f"Immunisation defaulter ({risk}): {record.child.full_name}"
    return Notification.objects.create(
        title=title,
        notification_class=NotificationClass.DEFAULTER,
        status=NotificationStatus.OPEN,
        urgency=UrgencyLevel.PRIORITY if risk == "HIGH" else UrgencyLevel.EMERGENCY,
        due_datetime=timezone.now(),
        related_entity_type="ChildImmunisationRecord",
        related_entity_id=record.id,
    )


def process_rule_assessment(assessment: dict, episode_type: str, episode_id,
                            patient_name: str = "", patient_id=None):
    """
    Process a rule engine assessment result and create appropriate notifications.
    Called after run_pregnancy_assessment, run_newborn_assessment, etc.
    """
    disposition = assessment.get("disposition", "")
    fired_rules = assessment.get("fired_rules", [])

    if disposition == UrgencyLevel.EMERGENCY:
        return create_emergency_notification(
            episode_type, episode_id, patient_name, patient_id, fired_rules, disposition,
        )
    elif disposition == UrgencyLevel.PRIORITY:
        return create_priority_notification(
            episode_type, episode_id, patient_name, patient_id, fired_rules, disposition,
        )
    return None
