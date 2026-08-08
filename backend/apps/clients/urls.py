"""Clients web URLs."""
from django.urls import path

from .views import (
    PersonListView, PersonDetailView, PersonCreateView, PersonEditView,
    unified_register,
)

urlpatterns = [
    path("", PersonListView.as_view(), name="person_list"),
    path("register/", unified_register, name="unified_register"),
    path("create/", PersonCreateView.as_view(), name="person_create"),
    path("<uuid:pk>/", PersonDetailView.as_view(), name="person_detail"),
    path("<uuid:pk>/edit/", PersonEditView.as_view(), name="person_edit"),
]
