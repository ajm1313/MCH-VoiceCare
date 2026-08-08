"""Web views for accounts (login, logout, dashboard)."""
from django.contrib.auth.views import LoginView as DjangoLoginView, LogoutView as DjangoLogoutView
from django.views.generic import TemplateView
from django.contrib.auth.mixins import LoginRequiredMixin

from apps.core.enums import (
    EpisodeStatus, ReferralStatus, UrgencyLevel, NotificationStatus, DefaulterStatus,
)
from apps.core.permissions import get_user_org_unit_ids, filter_queryset_by_org
from apps.pregnancy.models import PregnancyEpisode
from apps.newborn.models import NewbornEpisode
from apps.immunisation.models import ChildImmunisationRecord
from apps.referrals.models import Referral
from apps.notifications.models import Notification


class LoginView(DjangoLoginView):
    template_name = "accounts/login.html"
    redirect_authenticated_user = True

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["title"] = "Login — MCH VoiceCare"
        return ctx


class LogoutView(DjangoLogoutView):
    next_page = "/login/"


class DashboardView(LoginRequiredMixin, TemplateView):
    template_name = "accounts/dashboard.html"
    login_url = "/login/"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["title"] = "Dashboard — MCH VoiceCare"
        user = self.request.user

        # Active pregnancies
        preg_qs = filter_queryset_by_org(
            PregnancyEpisode.objects.filter(status=EpisodeStatus.ACTIVE), user
        )
        ctx["active_pregnancies"] = preg_qs.count()
        ctx["emergency_pregnancies"] = preg_qs.filter(
            current_urgency=UrgencyLevel.EMERGENCY
        ).count()

        # Newborn episodes
        nb_qs = filter_queryset_by_org(
            NewbornEpisode.objects.filter(status=EpisodeStatus.ACTIVE), user
        )
        ctx["newborn_episodes"] = nb_qs.count()
        ctx["emergency_newborns"] = nb_qs.filter(
            current_urgency=UrgencyLevel.EMERGENCY
        ).count()

        # Immunisation children
        imm_qs = filter_queryset_by_org(ChildImmunisationRecord.objects.all(), user)
        ctx["immunisation_children"] = imm_qs.count()
        ctx["defaulters"] = imm_qs.filter(
            defaulter_status__in=[DefaulterStatus.ACTIVE, DefaulterStatus.LOST]
        ).count()

        # Open referrals
        ref_qs = filter_queryset_by_org(
            Referral.objects.exclude(
                status__in=[ReferralStatus.CLOSED, ReferralStatus.CANCELLED_BY_CLINICIAN]
            ),
            user,
        )
        ctx["open_referrals"] = ref_qs.count()
        ctx["emergency_referrals"] = ref_qs.filter(
            urgency=UrgencyLevel.EMERGENCY
        ).count()

        # Open notifications
        ctx["open_notifications"] = Notification.objects.filter(
            status=NotificationStatus.OPEN
        ).count()
        ctx["emergency_notifications"] = Notification.objects.filter(
            status=NotificationStatus.OPEN,
            urgency=UrgencyLevel.EMERGENCY,
        ).count()

        # Recent referrals for table
        ctx["recent_referrals"] = ref_qs.order_by("-created_at")[:5]

        return ctx
