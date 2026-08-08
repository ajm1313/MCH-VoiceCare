"""
Row-level permission utilities for organisation-unit-scoped data access.

Hierarchy:
  SUPER_ADMIN → sees everything
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
    SUPER_ADMIN returns None (meaning: no filter, see all).
    """
    if user.is_superuser or user.is_super_admin:
        return None

    if user.system_role == SystemRole.SUPER_ADMIN:
        return None

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
    Returns unfiltered queryset for SUPER_ADMIN.
    """
    if user.is_superuser or user.is_super_admin:
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
    if user.is_superuser or user.is_super_admin:
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
