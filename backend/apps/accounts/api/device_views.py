"""
Device provisioning endpoint — POST /api/v1/auth/device-provision (spec §20.2).

Registers a mobile device for a user, returning configuration bootstrap
data needed for first-time setup.
"""
import uuid

from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.config_models import SystemConfig
from apps.audit.services import log_audit


class DeviceProvisionSerializer(serializers.Serializer):
    device_id = serializers.CharField(max_length=200, required=True)
    device_model = serializers.CharField(max_length=200, required=False, allow_blank=True)
    os_version = serializers.CharField(max_length=100, required=False, allow_blank=True)
    app_version = serializers.CharField(max_length=50, required=False, allow_blank=True)
    fcm_token = serializers.CharField(max_length=500, required=False, allow_blank=True)


class DeviceProvisionView(APIView):
    """
    POST /api/v1/auth/device-provision/

    Registers a device for the authenticated user and returns
    bootstrap configuration for offline-first setup.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = DeviceProvisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = request.user
        config = SystemConfig.get_config()

        # Audit the provisioning event
        log_audit(
            actor=user.username,
            action="DEVICE_PROVISIONED",
            actor_role=user.system_role,
            entity_type="Device",
            entity_id=data["device_id"],
            facility_id=user.organisation_unit_id,
            device_id=data["device_id"],
            purpose="ADMIN",
            metadata={
                "device_model": data.get("device_model", ""),
                "os_version": data.get("os_version", ""),
                "app_version": data.get("app_version", ""),
            },
        )

        return Response({
            "provisioned": True,
            "deviceId": data["device_id"],
            "userId": str(user.id),
            "username": user.username,
            "systemRole": user.system_role,
            "organisationUnitId": str(user.organisation_unit_id) if user.organisation_unit_id else None,
            "organisationUnitName": user.organisation_unit.name if user.organisation_unit else None,
            "config": {
                "clinical_ml_mode": config.clinical_ml_mode,
                "feature_flags": {
                    "ocr_enabled": config.ocr_enabled,
                    "ivr_dtmf_enabled": config.ivr_dtmf_enabled,
                    "ussd_enabled": config.ussd_enabled,
                    "speech_capture_enabled": config.speech_capture_enabled,
                    "remote_emergency_cascade_enabled": config.remote_emergency_cascade_enabled,
                    "print_referral_slip_enabled": config.print_referral_slip_enabled,
                },
                "sync": {
                    "batch_size": config.sync_batch_size,
                    "retry_max": config.sync_retry_max,
                    "retry_backoff_base_seconds": config.sync_retry_backoff_base_seconds,
                },
                "active_rule_bundle_version": config.active_rule_bundle_version,
            },
        }, status=status.HTTP_200_OK)
