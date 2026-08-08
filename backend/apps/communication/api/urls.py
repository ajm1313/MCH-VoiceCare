"""Communication API URLs."""
from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import MessageTemplateViewSet, CommunicationCampaignViewSet, CommunicationLogViewSet
from apps.communication.telephony_views import TelephonyWebhookView

router = DefaultRouter()
router.register(r"templates", MessageTemplateViewSet, basename="message-template")
router.register(r"campaigns", CommunicationCampaignViewSet, basename="campaign")
router.register(r"logs", CommunicationLogViewSet, basename="communication-log")

urlpatterns = router.urls + [
    path("telephony/webhook/", TelephonyWebhookView.as_view(), name="telephony-webhook"),
]
