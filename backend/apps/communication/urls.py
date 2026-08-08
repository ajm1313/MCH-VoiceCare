"""Communication web URLs."""
from django.urls import path
from .views import CampaignListView, CampaignDetailView, CampaignCreateView

urlpatterns = [
    path("", CampaignListView.as_view(), name="campaign_list"),
    path("create/", CampaignCreateView.as_view(), name="campaign_create"),
    path("<uuid:pk>/", CampaignDetailView.as_view(), name="campaign_detail"),
]
