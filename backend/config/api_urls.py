"""API URL routing — all endpoints under /api/v1/."""
from django.urls import include, path

urlpatterns = [
    path("accounts/", include("apps.accounts.api.urls")),
    path("organisations/", include("apps.organisations.api.urls")),
    path("clients/", include("apps.clients.api.urls")),
    path("pregnancy/", include("apps.pregnancy.api.urls")),
    path("newborn/", include("apps.newborn.api.urls")),
    path("immunisation/", include("apps.immunisation.api.urls")),
    path("growth/", include("apps.growth.api.urls")),
    path("referrals/", include("apps.referrals.api.urls")),
    path("audit/", include("apps.audit.api.urls")),
    path("notifications/", include("apps.notifications.api.urls")),
    path("communication/", include("apps.communication.api.urls")),
    path("reports/", include("apps.reports.api.urls")),
    path("integrations/", include("apps.integrations.api.urls")),
    path("", include("apps.core.api.urls")),
]
