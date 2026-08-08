"""Accounts API URL routing."""
from django.urls import path
from rest_framework.routers import DefaultRouter

from .auth_views import (
    LoginView, RefreshTokenView, ProfileView, LogoutView, RolesListView,
)
from .device_views import DeviceProvisionView
from .mfa_views import (
    MFASetupView, MFAVerifyView, MFADisableView, MFAStatusView, MFARecoveryView,
)
from .views import UserAccountViewSet, UserRoleScopeViewSet

router = DefaultRouter()
router.register(r"users", UserAccountViewSet, basename="user")
router.register(r"role-scopes", UserRoleScopeViewSet, basename="role-scope")

urlpatterns = [
    path("auth/login/", LoginView.as_view(), name="api-login"),
    path("auth/token/refresh/", RefreshTokenView.as_view(), name="api-token-refresh"),
    path("auth/profile/", ProfileView.as_view(), name="api-profile"),
    path("auth/logout/", LogoutView.as_view(), name="api-logout"),
    path("auth/roles/", RolesListView.as_view(), name="api-roles"),
    path("auth/device-provision/", DeviceProvisionView.as_view(), name="api-device-provision"),
    # MFA (spec §22)
    path("mfa/setup", MFASetupView.as_view(), name="mfa-setup"),
    path("mfa/verify", MFAVerifyView.as_view(), name="mfa-verify"),
    path("mfa/disable", MFADisableView.as_view(), name="mfa-disable"),
    path("mfa/status", MFAStatusView.as_view(), name="mfa-status"),
    path("mfa/recovery", MFARecoveryView.as_view(), name="mfa-recovery"),
] + router.urls
