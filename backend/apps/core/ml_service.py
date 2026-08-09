"""
Clinical risk inference adapter (spec §13, §6.3, §10.9).

CatBoost clinical ML inference MUST run server-side as a Django service
behind an adapter boundary (spec §6.3). The mobile app MUST NOT execute
clinical ML locally.

Adapter boundary (spec §10.9): "Keep CatBoost behind ClinicalRiskInference
and default feature flag to RULES_ONLY."

ML modes (spec §3.2):
  RULES_ONLY -> ML not executed for care
  SILENT     -> ML executes and is logged; result hidden, cannot alter workflow
  ASSISTED    -> validated ML may escalate but cannot override approved rules

The ML model MUST NOT cancel, downgrade, suppress, or close a rule-based
emergency alert (spec §3.1 — non-downgrade invariant).
"""
from dataclasses import dataclass, field
from typing import Optional, Protocol
import uuid
from datetime import datetime


@dataclass
class ClinicalRiskInput:
    """Input features for clinical risk prediction (spec §13.1)."""
    patient_id: str
    episode_id: str
    facts: dict  # Clinical facts from the rule engine
    rule_disposition: str = "ROUTINE"
    module: str = "pregnancy"  # pregnancy, newborn, growth, immunisation


@dataclass
class ClinicalRiskPrediction:
    """Output of clinical risk prediction (spec §13.4).

    Spec §13.4 requires 12 fields: modelId, modelVersion, featureContractVersion,
    mode, probability, thresholdId, riskBand, reasonCodes, missingCriticalFields,
    outOfDistribution, abstained, evaluatedAt.

    Legacy field names (risk_score, model_name, feature_contributions, computed_at)
    are kept as aliases for backward compatibility.
    """
    prediction_id: str
    risk_band: str  # NOT_SHOWN, LOW, PRIORITY, HIGH
    abstained: bool  # True if model abstained (insufficient data)

    # Spec §13.4 fields
    model_id: str = ""  # renamed from model_name
    model_version: str = ""
    feature_contract_version: str = "1.0.0"
    mode: str = "CORE_ANC"
    probability: float = 0.0  # 0.0 to 1.0 (renamed from risk_score)
    threshold_id: str = ""
    reason_codes: list = field(default_factory=list)  # renamed from feature_contributions
    missing_critical_fields: list = field(default_factory=list)
    out_of_distribution: bool = False
    evaluated_at: str = ""  # renamed from computed_at

    # Legacy / extra fields
    abstain_reason: Optional[str] = None
    # Aliases kept for backward compatibility with existing code/tests
    risk_score: float = 0.0  # alias for probability
    model_name: str = ""  # alias for model_id
    feature_contributions: dict = field(default_factory=dict)  # alias for reason_codes
    computed_at: str = ""  # alias for evaluated_at

    def to_dict(self) -> dict:
        return {
            # Spec §13.4 — 12 required fields (camelCase)
            "modelId": self.model_id,
            "modelVersion": self.model_version,
            "featureContractVersion": self.feature_contract_version,
            "mode": self.mode,
            "probability": self.probability,
            "thresholdId": self.threshold_id,
            "riskBand": self.risk_band,
            "reasonCodes": self.reason_codes,
            "missingCriticalFields": self.missing_critical_fields,
            "outOfDistribution": self.out_of_distribution,
            "abstained": self.abstained,
            "evaluatedAt": self.evaluated_at,
            # Legacy fields for backward compatibility
            "predictionId": self.prediction_id,
            "riskScore": self.probability,  # alias
            "abstainReason": self.abstain_reason,
            "featureContributions": self.reason_codes,  # alias
            "computedAt": self.evaluated_at,  # alias
            "modelName": self.model_id,  # alias
        }


@dataclass
class ModelMetadata:
    """Metadata about a loaded ML model."""
    model_name: str
    model_version: str
    model_type: str  # "CatBoostClassifier", "ElasticNet", etc.
    trained_at: str
    features: list  # List of feature names
    calibration_status: str = "UNCALIBRATED"
    validation_status: str = "PENDING"


class ClinicalRiskInference(Protocol):
    """
    Clinical risk inference protocol (spec §6.3, §10.9).

    Concrete implementations:
    - CatBoostInference: Loads a frozen CatBoostClassifier model
    - StubInference: Returns abstained predictions (for development)
    - ElasticNetBaseline: Transparent baseline comparator (spec §13.5)
    """

    def predict(self, input: ClinicalRiskInput) -> ClinicalRiskPrediction:
        """Run risk prediction on clinical facts."""
        ...

    def model_metadata(self) -> ModelMetadata:
        """Return metadata about the loaded model."""
        ...


