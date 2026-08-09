"""
Tests for ML evaluation metrics (spec §13.6).

Verifies all 13 required metrics with known values:
  1. sensitivity
  2. specificity
  3. positive_predictive_value
  4. negative_predictive_value
  5. au_roc
  6. au_pr
  7. calibration_slope
  8. calibration_intercept
  9. brier_score
  10. decision_curve_net_benefit
  11. subgroup_performance
  12. abstention_rate
  13. missingness_drift
"""
import numpy as np
from django.test import TestCase

from ml.evaluation.metrics import (
    EvaluationReport,
    evaluate_model,
    format_report,
    sensitivity,
    specificity,
    positive_predictive_value,
    negative_predictive_value,
    au_roc,
    au_pr,
    calibration_slope_intercept,
    brier_score,
    decision_curve_net_benefit,
    subgroup_performance,
    abstention_rate,
    missingness_drift,
)


class SensitivityTests(TestCase):
    """Test 1: sensitivity (recall)."""

    def test_perfect_sensitivity(self):
        y_true = np.array([1, 1, 0, 0])
        y_pred = np.array([1, 1, 0, 0])
        self.assertEqual(sensitivity(y_true, y_pred), 1.0)

    def test_zero_sensitivity(self):
        y_true = np.array([1, 1, 0, 0])
        y_pred = np.array([0, 0, 0, 0])
        self.assertEqual(sensitivity(y_true, y_pred), 0.0)

    def test_half_sensitivity(self):
        y_true = np.array([1, 1, 0, 0])
        y_pred = np.array([1, 0, 0, 0])
        self.assertEqual(sensitivity(y_true, y_pred), 0.5)

    def test_no_positives_returns_zero(self):
        y_true = np.array([0, 0])
        y_pred = np.array([0, 0])
        self.assertEqual(sensitivity(y_true, y_pred), 0.0)


class SpecificityTests(TestCase):
    """Test 2: specificity."""

    def test_perfect_specificity(self):
        y_true = np.array([1, 1, 0, 0])
        y_pred = np.array([1, 1, 0, 0])
        self.assertEqual(specificity(y_true, y_pred), 1.0)

    def test_zero_specificity(self):
        y_true = np.array([1, 1, 0, 0])
        y_pred = np.array([1, 1, 1, 1])
        self.assertEqual(specificity(y_true, y_pred), 0.0)


class PPVTests(TestCase):
    """Test 3: positive_predictive_value (precision)."""

    def test_perfect_ppv(self):
        y_true = np.array([1, 1, 0, 0])
        y_pred = np.array([1, 1, 0, 0])
        self.assertEqual(positive_predictive_value(y_true, y_pred), 1.0)

    def test_half_ppv(self):
        y_true = np.array([1, 0, 0, 0])
        y_pred = np.array([1, 1, 0, 0])
        self.assertEqual(positive_predictive_value(y_true, y_pred), 0.5)


class NPVTests(TestCase):
    """Test 4: negative_predictive_value."""

    def test_perfect_npv(self):
        y_true = np.array([1, 1, 0, 0])
        y_pred = np.array([1, 1, 0, 0])
        self.assertEqual(negative_predictive_value(y_true, y_pred), 1.0)

    def test_half_npv(self):
        y_true = np.array([1, 0, 0, 0])
        y_pred = np.array([0, 0, 0, 0])
        self.assertEqual(negative_predictive_value(y_true, y_pred), 0.5)


class AuRocTests(TestCase):
    """Test 5: au_roc."""

    def test_perfect_auc(self):
        y_true = np.array([0, 0, 1, 1])
        y_pred_proba = np.array([0.1, 0.2, 0.8, 0.9])
        self.assertEqual(au_roc(y_true, y_pred_proba), 1.0)

    def test_random_auc_near_half(self):
        np.random.seed(42)
        y_true = np.array([0] * 50 + [1] * 50)
        y_pred_proba = np.random.rand(100)
        auc = au_roc(y_true, y_pred_proba)
        self.assertGreater(auc, 0.3)
        self.assertLess(auc, 0.7)

    def test_single_class_returns_zero(self):
        y_true = np.array([1, 1, 1])
        y_pred_proba = np.array([0.1, 0.5, 0.9])
        self.assertEqual(au_roc(y_true, y_pred_proba), 0.0)


class AuPrTests(TestCase):
    """Test 6: au_pr."""

    def test_perfect_pr(self):
        y_true = np.array([0, 0, 1, 1])
        y_pred_proba = np.array([0.1, 0.2, 0.8, 0.9])
        self.assertEqual(au_pr(y_true, y_pred_proba), 1.0)

    def test_returns_float(self):
        y_true = np.array([0, 1, 0, 1])
        y_pred_proba = np.array([0.3, 0.6, 0.4, 0.7])
        result = au_pr(y_true, y_pred_proba)
        self.assertGreaterEqual(result, 0.0)
        self.assertLessEqual(result, 1.0)


