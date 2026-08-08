"""
Tests for clinical ML inference (spec §13, §6.3, §3.1, §3.2).

Verifies:
- Stub adapter abstains correctly
- Feature extraction from clinical facts
- Feature contract validation
- ML predict endpoint in RULES_ONLY mode (403)
- ML predict endpoint in SILENT mode (logged, not returned)
- ML predict endpoint in ASSISTED mode (returned)
- ML metadata endpoint
- Non-downgrade invariant (ML cannot de-escalate emergencies)
- Audit logging
"""
import uuid
from datetime import date

from django.test import TestCase, override_settings
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.enums import SystemRole, Sex, MLMode
from apps.core.config_models import SystemConfig
from apps.core.ml_service import (
    StubClinicalRiskInference, ClinicalRiskInput,
    get_inference_adapter, set_inference_adapter,
    extract_features,
)
from apps.core.decision_service import build_unified_decision
from apps.core.enums import UrgencyLevel, ClinicalDisposition
from apps.organisations.models import OrganisationUnit
from apps.accounts.models import UserAccount
from apps.audit.models import AuditEvent


def _make_org():
    return OrganisationUnit.objects.create(
        name="Test Facility", code="MLTEST01", unit_type="FACILITY",
    )


def _make_user(org):
    return UserAccount.objects.create_user(
        username="mltester", password="testpass123",
        organisation_unit=org, system_role=SystemRole.SUPER_ADMIN, is_super_admin=True,
    )


class StubInferenceTest(TestCase):
    """Tests for the stub inference adapter (spec §6.3)."""

    def setUp(self):
        set_inference_adapter(StubClinicalRiskInference())

    def test_stub_abstains(self):
        adapter = get_inference_adapter()
        result = adapter.predict(ClinicalRiskInput(
            patient_id=str(uuid.uuid4()),
            episode_id=str(uuid.uuid4()),
            facts={"maternal_age": 25},
        ))
        self.assertTrue(result.abstained)
        self.assertEqual(result.risk_band, "NOT_SHOWN")
        self.assertEqual(result.risk_score, 0.0)

    def test_stub_metadata(self):
        adapter = get_inference_adapter()
        meta = adapter.model_metadata()
        self.assertEqual(meta.model_name, "StubInference")
        self.assertEqual(meta.model_type, "Stub")


class FeatureExtractionTest(TestCase):
    """Tests for feature extraction (spec §13.1)."""

    def test_extract_pregnancy_features(self):
        facts = {
            "maternal_age": 28,
            "gravidity": 3,
            "parity": 2,
            "bp_systolic": 120,
            "bp_diastolic": 80,
            "hb_g_dl": 11.5,
            "gestational_age_days": 196,
            "chronic_hypertension": True,
            "diabetes": False,
            "previous_stillbirth": False,
            "previous_preeclampsia": True,
        }
        features = extract_features(facts, "pregnancy")
        self.assertEqual(features["maternal_age_years"], 28.0)
        self.assertEqual(features["gravidity"], 3.0)
        self.assertEqual(features["bp_systolic_mm_hg"], 120.0)
        self.assertEqual(features["chronic_hypertension"], 1)
        self.assertEqual(features["diabetes"], 0)
        self.assertEqual(features["previous_preeclampsia_eclampsia"], 1)

    def test_extract_missing_features(self):
        features = extract_features({}, "pregnancy")
        self.assertIsNone(features["maternal_age_years"])
        self.assertIsNone(features["gravidity"])

    def test_extract_unknown_module(self):
        features = extract_features({"foo": 1}, "unknown_module")
        self.assertEqual(features, {})


class FeatureContractTest(TestCase):
    """Tests for feature contract validation (spec §13.1)."""

    def test_validate_valid_features(self):
        from ml.features.contracts import validate_features
        features = {
            "maternal_age_years": 28,
            "gravidity": 3,
            "parity": 2,
            "bp_systolic_mm_hg": 120,
            "bp_diastolic_mm_hg": 80,
            "gestational_age_days": 196,
        }
        errors = validate_features(features, "pregnancy")
        # Optional features missing is OK
        self.assertEqual(len(errors), 0)

    def test_validate_missing_required(self):
        from ml.features.contracts import validate_features
        errors = validate_features({}, "pregnancy")
        self.assertGreater(len(errors), 0)
        self.assertTrue(any("maternal_age_years" in e for e in errors))

    def test_validate_out_of_range(self):
        from ml.features.contracts import validate_features
        features = {
            "maternal_age_years": 150,  # Above max of 55
            "gravidity": 3,
            "parity": 2,
            "bp_systolic_mm_hg": 120,
            "bp_diastolic_mm_hg": 80,
            "gestational_age_days": 196,
        }
        errors = validate_features(features, "pregnancy")
        self.assertTrue(any("above max" in e for e in errors))