class StubClinicalRiskInference:
    """
    Stub inference adapter for development/testing (spec §6.3).

    Always abstains — returns NOT_SHOWN risk band.
    This is the default when no CatBoost model is loaded.
    """

    def predict(self, input: ClinicalRiskInput) -> ClinicalRiskPrediction:
        now = datetime.utcnow().isoformat() + "Z"
        return ClinicalRiskPrediction(
            prediction_id=str(uuid.uuid4()),
            risk_band="NOT_SHOWN",
            abstained=True,
            abstain_reason="No ML model loaded (stub adapter)",
            # Spec §13.4 fields
            model_id="StubInference",
            model_version="stub-v0",
            feature_contract_version="1.0.0",
            mode="CORE_ANC",
            probability=0.0,
            threshold_id="",
            reason_codes=[],
            missing_critical_fields=[],
            out_of_distribution=False,
            evaluated_at=now,
            # Legacy aliases
            risk_score=0.0,
            model_name="StubInference",
            feature_contributions={},
            computed_at=now,
        )

    def model_metadata(self) -> ModelMetadata:
        return ModelMetadata(
            model_name="StubInference",
            model_version="stub-v0",
            model_type="Stub",
            trained_at="",
            features=[],
            calibration_status="N/A",
            validation_status="N/A",
        )


class CatBoostClinicalRiskInference:
    """
    CatBoost clinical risk inference adapter (spec §6.3, §13).

    Loads a frozen CatBoostClassifier model and runs server-side inference.
    The model package MUST be signed and versioned independently (spec §6.3).

    In SILENT mode, predictions are logged but not shown to clinicians.
    In ASSISTED mode, predictions may escalate but never de-escalate (spec §3.1).
    In RULES_ONLY mode, predict() is not called.
    """

    def __init__(self, model_path: str, model_version: str = "unknown"):
        self.model_path = model_path
        self.model_version = model_version
        self._model = None
        self._metadata = None
        self._load_model()

    def _load_model(self):
        """Load the frozen CatBoost model (spec §6.3)."""
        try:
            from catboost import CatBoostClassifier
            self._model = CatBoostClassifier()
            self._model.load_model(self.model_path)
            self._metadata = ModelMetadata(
                model_name="CatBoostClinicalRisk",
                model_version=self.model_version,
                model_type="CatBoostClassifier",
                trained_at="",
                features=list(self._model.feature_names_) if hasattr(self._model, 'feature_names_') else [],
                calibration_status="UNCALIBRATED",
                validation_status="PENDING",
            )
        except ImportError:
            # catboost not installed — fall back to stub behavior
            self._model = None
            self._metadata = ModelMetadata(
                model_name="CatBoostClinicalRisk",
                model_version=self.model_version,
                model_type="CatBoostClassifier",
                trained_at="",
                features=[],
                calibration_status="N/A",
                validation_status="CATBOOST_NOT_INSTALLED",
            )
        except Exception:
            # Model file missing or corrupt — fall back to stub (spec §29.6)
            self._model = None
            self._metadata = ModelMetadata(
                model_name="CatBoostClinicalRisk",
                model_version=self.model_version,
                model_type="CatBoostClassifier",
                trained_at="",
                features=[],
                calibration_status="N/A",
                validation_status="MODEL_LOAD_FAILED",
            )

    def predict(self, input: ClinicalRiskInput) -> ClinicalRiskPrediction:
        """Run CatBoost inference on clinical facts."""
        now = datetime.utcnow().isoformat() + "Z"
        if self._model is None:
            # Model not loaded — abstain (spec §29.6: CatBoost package missing/corrupt -> rules continue)
            return ClinicalRiskPrediction(
                prediction_id=str(uuid.uuid4()),
                risk_band="NOT_SHOWN",
                abstained=True,
                abstain_reason="CatBoost model not loaded",
                # Spec §13.4 fields
                model_id="CatBoostClinicalRisk",
                model_version=self.model_version,
                feature_contract_version="1.0.0",
                mode="CORE_ANC",
                probability=0.0,
                threshold_id="",
                reason_codes=[],
                missing_critical_fields=[],
                out_of_distribution=False,
                evaluated_at=now,
                # Legacy aliases
                risk_score=0.0,
                model_name="CatBoostClinicalRisk",
                feature_contributions={},
                computed_at=now,
            )

        # Extract features from clinical facts
        features = extract_features(input.facts, input.module)

        # Check for missing required features -> abstain (spec §13.3)
        missing = [f for f in self._metadata.features if f not in features or features[f] is None]
        if missing:
            return ClinicalRiskPrediction(
                prediction_id=str(uuid.uuid4()),
                risk_band="NOT_SHOWN",
                abstained=True,
                abstain_reason=f"Missing required features: {', '.join(missing[:5])}",
                # Spec §13.4 fields
                model_id="CatBoostClinicalRisk",
                model_version=self.model_version,
                feature_contract_version="1.0.0",
                mode="CORE_ANC",
                probability=0.0,
                threshold_id="",
                reason_codes=[],
                missing_critical_fields=missing,
                out_of_distribution=False,
                evaluated_at=now,
                # Legacy aliases
                risk_score=0.0,
                model_name="CatBoostClinicalRisk",
                feature_contributions={},
                computed_at=now,
            )

        # Run prediction
        try:
            import numpy as np
            feature_vector = np.array([[features.get(f, 0.0) for f in self._metadata.features]])
            prediction = self._model.predict_proba(feature_vector)
            risk_score = float(prediction[0][1])  # Probability of positive class

            # Map score to risk band (spec §13.4)
            if risk_score >= 0.7:
                risk_band = "HIGH"
            elif risk_score >= 0.3:
                risk_band = "PRIORITY"
            else:
                risk_band = "LOW"

            return ClinicalRiskPrediction(
                prediction_id=str(uuid.uuid4()),
                risk_band=risk_band,
                abstained=False,
                # Spec §13.4 fields
                model_id="CatBoostClinicalRisk",
                model_version=self.model_version,
                feature_contract_version="1.0.0",
                mode="CORE_ANC",
                probability=risk_score,
                threshold_id="",
                reason_codes=[],  # Would use SHAP values in production
                missing_critical_fields=[],
                out_of_distribution=False,
                evaluated_at=now,
                # Legacy aliases
                risk_score=risk_score,
                model_name="CatBoostClinicalRisk",
                feature_contributions={},  # Would use SHAP values in production
                computed_at=now,
            )
        except Exception as e:
            return ClinicalRiskPrediction(
                prediction_id=str(uuid.uuid4()),
                risk_band="NOT_SHOWN",
                abstained=True,
                abstain_reason=f"Prediction error: {str(e)}",
                # Spec §13.4 fields
                model_id="CatBoostClinicalRisk",
                model_version=self.model_version,
                feature_contract_version="1.0.0",
                mode="CORE_ANC",
                probability=0.0,
                threshold_id="",
                reason_codes=[],
                missing_critical_fields=[],
                out_of_distribution=False,
                evaluated_at=now,
                # Legacy aliases
                risk_score=0.0,
                model_name="CatBoostClinicalRisk",
                feature_contributions={},
                computed_at=now,
            )

    def model_metadata(self) -> ModelMetadata:
        return self._metadata


