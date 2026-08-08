"""Communication web views."""
from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.generic import ListView, DetailView, CreateView
from django.urls import reverse_lazy

from apps.communication.models import CommunicationCampaign, MessageTemplate


class CampaignListView(LoginRequiredMixin, ListView):
    model = CommunicationCampaign
    template_name = "communication/list.html"
    context_object_name = "campaigns"
    paginate_by = 25
    login_url = "/login/"


class CampaignDetailView(LoginRequiredMixin, DetailView):
    model = CommunicationCampaign
    template_name = "communication/detail.html"
    context_object_name = "campaign"
    login_url = "/login/"


class CampaignCreateView(LoginRequiredMixin, CreateView):
    model = CommunicationCampaign
    template_name = "communication/form.html"
    fields = ["title", "channel", "status", "template", "audience_count", "scheduled_at"]
    success_url = reverse_lazy("campaign_list")
    login_url = "/login/"
