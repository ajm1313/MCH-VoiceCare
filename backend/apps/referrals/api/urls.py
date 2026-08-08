"""Referral API URLs."""
from rest_framework.routers import DefaultRouter
from .views import ReferralViewSet, ReferralStateLogViewSet

router = DefaultRouter()
router.register(r"", ReferralViewSet, basename="referral")
router.register(r"state-logs", ReferralStateLogViewSet, basename="referral-state-log")
urlpatterns = router.urls
