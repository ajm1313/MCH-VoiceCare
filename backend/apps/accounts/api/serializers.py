"""Serializers for accounts API."""
from rest_framework import serializers
from apps.accounts.models import UserAccount, UserRoleScope


class UserProfileSerializer(serializers.ModelSerializer):
    fullName = serializers.CharField(source="full_name", required=False)
    mobileNumber = serializers.CharField(source="mobile_number", required=False)
    isSuperAdmin = serializers.BooleanField(source="is_super_admin", required=False)
    systemRole = serializers.CharField(source="system_role", required=False)
    organisationUnit = serializers.UUIDField(
        source="organisation_unit_id", required=False, allow_null=True
    )

    class Meta:
        model = UserAccount
        fields = [
            "id", "username", "fullName", "email", "mobileNumber",
            "is_active", "is_staff", "isSuperAdmin",
            "systemRole", "organisationUnit", "date_joined",
        ]
        read_only_fields = ["id", "date_joined"]


class CreateUserSerializer(serializers.ModelSerializer):
    fullName = serializers.CharField(source="full_name", required=False)
    mobileNumber = serializers.CharField(source="mobile_number", required=False)
    password = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = UserAccount
        fields = [
            "id", "username", "fullName", "email", "mobileNumber",
            "password", "system_role", "organisation_unit",
            "is_active", "is_staff", "is_super_admin",
        ]
        read_only_fields = ["id"]

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = UserAccount(**validated_data)
        user.set_password(password)
        user.save()
        return user


class UserRoleScopeSerializer(serializers.ModelSerializer):
    scope_unit_name = serializers.CharField(source="scope_unit.name", read_only=True)
    role_name = serializers.CharField(source="get_role_code_display", read_only=True)

    class Meta:
        model = UserRoleScope
        fields = [
            "id", "user", "role_code", "role_name",
            "scope_unit", "scope_unit_name", "assigned_by", "assigned_at",
        ]
        read_only_fields = ["id", "assigned_by", "assigned_at"]
