"""
Referral routing service — geospatial routing to the nearest currently
verified capable facility (spec §18.1).

Provides haversine distance calculation and facility suggestion based on
the required clinical capability and the patient's origin coordinates.
"""
import math

from django.utils import timezone

from apps.organisations.models import OrganisationUnit, FacilityCapability
from apps.core.enums import UrgencyLevel

# Map of capability keywords supported by FacilityCapability fields.
CAPABILITY_FIELDS = (
    "maternity_triage_24_7",
    "bemonc",
    "cemonc",
    "theatre",
    "blood",
    "specialist_obstetrics",
    "newborn_support",
)


def haversine_km(lat1, lon1, lat2, lon2):
    """Calculate the great-circle distance between two points in km."""
    R = 6371  # Earth's radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.asin(math.sqrt(a))
    return R * c


def find_nearest_capable_facility(
    origin_lat, origin_lon, required_capability, exclude_ids=None
):
    """Find the nearest facility with the required capability that is
    currently verified.

    Args:
        origin_lat, origin_lon: origin coordinates
        required_capability: field name on FacilityCapability
            (e.g. ``cemonc``, ``bemonc``, ``theatre``, ``blood``)
        exclude_ids: list of facility IDs to exclude

    Returns:
        ``(facility, distance_km)`` tuple, or ``(None, None)`` if no
        capable facility is found.
    """
    if required_capability not in CAPABILITY_FIELDS:
        raise ValueError(f"Unknown capability: {required_capability}")

    exclude_ids = exclude_ids or []

    capabilities = FacilityCapability.objects.filter(
        **{required_capability: True},
        verification_expires_at__gt=timezone.now(),
    ).exclude(facility_id__in=exclude_ids).select_related("facility")

    best = None
    best_dist = float("inf")
    for cap in capabilities:
        facility = cap.facility
        if facility.latitude and facility.longitude:
            dist = haversine_km(
                origin_lat,
                origin_lon,
                float(facility.latitude),
                float(facility.longitude),
            )
            if dist < best_dist:
                best_dist = dist
                best = facility

    if best is not None:
        return best, best_dist
    return None, None


def suggest_referral_destination(patient_lat, patient_lon, urgency, exclude_ids=None):
    """Suggest a referral destination facility for a patient.

    Maps the urgency level to the required capability and finds the
    nearest verified capable facility.

    Args:
        patient_lat, patient_lon: patient origin coordinates
        urgency: a :class:`UrgencyLevel` value
        exclude_ids: list of facility IDs to exclude (e.g. the
            referring facility)

    Returns:
        dict with ``facility`` (OrganisationUnit or None), ``distance_km``
        and ``required_capability``.
    """
    # Map urgency → required capability
    if urgency == UrgencyLevel.EMERGENCY:
        required_capability = "cemonc"
    elif urgency == UrgencyLevel.PRIORITY:
        required_capability = "bemonc"
    else:
        required_capability = "bemonc"

    facility, distance = find_nearest_capable_facility(
        patient_lat, patient_lon, required_capability, exclude_ids=exclude_ids,
    )
    return {
        "facility": facility,
        "distance_km": distance,
        "required_capability": required_capability,
    }
