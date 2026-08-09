"""
Tests for model card generation and serialization (spec §30.1, §31).

Verifies:
- generate_model_card produces a ModelCard
- serialize_model_card produces a dict with all required fields
- save_model_card writes JSON to the model_cards directory
- Approval status defaults to DRAFT
"""
import os
import json
import tempfile

from django.test import TestCase

from ml.governance.model_card import (
    ModelCard,
    ApprovalStatus,
    generate_model_card,
    serialize_model_card,
    save_model_card,
)
from ml.evaluation.metrics import EvaluationReport, evaluate_model
from ml.training.comparators import ElasticNetComparator
import numpy as np


def _make_eval_report():
    """Create a small evaluation report."""
    y_true = np.array([0, 0, 1, 1])
    y_pred_proba = np.array([0.1, 0.2, 0.8, 0.9])
    y_pred = np.array([0, 0, 1, 1])
    return evaluate_model(y_true, y_pred_proba, y_pred)


def _make_trained_comparator():
    """Create and train a small comparator."""
    rng = np.random.RandomState(42)
    X = rng.randn(30, 4)
    y = (X[:, 0] > 0).astype(int)
    comp = ElasticNetComparator()
    comp.train(X, y)
    return comp


class GenerateModelCardTests(TestCase):
    """Tests for generate_model_card (spec §30.1, §31)."""

    def test_generates_model_card(self):
        model = _make_trained_comparator()
        report = _make_eval_report()
        card = generate_model_card(
            model=model,
            eval_report=report,
            model_version="v1.0.0",
            training_data_description="Synthetic test data",
            intended_use="Research validation only",
        )
        self.assertIsInstance(card, ModelCard)

    def test_auto_detects_model_id(self):
        model = _make_trained_comparator()
        report = _make_eval_report()
        card = generate_model_card(model=model, eval_report=report)
        self.assertEqual(card.model_id, "elastic_net")

    def test_auto_detects_model_type(self):
        model = _make_trained_comparator()
        report = _make_eval_report()
        card = generate_model_card(model=model, eval_report=report)
        self.assertEqual(card.model_type, "ElasticNetLogisticRegression")

    def test_default_approval_status_is_draft(self):
        model = _make_trained_comparator()
        report = _make_eval_report()
        card = generate_model_card(model=model, eval_report=report)
        self.assertEqual(card.approval_status, ApprovalStatus.DRAFT)

    def test_includes_evaluation_report(self):
        model = _make_trained_comparator()
        report = _make_eval_report()
        card = generate_model_card(model=model, eval_report=report)
        self.assertIsNotNone(card.evaluation_report)
        self.assertIn("sensitivity", card.evaluation_report)

    def test_includes_limitations_and_ethical_considerations(self):
        model = _make_trained_comparator()
        report = _make_eval_report()
        card = generate_model_card(
            model=model,
            eval_report=report,
            limitations=["Not validated on Ghanaian data"],
            ethical_considerations=["Risk of algorithmic bias"],
        )
        self.assertEqual(card.limitations, ["Not validated on Ghanaian data"])
        self.assertEqual(card.ethical_considerations, ["Risk of algorithmic bias"])

    def test_feature_contract_version(self):
        model = _make_trained_comparator()
        report = _make_eval_report()
        card = generate_model_card(
            model=model, eval_report=report, feature_contract_version="2.0.0")
        self.assertEqual(card.feature_contract_version, "2.0.0")

    def test_accepts_dict_eval_report(self):
        model = _make_trained_comparator()
        card = generate_model_card(
            model=model,
            eval_report={"sensitivity": 0.9, "au_roc": 0.85},
        )
        self.assertEqual(card.evaluation_report["sensitivity"], 0.9)


class SerializeModelCardTests(TestCase):
    """Tests for serialize_model_card (spec §31)."""

    def test_returns_dict(self):
        model = _make_trained_comparator()
        report = _make_eval_report()
        card = generate_model_card(model=model, eval_report=report)
        d = serialize_model_card(card)
        self.assertIsInstance(d, dict)

    def test_includes_all_spec_31_fields(self):
        """Model card must contain all fields from spec §31."""
        model = _make_trained_comparator()
        report = _make_eval_report()
        card = generate_model_card(
            model=model,
            eval_report=report,
            training_data_description="Test data",
            intended_use="Research",
        )
        d = serialize_model_card(card)
        # Spec §31 required fields
        required = [
            "model_id", "model_version", "model_type",
            "training_data_description", "training_data_sources",
            "feature_contract_version", "evaluation_report",
            "approval_status", "approved_by", "approved_at",
            "approval_criteria_met", "intended_use", "limitations",
            "ethical_considerations", "target_definition",
            "prediction_time_definition", "split_definition",
            "calibration_method", "operating_thresholds",
            "package_hash", "rollback_instructions",
            "subgroup_metrics", "created_at",
        ]
        for key in required:
            self.assertIn(key, d, f"Missing required field: {key}")

    def test_serializable_to_json(self):
        """The serialized dict must be JSON-serializable."""
        model = _make_trained_comparator()
        report = _make_eval_report()
        card = generate_model_card(model=model, eval_report=report)
        d = serialize_model_card(card)
        json_str = json.dumps(d, default=str)
        self.assertIsInstance(json_str, str)
        # Can be deserialized back
        parsed = json.loads(json_str)
        self.assertEqual(parsed["model_id"], card.model_id)


class SaveModelCardTests(TestCase):
    """Tests for save_model_card (spec §31)."""

    def test_saves_to_directory(self):
        model = _make_trained_comparator()
        report = _make_eval_report()
        card = generate_model_card(
            model=model, eval_report=report, model_version="test-v1")
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = save_model_card(card, directory=tmpdir)
            self.assertTrue(os.path.exists(filepath))
            with open(filepath, "r") as f:
                data = json.load(f)
            self.assertEqual(data["model_id"], card.model_id)
            self.assertEqual(data["model_version"], "test-v1")

    def test_default_directory(self):
        """save_model_card without directory uses ml/governance/model_cards/."""
        model = _make_trained_comparator()
        report = _make_eval_report()
        card = generate_model_card(
            model=model, eval_report=report, model_version="test-default-dir")
        filepath = save_model_card(card)
        self.assertTrue(os.path.exists(filepath))
        # Cleanup
        os.remove(filepath)


class ApprovalStatusTests(TestCase):
    """Tests for approval status values."""

    def test_approval_statuses(self):
        self.assertEqual(ApprovalStatus.DRAFT, "DRAFT")
        self.assertEqual(ApprovalStatus.PENDING, "PENDING")
        self.assertEqual(ApprovalStatus.APPROVED, "APPROVED")
        self.assertEqual(ApprovalStatus.REJECTED, "REJECTED")
