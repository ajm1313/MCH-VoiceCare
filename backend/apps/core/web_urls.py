"""Core web URL routing — admin pages for config, packages, monitoring, dashboard."""
from django.urls import path

from apps.core.web_views import (
    ConfigAdminView,
    ConfigUpdateWebView,
    PackageListView,
    PackageActivateWebView,
    PackageRollbackWebView,
    MonitoringView,
    OverrideLogView,
    AggregateDashboardWebView,
)

urlpatterns = [
    path("config/", ConfigAdminView.as_view(), name="config_admin"),
    path("config/update/", ConfigUpdateWebView.as_view(), name="config_update_web"),
    path("packages/", PackageListView.as_view(), name="package_list_web"),
    path("packages/activate/", PackageActivateWebView.as_view(), name="package_activate_web"),
    path("packages/rollback/", PackageRollbackWebView.as_view(), name="package_rollback_web"),
    path("monitoring/", MonitoringView.as_view(), name="monitoring"),
    path("overrides/", OverrideLogView.as_view(), name="override_log"),
    path("aggregate/", AggregateDashboardWebView.as_view(), name="aggregate_dashboard"),
]