class MLPredictAPITest(TestCase):
    """Tests for ML predict API endpoint (spec §13, §6.3, §3.2)."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        set_inference_adapter(StubClinicalRiskInference())

    def tearDown(self):
        cache.clear()
        set_inference_adapter(StubClinicalRiskInference())

    def _set_ml_mode(self, mode):
        config = SystemConfig.get_config()
        config.clinical_ml_mode = mode
        config.save()

    def test_predict_rules_only_returns_403(self):
        self._set_ml_mode(MLMode.RULES_ONLY)
        resp = self.client.post("/api/v1/ml/predict", {
            "patientId": str(uuid.uuid4()),
            "facts": {"maternal_age": 28},
        }, format="json")
        self.assertEqual(resp.status_code, 403)
        self.assertIn("RULES_ONLY", resp.json()["error"])

    def test_predict_silent_mode_does_not_return_result(self):
        self._set_ml_mode(MLMode.SILENT)
        resp = self.client.post("/api/v1/ml/predict", {
            "patientId": str(uuid.uuid4()),
            "facts": {"maternal_age": 28},
            "module": "pregnancy",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["mlMode"], "SILENT")
        self.assertNotIn("prediction", data)

    def test_predict_assisted_mode_returns_result(self):
        self._set_ml_mode(MLMode.ASSISTED)
        resp = self.client.post("/api/v1/ml/predict", {
            "patientId": str(uuid.uuid4()),
            "facts": {"maternal_age": 28},
            "module": "pregnancy",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["mlMode"], "ASSISTED")
        self.assertIn("prediction", data)

    def test_predict_audit_log(self):
        self._set_ml_mode(MLMode.ASSISTED)
        self.client.post("/api/v1/ml/predict", {
            "patientId": str(uuid.uuid4()),
            "facts": {"maternal_age": 28},
        }, format="json")

        audit = AuditEvent.objects.filter(action="ML_PREDICTION").first()
        self.assertIsNotNone(audit)


class MLMetadataAPITest(TestCase):
    """Tests for ML metadata endpoint (spec §6.3)."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        set_inference_adapter(StubClinicalRiskInference())

    def test_metadata(self):
        resp = self.client.get("/api/v1/ml/metadata")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["modelName"], "StubInference")
        self.assertIn("mlMode", data)


class NonDowngradeInvariantTest(TestCase):
    """
    Tests for the non-downgrade invariant (spec §3.1).

    The ML model MUST NOT cancel, downgrade, suppress, or close a
    rule-based emergency alert.
    """

    def tearDown(self):
        cache.clear()

    def test_ml_cannot_downgrade_emergency(self):
        """ML HIGH risk should not downgrade an EMERGENCY rule disposition."""
        decision = build_unified_decision(
            patient_id=str(uuid.uuid4()),
            rule_result={"disposition": UrgencyLevel.EMERGENCY, "fired_rules": []},
            ml_result={"riskBand": "LOW", "abstained": False},  # ML says low risk
        )
        # Should still be EMERGENCY_NOW — ML cannot downgrade
        self.assertEqual(decision["clinicalDisposition"], ClinicalDisposition.EMERGENCY_NOW)

    def test_ml_cannot_downgrade_priority(self):
        """ML LOW risk should not downgrade a PRIORITY rule disposition."""
        decision = build_unified_decision(
            patient_id=str(uuid.uuid4()),
            rule_result={"disposition": UrgencyLevel.PRIORITY, "fired_rules": []},
            ml_result={"riskBand": "LOW", "abstained": False},
        )
        self.assertEqual(decision["clinicalDisposition"], ClinicalDisposition.PRIORITY_REVIEW)

    def test_ml_can_escalate_routine_to_priority(self):
        """ML HIGH risk can escalate ROUTINE to PRIORITY_REVIEW (spec §15)."""
        config = SystemConfig.get_config()
        config.clinical_ml_mode = MLMode.ASSISTED
        config.save()

        decision = build_unified_decision(
            patient_id=str(uuid.uuid4()),
            rule_result={"disposition": UrgencyLevel.ROUTINE, "fired_rules": []},
            ml_result={"riskBand": "HIGH", "abstained": False},
        )
        self.assertEqual(decision["clinicalDisposition"], ClinicalDisposition.PRIORITY_REVIEW)

    def test_ml_not_executed_in_rules_only(self):
        """In RULES_ONLY mode, ML result should be None."""
        config = SystemConfig.get_config()
        config.clinical_ml_mode = MLMode.RULES_ONLY
        config.save()

        decision = build_unified_decision(
            patient_id=str(uuid.uuid4()),
            rule_result={"disposition": UrgencyLevel.ROUTINE, "fired_rules": []},
            ml_result={"riskBand": "HIGH", "abstained": False},
        )
        self.assertIsNone(decision["clinicalRiskResult"])
        self.assertEqual(decision["clinicalDisposition"], ClinicalDisposition.ROUTINE)

    def test_abstain_on_missing_critical_fields(self):
        """ABSTAIN when critical fields are missing (spec §15)."""
        decision = build_unified_decision(
            patient_id=str(uuid.uuid4()),
            rule_result={"disposition": UrgencyLevel.ROUTINE, "fired_rules": []},
            missing_critical_fields=["bp_systolic", "bp_diastolic"],
        )
        self.assertEqual(decision["clinicalDisposition"], ClinicalDisposition.ABSTAIN)
        self.assertTrue(decision["requiresHumanConfirmation"])
