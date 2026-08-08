"""Root URL configuration."""
from django.contrib import admin
from django.urls import include, path
from django.views.generic import RedirectView

# Import admin registrations so all models appear in the Django admin
import config.admin  # noqa: F401

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("config.api_urls")),
    path("fhir/R4/", include("apps.fhir.urls")),
    path("", include("config.web_urls")),
]
