"""Core admin web views — config, packages, monitoring, dashboard, override log."""
from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib import messages
from django.shortcuts import redirect
from django.utils import timezone
from django.views.generic import TemplateView, ListView
from django.views import View

from apps.core.config_models import SystemConfig
from apps.core.enums import MLMode
from apps.core.permissions import user_can_manage_users
from apps.core.package_models import Package
from apps.audit.models import AuditEvent
from apps.audit.services import log_audit


class ConfigAdminView(LoginRequiredMixin, TemplateView):
    template_name = "core/config.html"
    login_url = "/login/"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["config"] = SystemConfig.get_config()
        ctx["ml_modes"] = MLMode.choices
        ctx["can_manage"] = user_can_manage_users(self.request.user)
        return ctx


class ConfigUpdateWebView(LoginRequiredMixin, View):
    login_url = "/login/"

    def post(self, request):
        if not user_can_manage_users(request.user):
            messages.error(request, "Only administrators can update system configuration.")
            return redirect("config_admin")

        config = SystemConfig.get_config()
        changed = []

        bool_fields = [
            "engagement_model_enabled", "ocr_enabled", "ivr_dtmf_enabled",
            "ussd_enabled", "speech_capture_enabled",
            "remote_emergency_cascade_enabled", "print_referral_slip_enabled",
        ]
        int_fields = [
            "sync_batch_size", "sync_retry_max", "sync_retry_backoff_base_seconds",
            "referral_ack_timeout_minutes", "referral_escalation_timeout_minutes",
            "scan_temporary_retention_hours",
        ]
        str_fields = [
            "clinical_ml_mode", "scan_retention_mode", "active_rule_bundle_version",
        ]

        for field in bool_fields:
            if field in request.POST:
                setattr(config, field, request.POST.get(field) == "on")
                changed.append(field)

        for field in int_fields:
            val = request.POST.get(field)
            if val is not None and val != "":
                try:
                    setattr(config, field, int(val))
                    changed.append(field)
                except (ValueError, TypeError):
                    messages.error(request, f"Invalid value for {field}.")
                    return redirect("config_admin")

        for field in str_fields:
            val = request.POST.get(field)
            if val is not None and val != "":
                setattr(config, field, val)
                changed.append(field)

        # JSON fields (spec §34) — accept JSON text and parse
        import json as _json
        json_fields = [
            "ocr_confidence_thresholds", "supported_mch_template_versions",
            "referral_destinations", "role_contact_numbers",
        ]
        for field in json_fields:
            val = request.POST.get(field)
            if val is not None and val.strip() != "":
                try:
                    setattr(config, field, _json.loads(val))
                    changed.append(field)
                except (ValueError, TypeError):
                    messages.error(request, f"Invalid JSON for {field}.")
                    return redirect("config_admin")

        if config.speech_capture_enabled:
            messages.error(request, "speech_capture_enabled MUST be false in the first release.")
            return redirect("config_admin")

        if not changed:
            messages.warning(request, "No configuration fields were changed.")
            return redirect("config_admin")

        config.save()
        log_audit(
            actor=request.user.username,
            action="CONFIG_UPDATED",
            actor_role=request.user.system_role,
            entity_type="SystemConfig",
            entity_id=str(config.id),
            purpose="ADMIN",
            metadata={"changed_fields": changed},
        )
        messages.success(request, f"Configuration updated: {', '.join(changed)}")
        return redirect("config_admin")


class PackageListView(LoginRequiredMixin, ListView):
    template_name = "core/packages.html"
    context_object_name = "packages"
    login_url = "/login/"
    paginate_by = 25

    def get_queryset(self):
        return Package.objects.all().order_by("-created_at")

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["can_manage"] = user_can_manage_users(self.request.user)
        ctx["active_rule"] = Package.objects.filter(
            package_type="CLINICAL_RULES", status="ACTIVE"
        ).first()
        ctx["active_model"] = Package.objects.filter(
            package_type="CLINICAL_ML_MODEL", status="ACTIVE"
        ).first()
        return ctx


class PackageActivateWebView(LoginRequiredMixin, View):
    login_url = "/login/"

    def post(self, request):
        if not user_can_manage_users(request.user):
            messages.error(request, "Only administrators can activate packages.")
            return redirect("package_list_web")

        package_id = request.POST.get("package_id")
        try:
            pkg = Package.objects.get(pk=package_id)
        except Package.DoesNotExist:
            messages.error(request, "Package not found.")
            return redirect("package_list_web")

        Package.objects.filter(
            package_type=pkg.package_type, status="ACTIVE"
        ).update(status="RETIRED")

        pkg.status = "ACTIVE"
        pkg.activated_at = timezone.now()
        pkg.save()

        log_audit(
            actor=request.user.username,
            action="PACKAGE_ACTIVATED",
            actor_role=request.user.system_role,
            entity_type="Package",
            entity_id=str(pkg.id),
            purpose="ADMIN",
            metadata={"package_type": pkg.package_type, "version": pkg.version},
        )
        messages.success(request, f"Package {pkg.version} activated.")
        return redirect("package_list_web")


