"""Web (server-rendered) URL routing.

Only spec-required web pages are included (spec §6.2):
- Dashboard, Aggregate Dashboard, Monitoring, Override Log
- Packages, Configuration, Audit Log, Users & Roles
- Clinical supervisor views: Clients, Pregnancy, Newborn,
  Immunisation, Growth, Referrals, Notifications

Old platform pages removed: Communication campaigns,
Integrations, Reports builder, Organisation units CRUD.
"""
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
    path("audit/", include("apps.audit.urls")),
    path("notifications/", include("apps.notifications.urls")),
    path("", RedirectView.as_view(url="/dashboard/", permanent=False)),
]
