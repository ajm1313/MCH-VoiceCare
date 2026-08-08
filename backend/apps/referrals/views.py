"""Referral web views."""
from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.generic import ListView, DetailView, CreateView, TemplateView
from django.urls import reverse_lazy
from django.shortcuts import get_object_or_404

from apps.referrals.models import Referral
from apps.audit.services import log_patient_view


class ReferralListView(LoginRequiredMixin, ListView):
    model = Referral
    template_name = "referrals/list.html"
    context_object_name = "referrals"
    paginate_by = 25
    login_url = "/login/"

    def get_queryset(self):
        qs = super().get_queryset().select_related("patient", "destination_facility").order_by("-created_at")
        status = self.request.GET.get("status")
        if status:
            qs = qs.filter(status=status)
        return qs


class ReferralDetailView(LoginRequiredMixin, DetailView):
    model = Referral
    template_name = "referrals/detail.html"
    context_object_name = "referral"
    login_url = "/login/"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["state_logs"] = self.object.state_logs.all()
        return ctx


class ReferralCreateView(LoginRequiredMixin, CreateView):
    model = Referral
    template_name = "referrals/form.html"
    fields = [
        "patient", "pregnancy_episode", "newborn_episode",
        "referral_reason", "referring_facility", "destination_facility",
        "urgency", "pre_referral_care",
    ]
    success_url = reverse_lazy("referral_list")
    login_url = "/login/"


class ReferralSlipView(LoginRequiredMixin, TemplateView):
    """
    Printable referral slip (spec §18.5).
    Contains patient ID, episode IDs, destination, urgency, pre-referral care, QR token.
    """
    template_name = "referrals/slip.html"
    login_url = "/login/"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        referral = get_object_or_404(Referral, pk=kwargs["pk"])
        ctx["referral"] = referral

        # Audit the patient view
        log_patient_view(
            actor=self.request.user.username,
            patient_id=referral.patient_id,
            actor_role=self.request.user.system_role,
            facility_id=referral.referring_facility_id,
            purpose="REFERRAL",
        )

        return ctx
