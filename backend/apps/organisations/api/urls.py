"""Organisation API URLs."""
from rest_framework.routers import DefaultRouter
from django.urls import path

from .views import OrganisationUnitViewSet, FacilityCapabilityViewSet

router = DefaultRouter()
router.register(r"units", OrganisationUnitViewSet, basename="org-unit")
router.register(r"capabilities", FacilityCapabilityViewSet, basename="capability")

urlpatterns = router.urls
