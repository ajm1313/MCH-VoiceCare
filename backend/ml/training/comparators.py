"""
Comparator models for clinical ML validation (spec §13.5).

Validation MUST compare CatBoost against:
  - elastic-net logistic regression — mandatory transparent baseline;
  - Explainable Boosting Machine (EBM);
  - XGBoost or LightGBM.

All candidates MUST use identical patient/pregnancy splits and external
holdouts (spec §13.5, §30.2).

Each comparator exposes a common interface:
  - train(X, y) -> self
  - predict(X) -> (probability, metadata)

Optional packages (xgboost, interpret) use try/except imports and fall back
to scikit-learn equivalents when not installed.
"""
from typing import List, Tuple, Dict, Any, Optional
import numpy as np


class BaseComparator:
    """Base class for all comparator models (spec §13.5)."""

    name: str = "base"
    model_type: str = "unknown"

    def train(self, X: np.ndarray, y: np.ndarray) -> "BaseComparator":
        """Train the comparator on features X and labels y."""
        raise NotImplementedError

    def predict(self, X: np.ndarray) -> Tuple[np.ndarray, Dict[str, Any]]:
        """Predict probabilities.

        Returns:
            Tuple of (probability_array, metadata_dict).
            metadata includes feature_importance / coefficients for
            interpretability.
        """
        raise NotImplementedError

    def is_available(self) -> bool:
        """Return True if the required backend package is installed."""
        return True


# ---------------------------------------------------------------------------
# ElasticNet comparator (mandatory transparent baseline)
# ---------------------------------------------------------------------------
class ElasticNetComparator(BaseComparator):
    """
    Elastic-net logistic regression comparator (spec §13.5).

    Mandatory transparent baseline. Uses sklearn.linear_model.SGDClassifier
    with elasticnet penalty. Records coefficients for interpretability.
    """

    name = "elastic_net"
    model_type = "ElasticNetLogisticRegression"

    def __init__(self, l1_ratio: float = 0.5, alpha: float = 0.0001,
                 max_iter: int = 1000, random_state: int = 42):
        self.l1_ratio = l1_ratio
        self.alpha = alpha
        self.max_iter = max_iter
        self.random_state = random_state
        self._model = None
        self._scaler = None
        self._feature_names: List[str] = []

    def train(self, X: np.ndarray, y: np.ndarray) -> "ElasticNetComparator":
        from sklearn.linear_model import SGDClassifier
        from sklearn.preprocessing import StandardScaler

        X = np.asarray(X, dtype=float)
        y = np.asarray(y, dtype=int)

        self._scaler = StandardScaler()
        X_scaled = self._scaler.fit_transform(X)

        # "log_loss" in sklearn >= 1.0; "log" in older versions
        try:
            self._model = SGDClassifier(
                loss="log_loss",
                penalty="elasticnet",
                l1_ratio=self.l1_ratio,
                alpha=self.alpha,
                max_iter=self.max_iter,
                random_state=self.random_state,
                tol=1e-3,
            )
            self._model.fit(X_scaled, y)
        except (TypeError, ValueError):
            self._model = SGDClassifier(
                loss="log",
                penalty="elasticnet",
                l1_ratio=self.l1_ratio,
                alpha=self.alpha,
                max_iter=self.max_iter,
                random_state=self.random_state,
                tol=1e-3,
            )
            self._model.fit(X_scaled, y)
        return self

    def predict(self, X: np.ndarray) -> Tuple[np.ndarray, Dict[str, Any]]:
        if self._model is None:
            raise RuntimeError("ElasticNetComparator must be trained before predict")
        X = np.asarray(X, dtype=float)
        X_scaled = self._scaler.transform(X)
        probabilities = self._model.predict_proba(X_scaled)[:, 1]
        metadata = {
            "model_type": self.model_type,
            "coefficients": self._model.coef_.tolist() if hasattr(self._model, "coef_") else [],
            "intercept": float(self._model.intercept_[0]) if hasattr(self._model, "intercept_") else 0.0,
            "l1_ratio": self.l1_ratio,
            "alpha": self.alpha,
        }
        return probabilities, metadata


