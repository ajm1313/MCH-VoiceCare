"""Notification API URLs."""
from rest_framework.routers import DefaultRouter
from .views import NotificationViewSet, ActionRecordViewSet

router = DefaultRouter()
router.register(r"", NotificationViewSet, basename="notification")
router.register(r"actions", ActionRecordViewSet, basename="action-record")
urlpatterns = router.urls
