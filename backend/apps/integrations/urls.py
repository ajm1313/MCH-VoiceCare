"""Integration web URLs."""
from django.urls import path
from .views import IntegrationListView, IntegrationCreateView

urlpatterns = [
    path("", IntegrationListView.as_view(), name="integration_list"),
    path("create/", IntegrationCreateView.as_view(), name="integration_create"),
]
