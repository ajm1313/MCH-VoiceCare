"""Newborn API URLs."""
from rest_framework.routers import DefaultRouter
from django.urls import path

from .views import (
    BirthEpisodeViewSet, NewbornEpisodeViewSet,
    NewbornObservationViewSet, NewbornAssessmentViewSet,
)

router = DefaultRouter()
router.register(r"birth-episodes", BirthEpisodeViewSet, basename="birth-episode")
router.register(r"episodes", NewbornEpisodeViewSet, basename="newborn-episode")
router.register(r"observations", NewbornObservationViewSet, basename="newborn-observation")
router.register(r"assessments", NewbornAssessmentViewSet, basename="newborn-assessment")

urlpatterns = router.urls
