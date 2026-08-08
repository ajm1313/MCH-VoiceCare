"""
Worklist API — aggregated task list for the current user (spec §20.2).

GET /api/v1/worklists/my
Returns open notifications, pending referrals, and overdue items
scoped to the user's organisation unit.
"""
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone

from apps.core.permissions import get_user_org_unit_ids
from apps.notifications.models import Notification
from apps.referrals.models import Referral
from apps.core.enums import NotificationStatus, ReferralStatus, UrgencyLevel
from apps.pregnancy.models import PregnancyEpisode
from apps.newborn.models import NewbornEpisode
from apps.immunisation.models import ChildImmunisationRecord, DefaulterEpisode
from apps.core.enums import DefaulterStatus


class WorklistViewSet(viewsets.ViewSet):
    """Aggregated worklist for the current user."""
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["get"])
    def my(self, request):
        """Return the current user's worklist items."""
        user = request.user
        org_ids = get_user_org_unit_ids(user)

        # ── Open notifications ──
        notifications = Notification.objects.filter(
            status=NotificationStatus.OPEN,
        ).order_by("-urgency", "-created_at")[:20]

        notif_data = [{
            "id": str(n.id),
            "title": n.title,
            "notification_class": n.notification_class,
            "urgency": n.urgency,
            "due_datetime": n.due_datetime.isoformat() if n.due_datetime else None,
            "related_entity_type": n.related_entity_type,
            "related_entity_id": str(n.related_entity_id) if n.related_entity_id else None,
            "created_at": n.created_at.isoformat(),
        } for n in notifications]

        # ── Active referrals ──
        referral_qs = Referral.objects.filter(
            status__in=[
                ReferralStatus.REQUESTED,
                ReferralStatus.RECEIVING_FACILITY_NOTIFIED,
                ReferralStatus.ACCEPTED,
                ReferralStatus.TRANSPORT_REQUESTED,
                ReferralStatus.IN_TRANSIT,
            ],
        ).order_by("-urgency", "-created_at")

        if org_ids is not None:
            referral_qs = referral_qs.filter(
                referring_facility_id__in=org_ids,
            )

        referrals_data = [{
            "id": str(r.id),
            "patient_name": r.patient.full_name,
            "status": r.status,
            "urgency": r.urgency,
            "destination": r.destination_facility.name if r.destination_facility else None,
            "short_code": r.short_code,
            "created_at": r.created_at.isoformat(),
        } for r in referral_qs[:20]]

        # ── Emergency pregnancy episodes ──
        pregnancy_qs = PregnancyEpisode.objects.filter(
            current_urgency=UrgencyLevel.EMERGENCY,
        )
        if org_ids is not None:
            pregnancy_qs = pregnancy_qs.filter(woman__organisation_unit_id__in=org_ids)

        emergencies_data = [{
            "id": str(ep.id),
            "woman_name": ep.woman.full_name,
            "urgency": ep.current_urgency,
            "type": "pregnancy",
        } for ep in pregnancy_qs[:10]]

        # ── Emergency newborn episodes ──
        newborn_qs = NewbornEpisode.objects.filter(
            current_urgency=UrgencyLevel.EMERGENCY,
        )
        if org_ids is not None:
            newborn_qs = newborn_qs.filter(child__organisation_unit_id__in=org_ids)

        emergencies_data.extend([{
            "id": str(ep.id),
            "child_name": ep.child.full_name,
            "urgency": ep.current_urgency,
            "type": "newborn",
        } for ep in newborn_qs[:10]])

        # ── Immunisation defaulters ──
        defaulter_qs = ChildImmunisationRecord.objects.filter(
            defaulter_status__in=[DefaulterStatus.ACTIVE, DefaulterStatus.LOST],
        )
        if org_ids is not None:
            defaulter_qs = defaulter_qs.filter(child__organisation_unit_id__in=org_ids)

        defaulters_data = [{
            "id": str(r.id),
            "child_name": r.child.full_name,
            "defaulter_status": r.defaulter_status,
            "overdue_count": r.overdue_count,
            "next_due_date": r.next_due_date.isoformat() if r.next_due_date else None,
        } for r in defaulter_qs[:15]]

        # ── Summary counts ──
        summary = {
            "emergency_notifications": sum(1 for n in notif_data if n["urgency"] == UrgencyLevel.EMERGENCY),
            "open_referrals": len(referrals_data),
            "emergency_episodes": len(emergencies_data),
            "defaulters": len(defaulters_data),
        }

        return Response({
            "notifications": notif_data,
            "referrals": referrals_data,
            "emergencies": emergencies_data,
            "defaulters": defaulters_data,
            "summary": summary,
            "generated_at": timezone.now().isoformat(),
        })
