"""
Clinical evaluation metrics for ML model validation (spec §13.6).

Do not use overall accuracy as the primary safety metric (spec §13.6).

Required reporting (13 metrics):
  1.  sensitivity (recall at threshold)
  2.  specificity
  3.  positive_predictive_value (precision)
  4.  negative_predictive_value
  5.  au_roc (area under ROC curve)
  6.  au_pr (area under PR curve)
  7.  calibration_slope
  8.  calibration_intercept
  9.  brier_score
  10. decision_curve_net_benefit (at threshold range)
  11. subgroup_performance (by region, facility, age_group, parity, language, disability)
  12. abstention_rate
  13. missingness_drift (feature missingness vs training baseline)
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
import numpy as np


@dataclass
class EvaluationReport:
    """Report containing all 13 required clinical evaluation metrics (spec §13.6)."""
    # 1. sensitivity (recall at threshold)
    sensitivity: float = 0.0
    # 2. specificity
    specificity: float = 0.0
    # 3. positive predictive value (precision)
    positive_predictive_value: float = 0.0
    # 4. negative predictive value
    negative_predictive_value: float = 0.0
    # 5. area under ROC curve
    au_roc: float = 0.0
    # 6. area under PR curve
    au_pr: float = 0.0
    # 7. calibration slope
    calibration_slope: float = 0.0
    # 8. calibration intercept
    calibration_intercept: float = 0.0
    # 9. Brier score
    brier_score: float = 0.0
    # 10. decision curve net benefit (at threshold range)
    decision_curve_net_benefit: Dict[str, float] = field(default_factory=dict)
    # 11. subgroup performance
    subgroup_performance: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    # 12. abstention rate
    abstention_rate: float = 0.0
    # 13. missingness drift
    missingness_drift: Dict[str, float] = field(default_factory=dict)
    # Extra metadata
    threshold: float = 0.5
    n_samples: int = 0
    n_positive: int = 0
    n_negative: int = 0


# ---------------------------------------------------------------------------
# Individual metric functions
# ---------------------------------------------------------------------------
def sensitivity(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Sensitivity (recall) = TP / (TP + FN)."""
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    tp = np.sum((y_pred == 1) & (y_true == 1))
    fn = np.sum((y_pred == 0) & (y_true == 1))
    if tp + fn == 0:
        return 0.0
    return float(tp / (tp + fn))