class CalibrationTests(TestCase):
    """Test 7 & 8: calibration_slope and calibration_intercept."""

    def test_well_calibrated(self):
        # Probabilities that match the true rates
        y_true = np.array([0, 0, 0, 0, 1, 1, 1, 1])
        y_pred_proba = np.array([0.1, 0.2, 0.3, 0.4, 0.6, 0.7, 0.8, 0.9])
        slope, intercept = calibration_slope_intercept(y_true, y_pred_proba)
        # Well-calibrated: slope near 1, intercept near 0
        self.assertGreater(slope, 0.0)

    def test_returns_tuple(self):
        y_true = np.array([0, 1, 0, 1])
        y_pred_proba = np.array([0.3, 0.7, 0.4, 0.6])
        result = calibration_slope_intercept(y_true, y_pred_proba)
        self.assertIsInstance(result, tuple)
        self.assertEqual(len(result), 2)


class BrierScoreTests(TestCase):
    """Test 9: brier_score."""

    def test_perfect_predictions(self):
        y_true = np.array([0, 1, 0, 1])
        y_pred_proba = np.array([0.0, 1.0, 0.0, 1.0])
        self.assertEqual(brier_score(y_true, y_pred_proba), 0.0)

    def test_worst_predictions(self):
        y_true = np.array([0, 1])
        y_pred_proba = np.array([1.0, 0.0])
        self.assertEqual(brier_score(y_true, y_pred_proba), 1.0)

    def test_known_value(self):
        y_true = np.array([0, 1])
        y_pred_proba = np.array([0.5, 0.5])
        # (0.5-0)^2 + (0.5-1)^2 = 0.25 + 0.25 = 0.5, mean = 0.25
        self.assertAlmostEqual(brier_score(y_true, y_pred_proba), 0.25, places=6)


class DecisionCurveTests(TestCase):
    """Test 10: decision_curve_net_benefit."""

    def test_returns_dict_of_thresholds(self):
        y_true = np.array([0, 0, 1, 1])
        y_pred_proba = np.array([0.1, 0.2, 0.8, 0.9])
        result = decision_curve_net_benefit(y_true, y_pred_proba)
        self.assertIsInstance(result, dict)
        self.assertGreater(len(result), 0)
        for key, val in result.items():
            self.assertIsInstance(val, float)

    def test_custom_thresholds(self):
        y_true = np.array([0, 0, 1, 1])
        y_pred_proba = np.array([0.1, 0.2, 0.8, 0.9])
        result = decision_curve_net_benefit(y_true, y_pred_proba, thresholds=[0.3, 0.5])
        self.assertEqual(set(result.keys()), {"0.3", "0.5"})


class SubgroupPerformanceTests(TestCase):
    """Test 11: subgroup_performance."""

    def test_subgroup_breakdown(self):
        y_true = np.array([1, 0, 1, 0])
        y_pred = np.array([1, 0, 1, 0])
        y_pred_proba = np.array([0.9, 0.1, 0.8, 0.2])
        subgroups = {"region": ["north", "north", "south", "south"]}
        result = subgroup_performance(y_true, y_pred, y_pred_proba, subgroups)
        self.assertIn("region", result)
        self.assertIn("north", result["region"])
        self.assertIn("south", result["region"])
        self.assertEqual(result["region"]["north"]["n"], 2)
        self.assertEqual(result["region"]["south"]["n"], 2)

    def test_multiple_subgroups(self):
        y_true = np.array([1, 0, 1, 0])
        y_pred = np.array([1, 0, 1, 0])
        y_pred_proba = np.array([0.9, 0.1, 0.8, 0.2])
        subgroups = {
            "region": ["north", "south", "north", "south"],
            "age_group": ["young", "old", "old", "young"],
        }
        result = subgroup_performance(y_true, y_pred, y_pred_proba, subgroups)
        self.assertIn("region", result)
        self.assertIn("age_group", result)


class AbstentionRateTests(TestCase):
    """Test 12: abstention_rate."""

    def test_no_abstention(self):
        self.assertEqual(abstention_rate(0, 100), 0.0)

    def test_all_abstention(self):
        self.assertEqual(abstention_rate(100, 100), 1.0)

    def test_half_abstention(self):
        self.assertEqual(abstention_rate(50, 100), 0.5)

    def test_zero_total(self):
        self.assertEqual(abstention_rate(0, 0), 0.0)


