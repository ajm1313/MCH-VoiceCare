"""Core API URLs — sync, worklist, config, rule package, clinical override, package management, OCR, and dashboard endpoints."""
from django.urls import path
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
from apps.core.api.ocr_views import (
    OCRTemplateListView, OCRTemplateDetailView,
    OCRJobCreateView, OCRJobListView, OCRJobDetailView,
    OCRJobConfirmView, OCRJobRejectView,
)
from apps.core.api.telephony_views import (
    TelephonyWebhookView, PromptPackListView,
    PromptPackByLanguageView, TelephonySessionListView,
)
from apps.core.api.ml_views import MLPredictView, MLMetadataView
from apps.core.api.ml_monitoring_views import MLMonitoringView

urlpatterns = [
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
    # OCR (spec §16, §25)
    path("ocr/templates", OCRTemplateListView.as_view(), name="ocr-template-list"),
    path("ocr/templates/<str:pk>", OCRTemplateDetailView.as_view(), name="ocr-template-detail"),
    path("ocr/jobs", OCRJobCreateView.as_view(), name="ocr-job-create"),
    path("ocr/jobs/list", OCRJobListView.as_view(), name="ocr-job-list"),
    path("ocr/jobs/<str:pk>", OCRJobDetailView.as_view(), name="ocr-job-detail"),
    path("ocr/jobs/<str:pk>/confirm", OCRJobConfirmView.as_view(), name="ocr-job-confirm"),
    path("ocr/jobs/<str:pk>/reject", OCRJobRejectView.as_view(), name="ocr-job-reject"),
    # Telephony (spec §17, §22)
    path("telephony/webhooks/<str:provider>", TelephonyWebhookView.as_view(), name="telephony-webhook"),
    path("telephony/prompt-packs", PromptPackListView.as_view(), name="prompt-pack-list"),
    path("telephony/prompt-packs/<str:language>", PromptPackByLanguageView.as_view(), name="prompt-pack-by-language"),
    path("telephony/sessions", TelephonySessionListView.as_view(), name="telephony-session-list"),
    # Clinical ML (spec §13, §6.3)
    path("ml/predict", MLPredictView.as_view(), name="ml-predict"),
    path("ml/metadata", MLMetadataView.as_view(), name="ml-metadata"),
    path("ml/monitoring", MLMonitoringView.as_view(), name="ml-monitoring"),
]
