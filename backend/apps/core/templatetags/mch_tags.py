"""Core templatetags for MCH VoiceCare."""
from django import template

from apps.core.enums import UrgencyLevel
from apps.core.utils import urgency_badge_class, status_badge_class, urgency_tone_class

register = template.Library()


@register.filter
def urgency_badge(value):
    return urgency_badge_class(value)


@register.filter
def urgency_tone(value):
    """Return the premium urgency tone suffix (e.g. 'red', 'amber').

    Used with the new shared urgency badge classes:
        <span class="urgency-badge urgency-{{ value|urgency_tone }}">…</span>

    Unknown / missing urgency returns 'grey' (data-missing), never 'green'.
    """
    return urgency_tone_class(value)


@register.filter
def status_badge(value):
    return status_badge_class(value)


@register.filter
def field_value(form, field_name):
    """Get the value of a form field."""
    field = form.fields.get(field_name)
    if field is None:
        return ""
    bound = form[field_name]
    return bound.value() or ""
