"""Growth API URLs."""
from rest_framework.routers import DefaultRouter
from .views import GrowthMeasurementViewSet

router = DefaultRouter()
router.register(r"measurements", GrowthMeasurementViewSet, basename="growth-measurement")
urlpatterns = router.urls
