"""Integration API URLs."""
from rest_framework.routers import DefaultRouter
from .views import IntegrationConfigViewSet, ImportBatchViewSet, ImportRecordViewSet

router = DefaultRouter()
router.register(r"configs", IntegrationConfigViewSet, basename="integration-config")
router.register(r"imports", ImportBatchViewSet, basename="import-batch")
router.register(r"import-records", ImportRecordViewSet, basename="import-record")
urlpatterns = router.urls