class PackageRollbackWebView(LoginRequiredMixin, View):
    login_url = "/login/"

    def post(self, request):
        if not user_can_manage_users(request.user):
            messages.error(request, "Only administrators can rollback packages.")
            return redirect("package_list_web")

        package_id = request.POST.get("package_id")
        try:
            pkg = Package.objects.get(pk=package_id)
        except Package.DoesNotExist:
            messages.error(request, "Package not found.")
            return redirect("package_list_web")

        Package.objects.filter(
            package_type=pkg.package_type, status="ACTIVE"
        ).update(status="RETIRED")

        pkg.status = "ACTIVE"
        pkg.activated_at = timezone.now()
        pkg.save()

        log_audit(
            actor=request.user.username,
            action="PACKAGE_ROLLBACK",
            actor_role=request.user.system_role,
            entity_type="Package",
            entity_id=str(pkg.id),
            purpose="ADMIN",
            metadata={"package_type": pkg.package_type, "version": pkg.version},
        )
        messages.success(request, f"Rolled back to package {pkg.version}.")
        return redirect("package_list_web")


class MonitoringView(LoginRequiredMixin, TemplateView):
    template_name = "core/monitoring.html"
    login_url = "/login/"

    def get_context_data(self, **kwargs):
        from datetime import timedelta
        from django.utils import timezone
        from apps.core.enums import (
            ReferralStatus, UrgencyLevel, NotificationStatus,
        )
        from apps.referrals.models import Referral
        from apps.notifications.models import Notification
        from apps.organisations.models import OrganisationUnit, FacilityCapability

        ctx = super().get_context_data(**kwargs)
        now = timezone.now()
        last_24h = now - timedelta(hours=24)
        last_7d = now - timedelta(days=7)

        sync_events = AuditEvent.objects.filter(
            action__startswith="SYNC", occurred_at__gte=last_24h
        )
        ctx["sync_success_24h"] = sync_events.filter(action="SYNC_SUCCESS").count()
        ctx["sync_failure_24h"] = sync_events.filter(action="SYNC_FAILURE").count()

        ctx["active_packages"] = Package.objects.filter(status="ACTIVE").count()
        ctx["staged_packages"] = Package.objects.filter(status="STAGED").count()
        ctx["revoked_packages"] = Package.objects.filter(status="REVOKED").count()

        ctx["telephony_failures_24h"] = AuditEvent.objects.filter(
            action="TELEPHONY_WEBHOOK_ERROR", occurred_at__gte=last_24h,
        ).count()

        ctx["expired_caps"] = FacilityCapability.objects.filter(
            verification_expires_at__lt=now,
        ).count()

        ctx["emergency_alerts_24h"] = Notification.objects.filter(
            urgency=UrgencyLevel.EMERGENCY, created_at__gte=last_24h,
        ).count()
        ctx["open_alerts"] = Notification.objects.filter(
            status__in=[NotificationStatus.OPEN, NotificationStatus.ACKNOWLEDGED],
        ).count()
        ctx["overrides_7d"] = AuditEvent.objects.filter(
            action="CLINICIAN_OVERRIDE", occurred_at__gte=last_7d,
        ).count()

        open_referrals = Referral.objects.exclude(
            status__in=[ReferralStatus.CLOSED, ReferralStatus.CANCELLED_BY_CLINICIAN],
        )
        ctx["open_referrals"] = open_referrals.count()
        ctx["emergency_referrals"] = open_referrals.filter(
            urgency=UrgencyLevel.EMERGENCY
        ).count()

        recent_referrals = Referral.objects.filter(
            created_at__gte=last_7d, acknowledged_at__isnull=False,
        )
        if recent_referrals.exists():
            total_delay = sum(
                (r.acknowledged_at - r.created_at).total_seconds() / 60
                for r in recent_referrals
            )
            ctx["avg_ack_delay_minutes"] = round(
                total_delay / recent_referrals.count(), 1
            )
        else:
            ctx["avg_ack_delay_minutes"] = None

        config = SystemConfig.get_config()
        ctx["ml_mode"] = config.clinical_ml_mode
        ctx["rule_bundle_version"] = config.active_rule_bundle_version
        ctx["total_org_units"] = OrganisationUnit.objects.count()

        ctx["can_manage"] = user_can_manage_users(self.request.user)
        return ctx


