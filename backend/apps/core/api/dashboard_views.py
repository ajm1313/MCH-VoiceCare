"""
Aggregate dashboard API endpoint (spec §21.2, §27).

Returns aggregate counts with NO patient identifiers.
National admin sees national-level aggregates only.
"""
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.enums import (
    EpisodeStatus, ReferralStatus, UrgencyLevel, NotificationStatus, DefaulterStatus,
)
from apps.core.permissions import get_user_org_unit_ids
from apps.pregnancy.models import PregnancyEpisode
from apps.newborn.models import NewbornEpisode
from apps.immunisation.models import ChildImmunisationRecord
from apps.referrals.models import Referral
from apps.notifications.models import Notification
from apps.audit.models import AuditEvent
from apps.organisations.models import OrganisationUnit


class AggregateDashboardView(APIView):
    """
    GET /api/v1/dashboard/aggregate/

    Returns aggregate monitoring counts with NO patient identifiers.
    Scoped to user's org hierarchy. National admin sees all.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        unit_ids = get_user_org_unit_ids(user)

        # Build org filter
        from django.db.models import Q

        def org_filter(prefix=""):
            if unit_ids is None:
                return Q()
            if not unit_ids:
                return Q(pk__in=[])
            return Q(**{f"{prefix}id__in": unit_ids}) if not prefix else Q(**{f"{prefix}_id__in": unit_ids})

        # Pregnancy aggregates
        preg_qs = PregnancyEpisode.objects.all()
        if unit_ids is not None:
            if not unit_ids:
                preg_qs = PregnancyEpisode.objects.none()
            else:
                preg_qs = preg_qs.filter(woman__organisation_unit_id__in=unit_ids)

        newborn_qs = NewbornEpisode.objects.all()
        if unit_ids is not None:
            if not unit_ids:
                newborn_qs = NewbornEpisode.objects.none()
            else:
                newborn_qs = newborn_qs.filter(child__organisation_unit_id__in=unit_ids)

        imm_qs = ChildImmunisationRecord.objects.all()
        if unit_ids is not None:
            if not unit_ids:
                imm_qs = ChildImmunisationRecord.objects.none()
            else:
                imm_qs = imm_qs.filter(child__organisation_unit_id__in=unit_ids)

        ref_qs = Referral.objects.all()
        if unit_ids is not None:
            if not unit_ids:
                ref_qs = Referral.objects.none()
            else:
                ref_qs = ref_qs.filter(
                    Q(referring_facility_id__in=unit_ids) |
                    Q(destination_facility_id__in=unit_ids) |
                    Q(patient__organisation_unit_id__in=unit_ids)
                )

        notif_qs = Notification.objects.filter(status=NotificationStatus.OPEN)

        # Aggregate counts (no patient identifiers)
        data = {
            "pregnancy": {
                "active": preg_qs.filter(status=EpisodeStatus.ACTIVE).count(),
                "emergency": preg_qs.filter(
                    status=EpisodeStatus.ACTIVE, current_urgency=UrgencyLevel.EMERGENCY
                ).count(),
                "priority": preg_qs.filter(
                    status=EpisodeStatus.ACTIVE, current_urgency=UrgencyLevel.PRIORITY
                ).count(),
                "closed": preg_qs.filter(status=EpisodeStatus.CLOSED).count(),
            },
            "newborn": {
                "active": newborn_qs.filter(status=EpisodeStatus.ACTIVE).count(),
                "emergency": newborn_qs.filter(
                    status=EpisodeStatus.ACTIVE, current_urgency=UrgencyLevel.EMERGENCY
                ).count(),
                "priority": newborn_qs.filter(
                    status=EpisodeStatus.ACTIVE, current_urgency=UrgencyLevel.PRIORITY
                ).count(),
                "closed": newborn_qs.filter(status=EpisodeStatus.CLOSED).count(),
            },
            "immunisation": {
                "enrolled": imm_qs.count(),
                "defaulters_active": imm_qs.filter(
                    defaulter_status=DefaulterStatus.ACTIVE
                ).count(),
                "defaulters_lost": imm_qs.filter(
                    defaulter_status=DefaulterStatus.LOST
                ).count(),
            },
            "referrals": {
                "open": ref_qs.exclude(
                    status__in=[ReferralStatus.CLOSED, ReferralStatus.CANCELLED_BY_CLINICIAN]
                ).count(),
                "emergency": ref_qs.filter(
                    urgency=UrgencyLevel.EMERGENCY
                ).exclude(
                    status__in=[ReferralStatus.CLOSED, ReferralStatus.CANCELLED_BY_CLINICIAN]
                ).count(),
                "acknowledged": ref_qs.filter(
                    status__in=[ReferralStatus.ACCEPTED, ReferralStatus.IN_TRANSIT,
                                ReferralStatus.ARRIVED, ReferralStatus.DISPOSITION_RECORDED]
                ).count(),
                "closed": ref_qs.filter(status=ReferralStatus.CLOSED).count(),
            },
            "notifications": {
                "open": notif_qs.count(),
                "emergency": notif_qs.filter(urgency=UrgencyLevel.EMERGENCY).count(),
                "priority": notif_qs.filter(urgency=UrgencyLevel.PRIORITY).count(),
            },
            "audit": {
                "total_events": AuditEvent.objects.count(),
                "override_events": AuditEvent.objects.filter(action="CLINICIAN_OVERRIDE").count(),
                "telephony_events": AuditEvent.objects.filter(
                    action="TELEPHONY_REMOTE_OBSERVATION"
                ).count(),
            },
        }

        # Org unit counts by level (no patient data)
        if unit_ids is not None:
            org_qs = OrganisationUnit.objects.filter(id__in=unit_ids)
        else:
            org_qs = OrganisationUnit.objects.all()

        data["organisations"] = {
            "regions": org_qs.filter(unit_type="REGION").count(),
            "districts": org_qs.filter(unit_type="DISTRICT").count(),
            "subdistricts": org_qs.filter(unit_type="SUBDISTRICT").count(),
            "facilities": org_qs.filter(unit_type="FACILITY").count(),
        }

        return Response(data)
