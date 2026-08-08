"""Referral web URLs."""
from django.urls import path
from .views import ReferralListView, ReferralDetailView, ReferralCreateView, ReferralSlipView

urlpatterns = [
    path("", ReferralListView.as_view(), name="referral_list"),
    path("create/", ReferralCreateView.as_view(), name="referral_create"),
    path("<uuid:pk>/", ReferralDetailView.as_view(), name="referral_detail"),
    path("<uuid:pk>/slip/", ReferralSlipView.as_view(), name="referral_slip"),
]
