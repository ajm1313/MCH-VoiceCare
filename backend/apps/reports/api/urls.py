"""Report API URLs."""
from rest_framework.routers import DefaultRouter
from .views import ReportViewSet, ScheduledReportViewSet

router = DefaultRouter()
router.register(r"", ReportViewSet, basename="report")
router.register(r"scheduled", ScheduledReportViewSet, basename="scheduled-report")
urlpatterns = router.urls