class OverrideLogView(LoginRequiredMixin, ListView):
    template_name = "core/override_log.html"
    context_object_name = "overrides"
    login_url = "/login/"
    paginate_by = 25

    def get_queryset(self):
        return AuditEvent.objects.filter(
            action="CLINICIAN_OVERRIDE"
        ).order_by("-occurred_at")


class AggregateDashboardWebView(LoginRequiredMixin, TemplateView):
    template_name = "core/aggregate_dashboard.html"
    login_url = "/login/"

    def get_context_data(self, **kwargs):
        from django.db.models import Q
        from apps.core.enums import (
            EpisodeStatus, ReferralStatus, UrgencyLevel,
            NotificationStatus, DefaulterStatus,
        )
        from apps.core.permissions import get_user_org_unit_ids
        from apps.pregnancy.models import PregnancyEpisode
        from apps.newborn.models import NewbornEpisode
        from apps.immunisation.models import ChildImmunisationRecord
        from apps.referrals.models import Referral
        from apps.notifications.models import Notification
        from apps.organisations.models import OrganisationUnit

        ctx = super().get_context_data(**kwargs)
        user = self.request.user
        unit_ids = get_user_org_unit_ids(user)

        preg_qs = PregnancyEpisode.objects.all()
        newborn_qs = NewbornEpisode.objects.all()
        imm_qs = ChildImmunisationRecord.objects.all()
        ref_qs = Referral.objects.all()

        if unit_ids is not None:
            if not unit_ids:
                preg_qs = PregnancyEpisode.objects.none()
                newborn_qs = NewbornEpisode.objects.none()
                imm_qs = ChildImmunisationRecord.objects.none()
                ref_qs = Referral.objects.none()
            else:
                preg_qs = preg_qs.filter(woman__organisation_unit_id__in=unit_ids)
                newborn_qs = newborn_qs.filter(child__organisation_unit_id__in=unit_ids)
                imm_qs = imm_qs.filter(child__organisation_unit_id__in=unit_ids)
                ref_qs = ref_qs.filter(
                    Q(referring_facility_id__in=unit_ids) |
                    Q(destination_facility_id__in=unit_ids) |
                    Q(patient__organisation_unit_id__in=unit_ids)
                )

        notif_qs = Notification.objects.filter(status=NotificationStatus.OPEN)

        ctx["preg_active"] = preg_qs.filter(status=EpisodeStatus.ACTIVE).count()
        ctx["preg_emergency"] = preg_qs.filter(
            status=EpisodeStatus.ACTIVE, current_urgency=UrgencyLevel.EMERGENCY
        ).count()
        ctx["preg_priority"] = preg_qs.filter(
            status=EpisodeStatus.ACTIVE, current_urgency=UrgencyLevel.PRIORITY
        ).count()

        ctx["nb_active"] = newborn_qs.filter(status=EpisodeStatus.ACTIVE).count()
        ctx["nb_emergency"] = newborn_qs.filter(
            status=EpisodeStatus.ACTIVE, current_urgency=UrgencyLevel.EMERGENCY
        ).count()

        ctx["imm_enrolled"] = imm_qs.count()
        ctx["imm_defaulters"] = imm_qs.filter(
            defaulter_status__in=[DefaulterStatus.ACTIVE, DefaulterStatus.LOST]
        ).count()

        ctx["ref_open"] = ref_qs.exclude(
            status__in=[ReferralStatus.CLOSED, ReferralStatus.CANCELLED_BY_CLINICIAN]
        ).count()
        ctx["ref_emergency"] = ref_qs.filter(
            urgency=UrgencyLevel.EMERGENCY
        ).exclude(
            status__in=[ReferralStatus.CLOSED, ReferralStatus.CANCELLED_BY_CLINICIAN]
        ).count()

        ctx["notif_open"] = notif_qs.count()
        ctx["notif_emergency"] = notif_qs.filter(
            urgency=UrgencyLevel.EMERGENCY
        ).count()

        org_qs = OrganisationUnit.objects.all()
        if unit_ids is not None:
            org_qs = org_qs.filter(id__in=unit_ids)
        ctx["org_regions"] = org_qs.filter(unit_type="REGION").count()
        ctx["org_districts"] = org_qs.filter(unit_type="DISTRICT").count()
        ctx["org_subdistricts"] = org_qs.filter(unit_type="SUBDISTRICT").count()
        ctx["org_facilities"] = org_qs.filter(unit_type="FACILITY").count()

        return ctx
