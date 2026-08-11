"""
Prometheus metrics endpoint (spec §27.1).

GET /metrics — returns Prometheus-format text metrics for scraping by
Prometheus/Grafana/VictoriaMetrics observability stacks.

Exposes all technical and clinical safety monitoring metrics from spec §27
in the Prometheus text exposition format:
https://prometheus.io/docs/instrumenting/exposition_formats/

Security:
- Endpoint is protected by a bearer token (MONITORING_TOKEN env var)
- No patient identifiers are exposed (spec §27.2)
- All metrics are aggregate counts or averages
"""
from datetime import timedelta

from django.conf import settings
from django.db.models import Count, Q
from django.utils import timezone
from django.http import HttpResponse, HttpResponseForbidden

from apps.core.config_models import SystemConfig
from apps.core.enums import (
    ReferralStatus, UrgencyLevel, NotificationStatus, MLMode,
)
from apps.audit.models import AuditEvent
from apps.referrals.models import Referral, ReferralStateLog
from apps.notifications.models import Notification
from apps.organisations.models import OrganisationUnit, FacilityCapability
from apps.core.package_models import Package
from apps.accounts.models import Device
from apps.core.permissions import get_descendant_unit_ids as _get_descendants


def _format_metric(name, value, metric_type="gauge", help_text="", labels=None):
    """
    Format a single Prometheus metric line.

    Args:
        name: Metric name (e.g. mch_sync_success_total)
        value: Numeric value
        metric_type: counter, gauge, or histogram
        help_text: Help description
        labels: Dict of label key-value pairs
    """
    lines = []
    if help_text:
        lines.append(f"# HELP {name} {help_text}")
    lines.append(f"# TYPE {name} {metric_type}")

    if labels:
        label_str = ",".join(f'{k}="{v}"' for k, v in labels.items())
        lines.append(f"{name}{{{label_str}}} {value}")
    else:
        lines.append(f"{name} {value}")

    return "\n".join(lines) + "\n"


