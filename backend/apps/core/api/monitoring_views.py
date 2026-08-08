"""
Monitoring and observability API (spec §27).

GET /api/v1/monitoring/health — system health metrics for dashboards.
Returns technical and clinical safety monitoring metrics.
"""
from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.config_models import SystemConfig
from apps.core.enums import (
    ReferralStatus, UrgencyLevel, NotificationStatus, SyncStatus, MLMode,
)
from apps.core.permissions import user_can_manage_users
from apps.audit.models import AuditEvent
from apps.referrals.models import Referral
from apps.notifications.models import Notification
from apps.organisations.models import OrganisationUnit, FacilityCapability
from apps.core.package_models import Package


class MonitoringHealthView(APIView):
    """
    GET /api/v1/monitoring/health

    Returns system health and monitoring metrics (spec §27):
    - Technical: sync success/failure, backlog depth, package rollout, device last-sync
    - Clinical safety: alert counts, overrides, referral acceptance, time to care
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        last_24h = now - timedelta(hours=24)
        last_7d = now - timedelta(days=7)

        # ── Technical monitoring (§27.1) ──
        sync_events = AuditEvent.objects.filter(action__startswith="SYNC", occurred_at__gte=last_24h)
        sync_success = sync_events.filter(action="SYNC_SUCCESS").count()
        sync_failure = sync_events.filter(action="SYNC_FAILURE").count()

        pending_sync = AuditEvent.objects.filter(
            action="SYNC_BATCH", metadata__has_key="rejectedEvents",
        ).count()

        active_packages = Package.objects.filter(status="ACTIVE").count()
        staged_packages = Package.objects.filter(status="STAGED").count()
        revoked_packages = Package.objects.filter(status="REVOKED").count()

        # Telephony webhook failures
        telephony_failures = AuditEvent.objects.filter(
            action="TELEPHONY_WEBHOOK_ERROR", occurred_at__gte=last_24h,
        ).count()

        # Expired capability verifications
        expired_caps = FacilityCapability.objects.filter(
            verification_expires_at__lt=now,
        ).count()

        # ── Clinical safety monitoring (§27.2) ──
        emergency_alerts_24h = Notification.objects.filter(
            urgency=UrgencyLevel.EMERGENCY, created_at__gte=last_24h,
        ).count()

        open_alerts = Notification.objects.filter(
            status__in=[NotificationStatus.OPEN, NotificationStatus.ACKNOWLEDGED],
        ).count()

        overrides_7d = AuditEvent.objects.filter(
            action="CLINICIAN_OVERRIDE", occurred_at__gte=last_7d,
        ).count()

        # Referral metrics
        open_referrals = Referral.objects.exclude(
            status__in=[ReferralStatus.CLOSED, ReferralStatus.CANCELLED_BY_CLINICIAN],
        ).count()

        emergency_referrals = Referral.objects.filter(
            urgency=UrgencyLevel.EMERGENCY,
        ).exclude(
            status__in=[ReferralStatus.CLOSED, ReferralStatus.CANCELLED_BY_CLINICIAN],
        ).count()

        accepted_referrals = Referral.objects.filter(
            status__in=[ReferralStatus.ACCEPTED, ReferralStatus.IN_TRANSIT,
                        ReferralStatus.ARRIVED, ReferralStatus.DISPOSITION_RECORDED],
        ).count()

        # Referral acknowledgment delay (average for last 7 days)
        recent_referrals = Referral.objects.filter(
            created_at__gte=last_7d, acknowledged_at__isnull=False,
        )
        avg_ack_delay_minutes = None
        if recent_referrals.exists():
            total_delay = sum(
                (r.acknowledged_at - r.created_at).total_seconds() / 60
                for r in recent_referrals
            )
            avg_ack_delay_minutes = round(total_delay / recent_referrals.count(), 1)

        config = SystemConfig.get_config()

        return Response({
            "timestamp": now.isoformat(),
            "technical": {
                "sync_success_24h": sync_success,
                "sync_failure_24h": sync_failure,
                "telephony_failures_24h": telephony_failures,
                "active_packages": active_packages,
                "staged_packages": staged_packages,
                "revoked_packages": revoked_packages,
                "expired_capability_verifications": expired_caps,
                "total_org_units": OrganisationUnit.objects.count(),
            },
            "clinical_safety": {
                "emergency_alerts_24h": emergency_alerts_24h,
                "open_alerts": open_alerts,
                "clinician_overrides_7d": overrides_7d,
                "open_referrals": open_referrals,
                "emergency_referrals_open": emergency_referrals,
                "accepted_referrals": accepted_referrals,
                "avg_referral_ack_delay_minutes": avg_ack_delay_minutes,
            },
            "system": {
                "clinical_ml_mode": config.clinical_ml_mode,
                "rules_only": config.clinical_ml_mode == MLMode.RULES_ONLY,
                "active_rule_bundle_version": config.active_rule_bundle_version,
            },
        })
