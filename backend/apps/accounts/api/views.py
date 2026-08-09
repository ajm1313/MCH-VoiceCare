"""Account management API views."""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema

from apps.accounts.models import UserAccount, UserRoleScope
from apps.accounts.api.serializers import (
    UserProfileSerializer, CreateUserSerializer, UserRoleScopeSerializer,
)
from apps.audit.services import log_permission_change
from apps.core.permissions import user_can_manage_users


@extend_schema(tags=["auth"])
class UserAccountViewSet(viewsets.ModelViewSet):
    """CRUD for user accounts."""
    queryset = UserAccount.objects.all().order_by("-date_joined")
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == "create":
            return CreateUserSerializer
        return UserProfileSerializer

    @action(detail=True, methods=["post"])
    def assign_role(self, request, pk=None):
        if not user_can_manage_users(request.user):
            return Response(
                {"detail": "You do not have permission to manage users."},
                status=status.HTTP_403_FORBIDDEN,
            )
        user = self.get_object()
        role_code = request.data.get("role_code")
        scope_unit = request.data.get("scope_unit")
        if not role_code or not scope_unit:
            return Response(
                {"detail": "role_code and scope_unit are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        scope = UserRoleScope.objects.create(
            user=user,
            role_code=role_code,
            scope_unit_id=scope_unit,
            assigned_by=request.user,
        )

        log_permission_change(
            actor=request.user.username,
            target_user=user.username,
            action_type="ROLE_ASSIGNED",
            old_role="",
            new_role=role_code,
            actor_role=request.user.system_role,
        )

        return Response(
            UserRoleScopeSerializer(scope).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def revoke_role(self, request, pk=None):
        if not user_can_manage_users(request.user):
            return Response(
                {"detail": "You do not have permission to manage users."},
                status=status.HTTP_403_FORBIDDEN,
            )
        user = self.get_object()
        scope_id = request.data.get("scope_id")
        if not scope_id:
            return Response(
                {"detail": "scope_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        scope = UserRoleScope.objects.filter(id=scope_id, user=user).first()
        if scope:
            old_role = scope.role_code
            UserRoleScope.objects.filter(id=scope_id, user=user).delete()

            log_permission_change(
                actor=request.user.username,
                target_user=user.username,
                action_type="ROLE_REVOKED",
                old_role=old_role,
                new_role="",
                actor_role=request.user.system_role,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["auth"])
class UserRoleScopeViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only viewset for role scopes."""
    queryset = UserRoleScope.objects.all().order_by("-assigned_at")
    serializer_class = UserRoleScopeSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["user", "role_code", "scope_unit"]
