"""Core API URLs — sync, worklist, config, rule package, clinical override, package management, OCR, and dashboard endpoints."""
from django.urls import path
from django.http import JsonResponse
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.core.api.sync_views import SyncViewSet
from apps.core.api.worklist_views import WorklistViewSet
from apps.core.api.config_views import ConfigBootstrapView, ConfigUpdateView
from apps.core.api.rule_package_views import RulePackageLatestView, ModelPackageLatestView
from apps.core.api.override_views import ClinicianOverrideView
from apps.core.api.package_views import (
    PackageListView, PackageActiveView, PackageActivateView, PackageRollbackView,
)
from apps.core.api.dashboard_views import AggregateDashboardView
from apps.core.api.monitoring_views import MonitoringHealthView
from apps.core.api.prometheus_views import prometheus_metrics_view
from apps.core.api.ocr_views import (
    OCRTemplateListView, OCRTemplateDetailView,
    OCRJobCreateView, OCRJobListView, OCRJobDetailView,
    OCRJobConfirmView, OCRJobRejectView,
    OCRQualityMetricsView,
)
from apps.core.api.telephony_views import (
    TelephonyWebhookView, PromptPackListView,
    PromptPackByLanguageView, TelephonySessionListView,
    USSDEndpointView, PromptPackUploadView,
    AudioAssetView, AudioAssetUploadView,
)
from apps.core.api.ml_views import MLPredictView, MLMetadataView
from apps.core.api.ml_monitoring_views import MLMonitoringView


class HealthCheckView(APIView):
    """Public health check endpoint for load balancers and Railway."""
    permission_classes = [AllowAny]

    def get(self, request):
        return JsonResponse({"status": "ok", "service": "mch-voicecare"})


urlpatterns = [
    path("health/", HealthCheckView.as_view(), name="health-check"),
    path("sync/", SyncViewSet.as_view({"post": "push", "get": "pull"})),
    path("sync/batch", SyncViewSet.as_view({"post": "batch"})),
    path("worklists/my", WorklistViewSet.as_view({"get": "my"})),
    path("config/bootstrap", ConfigBootstrapView.as_view()),
    path("config/", ConfigUpdateView.as_view(), name="config-update"),
    path("packages/rules/latest", RulePackageLatestView.as_view()),
    path("packages/models/latest", ModelPackageLatestView.as_view()),
    path("clinical/override/", ClinicianOverrideView.as_view(), name="clinical-override"),
    path("packages/", PackageListView.as_view(), name="package-list"),
    path("packages/activate/", PackageActivateView.as_view(), name="package-activate"),
    path("packages/rollback/", PackageRollbackView.as_view(), name="package-rollback"),
    path("packages/<str:package_type>/active/", PackageActiveView.as_view(), name="package-active"),
    path("dashboard/aggregate/", AggregateDashboardView.as_view(), name="dashboard-aggregate"),
    path("monitoring/health/", MonitoringHealthView.as_view(), name="monitoring-health"),
    # Prometheus metrics endpoint (spec §27.1) — for external observability stacks
    path("monitoring/metrics", prometheus_metrics_view, name="prometheus-metrics"),
    # OCR (spec §16, §25)
    path("ocr/templates", OCRTemplateListView.as_view(), name="ocr-template-list"),
    path("ocr/templates/<str:pk>", OCRTemplateDetailView.as_view(), name="ocr-template-detail"),
    path("ocr/jobs", OCRJobCreateView.as_view(), name="ocr-job-create"),
    path("ocr/jobs/list", OCRJobListView.as_view(), name="ocr-job-list"),
    path("ocr/jobs/<str:pk>", OCRJobDetailView.as_view(), name="ocr-job-detail"),
    path("ocr/jobs/<str:pk>/confirm", OCRJobConfirmView.as_view(), name="ocr-job-confirm"),
    path("ocr/jobs/<str:pk>/reject", OCRJobRejectView.as_view(), name="ocr-job-reject"),
    path("ocr/quality-metrics", OCRQualityMetricsView.as_view(), name="ocr-quality-metrics"),
    # Telephony (spec §17, §22)
    path("telephony/webhooks/<str:provider>", TelephonyWebhookView.as_view(), name="telephony-webhook"),
    path("telephony/prompt-packs", PromptPackListView.as_view(), name="prompt-pack-list"),
    # Prompt pack upload — admin only (spec §17.2) — MUST be before <str:language> to avoid conflict
    path("telephony/prompt-packs/upload", PromptPackUploadView.as_view(), name="prompt-pack-upload"),
    path("telephony/prompt-packs/<str:language>", PromptPackByLanguageView.as_view(), name="prompt-pack-by-language"),
    path("telephony/sessions", TelephonySessionListView.as_view(), name="telephony-session-list"),
    # USSD (spec §17.5)
    path("telephony/ussd", USSDEndpointView.as_view(), name="telephony-ussd"),
    # Audio assets (spec §17.2)
    path("telephony/audio", AudioAssetUploadView.as_view(), name="audio-asset-upload"),
    path("telephony/audio/<str:asset_id>", AudioAssetView.as_view(), name="audio-asset-detail"),
    # Clinical ML (spec §13, §6.3)
    path("ml/predict", MLPredictView.as_view(), name="ml-predict"),
    path("ml/metadata", MLMetadataView.as_view(), name="ml-metadata"),
    path("ml/monitoring", MLMonitoringView.as_view(), name="ml-monitoring"),
]
