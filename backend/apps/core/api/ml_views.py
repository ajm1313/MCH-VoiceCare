"""
Clinical ML inference API endpoints (spec §13, §6.3).

POST /api/v1/ml/predict
  - Runs clinical risk prediction server-side (spec §6.3)
  - Only executes if ML mode is not RULES_ONLY
  - In SILENT mode: prediction is logged but not returned to caller
  - In ASSISTED mode: prediction is returned and may escalate care

GET  /api/v1/ml/metadata
  - Returns metadata about the loaded ML model
"""
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.config_models import SystemConfig
from apps.core.enums import MLMode
from apps.core.ml_service import (
    get_inference_adapter, ClinicalRiskInput,
)
from apps.audit.services import log_audit


class MLPredictView(APIView):
    """
    POST /api/v1/ml/predict — run clinical risk prediction (spec §13, §6.3).

    The ML model runs server-side only. The mobile app MUST NOT execute
    clinical ML locally (spec §6.3).

    In RULES_ONLY mode: returns 403 (ML not available).
    In SILENT mode: prediction is logged but result is NOT returned.
    In ASSISTED mode: prediction is returned to the caller.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        config = SystemConfig.get_config()
        ml_mode = config.clinical_ml_mode

        # RULES_ONLY: ML not executed for care (spec §3.2)
        if ml_mode == MLMode.RULES_ONLY:
            return Response({
                "error": "ML prediction not available in RULES_ONLY mode",
                "mlMode": ml_mode,
            }, status=status.HTTP_403_FORBIDDEN)

        # Extract input from request
        patient_id = request.data.get("patientId", "")
        episode_id = request.data.get("episodeId", "")
        facts = request.data.get("facts", {})
        rule_disposition = request.data.get("ruleDisposition", "ROUTINE")
        module = request.data.get("module", "pregnancy")

        # Check feature flags
        if not config.engagement_model_enabled and module == "engagement":
            return Response({
                "error": "Engagement model not enabled",
            }, status=status.HTTP_403_FORBIDDEN)

        # Build input
        ml_input = ClinicalRiskInput(
            patient_id=patient_id,
            episode_id=episode_id,
            facts=facts,
            rule_disposition=rule_disposition,
            module=module,
        )

        # Run prediction
        adapter = get_inference_adapter()
        prediction = adapter.predict(ml_input)

        # Audit log all ML predictions (spec §23, §3.2)
        log_audit(
            actor=request.user.username,
            action="ML_PREDICTION",
            actor_role=request.user.system_role,
            entity_type="Person",
            entity_id=patient_id,
            patient_id=patient_id if patient_id else None,
            purpose="DIRECT_CARE",
            metadata={
                "mlMode": ml_mode,
                "module": module,
                "riskBand": prediction.risk_band,
                "riskScore": prediction.probability,
                "probability": prediction.probability,
                "abstained": prediction.abstained,
                "modelVersion": prediction.model_version,
                "modelId": prediction.model_id,
                "ruleDisposition": rule_disposition,
            },
        )

        # SILENT mode: log but don't return result (spec §3.2)
        if ml_mode == MLMode.SILENT:
            return Response({
                "mlMode": "SILENT",
                "status": "logged",
                "message": "Prediction logged but not returned in SILENT mode.",
            })

        # ASSISTED mode: return prediction (spec §3.2)
        return Response({
            "mlMode": ml_mode,
            "prediction": prediction.to_dict(),
        })


class MLMetadataView(APIView):
    """
    GET /api/v1/ml/metadata — return loaded ML model metadata (spec §6.3).

    This allows the mobile app to display model version and validation status.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        config = SystemConfig.get_config()
        adapter = get_inference_adapter()
        metadata = adapter.model_metadata()

        return Response({
            "modelName": metadata.model_name,
            "modelVersion": metadata.model_version,
            "modelType": metadata.model_type,
            "trainedAt": metadata.trained_at,
            "features": metadata.features,
            "calibrationStatus": metadata.calibration_status,
            "validationStatus": metadata.validation_status,
            "mlMode": config.clinical_ml_mode,
            "featureCount": len(metadata.features),
        })
