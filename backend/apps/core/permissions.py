"""
Row-level permission utilities for organisation-unit-scoped data access.

Hierarchy:
  SUPER_ADMIN → scoped to their org_unit + descendants (NOT unrestricted, spec §21.3, §37)
  REGIONAL_ADMIN → sees data within their region and all descendants
  DISTRICT_ADMIN → sees data within their district and all descendants
  SUBDISTRICT_ADMIN → sees data within their sub-district and all descendants
  FACILITY_CLINICAL_USER → sees data within their facility only
  READ_ONLY → same as facility but read-only
"""
from django.db.models import Q

from apps.core.enums import SystemRole


def get_descendant_unit_ids(org_unit):
    """Recursively collect all descendant OrganisationUnit IDs (including self)."""
    if org_unit is None:
        return []
    ids = [org_unit.id]
    children = org_unit.children.all()
    for child in children:
        ids.extend(get_descendant_unit_ids(child))
    return ids


def get_user_org_unit_ids(user):
    """
    Return list of OrganisationUnit IDs the user can access.
    Django superuser returns None (meaning: no filter, see all — dev/admin only).
    is_super_admin is scoped to their org_unit + descendants (spec §21.3, §37).
    """
    if user.is_superuser:
        return None  # Django superuser for dev/admin only

    if user.is_super_admin or user.system_role == SystemRole.SUPER_ADMIN:
        # Super admin is scoped to their org unit + descendants, NOT unrestricted
        if user.organisation_unit:
            return get_descendant_unit_ids(user.organisation_unit)
        return None  # Only truly unrestricted if no org_unit (should not happen in production)

    org_unit = user.organisation_unit
    if org_unit is None:
        return []

    # Facility-level users only see their own facility
    if user.system_role in (SystemRole.FACILITY_CLINICAL_USER, SystemRole.READ_ONLY):
        return [org_unit.id]

    # Admin users see their unit + all descendants
    return get_descendant_unit_ids(org_unit)


def filter_queryset_by_org(qs, user, org_field="organisation_unit"):
    """
    Filter a queryset so the user only sees records within their org scope.
    Returns unfiltered queryset for Django superuser only.
    """
    if user.is_superuser:
        return qs

    unit_ids = get_user_org_unit_ids(user)
    if unit_ids is None:
        return qs
    if not unit_ids:
        return qs.none()

    return qs.filter(**{f"{org_field}_id__in": unit_ids})


def filter_queryset_by_org_multi(qs, user, org_fields):
    """
    Filter a queryset where org unit may be referenced via multiple fields.
    Uses OR logic across the provided fields.
    """
    if user.is_superuser:
        return qs

    unit_ids = get_user_org_unit_ids(user)
    if unit_ids is None:
        return qs
    if not unit_ids:
        return qs.none()

    q_objects = Q()
    for field in org_fields:
        q_objects |= Q(**{f"{field}_id__in": unit_ids})
    return qs.filter(q_objects)


def user_can_write(user):
    """Whether the user has write permissions."""
    return user.system_role != SystemRole.READ_ONLY


def user_can_manage_users(user):
    """Whether the user can manage other users."""
    return user.system_role in (
        SystemRole.SUPER_ADMIN,
        SystemRole.REGIONAL_ADMIN,
        SystemRole.DISTRICT_ADMIN,
        SystemRole.SUBDISTRICT_ADMIN,
    ) or user.is_super_admin


# Valid purposes for purpose-bound access (spec §21.2)
VALID_PURPOSES = ("DIRECT_CARE", "REFERRAL", "SUPERVISION", "AUDIT", "ADMIN")

# Facility-level roles that have direct care access without purpose checks
_FACILITY_LEVEL_ROLES = (
    SystemRole.FACILITY_CLINICAL_USER,
    SystemRole.READ_ONLY,
)


def has_purpose_bound_access(user, purpose: str) -> bool:
    """
    Check if user has the required purpose for identified access
    above facility level (spec §21.2).

    Facility-level users always have direct care access.
    Above-facility admin users need a valid purpose claim for
    identified (non-aggregate) patient records.
    """
    if user.is_superuser:
        return True  # Django superuser bypasses (dev/admin only)
    if user.system_role in _FACILITY_LEVEL_ROLES:
        return True  # Facility-level users have direct care access
    # Above-facility users need purpose-bound roles
    # For now, allow SUPER_ADMIN, REGIONAL_ADMIN etc. with valid purposes
    # This can be extended with a Purpose model later
    return purpose in VALID_PURPOSES
