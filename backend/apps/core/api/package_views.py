"""
Package management API endpoints — activation and rollback (spec §24).

POST /api/v1/packages/activate/   — activate a new package version
POST /api/v1/packages/rollback/   — rollback to previous active version
GET  /api/v1/packages/             — list all packages
GET  /api/v1/packages/{type}/active/ — get current active package for a type
"""
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.package_models import Package, PACKAGE_TYPES
from apps.audit.services import log_audit


class PackageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Package
        fields = [
            "id", "package_id", "package_type", "version", "status",
            "sha256", "signing_key_id", "previous_version",
            "effective_from", "minimum_app_version",
            "activated_at", "retired_at", "created_at",
        ]
        read_only_fields = ["id", "activated_at", "retired_at", "created_at"]


class PackageActivateSerializer(serializers.Serializer):
    package_id = serializers.CharField(max_length=200)
    package_type = serializers.ChoiceField(choices=[pt[0] for pt in PACKAGE_TYPES])
    version = serializers.CharField(max_length=50)
    sha256 = serializers.CharField(max_length=64)
    signature = serializers.CharField(required=False, allow_blank=True)
    signing_key_id = serializers.CharField(max_length=100, required=False, allow_blank=True)
    minimum_app_version = serializers.CharField(max_length=50, required=False, allow_blank=True)
    payload = serializers.JSONField(required=False, default=dict)


class PackageRollbackSerializer(serializers.Serializer):
    package_type = serializers.ChoiceField(choices=[pt[0] for pt in PACKAGE_TYPES])


class PackageListView(APIView):
    """GET /api/v1/packages/ — list all packages."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        packages = Package.objects.all().order_by("-created_at")[:50]
        data = PackageSerializer(packages, many=True).data
        return Response(data)


class PackageActiveView(APIView):
    """GET /api/v1/packages/{type}/active/ — get current active package."""
    permission_classes = [IsAuthenticated]

    def get(self, request, package_type):
        pkg = Package.objects.filter(
            package_type=package_type,
            status="ACTIVE",
        ).first()
        if not pkg:
            return Response({"detail": "No active package for this type."}, status=status.HTTP_404_NOT_FOUND)
        return Response(PackageSerializer(pkg).data)


class PackageActivateView(APIView):
    """POST /api/v1/packages/activate/ — activate a new package version."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PackageActivateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            pkg = Package.activate(
                package_id=data["package_id"],
                package_type=data["package_type"],
                version=data["version"],
                sha256=data["sha256"],
                signature=data.get("signature", ""),
                signing_key_id=data.get("signing_key_id", ""),
                minimum_app_version=data.get("minimum_app_version", ""),
                payload=data.get("payload", {}),
            )
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        log_audit(
            actor=request.user.username,
            action="PACKAGE_ACTIVATED",
            actor_role=request.user.system_role,
            entity_type="Package",
            entity_id=str(pkg.id),
            purpose="ADMIN",
            metadata={
                "package_type": pkg.package_type,
                "version": pkg.version,
                "previous_version": pkg.previous_version,
            },
        )

        return Response(PackageSerializer(pkg).data, status=status.HTTP_201_CREATED)


class PackageRollbackView(APIView):
    """POST /api/v1/packages/rollback/ — rollback to previous version."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PackageRollbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            pkg = Package.rollback(data["package_type"])
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_409_CONFLICT)

        log_audit(
            actor=request.user.username,
            action="PACKAGE_ROLLBACK",
            actor_role=request.user.system_role,
            entity_type="Package",
            entity_id=str(pkg.id),
            purpose="ADMIN",
            metadata={
                "package_type": pkg.package_type,
                "rolled_back_to": pkg.version,
            },
        )

        return Response(PackageSerializer(pkg).data, status=status.HTTP_200_OK)