def specificity(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Specificity = TN / (TN + FP)."""
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    tn = np.sum((y_pred == 0) & (y_true == 0))
    fp = np.sum((y_pred == 1) & (y_true == 0))
    if tn + fp == 0:
        return 0.0
    return float(tn / (tn + fp))


def positive_predictive_value(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """PPV (precision) = TP / (TP + FP)."""
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    tp = np.sum((y_pred == 1) & (y_true == 1))
    fp = np.sum((y_pred == 1) & (y_true == 0))
    if tp + fp == 0:
        return 0.0
    return float(tp / (tp + fp))


def negative_predictive_value(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """NPV = TN / (TN + FN)."""
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    tn = np.sum((y_pred == 0) & (y_true == 0))
    fn = np.sum((y_pred == 0) & (y_true == 1))
    if tn + fn == 0:
        return 0.0
    return float(tn / (tn + fn))


def au_roc(y_true: np.ndarray, y_pred_proba: np.ndarray) -> float:
    """Area under the ROC curve."""
    try:
        from sklearn.metrics import roc_auc_score
        y_true = np.asarray(y_true)
        y_pred_proba = np.asarray(y_pred_proba)
        if len(np.unique(y_true)) < 2:
            return 0.0
        return float(roc_auc_score(y_true, y_pred_proba))
    except ImportError:
        return _manual_auc(y_true, y_pred_proba)


def au_pr(y_true: np.ndarray, y_pred_proba: np.ndarray) -> float:
    """Area under the precision-recall curve."""
    try:
        from sklearn.metrics import average_precision_score
        y_true = np.asarray(y_true)
        y_pred_proba = np.asarray(y_pred_proba)
        return float(average_precision_score(y_true, y_pred_proba))
    except ImportError:
        return _manual_auc(y_true, y_pred_proba)


def calibration_slope_intercept(y_true: np.ndarray,
                                y_pred_proba: np.ndarray) -> tuple:
    """Calibration slope and intercept via logistic regression of outcome on logit(prob).

    A well-calibrated model has slope ~1.0 and intercept ~0.0.
    """
    y_true = np.asarray(y_true, dtype=float)
    y_pred_proba = np.asarray(y_pred_proba, dtype=float)
    # Clamp to avoid log(0)
    eps = 1e-7
    probs = np.clip(y_pred_proba, eps, 1 - eps)
    logit = np.log(probs / (1 - probs))

    try:
        from sklearn.linear_model import LogisticRegression
        # penalty=None supported in sklearn >= 1.2; fallback to 'none' for older
        try:
            lr = LogisticRegression(penalty=None, solver="lbfgs", max_iter=1000)
        except (TypeError, ValueError):
            lr = LogisticRegression(penalty="none", solver="lbfgs", max_iter=1000)
        lr.fit(logit.reshape(-1, 1), y_true.astype(int))
        slope = float(lr.coef_[0][0])
        intercept = float(lr.intercept_[0])
        return slope, intercept
    except (ImportError, Exception):
        # Fallback: simple least-squares on logit
        if len(y_true) < 2 or np.std(logit) == 0:
            return 0.0, 0.0
        x = logit
        y = y_true
        x_mean = np.mean(x)
        y_mean = np.mean(y)
        denom = np.sum((x - x_mean) ** 2)
        if denom == 0:
            return 0.0, 0.0
        slope = float(np.sum((x - x_mean) * (y - y_mean)) / denom)
        intercept = float(y_mean - slope * x_mean)
        return slope, intercept


def brier_score(y_true: np.ndarray, y_pred_proba: np.ndarray) -> float:
    """Brier score = mean((predicted_prob - actual)^2)."""
    y_true = np.asarray(y_true, dtype=float)
    y_pred_proba = np.asarray(y_pred_proba, dtype=float)
    return float(np.mean((y_pred_proba - y_true) ** 2))


def decision_curve_net_benefit(y_true: np.ndarray, y_pred_proba: np.ndarray,
                               thresholds: Optional[List[float]] = None) -> Dict[str, float]:
    """Decision curve net benefit at a range of thresholds.

    Net benefit = (TP - FP * t/(1-t)) / N  where t is the threshold.
    """
    y_true = np.asarray(y_true, dtype=int)
    y_pred_proba = np.asarray(y_pred_proba, dtype=float)
    if thresholds is None:
        thresholds = [round(t * 0.05, 2) for t in range(1, 20)]  # 0.05 to 0.95

    n = len(y_true)
    result: Dict[str, float] = {}
    for t in thresholds:
        if t <= 0 or t >= 1:
            continue
        y_pred = (y_pred_proba >= t).astype(int)
        tp = np.sum((y_pred == 1) & (y_true == 1))
        fp = np.sum((y_pred == 1) & (y_true == 0))
        nb = (tp - fp * (t / (1 - t))) / n if n > 0 else 0.0
        result[str(t)] = round(float(nb), 6)
    return result


def subgroup_performance(y_true: np.ndarray, y_pred: np.ndarray,
                         y_pred_proba: np.ndarray,
                         subgroups_df: Dict[str, list]) -> Dict[str, Dict[str, Any]]:
    """Subgroup performance by region, facility, age_group, parity, language, disability.

    Args:
        subgroups_df: dict mapping subgroup column name -> list of values
            (same length as y_true)
    """
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    y_pred_proba = np.asarray(y_pred_proba, dtype=float)
    result: Dict[str, Dict[str, Any]] = {}

    for group_name, group_values in subgroups_df.items():
        group_values = list(group_values)
        if len(group_values) != len(y_true):
            result[group_name] = {"error": "length mismatch"}
            continue
        groups: Dict[str, Dict[str, Any]] = {}
        unique_vals = set(group_values)
        for val in unique_vals:
            mask = np.array([v == val for v in group_values])
            if np.sum(mask) == 0:
                continue
            yt = y_true[mask]
            yp = y_pred[mask]
            ypp = y_pred_proba[mask]
            groups[str(val)] = {
                "n": int(np.sum(mask)),
                "sensitivity": sensitivity(yt, yp),
                "specificity": specificity(yt, yp),
                "positive_predictive_value": positive_predictive_value(yt, yp),
                "negative_predictive_value": negative_predictive_value(yt, yp),
                "au_roc": au_roc(yt, ypp) if len(np.unique(yt)) > 1 else None,
                "brier_score": brier_score(yt, ypp),
            }
        result[group_name] = groups
    return result


def abstention_rate(n_abstained: int, n_total: int) -> float:
    """Abstention rate = n_abstained / n_total."""
    if n_total == 0:
        return 0.0
    return float(n_abstained / n_total)


def missingness_drift(current_missingness: Dict[str, float],
                      training_baseline: Dict[str, float]) -> Dict[str, float]:
    """Feature missingness drift vs training baseline.

    Returns dict mapping feature -> absolute difference in missingness rate.
    """
    result: Dict[str, float] = {}
    all_features = set(list(current_missingness.keys()) + list(training_baseline.keys()))
    for feat in all_features:
        curr = current_missingness.get(feat, 0.0)
        base = training_baseline.get(feat, 0.0)
        result[feat] = round(abs(curr - base), 6)
    return result


# ---------------------------------------------------------------------------
# Main evaluation function
# ---------------------------------------------------------------------------
def evaluate_model(
    y_true: np.ndarray,
    y_pred_proba: np.ndarray,
    y_pred: np.ndarray,
    subgroups_df: Optional[Dict[str, list]] = None,
    threshold: float = 0.5,
    n_abstained: int = 0,
    current_missingness: Optional[Dict[str, float]] = None,
    training_missingness_baseline: Optional[Dict[str, float]] = None,
) -> EvaluationReport:
    """Evaluate a model and produce a report with all 13 metrics (spec §13.6).

    Args:
        y_true: Ground truth binary labels
        y_pred_proba: Predicted probabilities
        y_pred: Predicted binary labels (at threshold)
        subgroups_df: Optional dict of subgroup columns for subgroup analysis
        threshold: Classification threshold
        n_abstained: Number of samples where the model abstained
        current_missingness: Current feature missingness rates
        training_missingness_baseline: Training-time feature missingness rates

    Returns:
        EvaluationReport with all 13 required metrics.
    """
    y_true = np.asarray(y_true)
    y_pred_proba = np.asarray(y_pred_proba, dtype=float)
    y_pred = np.asarray(y_pred)

    # Calibration
    cal_slope, cal_intercept = calibration_slope_intercept(y_true, y_pred_proba)

    # Subgroup performance
    sub_perf = {}
    if subgroups_df:
        sub_perf = subgroup_performance(y_true, y_pred, y_pred_proba, subgroups_df)

    # Missingness drift
    miss_drift = {}
    if current_missingness and training_missingness_baseline:
        miss_drift = missingness_drift(current_missingness, training_missingness_baseline)

    n_total = len(y_true) + n_abstained

    return EvaluationReport(
        sensitivity=sensitivity(y_true, y_pred),
        specificity=specificity(y_true, y_pred),
        positive_predictive_value=positive_predictive_value(y_true, y_pred),
        negative_predictive_value=negative_predictive_value(y_true, y_pred),
        au_roc=au_roc(y_true, y_pred_proba),
        au_pr=au_pr(y_true, y_pred_proba),
        calibration_slope=cal_slope,
        calibration_intercept=cal_intercept,
        brier_score=brier_score(y_true, y_pred_proba),
        decision_curve_net_benefit=decision_curve_net_benefit(y_true, y_pred_proba),
        subgroup_performance=sub_perf,
        abstention_rate=abstention_rate(n_abstained, n_total),
        missingness_drift=miss_drift,
        threshold=threshold,
        n_samples=len(y_true),
        n_positive=int(np.sum(y_true == 1)),
        n_negative=int(np.sum(y_true == 0)),
    )


def format_report(report: EvaluationReport) -> dict:
    """Format an EvaluationReport as a dict for JSON serialization."""
    return {
        "sensitivity": round(report.sensitivity, 6),
        "specificity": round(report.specificity, 6),
        "positive_predictive_value": round(report.positive_predictive_value, 6),
        "negative_predictive_value": round(report.negative_predictive_value, 6),
        "au_roc": round(report.au_roc, 6),
        "au_pr": round(report.au_pr, 6),
        "calibration_slope": round(report.calibration_slope, 6),
        "calibration_intercept": round(report.calibration_intercept, 6),
        "brier_score": round(report.brier_score, 6),
        "decision_curve_net_benefit": report.decision_curve_net_benefit,
        "subgroup_performance": report.subgroup_performance,
        "abstention_rate": round(report.abstention_rate, 6),
        "missingness_drift": report.missingness_drift,
        "threshold": report.threshold,
        "n_samples": report.n_samples,
        "n_positive": report.n_positive,
        "n_negative": report.n_negative,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _manual_auc(y_true: np.ndarray, y_pred_proba: np.ndarray) -> float:
    """Manual ROC AUC computation (fallback when sklearn unavailable)."""
    y_true = np.asarray(y_true, dtype=int)
    y_pred_proba = np.asarray(y_pred_proba, dtype=float)
    if len(np.unique(y_true)) < 2:
        return 0.0
    order = np.argsort(-y_pred_proba)
    y_sorted = y_true[order]
    n_pos = np.sum(y_true == 1)
    n_neg = np.sum(y_true == 0)
    if n_pos == 0 or n_neg == 0:
        return 0.0
    tp = 0
    fp = 0
    auc = 0.0
    prev_score = None
    for i in range(len(y_sorted)):
        if prev_score is not None and y_pred_proba[order[i]] != prev_score:
            auc += (fp / n_neg) * (tp / n_pos) * 0.5
        if y_sorted[i] == 1:
            tp += 1
        else:
            fp += 1
            auc += tp / n_pos
        prev_score = y_pred_proba[order[i]]
    return float(auc / n_neg) if n_neg > 0 else 0.0
