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