class MissingnessDriftTests(TestCase):
    """Test 13: missingness_drift."""

    def test_no_drift(self):
        current = {"age": 0.1, "bp": 0.2}
        baseline = {"age": 0.1, "bp": 0.2}
        result = missingness_drift(current, baseline)
        self.assertEqual(result["age"], 0.0)
        self.assertEqual(result["bp"], 0.0)

    def test_drift_detected(self):
        current = {"age": 0.5, "bp": 0.2}
        baseline = {"age": 0.1, "bp": 0.2}
        result = missingness_drift(current, baseline)
        self.assertAlmostEqual(result["age"], 0.4, places=6)
        self.assertEqual(result["bp"], 0.0)

    def test_new_feature_in_current(self):
        current = {"age": 0.1, "new_feat": 0.3}
        baseline = {"age": 0.1}
        result = missingness_drift(current, baseline)
        self.assertIn("new_feat", result)
        self.assertAlmostEqual(result["new_feat"], 0.3, places=6)


class EvaluateModelTests(TestCase):
    """Test the full evaluate_model function producing all 13 metrics."""

    def test_returns_evaluation_report(self):
        y_true = np.array([0, 0, 1, 1, 0, 1])
        y_pred_proba = np.array([0.1, 0.2, 0.8, 0.9, 0.3, 0.7])
        y_pred = (y_pred_proba >= 0.5).astype(int)
        report = evaluate_model(y_true, y_pred_proba, y_pred)
        self.assertIsInstance(report, EvaluationReport)

    def test_report_has_all_13_metrics(self):
        y_true = np.array([0, 0, 1, 1])
        y_pred_proba = np.array([0.1, 0.2, 0.8, 0.9])
        y_pred = np.array([0, 0, 1, 1])
        report = evaluate_model(y_true, y_pred_proba, y_pred)
        # All 13 metrics must be present
        self.assertTrue(hasattr(report, "sensitivity"))
        self.assertTrue(hasattr(report, "specificity"))
        self.assertTrue(hasattr(report, "positive_predictive_value"))
        self.assertTrue(hasattr(report, "negative_predictive_value"))
        self.assertTrue(hasattr(report, "au_roc"))
        self.assertTrue(hasattr(report, "au_pr"))
        self.assertTrue(hasattr(report, "calibration_slope"))
        self.assertTrue(hasattr(report, "calibration_intercept"))
        self.assertTrue(hasattr(report, "brier_score"))
        self.assertTrue(hasattr(report, "decision_curve_net_benefit"))
        self.assertTrue(hasattr(report, "subgroup_performance"))
        self.assertTrue(hasattr(report, "abstention_rate"))
        self.assertTrue(hasattr(report, "missingness_drift"))

    def test_report_with_subgroups(self):
        y_true = np.array([0, 0, 1, 1])
        y_pred_proba = np.array([0.1, 0.2, 0.8, 0.9])
        y_pred = np.array([0, 0, 1, 1])
        subgroups = {"region": ["north", "south", "north", "south"]}
        report = evaluate_model(y_true, y_pred_proba, y_pred, subgroups_df=subgroups)
        self.assertIn("region", report.subgroup_performance)

    def test_report_with_abstention(self):
        y_true = np.array([0, 1])
        y_pred_proba = np.array([0.2, 0.8])
        y_pred = np.array([0, 1])
        report = evaluate_model(y_true, y_pred_proba, y_pred, n_abstained=2)
        self.assertEqual(report.abstention_rate, 0.5)

    def test_report_with_missingness_drift(self):
        y_true = np.array([0, 1])
        y_pred_proba = np.array([0.2, 0.8])
        y_pred = np.array([0, 1])
        report = evaluate_model(
            y_true, y_pred_proba, y_pred,
            current_missingness={"age": 0.5},
            training_missingness_baseline={"age": 0.1},
        )
        self.assertIn("age", report.missingness_drift)


class FormatReportTests(TestCase):
    """Test format_report for JSON serialization."""

    def test_returns_dict(self):
        y_true = np.array([0, 1])
        y_pred_proba = np.array([0.2, 0.8])
        y_pred = np.array([0, 1])
        report = evaluate_model(y_true, y_pred_proba, y_pred)
        d = format_report(report)
        self.assertIsInstance(d, dict)
        self.assertIn("sensitivity", d)
        self.assertIn("au_roc", d)
        self.assertIn("brier_score", d)

    def test_all_13_metrics_in_dict(self):
        y_true = np.array([0, 1])
        y_pred_proba = np.array([0.2, 0.8])
        y_pred = np.array([0, 1])
        report = evaluate_model(y_true, y_pred_proba, y_pred)
        d = format_report(report)
        expected_keys = [
            "sensitivity", "specificity", "positive_predictive_value",
            "negative_predictive_value", "au_roc", "au_pr",
            "calibration_slope", "calibration_intercept", "brier_score",
            "decision_curve_net_benefit", "subgroup_performance",
            "abstention_rate", "missingness_drift",
        ]
        for key in expected_keys:
            self.assertIn(key, d)
