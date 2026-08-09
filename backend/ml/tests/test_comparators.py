"""
Tests for ML comparator models (spec §13.5).

Verifies:
- ElasticNetComparator trains and predicts
- EBMComparator trains and predicts (with fallback)
- XGBoostComparator trains and predicts (with fallback)
- ComparatorRegistry returns all 3 comparators
- All comparators produce probabilities in [0, 1]
"""
import numpy as np
from django.test import TestCase

from ml.training.comparators import (
    ElasticNetComparator,
    EBMComparator,
    XGBoostComparator,
    ComparatorRegistry,
    BaseComparator,
)


def _make_synthetic_data(n=50, n_features=5, seed=42):
    """Generate small synthetic binary classification data."""
    rng = np.random.RandomState(seed)
    X = rng.randn(n, n_features)
    # Linear combination + noise -> binary label
    logits = X[:, 0] * 2 - X[:, 1] + 0.5 * X[:, 2] + rng.randn(n) * 0.3
    y = (logits > 0).astype(int)
    return X, y


class ElasticNetComparatorTests(TestCase):
    """Tests for ElasticNetComparator (spec §13.5)."""

    def test_trains_and_predicts(self):
        X, y = _make_synthetic_data()
        comp = ElasticNetComparator()
        comp.train(X, y)
        probs, metadata = comp.predict(X)
        self.assertEqual(len(probs), len(y))
        for p in probs:
            self.assertGreaterEqual(p, 0.0)
            self.assertLessEqual(p, 1.0)

    def test_records_coefficients(self):
        """ElasticNet must record coefficients for interpretability."""
        X, y = _make_synthetic_data()
        comp = ElasticNetComparator()
        comp.train(X, y)
        _, metadata = comp.predict(X)
        self.assertIn("coefficients", metadata)
        self.assertEqual(len(metadata["coefficients"]), X.shape[1])
        self.assertIn("intercept", metadata)

    def test_model_type(self):
        comp = ElasticNetComparator()
        self.assertEqual(comp.model_type, "ElasticNetLogisticRegression")
        self.assertEqual(comp.name, "elastic_net")

    def test_predict_before_train_raises(self):
        comp = ElasticNetComparator()
        X, _ = _make_synthetic_data()
        with self.assertRaises(RuntimeError):
            comp.predict(X)


class EBMComparatorTests(TestCase):
    """Tests for EBMComparator (spec §13.5)."""

    def test_trains_and_predicts(self):
        X, y = _make_synthetic_data()
        comp = EBMComparator()
        comp.train(X, y)
        probs, metadata = comp.predict(X)
        self.assertEqual(len(probs), len(y))
        for p in probs:
            self.assertGreaterEqual(p, 0.0)
            self.assertLessEqual(p, 1.0)

    def test_metadata_has_model_type(self):
        X, y = _make_synthetic_data()
        comp = EBMComparator()
        comp.train(X, y)
        _, metadata = comp.predict(X)
        self.assertEqual(metadata["model_type"], "ExplainableBoostingMachine")

    def test_is_available_returns_bool(self):
        comp = EBMComparator()
        self.assertIsInstance(comp.is_available(), bool)


class XGBoostComparatorTests(TestCase):
    """Tests for XGBoostComparator (spec §13.5)."""

    def test_trains_and_predicts(self):
        X, y = _make_synthetic_data()
        comp = XGBoostComparator()
        comp.train(X, y)
        probs, metadata = comp.predict(X)
        self.assertEqual(len(probs), len(y))
        for p in probs:
            self.assertGreaterEqual(p, 0.0)
            self.assertLessEqual(p, 1.0)

    def test_metadata_has_model_type(self):
        X, y = _make_synthetic_data()
        comp = XGBoostComparator()
        comp.train(X, y)
        _, metadata = comp.predict(X)
        self.assertEqual(metadata["model_type"], "XGBoost")

    def test_is_available_returns_bool(self):
        comp = XGBoostComparator()
        self.assertIsInstance(comp.is_available(), bool)


class ComparatorRegistryTests(TestCase):
    """Tests for ComparatorRegistry (spec §13.5)."""

    def test_get_all_comparators_returns_three(self):
        comparators = ComparatorRegistry.get_all_comparators()
        self.assertEqual(len(comparators), 3)

    def test_get_all_comparators_types(self):
        comparators = ComparatorRegistry.get_all_comparators()
        types = [type(c) for c in comparators]
        self.assertIn(ElasticNetComparator, types)
        self.assertIn(EBMComparator, types)
        self.assertIn(XGBoostComparator, types)

    def test_get_comparator_by_name(self):
        comp = ComparatorRegistry.get_comparator("elastic_net")
        self.assertIsInstance(comp, ElasticNetComparator)
        comp2 = ComparatorRegistry.get_comparator("ebm")
        self.assertIsInstance(comp2, EBMComparator)
        comp3 = ComparatorRegistry.get_comparator("xgboost")
        self.assertIsInstance(comp3, XGBoostComparator)

    def test_get_comparator_unknown_returns_none(self):
        comp = ComparatorRegistry.get_comparator("nonexistent")
        self.assertIsNone(comp)

    def test_all_comparators_are_base(self):
        comparators = ComparatorRegistry.get_all_comparators()
        for c in comparators:
            self.assertIsInstance(c, BaseComparator)
