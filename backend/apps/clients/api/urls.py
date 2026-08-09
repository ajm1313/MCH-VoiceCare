"""Clients API URLs."""
from rest_framework.routers import DefaultRouter
from django.urls import path

from .views import (
    PersonViewSet, HouseholdViewSet, CaregiverLinkViewSet,
    PatientReconciliationQueueViewSet,
)

router = DefaultRouter()
router.register(r"persons", PersonViewSet, basename="person")
router.register(r"households", HouseholdViewSet, basename="household")
router.register(r"caregiver-links", CaregiverLinkViewSet, basename="caregiver-link")
router.register(r"reconciliation-queue", PatientReconciliationQueueViewSet, basename="reconciliation-queue")

urlpatterns = router.urls
