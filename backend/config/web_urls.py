"""Web (server-rendered) URL routing."""
from django.urls import include, path
from django.views.generic import RedirectView

from apps.accounts.views import LoginView, LogoutView, DashboardView

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("accounts/", include("apps.accounts.web_urls")),
    path("system/", include("apps.core.web_urls")),
    path("clients/", include("apps.clients.urls")),
    path("pregnancy/", include("apps.pregnancy.urls")),
    path("newborn/", include("apps.newborn.urls")),
    path("immunisation/", include("apps.immunisation.urls")),
    path("growth/", include("apps.growth.urls")),
    path("referrals/", include("apps.referrals.urls")),
    path("organisations/", include("apps.organisations.urls")),
    path("audit/", include("apps.audit.urls")),
    path("notifications/", include("apps.notifications.urls")),
    path("communication/", include("apps.communication.urls")),
    path("reports/", include("apps.reports.urls")),
    path("integrations/", include("apps.integrations.urls")),
    path("", RedirectView.as_view(url="/dashboard/", permanent=False)),
]
