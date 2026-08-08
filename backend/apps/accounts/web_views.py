"""User and role-scope management web views."""
from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib import messages
from django.shortcuts import redirect, get_object_or_404
from django.views.generic import ListView, DetailView, CreateView, UpdateView, DeleteView
from django.views import View
from django.urls import reverse_lazy

from apps.accounts.models import UserAccount, UserRoleScope
from apps.core.enums import SystemRole
from apps.core.permissions import user_can_manage_users
from apps.organisations.models import OrganisationUnit
from apps.audit.services import log_audit


class UserListView(LoginRequiredMixin, ListView):
    model = UserAccount
    template_name = "accounts/user_list.html"
    context_object_name = "users"
    paginate_by = 25
    login_url = "/login/"

    def get_queryset(self):
        qs = super().get_queryset().order_by("-date_joined")
        q = self.request.GET.get("q")
        if q:
            qs = qs.filter(full_name__icontains=q) | qs.filter(username__icontains=q)
        return qs

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["can_manage"] = user_can_manage_users(self.request.user)
        return ctx


class UserDetailView(LoginRequiredMixin, DetailView):
    model = UserAccount
    template_name = "accounts/user_detail.html"
    context_object_name = "user_obj"
    login_url = "/login/"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["role_scopes"] = self.object.role_scopes.select_related("scope_unit")
        ctx["can_manage"] = user_can_manage_users(self.request.user)
        ctx["org_units"] = OrganisationUnit.objects.all().order_by("name")
        return ctx


class UserCreateView(LoginRequiredMixin, CreateView):
    model = UserAccount
    template_name = "accounts/user_form.html"
    fields = [
        "username", "full_name", "mobile_number", "email",
        "system_role", "organisation_unit",
        "is_active", "is_super_admin", "can_view_reports",
    ]
    login_url = "/login/"
    success_url = reverse_lazy("user_list")

    def dispatch(self, request, *args, **kwargs):
        if not user_can_manage_users(request.user):
            messages.error(request, "Only administrators can create users.")
            return redirect("user_list")
        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["org_units"] = OrganisationUnit.objects.all().order_by("name")
        ctx["system_roles"] = SystemRole.choices
        return ctx

    def form_valid(self, form):
        response = super().form_valid(form)
        log_audit(
            actor=self.request.user.username,
            action="USER_CREATED",
            actor_role=self.request.user.system_role,
            entity_type="UserAccount",
            entity_id=str(self.object.id),
            purpose="ADMIN",
            metadata={"username": self.object.username},
        )
        messages.success(self.request, f"User {self.object.username} created.")
        return response


class UserEditView(LoginRequiredMixin, UpdateView):
    model = UserAccount
    template_name = "accounts/user_form.html"
    fields = [
        "username", "full_name", "mobile_number", "email",
        "system_role", "organisation_unit",
        "is_active", "is_super_admin", "can_view_reports",
    ]
    login_url = "/login/"
    success_url = reverse_lazy("user_list")

    def dispatch(self, request, *args, **kwargs):
        if not user_can_manage_users(request.user):
            messages.error(request, "Only administrators can edit users.")
            return redirect("user_list")
        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["org_units"] = OrganisationUnit.objects.all().order_by("name")
        ctx["system_roles"] = SystemRole.choices
        return ctx

    def form_valid(self, form):
        response = super().form_valid(form)
        log_audit(
            actor=self.request.user.username,
            action="USER_UPDATED",
            actor_role=self.request.user.system_role,
            entity_type="UserAccount",
            entity_id=str(self.object.id),
            purpose="ADMIN",
            metadata={"username": self.object.username},
        )
        messages.success(self.request, f"User {self.object.username} updated.")
        return response


class RoleScopeAssignView(LoginRequiredMixin, View):
    login_url = "/login/"

    def post(self, request, user_pk):
        if not user_can_manage_users(request.user):
            messages.error(request, "Only administrators can assign role scopes.")
            return redirect("user_list")

        user = get_object_or_404(UserAccount, pk=user_pk)
        role_code = request.POST.get("role_code")
        scope_unit_id = request.POST.get("scope_unit")

        if not role_code or not scope_unit_id:
            messages.error(request, "Both role and scope unit are required.")
            return redirect("user_detail", pk=user_pk)

        try:
            scope_unit = OrganisationUnit.objects.get(pk=scope_unit_id)
        except OrganisationUnit.DoesNotExist:
            messages.error(request, "Organisation unit not found.")
            return redirect("user_detail", pk=user_pk)

        scope, created = UserRoleScope.objects.get_or_create(
            user=user,
            role_code=role_code,
            scope_unit=scope_unit,
            defaults={"assigned_by": request.user},
        )

        if not created:
            messages.info(request, "Role scope already exists.")
        else:
            log_audit(
                actor=request.user.username,
                action="ROLE_SCOPE_ASSIGNED",
                actor_role=request.user.system_role,
                entity_type="UserRoleScope",
                entity_id=str(scope.id),
                purpose="ADMIN",
                metadata={"user": user.username, "role": role_code},
            )
            messages.success(request, f"Role scope assigned to {user.username}.")

        return redirect("user_detail", pk=user_pk)


class RoleScopeDeleteView(LoginRequiredMixin, View):
    login_url = "/login/"

    def post(self, request, pk):
        if not user_can_manage_users(request.user):
            messages.error(request, "Only administrators can remove role scopes.")
            return redirect("user_list")

        scope = get_object_or_404(UserRoleScope, pk=pk)
        user_pk = scope.user.pk
        scope.delete()
        log_audit(
            actor=request.user.username,
            action="ROLE_SCOPE_REMOVED",
            actor_role=request.user.system_role,
            entity_type="UserRoleScope",
            entity_id=str(pk),
            purpose="ADMIN",
            metadata={"user": scope.user.username},
        )
        messages.success(request, "Role scope removed.")
        return redirect("user_detail", pk=user_pk)
