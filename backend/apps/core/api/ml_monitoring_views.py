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

        # --- Calibration drift (spec §27.2) ---
        # Compare current calibration slope vs training baseline (1.0 = ideal).
        # Without a stored baseline we use the risk-band distribution skew as a
        # proxy: if HIGH band proportion deviates significantly from expected,
        # flag as drift.
        calibration_drift = self._compute_calibration_drift(
            risk_bands_7d, total_predictions_7d, metadata)

        # --- Missingness drift (spec §27.2) ---
        # Compare current feature missingness (proxied by abstention rate)
        # vs training baseline.
        missingness_drift = self._compute_missingness_drift(
            abstention_rate, metadata)

        # --- Subgroup performance breakdown (spec §27.2, §13.6) ---
        # Break down by region, age_group, parity using audit metadata.
        subgroup_performance = self._compute_subgroup_performance(
            ml_predictions_7d)

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
            "calibration_drift": calibration_drift,
            "missingness_drift": missingness_drift,
            "subgroup_performance": subgroup_performance,
            "alerts": {
                "ml_disabled": ml_mode == MLMode.RULES_ONLY,
                "model_not_loaded": metadata.validation_status in (
                    "CATBOOST_NOT_INSTALLED", "MODEL_LOAD_FAILED", "N/A",
                ),
                "high_abstention_rate": abstention_rate > 50,
                "calibration_drift_detected": calibration_drift.get("drift_detected", False),
                "missingness_drift_detected": missingness_drift.get("drift_detected", False),
                "message": "ML is operating in RULES_ONLY mode — no care-changing output." if ml_mode == MLMode.RULES_ONLY else None,
            },
        })

    def _compute_calibration_drift(self, risk_bands_7d: dict,
                                   total_predictions_7d: int,
                                   metadata) -> dict:
        """Compute calibration drift metric (spec §27.2).

        Compares current calibration (proxied by risk-band distribution) vs
        a training baseline. A well-calibrated model should have a stable
        distribution. Significant skew in the HIGH band indicates drift.
        """
        if total_predictions_7d == 0:
            return {
                "current_high_band_pct": 0.0,
                "baseline_high_band_pct": None,
                "drift_detected": False,
                "message": "No predictions in window",
            }

        high_count = risk_bands_7d.get("HIGH", 0)
        current_high_pct = (high_count / total_predictions_7d) * 100

        # Training baseline — in production this would be loaded from the
        # model manifest. Without a stored baseline, we flag if HIGH band
        # exceeds 30% (a heuristic threshold indicating possible over-alerting).
        baseline_high_pct = 15.0  # default expected baseline
        drift_threshold = 15.0  # percentage points
        drift_detected = abs(current_high_pct - baseline_high_pct) > drift_threshold

        return {
            "current_high_band_pct": round(current_high_pct, 2),
            "baseline_high_band_pct": baseline_high_pct,
            "drift_magnitude_pct": round(abs(current_high_pct - baseline_high_pct), 2),
            "drift_detected": drift_detected,
            "calibration_status": metadata.calibration_status,
        }

    def _compute_missingness_drift(self, abstention_rate: float,
                                   metadata) -> dict:
        """Compute missingness drift metric (spec §27.2).

        Compares current feature missingness (proxied by abstention rate)
        vs a training baseline missingness rate.
        """
        # Training baseline abstention — in production loaded from manifest.
        baseline_abstention_pct = 10.0  # default expected baseline
        current_abstention_pct = abstention_rate
        drift_threshold = 20.0  # percentage points
        drift_detected = abs(current_abstention_pct - baseline_abstention_pct) > drift_threshold

        return {
            "current_abstention_pct": round(current_abstention_pct, 2),
            "baseline_abstention_pct": baseline_abstention_pct,
            "drift_magnitude_pct": round(abs(current_abstention_pct - baseline_abstention_pct), 2),
            "drift_detected": drift_detected,
        }

    def _compute_subgroup_performance(self, ml_predictions_7d) -> dict:
        """Compute subgroup performance breakdown (spec §27.2, §13.6).

        Breaks down ML predictions by region, age_group, and parity using
        audit event metadata.
        """
        subgroups = {"region": {}, "age_group": {}, "parity": {}}

        for event in ml_predictions_7d:
            meta = event.metadata or {}
            region = meta.get("region", "unknown")
            age_group = meta.get("ageGroup", "unknown")
            parity = meta.get("parity", "unknown")
            risk_band = meta.get("riskBand", "NOT_SHOWN")
            abstained = meta.get("abstained", False)

            for group_key, group_val in [("region", region), ("age_group", age_group), ("parity", parity)]:
                if group_val not in subgroups[group_key]:
                    subgroups[group_key][group_val] = {
                        "count": 0,
                        "abstained": 0,
                        "high_risk": 0,
                    }
                subgroups[group_key][group_val]["count"] += 1
                if abstained:
                    subgroups[group_key][group_val]["abstained"] += 1
                if risk_band == "HIGH":
                    subgroups[group_key][group_val]["high_risk"] += 1

        # Compute rates
        for group_key in subgroups:
            for val, stats in subgroups[group_key].items():
                count = stats["count"]
                stats["abstention_rate_pct"] = round(
                    (stats["abstained"] / count * 100) if count > 0 else 0, 2)
                stats["high_risk_rate_pct"] = round(
                    (stats["high_risk"] / count * 100) if count > 0 else 0, 2)

        return subgroups
