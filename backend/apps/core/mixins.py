"""
DRF mixins for org-unit-scoped querysets and write permissions.
"""
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS
from rest_framework.response import Response

from apps.core.permissions import (
    filter_queryset_by_org,
    filter_queryset_by_org_multi,
    get_user_org_unit_ids,
    user_can_write,
)


class OrgScopedQuerySetMixin:
    """
    Mixin that filters queryset by the user's organisation unit scope.
    Set `org_field` on the ViewSet or default to 'organisation_unit'.
    """
    org_field = "organisation_unit"

    def get_queryset(self):
        qs = super().get_queryset()
        if not self.request.user.is_authenticated:
            return qs.none()
        return filter_queryset_by_org(qs, self.request.user, org_field=self.org_field)


class RelatedOrgScopedQuerySetMixin:
    """
    Mixin for models that reach org_unit through a related FK (e.g. woman, child, patient).
    Set `org_lookup` on the ViewSet, e.g. 'woman__organisation_unit' or 'child__organisation_unit'.
    For multiple possible paths, provide a list: ['woman__organisation_unit', 'child__organisation_unit']
    """
    org_lookup = "organisation_unit"

    def get_queryset(self):
        qs = super().get_queryset()
        if not self.request.user.is_authenticated:
            return qs.none()
        user = self.request.user
        if user.is_superuser or user.is_super_admin:
            return qs
        unit_ids = get_user_org_unit_ids(user)
        if unit_ids is None:
            return qs
        if not unit_ids:
            return qs.none()
        lookups = self.org_lookup if isinstance(self.org_lookup, list) else [self.org_lookup]
        from django.db.models import Q
        q_obj = Q()
        for lookup in lookups:
            q_obj |= Q(**{f"{lookup}_id__in": unit_ids})
        return qs.filter(q_obj)


class ReadOnlyUnlessWriterMixin:
    """
    Mixin that blocks write operations for READ_ONLY role users.
    """
    def perform_create(self, serializer):
        if not user_can_write(self.request.user):
            raise PermissionDenied("Read-only users cannot create records.")
        super().perform_create(serializer)

    def perform_update(self, serializer):
        if not user_can_write(self.request.user):
            raise PermissionDenied("Read-only users cannot update records.")
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        if not user_can_write(self.request.user):
            raise PermissionDenied("Read-only users cannot delete records.")
        super().perform_destroy(instance)


class OrgScopedViewSet(OrgScopedQuerySetMixin, ReadOnlyUnlessWriterMixin):
    """
    Combined mixin: org-scoped queryset + read-only enforcement.
    Inherit this on ViewSets that have an `organisation_unit` FK.
    """
    pass


class RelatedOrgScopedViewSet(RelatedOrgScopedQuerySetMixin, ReadOnlyUnlessWriterMixin):
    """
    Combined mixin: related org-scoped queryset + read-only enforcement.
    Inherit this on ViewSets where org_unit is reached through a related model.
    """
    pass
