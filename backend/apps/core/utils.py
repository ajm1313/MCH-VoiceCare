"""Core utilities and helpers."""
from .enums import UrgencyLevel


def urgency_badge_class(urgency: str) -> str:
    """Map urgency level to DaisyUI badge class."""
    mapping = {
        UrgencyLevel.EMERGENCY: "badge-error",
        UrgencyLevel.PRIORITY: "badge-warning",
        UrgencyLevel.ROUTINE: "badge-success",
        UrgencyLevel.ABSTAIN: "badge-ghost",
    }
    return mapping.get(urgency, "badge-ghost")


def urgency_tone_class(urgency: str) -> str:
    """Map urgency level to a premium tone suffix used by the new UI.

    Returns one of: 'red', 'amber', 'green', 'grey'.
    Unknown / missing urgency returns 'grey' (data-missing) — never 'green',
    so abstention or missing data is never mistaken for routine/safe.
    """
    mapping = {
        UrgencyLevel.EMERGENCY: "red",
        UrgencyLevel.PRIORITY: "amber",
        UrgencyLevel.ROUTINE: "green",
        UrgencyLevel.ABSTAIN: "grey",
    }
    return mapping.get(urgency, "grey")


def status_badge_class(status: str) -> str:
    """Map common statuses to badge classes."""
    status_lower = status.lower() if status else ""
    if status_lower in ("active", "open", "planned", "synced", "completed"):
        return "badge-success"
    if status_lower in ("pending", "draft", "in_progress", "processing"):
        return "badge-warning"
    if status_lower in ("error", "failed", "cancelled", "declined", "lost"):
        return "badge-error"
    if status_lower in ("closed", "dismissed"):
        return "badge-ghost"
    return "badge-info"
