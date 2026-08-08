"""Immunisation web URLs."""
from django.urls import path

from .views import (
    ImmunisationListView, ImmunisationChildDetailView, ImmunisationRecordDoseView,
    CWCSessionListView, DefaulterListView, DefaulterDetailView, DefaulterTraceView,
)

urlpatterns = [
    path("", ImmunisationListView.as_view(), name="immunisation_list"),
    path("<uuid:pk>/", ImmunisationChildDetailView.as_view(), name="immunisation_child_detail"),
    path("<uuid:pk>/record-dose/", ImmunisationRecordDoseView.as_view(), name="immunisation_record_dose"),
    path("cwc/", CWCSessionListView.as_view(), name="cwc_session_list"),
    path("defaulters/", DefaulterListView.as_view(), name="defaulter_list"),
    path("defaulters/<uuid:pk>/", DefaulterDetailView.as_view(), name="defaulter_detail"),
    path("defaulters/<uuid:pk>/trace/", DefaulterTraceView.as_view(), name="defaulter_trace"),
]
