"""Integration web views."""
from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.generic import ListView, CreateView
from django.urls import reverse_lazy

from apps.integrations.models import IntegrationConfig


class IntegrationListView(LoginRequiredMixin, ListView):
    model = IntegrationConfig
    template_name = "integrations/list.html"
    context_object_name = "configs"
    paginate_by = 25
    login_url = "/login/"


class IntegrationCreateView(LoginRequiredMixin, CreateView):
    model = IntegrationConfig
    template_name = "integrations/form.html"
    fields = ["config_type", "provider_name", "status", "base_url", "api_key_ref"]
    success_url = reverse_lazy("integration_list")
    login_url = "/login/"
