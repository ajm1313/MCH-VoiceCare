"""Immunisation web views."""
from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.shortcuts import redirect, get_object_or_404
from django.views.generic import ListView, DetailView
from django.views import View

from apps.immunisation.models import (
    ChildImmunisationRecord, VaccineDose, CWCSession, DefaulterEpisode,
)
from apps.immunisation.forms import VaccineDoseForm, CWCSessionForm, DefaulterTraceForm


class ImmunisationListView(LoginRequiredMixin, ListView):
    model = ChildImmunisationRecord
    template_name = "immunisation/list.html"
    context_object_name = "records"
    paginate_by = 25
    login_url = "/login/"

    def get_queryset(self):
        qs = super().get_queryset().select_related("child").order_by("-created_at")
        q = self.request.GET.get("q")
        if q:
            qs = qs.filter(child__full_name__icontains=q)
        return qs


class ImmunisationChildDetailView(LoginRequiredMixin, DetailView):
    model = ChildImmunisationRecord
    template_name = "immunisation/child_detail.html"
    context_object_name = "record"
    login_url = "/login/"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["doses"] = self.object.doses.all()
        ctx["defaulters"] = self.object.defaulter_episodes.all()
        ctx["dose_form"] = VaccineDoseForm(initial={"child_record": self.object.pk})
        return ctx


class ImmunisationRecordDoseView(LoginRequiredMixin, View):
    login_url = "/login/"

    def post(self, request, pk):
        record = get_object_or_404(ChildImmunisationRecord, pk=pk)
        form = VaccineDoseForm(request.POST)
        if form.is_valid():
            dose = form.save(commit=False)
            dose.child_record = record
            dose.administered_by = request.user.username
            dose.save()
            messages.success(request, "Vaccine dose recorded.")
        else:
            messages.error(request, "Form errors — please correct and resubmit.")
        return redirect("immunisation_child_detail", pk=pk)


class CWCSessionListView(LoginRequiredMixin, ListView):
    model = CWCSession
    template_name = "immunisation/cwc_list.html"
    context_object_name = "sessions"
    paginate_by = 25
    login_url = "/login/"


class DefaulterListView(LoginRequiredMixin, ListView):
    model = DefaulterEpisode
    template_name = "immunisation/defaulter_list.html"
    context_object_name = "defaulters"
    paginate_by = 25
    login_url = "/login/"

    def get_queryset(self):
        qs = super().get_queryset().select_related("child_record").order_by("-created_at")
        status = self.request.GET.get("status")
        if status:
            qs = qs.filter(defaulter_status=status)
        return qs


class DefaulterDetailView(LoginRequiredMixin, DetailView):
    model = DefaulterEpisode
    template_name = "immunisation/defaulter_detail.html"
    context_object_name = "defaulter"
    login_url = "/login/"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["trace_form"] = DefaulterTraceForm(instance=self.object)
        return ctx


class DefaulterTraceView(LoginRequiredMixin, View):
    login_url = "/login/"

    def post(self, request, pk):
        defaulter = get_object_or_404(DefaulterEpisode, pk=pk)
        form = DefaulterTraceForm(request.POST, instance=defaulter)
        if form.is_valid():
            form.save()
            messages.success(request, "Trace updated.")
        return redirect("defaulter_detail", pk=pk)
