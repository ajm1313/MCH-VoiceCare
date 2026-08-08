"""
System configuration API — bootstrap and update endpoints (spec §20.2, §33).

GET /api/v1/config/bootstrap — non-sensitive config for client bootstrap
PATCH /api/v1/config/ — admin-only config update with audit logging
"""
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.config_models import SystemConfig
from apps.core.enums import MLMode
from apps.core.permissions import user_can_manage_users
from apps.core.signing_service import get_verification_public_keys
from apps.audit.services import log_audit


CONFIG_UPDATE_FIELDS = {
    "clinical_ml_mode": None,
    "engagement_model_enabled": bool,
    "ocr_enabled": bool,
    "ivr_dtmf_enabled": bool,
    "ussd_enabled": bool,
    "speech_capture_enabled": bool,
    "remote_emergency_cascade_enabled": bool,
    "print_referral_slip_enabled": bool,
    "sync_batch_size": int,
    "sync_retry_max": int,
    "sync_retry_backoff_base_seconds": int,
    "referral_ack_timeout_minutes": int,
    "referral_escalation_timeout_minutes": int,
    "scan_retention_mode": None,
    "scan_temporary_retention_hours": int,
    "active_rule_bundle_version": None,
    "clinical_thresholds": None,
}

# Default clinical thresholds (spec §33).
# Keys match the mobile clinicalThresholds.ts config keys.
# These reflect Ghana Safe Motherhood / WHO reference values and MUST be
# overridden by GHS-approved configuration before production deployment.
_DEFAULT_THRESHOLDS = {
    # Pregnancy — blood pressure
    "BP_SYS_EMERGENCY": 160,
    "BP_DIA_EMERGENCY": 110,
    "BP_SYS_ELEVATED": 140,
    "BP_DIA_ELEVATED": 90,
    # Pregnancy — haemoglobin
    "HB_SEVERE_LOW": 7.0,
    "HB_MODERATE_HIGH": 10.9,
    # Pregnancy — gestational age (days)
    "GA_NEAR_TERM_DAYS": 238,
    "GA_BIRTH_PLAN_DAYS": 196,
    "GA_POST_20W_DAYS": 140,
    "GA_PRETERM_DAYS": 259,
    # Pregnancy — maternal age / parity
    "MATERNAL_AGE_YOUNG": 18,
    "MATERNAL_AGE_ADVANCED": 35,
    "PARITY_HIGH": 5,
    "UTERINE_DISCREPANCY_WEEKS": 2,
    # Newborn — vital signs
    "NB_RR_HIGH": 60,
    "NB_TEMP_FEVER": 37.5,
    "NB_TEMP_HYPO": 35.5,
    "NB_TEMP_MILD_LOW": 36.5,
    # Newborn — jaundice / weight / gestation
    "NB_JAUNDICE_EARLY_HOURS": 24,
    "NB_LBW_G": 2500,
    "NB_PRETERM_WEEKS": 37,
    "NB_ROM_HOURS": 18,
    "NB_LBW_REFERRAL_G": 1800,
    "CHPS_LBW_REFERRAL_G": 1800,
    "JAUNDICE_PERSIST_DAYS": 14,
    "NEWBORN_URINE_HOURS": 24,
    "NEWBORN_MECONIUM_HOURS": 24,
    # Growth — SD score thresholds
    "GROWTH_SEVERE_LOW_SD": -3,
    "GROWTH_MODERATE_LOW_SD": -2,
    "GROWTH_MILD_LOW_SD": -1,
    "GROWTH_HIGH_SD": 2,
    "GROWTH_STATIC_COUNT": 2,
    "GROWTH_WEIGHT_LOSS_PCT": 10,
    "GROWTH_AGE_LIMIT_MONTHS": 24,
    # Immunisation
    "IMM_LONG_DEFAULTER_DAYS": 30,
    "IMM_MULTI_OVERDUE_COUNT": 3,
    "IMM_MISSED_SESSIONS_HIGH": 2,
    "IMM_AGE_LIMIT_MONTHS": 24,
    "DEFAULTER_GRACE_DAYS": 7,
    # FHR
    "FHR_LOW": 110,
    "FHR_HIGH": 160,
}


class ConfigBootstrapView(APIView):
    """Return system configuration for client bootstrap."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        config = SystemConfig.get_config()
        return Response({
            "clinical_ml_mode": config.clinical_ml_mode,
            "feature_flags": {
                "engagement_model_enabled": config.engagement_model_enabled,
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
            "referral": {
                "ack_timeout_minutes": config.referral_ack_timeout_minutes,
                "escalation_timeout_minutes": config.referral_escalation_timeout_minutes,
            },
            "scan_retention": {
                "mode": config.scan_retention_mode,
                "temporary_retention_hours": config.scan_temporary_retention_hours,
            },
            "active_rule_bundle_version": config.active_rule_bundle_version,
            "ml_mode_is_rules_only": config.clinical_ml_mode == MLMode.RULES_ONLY,
            "signing_keys": get_verification_public_keys(),
            "clinical_thresholds": config.clinical_thresholds or _DEFAULT_THRESHOLDS,
        })


class ConfigUpdateView(APIView):
    """
    PATCH /api/v1/config/

    Admin-only endpoint to update externally configurable system settings
    (spec §33). All changes are audit logged.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        if not user_can_manage_users(request.user):
            return Response(
                {"detail": "Only administrators can update system configuration."},
                status=status.HTTP_403_FORBIDDEN,
            )

        config = SystemConfig.get_config()
        changed = []

        for field, expected_type in CONFIG_UPDATE_FIELDS.items():
            if field in request.data:
                value = request.data[field]
                if expected_type is bool:
                    value = bool(value)
                elif expected_type is int:
                    try:
                        value = int(value)
                    except (ValueError, TypeError):
                        return Response(
                            {"detail": f"Invalid value for {field}: must be integer."},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                setattr(config, field, value)
                changed.append(field)

        if not changed:
            return Response(
                {"detail": "No valid configuration fields provided."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Enforce speech_capture_enabled MUST be false in first release (spec §34)
        if config.speech_capture_enabled:
            return Response(
                {"detail": "speech_capture_enabled MUST be false in the first release."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        config.save()

        log_audit(
            actor=request.user.username,
            action="CONFIG_UPDATED",
            actor_role=request.user.system_role,
            entity_type="SystemConfig",
            entity_id=str(config.id),
            purpose="ADMIN",
            metadata={"changed_fields": changed},
        )

        return Response({
            "updated": True,
            "changed_fields": changed,
            "clinical_ml_mode": config.clinical_ml_mode,
            "feature_flags": {
                "engagement_model_enabled": config.engagement_model_enabled,
                "ocr_enabled": config.ocr_enabled,
                "ivr_dtmf_enabled": config.ivr_dtmf_enabled,
                "ussd_enabled": config.ussd_enabled,
                "speech_capture_enabled": config.speech_capture_enabled,
                "remote_emergency_cascade_enabled": config.remote_emergency_cascade_enabled,
                "print_referral_slip_enabled": config.print_referral_slip_enabled,
            },
        })