# --- Feature extraction (spec §13.1) ---

# Feature contract: maps clinical fact keys to ML feature names
# This is a placeholder — the actual feature contract must be clinically
# approved and validated (spec §13.1, §10.10)
FEATURE_CONTRACTS = {
    "pregnancy": {
        "maternal_age": "maternal_age_years",
        "gravidity": "gravidity",
        "parity": "parity",
        "previous_caesarean": "previous_caesarean_count",
        "bp_systolic": "bp_systolic_mm_hg",
        "bp_diastolic": "bp_diastolic_mm_hg",
        "hb_g_dl": "hb_g_dl",
        "gestational_age_days": "gestational_age_days",
        "chronic_hypertension": "chronic_hypertension",
        "diabetes": "diabetes",
        "previous_stillbirth": "previous_stillbirth",
        "previous_preeclampsia": "previous_preeclampsia_eclampsia",
    },
    "newborn": {
        "birth_weight_g": "birth_weight_g",
        "gestational_age_weeks": "gestational_age_weeks",
        "temperature_c": "temperature_c",
        "respiratory_rate": "respiratory_rate_min",
        "feeding_status": "feeding_status",
        "movement_status": "movement_status",
    },
}


def extract_features(facts: dict, module: str = "pregnancy") -> dict:
    """
    Extract ML features from clinical facts (spec §13.1).

    Maps clinical fact keys to ML feature names using the feature contract.
    Unknown/missing features are returned as None.
    """
    contract = FEATURE_CONTRACTS.get(module, {})
    features = {}

    for fact_key, ml_feature in contract.items():
        val = facts.get(fact_key)
        if val is not None:
            # Convert booleans to 0/1
            if isinstance(val, bool):
                features[ml_feature] = 1 if val else 0
            # Convert enum-like strings to numeric codes
            elif isinstance(val, str) and val in ("PRE_EXISTING", "GESTATIONAL", "SUSPECTED", "DISEASE"):
                features[ml_feature] = 1
            elif isinstance(val, str) and val in ("NONE", "UNKNOWN", "NEGATIVE"):
                features[ml_feature] = 0
            else:
                try:
                    features[ml_feature] = float(val)
                except (ValueError, TypeError):
                    features[ml_feature] = val
        else:
            features[ml_feature] = None

    return features


# --- Singleton adapter ---

_inference_adapter: ClinicalRiskInference = StubClinicalRiskInference()


def get_inference_adapter() -> ClinicalRiskInference:
    """Get the current clinical risk inference adapter."""
    return _inference_adapter


def set_inference_adapter(adapter: ClinicalRiskInference) -> None:
    """Set the inference adapter (for testing or production swap)."""
    global _inference_adapter
    _inference_adapter = adapter


def load_catboost_model(model_path: str, model_version: str = "unknown") -> bool:
    """
    Load a CatBoost model into the inference adapter (spec §6.3).

    Returns True if the model was loaded successfully.
    """
    global _inference_adapter
    adapter = CatBoostClinicalRiskInference(model_path, model_version)
    if adapter.model_metadata().validation_status == "PENDING":
        _inference_adapter = adapter
        return True
    return False
