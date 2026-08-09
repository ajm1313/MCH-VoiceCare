"""Root URL configuration."""
from django.contrib import admin
from django.urls import include, path
from django.views.generic import RedirectView
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
    SpectacularRedocView,
)

# Import admin registrations so all models appear in the Django admin
import config.admin  # noqa: F401

from apps.organisations.api.views import OrganisationUnitViewSet


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("config.api_urls")),
    path("fhir/R4/", include("apps.fhir.urls")),
    path("", include("config.web_urls")),
    # Facility endpoint alias (spec §20.2): /api/v1/facilities/{id}/referral-options
    # maps to the same OrganisationUnit referral_options action for backward
    # compatibility with the spec naming.
    path(
        "api/v1/facilities/<uuid:pk>/referral-options",
        OrganisationUnitViewSet.as_view({"get": "referral_options"}),
        name="facility-referral-options",
    ),
    # ── OpenAPI schema and interactive docs (drf-spectacular) ──
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/schema/swagger/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    path(
        "api/schema/redoc/",
        SpectacularRedocView.as_view(url_name="schema"),
        name="redoc",
    ),
]

# Serve static files in development and via WhiteNoise in production
urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
