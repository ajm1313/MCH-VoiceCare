"""Pregnancy API URLs."""
from rest_framework.routers import DefaultRouter
from django.urls import path

from .views import (
    PregnancyEpisodeViewSet, PregnancyObservationViewSet, PregnancyAssessmentViewSet,
)

router = DefaultRouter()
router.register(r"episodes", PregnancyEpisodeViewSet, basename="pregnancy-episode")
router.register(r"observations", PregnancyObservationViewSet, basename="pregnancy-observation")
router.register(r"assessments", PregnancyAssessmentViewSet, basename="pregnancy-assessment")

urlpatterns = router.urls
