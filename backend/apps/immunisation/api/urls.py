"""Immunisation API URLs."""
from rest_framework.routers import DefaultRouter
from django.urls import path

from .views import (
    ChildImmunisationRecordViewSet, VaccineDoseViewSet,
    CWCSessionViewSet, CWCSessionAttendanceViewSet, DefaulterEpisodeViewSet,
)

router = DefaultRouter()
router.register(r"children", ChildImmunisationRecordViewSet, basename="immunisation-child")
router.register(r"doses", VaccineDoseViewSet, basename="vaccine-dose")
router.register(r"cwc-sessions", CWCSessionViewSet, basename="cwc-session")
router.register(r"cwc-attendance", CWCSessionAttendanceViewSet, basename="cwc-attendance")
router.register(r"defaulters", DefaulterEpisodeViewSet, basename="defaulter")

urlpatterns = router.urls
