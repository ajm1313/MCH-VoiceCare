"""Organisation web URLs."""
from django.urls import path

from .views import (
    OrgUnitListView, OrgUnitCreateView, OrgUnitEditView, OrgUnitDeleteView,
)

urlpatterns = [
    path("", OrgUnitListView.as_view(), name="org_unit_list"),
    path("create/", OrgUnitCreateView.as_view(), name="org_unit_create"),
    path("<uuid:pk>/edit/", OrgUnitEditView.as_view(), name="org_unit_edit"),
    path("<uuid:pk>/delete/", OrgUnitDeleteView.as_view(), name="org_unit_delete"),
]
