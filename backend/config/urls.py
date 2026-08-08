"""Root URL configuration."""
from django.contrib import admin
from django.urls import include, path
from django.views.generic import RedirectView
from django.conf import settings
from django.conf.urls.static import static

# Import admin registrations so all models appear in the Django admin
import config.admin  # noqa: F401

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("config.api_urls")),
    path("fhir/R4/", include("apps.fhir.urls")),
    path("", include("config.web_urls")),
]

# Serve static files in development and via WhiteNoise in production
urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
