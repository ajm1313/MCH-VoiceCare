"""Organisation web views."""
from django.contrib.auth.mixins import LoginRequiredMixin
from django.urls import reverse_lazy
from django.views.generic import ListView, CreateView, UpdateView, DeleteView

from apps.organisations.models import OrganisationUnit
from apps.organisations.forms import OrganisationUnitForm


class OrgUnitListView(LoginRequiredMixin, ListView):
    model = OrganisationUnit
    template_name = "organisations/list.html"
    context_object_name = "org_units"
    paginate_by = 25
    login_url = "/login/"

    def get_queryset(self):
        qs = super().get_queryset().select_related("parent")
        unit_type = self.request.GET.get("type")
        if unit_type:
            qs = qs.filter(unit_type=unit_type)
        return qs

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["unit_types"] = ["REGION", "DISTRICT", "SUBDISTRICT", "FACILITY"]
        ctx["selected_type"] = self.request.GET.get("type", "")
        return ctx


class OrgUnitCreateView(LoginRequiredMixin, CreateView):
    model = OrganisationUnit
    form_class = OrganisationUnitForm
    template_name = "organisations/form.html"
    success_url = reverse_lazy("org_unit_list")
    login_url = "/login/"


class OrgUnitEditView(LoginRequiredMixin, UpdateView):
    model = OrganisationUnit
    form_class = OrganisationUnitForm
    template_name = "organisations/form.html"
    success_url = reverse_lazy("org_unit_list")
    login_url = "/login/"


class OrgUnitDeleteView(LoginRequiredMixin, DeleteView):
    model = OrganisationUnit
    template_name = "organisations/delete.html"
    success_url = reverse_lazy("org_unit_list")
    login_url = "/login/"