# ---------------------------------------------------------------------------
# EBM comparator (Explainable Boosting Machine)
# ---------------------------------------------------------------------------
class EBMComparator(BaseComparator):
    """
    Explainable Boosting Machine comparator (spec §13.5).

    Uses interpret.glassbox.ExplainableBoostingClassifier if available.
    Falls back to sklearn GradientBoostingClassifier with feature importance.
    """

    name = "ebm"
    model_type = "ExplainableBoostingMachine"

    def __init__(self, random_state: int = 42):
        self.random_state = random_state
        self._model = None
        self._uses_interpret = False

    def is_available(self) -> bool:
        try:
            import interpret  # noqa: F401
            return True
        except ImportError:
            return False

    def train(self, X: np.ndarray, y: np.ndarray) -> "EBMComparator":
        X = np.asarray(X, dtype=float)
        y = np.asarray(y, dtype=int)

        try:
            from interpret.glassbox import ExplainableBoostingClassifier
            self._model = ExplainableBoostingClassifier(
                random_state=self.random_state,
            )
            self._model.fit(X, y)
            self._uses_interpret = True
        except ImportError:
            # Fallback: sklearn GradientBoostingClassifier
            from sklearn.ensemble import GradientBoostingClassifier
            self._model = GradientBoostingClassifier(
                random_state=self.random_state,
                n_estimators=100,
                max_depth=3,
            )
            self._model.fit(X, y)
            self._uses_interpret = False
        return self

    def predict(self, X: np.ndarray) -> Tuple[np.ndarray, Dict[str, Any]]:
        if self._model is None:
            raise RuntimeError("EBMComparator must be trained before predict")
        X = np.asarray(X, dtype=float)
        probabilities = self._model.predict_proba(X)[:, 1]

        metadata: Dict[str, Any] = {
            "model_type": self.model_type,
            "uses_interpret": self._uses_interpret,
        }

        if self._uses_interpret and hasattr(self._model, "feature_importances_"):
            metadata["feature_importance"] = self._model.feature_importances_.tolist()
        elif hasattr(self._model, "feature_importances_"):
            metadata["feature_importance"] = self._model.feature_importances_.tolist()

        return probabilities, metadata


# ---------------------------------------------------------------------------
# XGBoost comparator
# ---------------------------------------------------------------------------
class XGBoostComparator(BaseComparator):
    """
    XGBoost comparator (spec §13.5).

    Uses xgboost.XGBClassifier if available, else sklearn
    GradientBoostingClassifier as fallback.
    """

    name = "xgboost"
    model_type = "XGBoost"

    def __init__(self, n_estimators: int = 100, max_depth: int = 3,
                 learning_rate: float = 0.1, random_state: int = 42):
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.learning_rate = learning_rate
        self.random_state = random_state
        self._model = None
        self._uses_xgboost = False

    def is_available(self) -> bool:
        try:
            import xgboost  # noqa: F401
            return True
        except ImportError:
            return False

    def train(self, X: np.ndarray, y: np.ndarray) -> "XGBoostComparator":
        X = np.asarray(X, dtype=float)
        y = np.asarray(y, dtype=int)

        try:
            import xgboost as xgb
            self._model = xgb.XGBClassifier(
                n_estimators=self.n_estimators,
                max_depth=self.max_depth,
                learning_rate=self.learning_rate,
                random_state=self.random_state,
                eval_metric="logloss",
            )
            self._model.fit(X, y)
            self._uses_xgboost = True
        except ImportError:
            # Fallback: sklearn GradientBoostingClassifier
            from sklearn.ensemble import GradientBoostingClassifier
            self._model = GradientBoostingClassifier(
                n_estimators=self.n_estimators,
                max_depth=self.max_depth,
                learning_rate=self.learning_rate,
                random_state=self.random_state,
            )
            self._model.fit(X, y)
            self._uses_xgboost = False
        return self

    def predict(self, X: np.ndarray) -> Tuple[np.ndarray, Dict[str, Any]]:
        if self._model is None:
            raise RuntimeError("XGBoostComparator must be trained before predict")
        X = np.asarray(X, dtype=float)
        probabilities = self._model.predict_proba(X)[:, 1]
        metadata: Dict[str, Any] = {
            "model_type": self.model_type,
            "uses_xgboost": self._uses_xgboost,
        }
        if hasattr(self._model, "feature_importances_"):
            metadata["feature_importance"] = self._model.feature_importances_.tolist()
        return probabilities, metadata


# ---------------------------------------------------------------------------
# Comparator registry
# ---------------------------------------------------------------------------
class ComparatorRegistry:
    """
    Registry of all comparator models (spec §13.5).

    Provides access to all three required comparators:
    ElasticNet, EBM, and XGBoost.
    """

    @staticmethod
    def get_all_comparators() -> List[BaseComparator]:
        """Return instances of all 3 required comparators (spec §13.5)."""
        return [
            ElasticNetComparator(),
            EBMComparator(),
            XGBoostComparator(),
        ]

    @staticmethod
    def get_comparator(name: str) -> Optional[BaseComparator]:
        """Get a single comparator by name."""
        comparators = {
            ElasticNetComparator.name: ElasticNetComparator,
            EBMComparator.name: EBMComparator,
            XGBoostComparator.name: XGBoostComparator,
        }
        cls = comparators.get(name)
        return cls() if cls else None