def _collect_metrics():
    """
    Collect all monitoring metrics and return as Prometheus text format.

    Metrics are organized into:
    - Technical monitoring (§27.1): sync, telephony, packages, devices
    - Clinical safety monitoring (§27.2): alerts, referrals, overrides
    - System info: build version, ML mode, feature flags
    """
    now = timezone.now()
    last_24h = now - timedelta(hours=24)
    last_7d = now - timedelta(days=7)

    output = []

    # ── System info (info-type metrics) ──
    config = SystemConfig.get_config()
    output.append(_format_metric(
        "mch_info", 1, metric_type="gauge",
        help_text="MCH VoiceCare system info",
        labels={"ml_mode": config.clinical_ml_mode, "version": "1.0.0"},
    ))

    # ── Technical monitoring (§27.1) ──

    # Sync success/failure rate
    sync_events = AuditEvent.objects.filter(
        action__startswith="SYNC", occurred_at__gte=last_24h
    )
    sync_success = sync_events.filter(action="SYNC_SUCCESS").count()
    sync_failure = sync_events.filter(action="SYNC_FAILURE").count()

    output.append(_format_metric(
        "mch_sync_success_total", sync_success, metric_type="counter",
        help_text="Total successful sync events in last 24 hours",
    ))
    output.append(_format_metric(
        "mch_sync_failure_total", sync_failure, metric_type="counter",
        help_text="Total failed sync events in last 24 hours",
    ))
    if sync_success + sync_failure > 0:
        sync_rate = sync_success / (sync_success + sync_failure)
    else:
        sync_rate = 1.0
    output.append(_format_metric(
        "mch_sync_success_rate", sync_rate, metric_type="gauge",
        help_text="Sync success rate (0-1) in last 24 hours",
    ))

    # Telephony webhook failures
    telephony_failures = AuditEvent.objects.filter(
        action="TELEPHONY_WEBHOOK_ERROR", occurred_at__gte=last_24h,
    ).count()
    output.append(_format_metric(
        "mch_telephony_failures_total", telephony_failures, metric_type="counter",
        help_text="Total telephony webhook failures in last 24 hours",
    ))

    # Package rollout status
    active_packages = Package.objects.filter(status="ACTIVE").count()
    staged_packages = Package.objects.filter(status="STAGED").count()
    revoked_packages = Package.objects.filter(status="REVOKED").count()

    output.append(_format_metric(
        "mch_packages_active", active_packages, metric_type="gauge",
        help_text="Number of active packages",
    ))
    output.append(_format_metric(
        "mch_packages_staged", staged_packages, metric_type="gauge",
        help_text="Number of staged packages",
    ))
    output.append(_format_metric(
        "mch_packages_revoked", revoked_packages, metric_type="gauge",
        help_text="Number of revoked packages",
    ))

    # Expired capability verifications
    expired_caps = FacilityCapability.objects.filter(
        verification_expires_at__lt=now,
    ).count()
    output.append(_format_metric(
        "mch_expired_capability_verifications", expired_caps, metric_type="gauge",
        help_text="Number of facility capabilities with expired verification",
    ))

    # Device last-sync stats
    active_devices = Device.objects.filter(is_revoked=False)
    device_count = active_devices.count()
    output.append(_format_metric(
        "mch_active_devices", device_count, metric_type="gauge",
        help_text="Number of active (non-revoked) devices",
    ))

    synced_devices = active_devices.exclude(last_seen_at__isnull=True)
    if synced_devices.exists():
        total_seconds = sum(
            (now - d.last_seen_at).total_seconds() for d in synced_devices
        )
        avg_sync_hours = total_seconds / synced_devices.count() / 3600
    else:
        avg_sync_hours = 0

    output.append(_format_metric(
        "mch_device_last_sync_avg_hours", round(avg_sync_hours, 2), metric_type="gauge",
        help_text="Average hours since last device sync",
    ))

    # Total org units
    output.append(_format_metric(
        "mch_org_units_total", OrganisationUnit.objects.count(), metric_type="gauge",
        help_text="Total number of organisation units",
    ))

    # ── Clinical safety monitoring (§27.2) ──

    # Alert counts and rate
    emergency_alerts_24h = Notification.objects.filter(
        urgency=UrgencyLevel.EMERGENCY, created_at__gte=last_24h,
    ).count()
    open_alerts = Notification.objects.filter(
        status__in=[NotificationStatus.OPEN, NotificationStatus.ACKNOWLEDGED],
    ).count()

    output.append(_format_metric(
        "mch_emergency_alerts_24h", emergency_alerts_24h, metric_type="counter",
        help_text="Emergency alerts created in last 24 hours",
    ))
    output.append(_format_metric(
        "mch_open_alerts", open_alerts, metric_type="gauge",
        help_text="Currently open alerts",
    ))

    # Overrides
    overrides_7d = AuditEvent.objects.filter(
        action="CLINICIAN_OVERRIDE", occurred_at__gte=last_7d,
    ).count()
    output.append(_format_metric(
        "mch_clinician_overrides_7d", overrides_7d, metric_type="counter",
        help_text="Clinician overrides in last 7 days",
    ))

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

    output.append(_format_metric(
        "mch_open_referrals", open_referrals, metric_type="gauge",
        help_text="Currently open referrals",
    ))
    output.append(_format_metric(
        "mch_emergency_referrals_open", emergency_referrals, metric_type="gauge",
        help_text="Open emergency referrals",
    ))
    output.append(_format_metric(
        "mch_accepted_referrals", accepted_referrals, metric_type="gauge",
        help_text="Accepted referrals (in progress or completed)",
    ))

    # Referral acknowledgment delay (average for last 7 days)
    recent_referrals = Referral.objects.filter(
        created_at__gte=last_7d, acknowledged_at__isnull=False,
    )
    if recent_referrals.exists():
        total_delay = sum(
            (r.acknowledged_at - r.created_at).total_seconds() / 60
            for r in recent_referrals
        )
        avg_ack_delay = total_delay / recent_referrals.count()
    else:
        avg_ack_delay = 0

    output.append(_format_metric(
        "mch_referral_ack_delay_avg_minutes", round(avg_ack_delay, 2), metric_type="gauge",
        help_text="Average referral acknowledgment delay in minutes (last 7 days)",
    ))

    # Transport activation
    transport_active = Referral.objects.filter(
        status__in=[ReferralStatus.TRANSPORT_REQUESTED, ReferralStatus.IN_TRANSIT],
    ).count()
    output.append(_format_metric(
        "mch_transport_active", transport_active, metric_type="gauge",
        help_text="Referrals with active transport",
    ))

    # Arrival confirmation
    arrivals_24h = ReferralStateLog.objects.filter(
        to_status=ReferralStatus.ARRIVED, created_at__gte=last_24h,
    ).count()
    output.append(_format_metric(
        "mch_arrivals_24h", arrivals_24h, metric_type="counter",
        help_text="Referral arrivals in last 24 hours",
    ))

    # Time to care
    arrived_referrals = Referral.objects.filter(
        status__in=[ReferralStatus.ARRIVED, ReferralStatus.DISPOSITION_RECORDED, ReferralStatus.CLOSED],
        created_at__gte=last_7d,
    ).exclude(updated_at__isnull=True)
    if arrived_referrals.exists():
        total_care_time = sum(
            (r.updated_at - r.created_at).total_seconds() / 3600
            for r in arrived_referrals
        )
        avg_time_to_care = total_care_time / arrived_referrals.count()
    else:
        avg_time_to_care = 0

    output.append(_format_metric(
        "mch_time_to_care_avg_hours", round(avg_time_to_care, 2), metric_type="gauge",
        help_text="Average time from referral to care in hours (last 7 days)",
    ))

    # False negatives
    false_negatives = ReferralStateLog.objects.filter(
        to_status=ReferralStatus.NO_ACK_ESCALATED,
        created_at__gte=last_7d,
    ).count()
    output.append(_format_metric(
        "mch_false_negatives_7d", false_negatives, metric_type="counter",
        help_text="Referrals that escalated from routine to emergency (false negatives, last 7 days)",
    ))

    # Subgroup performance: referral counts by region
    for org in OrganisationUnit.objects.filter(unit_type="REGION"):
        descendant_ids = _get_descendants(org)
        count = Referral.objects.filter(
            referring_facility_id__in=descendant_ids,
            created_at__gte=last_7d,
        ).count()
        output.append(_format_metric(
            "mch_referrals_by_region", count, metric_type="gauge",
            help_text="Referrals by region (last 7 days)",
            labels={"region": org.name},
        ))

    return "".join(output)


def prometheus_metrics_view(request):
    """
    GET /metrics — Prometheus text exposition format endpoint.

    Protected by a bearer token via MONITORING_TOKEN env var.
    If MONITORING_TOKEN is not set, falls back to requiring Django admin auth.
    """
    # Check authentication
    monitoring_token = getattr(settings, "MONITORING_TOKEN", None)

    if monitoring_token:
        # Token-based auth (for external Prometheus scraper)
        auth_header = request.headers.get("Authorization", "")
        if auth_header != f"Bearer {monitoring_token}":
            return HttpResponseForbidden("Invalid monitoring token")
    else:
        # Fall back to Django session auth (admin only)
        if not request.user.is_authenticated or not request.user.is_staff:
            return HttpResponseForbidden("Authentication required")

    metrics_text = _collect_metrics()
    return HttpResponse(metrics_text, content_type="text/plain; version=0.0.4; charset=utf-8")
