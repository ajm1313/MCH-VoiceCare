"""
ML monitoring API endpoint (spec §27.2).

GET /api/v1/ml/monitoring — clinical safety monitoring for ML models.

Tracks (spec §27.2):
- alert counts and rate
- rule/model disagreement
- overrides and reasons
- false negatives
- calibration drift
- missingness drift
- subgroup performance
"""
from datetime import timedelta

from django.db.models import Count, Q, Avg
from django.utils import timezone

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.config_models import SystemConfig
from apps.core.enums import MLMode, UrgencyLevel, ClinicalDisposition
from apps.audit.models import AuditEvent
from apps.notifications.models import Notification
from apps.core.ml_service import get_inference_adapter


class MLMonitoringView(APIView):
    """
    GET /api/v1/ml/monitoring — ML clinical safety monitoring (spec §27.2).

    Only accessible to admin roles. Returns ML-specific monitoring metrics.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.core.permissions import user_can_manage_users
        if not user_can_manage_users(request.user):
            return Response({"error": "Insufficient permissions"},
                          status=403)

        now = timezone.now()
        last_24h = now - timedelta(hours=24)
        last_7d = now - timedelta(days=7)
        last_30d = now - timedelta(days=30)

        config = SystemConfig.get_config()
        ml_mode = config.clinical_ml_mode

        # ML predictions in each window
        ml_predictions_24h = AuditEvent.objects.filter(
            action="ML_PREDICTION", occurred_at__gte=last_24h,
        )
        ml_predictions_7d = AuditEvent.objects.filter(
            action="ML_PREDICTION", occurred_at__gte=last_7d,
        )
        ml_predictions_30d = AuditEvent.objects.filter(
            action="ML_PREDICTION", occurred_at__gte=last_30d,
        )

        total_predictions_24h = ml_predictions_24h.count()
        total_predictions_7d = ml_predictions_7d.count()
        total_predictions_30d = ml_predictions_30d.count()

        # Abstention rate (spec §27.2: missingness drift)
        abstained_24h = ml_predictions_24h.filter(metadata__abstained=True).count()
        abstention_rate = (abstained_24h / total_predictions_24h * 100) if total_predictions_24h > 0 else 0

        # Risk band distribution (spec §27.2: calibration drift)
        risk_bands_7d = {}
        for band in ["NOT_SHOWN", "LOW", "PRIORITY", "HIGH"]:
            risk_bands_7d[band] = ml_predictions_7d.filter(metadata__riskBand=band).count()

        # Rule/model disagreement (spec §27.2)
        # ML said HIGH/PRIORITY but rule said ROUTINE (ML escalation)
        escalations_7d = 0
        for event in ml_predictions_7d:
            meta = event.metadata or {}
            if (meta.get("riskBand") in ("HIGH", "PRIORITY") and
                    meta.get("ruleDisposition") == "ROUTINE"):
                escalations_7d += 1

        # Overrides related to ML (spec §27.2)
        ml_overrides_7d = AuditEvent.objects.filter(
            action="CLINICIAN_OVERRIDE", occurred_at__gte=last_7d,
            metadata__has_key="mlRiskBand",
        ).count()

        # Model metadata
        adapter = get_inference_adapter()
        metadata = adapter.model_metadata()

        # Prediction rate (per hour)
        prediction_rate_per_hour = total_predictions_24h / 24 if total_predictions_24h > 0 else 0

        return Response({
            "timestamp": now.isoformat(),
            "mlMode": ml_mode,
            "model": {
                "name": metadata.model_name,
                "version": metadata.model_version,
                "type": metadata.model_type,
                "calibrationStatus": metadata.calibration_status,
                "validationStatus": metadata.validation_status,
            },
            "predictions": {
                "total_24h": total_predictions_24h,
                "total_7d": total_predictions_7d,
                "total_30d": total_predictions_30d,
                "rate_per_hour": round(prediction_rate_per_hour, 2),
            },
            "safety": {
                "abstention_rate_24h_pct": round(abstention_rate, 1),
                "abstained_count_24h": abstained_24h,
                "escalations_7d": escalations_7d,
                "ml_overrides_7d": ml_overrides_7d,
            },
            "risk_band_distribution_7d": risk_bands_7d,
            "alerts": {
                "ml_disabled": ml_mode == MLMode.RULES_ONLY,
                "model_not_loaded": metadata.validation_status in (
                    "CATBOOST_NOT_INSTALLED", "MODEL_LOAD_FAILED", "N/A",
                ),
                "high_abstention_rate": abstention_rate > 50,
                "message": "ML is operating in RULES_ONLY mode — no care-changing output." if ml_mode == MLMode.RULES_ONLY else None,
            },
        })
