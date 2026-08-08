"""Pregnancy web URLs."""
from django.urls import path

from .views import (
    PregnancyListView, PregnancyDetailView, PregnancyObserveView,
)

urlpatterns = [
    path("", PregnancyListView.as_view(), name="pregnancy_list"),
    path("<uuid:pk>/", PregnancyDetailView.as_view(), name="pregnancy_detail"),
    path("<uuid:pk>/observe/", PregnancyObserveView.as_view(), name="pregnancy_observe"),
]
