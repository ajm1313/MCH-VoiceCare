"""Organisation web URL routing — cascaded hierarchy management."""
from django.urls import path

from apps.organisations.web_views import (
    OrganisationUnitListView,
    OrganisationUnitDetailView,
    OrganisationUnitCreateView,
    OrganisationUnitEditView,
)

urlpatterns = [
    path("units/", OrganisationUnitListView.as_view(), name="orgunit_list"),
    path("units/create/", OrganisationUnitCreateView.as_view(), name="orgunit_create"),
    path("units/<uuid:pk>/", OrganisationUnitDetailView.as_view(), name="orgunit_detail"),
    path("units/<uuid:pk>/edit/", OrganisationUnitEditView.as_view(), name="orgunit_edit"),
]
