"""Organisation unit web views — cascaded hierarchy management (spec §21.1).

Admins can create and manage the Region → District → Sub-district → Facility
hierarchy, assign facility capabilities, and link users to facilities.
"""
from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib import messages
from django.shortcuts import redirect, get_object_or_404
from django.views.generic import ListView, DetailView, CreateView, UpdateView
from django.urls import reverse_lazy

from apps.organisations.models import OrganisationUnit, FacilityCapability
from apps.organisations.forms import OrganisationUnitForm
from apps.core.enums import OrganisationUnitType, FacilityType
from apps.core.permissions import user_can_manage_users
from apps.audit.services import log_audit


class OrganisationUnitListView(LoginRequiredMixin, ListView):
    model = OrganisationUnit
    template_name = "organisations/orgunit_list.html"
    context_object_name = "org_units"
    paginate_by = 50
    login_url = "/login/"

    def get_queryset(self):
        qs = super().get_queryset().select_related("parent").order_by("unit_type", "name")
        unit_type = self.request.GET.get("unit_type")
        if unit_type:
            qs = qs.filter(unit_type=unit_type)
        q = self.request.GET.get("q")
        if q:
            qs = qs.filter(name__icontains=q) | qs.filter(code__icontains=q)
        return qs

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["can_manage"] = user_can_manage_users(self.request.user)
        ctx["unit_types"] = OrganisationUnitType.choices
        ctx["current_unit_type"] = self.request.GET.get("unit_type", "")
        # Summary counts
        qs = OrganisationUnit.objects.all()
        ctx["count_regions"] = qs.filter(unit_type=OrganisationUnitType.REGION).count()
        ctx["count_districts"] = qs.filter(unit_type=OrganisationUnitType.DISTRICT).count()
        ctx["count_subdistricts"] = qs.filter(unit_type=OrganisationUnitType.SUBDISTRICT).count()
        ctx["count_facilities"] = qs.filter(unit_type=OrganisationUnitType.FACILITY).count()
        return ctx


class OrganisationUnitDetailView(LoginRequiredMixin, DetailView):
    model = OrganisationUnit
    template_name = "organisations/orgunit_detail.html"
    context_object_name = "org_unit"
    login_url = "/login/"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        unit = self.object
        ctx["can_manage"] = user_can_manage_users(self.request.user)
        ctx["children"] = unit.children.all().order_by("unit_type", "name")
        ctx["users"] = unit.users.all().order_by("full_name")
        ctx["unit_types"] = OrganisationUnitType.choices
        ctx["facility_types"] = FacilityType.choices
        # Capability record for facilities
        if unit.unit_type == OrganisationUnitType.FACILITY:
            try:
                ctx["capability"] = unit.capabilities.get()
            except FacilityCapability.DoesNotExist:
                ctx["capability"] = None
        else:
            ctx["capability"] = None
        return ctx


class OrganisationUnitCreateView(LoginRequiredMixin, CreateView):
    model = OrganisationUnit
    template_name = "organisations/orgunit_form.html"
    form_class = OrganisationUnitForm
    login_url = "/login/"
    success_url = reverse_lazy("orgunit_list")

    def dispatch(self, request, *args, **kwargs):
        if not user_can_manage_users(request.user):
            messages.error(request, "Only administrators can create organisation units.")
            return redirect("orgunit_list")
        return super().dispatch(request, *args, **kwargs)

    def get_initial(self):
        initial = super().get_initial()
        parent_id = self.request.GET.get("parent")
        if parent_id:
            try:
                parent = OrganisationUnit.objects.get(pk=parent_id)
                initial["parent"] = parent
                # Auto-suggest the next level in the hierarchy
                if parent.unit_type == OrganisationUnitType.REGION:
                    initial["unit_type"] = OrganisationUnitType.DISTRICT
                elif parent.unit_type == OrganisationUnitType.DISTRICT:
                    initial["unit_type"] = OrganisationUnitType.SUBDISTRICT
                elif parent.unit_type == OrganisationUnitType.SUBDISTRICT:
                    initial["unit_type"] = OrganisationUnitType.FACILITY
            except OrganisationUnit.DoesNotExist:
                pass
        return initial

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["can_manage"] = user_can_manage_users(self.request.user)
        ctx["unit_types"] = OrganisationUnitType.choices
        ctx["facility_types"] = FacilityType.choices
        ctx["parent_units"] = OrganisationUnit.objects.all().order_by("unit_type", "name")
        parent_id = self.request.GET.get("parent")
        if parent_id:
            ctx["parent_unit"] = get_object_or_404(OrganisationUnit, pk=parent_id)
        return ctx

    def form_valid(self, form):
        response = super().form_valid(form)
        log_audit(
            actor=self.request.user.username,
            action="ORG_UNIT_CREATED",
            actor_role=self.request.user.system_role,
            entity_type="OrganisationUnit",
            entity_id=str(self.object.id),
            purpose="ADMIN",
            metadata={
                "name": self.object.name,
                "unit_type": self.object.unit_type,
                "parent": str(self.object.parent_id) if self.object.parent_id else None,
            },
        )
        messages.success(self.request, f"{self.object.name} created.")
        return response


class OrganisationUnitEditView(LoginRequiredMixin, UpdateView):
    model = OrganisationUnit
    template_name = "organisations/orgunit_form.html"
    form_class = OrganisationUnitForm
    login_url = "/login/"
    success_url = reverse_lazy("orgunit_list")

    def dispatch(self, request, *args, **kwargs):
        if not user_can_manage_users(request.user):
            messages.error(request, "Only administrators can edit organisation units.")
            return redirect("orgunit_list")
        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["can_manage"] = user_can_manage_users(self.request.user)
        ctx["unit_types"] = OrganisationUnitType.choices
        ctx["facility_types"] = FacilityType.choices
        ctx["parent_units"] = OrganisationUnit.objects.exclude(pk=self.object.pk).order_by("unit_type", "name")
        return ctx

    def form_valid(self, form):
        response = super().form_valid(form)
        log_audit(
            actor=self.request.user.username,
            action="ORG_UNIT_UPDATED",
            actor_role=self.request.user.system_role,
            entity_type="OrganisationUnit",
            entity_id=str(self.object.id),
            purpose="ADMIN",
            metadata={"name": self.object.name, "unit_type": self.object.unit_type},
        )
        messages.success(self.request, f"{self.object.name} updated.")
        return response
