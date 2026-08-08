"""
JWT auth views: login, profile, logout, token refresh.
Matches the mobile app's authStore contract.
"""
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from apps.audit.services import log_audit


class LoginSerializer(TokenObtainPairSerializer):
    """Custom login serializer that enriches the response with user profile."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["username"] = user.username
        token["role"] = user.system_role
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        user = self.user
        data["token"] = data.pop("access")
        data["refreshToken"] = data.pop("refresh")
        data["expiresAt"] = None  # Set by frontend from token lifetime
        data["user"] = _user_profile_dict(user)
        return data


def _user_role_data(user):
    return {
        "code": user.system_role,
        "name": user.get_system_role_display(),
        "level": user.role_level,
    }


def _user_location_data(user):
    org = user.organisation_unit
    if not org:
        return {
            "region_id": None, "region_name": None,
            "district_id": None, "district_name": None,
            "subdistrict_id": None, "subdistrict_name": None,
            "facility_id": None, "facility_name": None,
            "facility_type": None,
        }
    # Walk up the hierarchy
    region = district = subdistrict = facility = None
    node = org
    while node:
        if node.unit_type == "FACILITY":
            facility = node
        elif node.unit_type == "SUBDISTRICT":
            subdistrict = node
        elif node.unit_type == "DISTRICT":
            district = node
        elif node.unit_type == "REGION":
            region = node
        node = node.parent

    return {
        "region_id": str(region.id) if region else None,
        "region_name": region.name if region else None,
        "district_id": str(district.id) if district else None,
        "district_name": district.name if district else None,
        "subdistrict_id": str(subdistrict.id) if subdistrict else None,
        "subdistrict_name": subdistrict.name if subdistrict else None,
        "facility_id": str(facility.id) if facility else None,
        "facility_name": facility.name if facility else None,
        "facility_type": facility.facility_type if facility else None,
    }


def _user_profile_dict(user):
    return {
        "id": str(user.id),
        "username": user.username,
        "fullName": user.full_name or user.username,
        "email": user.email,
        "mobileNumber": user.mobile_number,
        "isActive": user.is_active,
        "isStaff": user.is_staff,
        "isSuperuser": user.is_superuser,
        "isSuperAdmin": user.is_super_admin,
        "isFacilityLevelOnly": user.is_facility_level_only,
        "canViewReports": user.can_view_reports,
        "systemRole": user.system_role,
        "role": _user_role_data(user),
        "location": _user_location_data(user),
        "organisationUnitName": user.organisation_unit.name if user.organisation_unit else None,
    }


class LoginView(TokenObtainPairView):
    """POST /api/v1/accounts/auth/login/"""
    serializer_class = LoginSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            from apps.accounts.models import UserAccount
            username = request.data.get("username", "")
            try:
                user = UserAccount.objects.get(username=username)
                log_audit(
                    actor=username,
                    action="LOGIN",
                    actor_role=user.system_role,
                    entity_type="UserAccount",
                    entity_id=str(user.id),
                    facility_id=user.organisation_unit_id,
                    purpose="ADMIN",
                )
            except UserAccount.DoesNotExist:
                pass
        return response


class RefreshTokenView(TokenRefreshView):
    """POST /api/v1/accounts/auth/token/refresh/"""
    # SimpleJWT expects "refresh" but mobile sends "refresh_token"
    def post(self, request, *args, **kwargs):
        if "refresh_token" in request.data and "refresh" not in request.data:
            request.data["refresh"] = request.data["refresh_token"]
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            data = response.data
            response.data = {
                "token": data.get("access"),
                "refreshToken": data.get("refresh"),
                "expiresAt": None,
            }
        return response


class ProfileView(APIView):
    """GET /api/v1/accounts/auth/profile/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(_user_profile_dict(request.user))


class LogoutView(APIView):
    """POST /api/v1/accounts/auth/logout/"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh_token") or request.data.get("refresh")
        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                token.blacklist()
            except Exception:
                pass
        log_audit(
            actor=request.user.username,
            action="LOGOUT",
            actor_role=request.user.system_role,
            entity_type="UserAccount",
            entity_id=str(request.user.id),
            facility_id=request.user.organisation_unit_id,
            purpose="ADMIN",
        )
        return Response({"detail": "Logged out"}, status=status.HTTP_200_OK)


class RolesListView(APIView):
    """GET /api/v1/accounts/auth/roles/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.core.enums import SystemRole
        roles = [
            {"code": code, "name": label, "level": i}
            for i, (code, label) in enumerate(SystemRole.choices)
        ]
        return Response(roles)
