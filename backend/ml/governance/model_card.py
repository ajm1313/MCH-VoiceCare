"""
Model cards for ML governance (spec §30.1, §31).

Every model artifact MUST have a model card containing (spec §31):
  - training data sources;
  - target definition;
  - prediction-time definition;
  - feature-contract version;
  - train/validation/test split definition;
  - subgroup metrics;
  - calibration method;
  - operating thresholds;
  - known limitations;
  - clinical approval status;
  - package hash;
  - rollback instructions.
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from datetime import datetime
import os
import json


class ApprovalStatus:
    """Model card approval status."""
    DRAFT = "DRAFT"
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


@dataclass
class ModelCard:
    """Model card for a trained ML model (spec §30.1, §31)."""
    model_id: str
    model_version: str
    model_type: str  # CatBoostClassifier, ElasticNet, EBM, XGBoost
    training_data_description: str = ""
    feature_contract_version: str = "1.0.0"
    evaluation_report: Optional[Dict[str, Any]] = None
    approval_status: str = ApprovalStatus.DRAFT
    approved_by: str = ""
    approved_at: str = ""
    approval_criteria_met: bool = False
    intended_use: str = ""
    limitations: List[str] = field(default_factory=list)
    ethical_considerations: List[str] = field(default_factory=list)
    # Extra fields from spec §31
    target_definition: str = ""
    prediction_time_definition: str = ""
    split_definition: str = ""
    calibration_method: str = "UNCALIBRATED"
    operating_thresholds: Dict[str, float] = field(default_factory=dict)
    package_hash: str = ""
    rollback_instructions: str = ""
    training_data_sources: List[str] = field(default_factory=list)
    subgroup_metrics: Dict[str, Any] = field(default_factory=dict)
    created_at: str = ""


def generate_model_card(model: Any,
                        eval_report: Any,
                        model_id: str = "",
                        model_version: str = "",
                        model_type: str = "",
                        training_data_description: str = "",
                        feature_contract_version: str = "1.0.0",
                        intended_use: str = "",
                        limitations: Optional[List[str]] = None,
                        ethical_considerations: Optional[List[str]] = None) -> ModelCard:
    """Generate a model card from a trained model and evaluation report.

    Args:
        model: Trained model object (comparator or CatBoost adapter)
        eval_report: EvaluationReport (from ml.evaluation.metrics) or dict
        model_id: Model identifier (auto-detected from model if not given)
        model_version: Version string
        model_type: Model type string (auto-detected from model if not given)

    Returns:
        ModelCard with DRAFT approval status.
    """
    # Auto-detect model_id and model_type if not provided
    if not model_id:
        model_id = getattr(model, "name", getattr(model, "model_name", "unknown"))
    if not model_type:
        model_type = getattr(model, "model_type", "unknown")

    # Convert eval_report to dict if it's an EvaluationReport
    if hasattr(eval_report, "sensitivity"):
        from ml.evaluation.metrics import format_report
        eval_dict = format_report(eval_report)
        subgroup_metrics = eval_report.subgroup_performance
    elif isinstance(eval_report, dict):
        eval_dict = eval_report
        subgroup_metrics = eval_dict.get("subgroup_performance", {})
    else:
        eval_dict = {}
        subgroup_metrics = {}

    return ModelCard(
        model_id=model_id,
        model_version=model_version,
        model_type=model_type,
        training_data_description=training_data_description,
        feature_contract_version=feature_contract_version,
        evaluation_report=eval_dict,
        approval_status=ApprovalStatus.DRAFT,
        approved_by="",
        approved_at="",
        approval_criteria_met=False,
        intended_use=intended_use,
        limitations=limitations or [],
        ethical_considerations=ethical_considerations or [],
        subgroup_metrics=subgroup_metrics,
        created_at=datetime.utcnow().isoformat() + "Z",
    )


def serialize_model_card(card: ModelCard) -> dict:
    """Serialize a ModelCard to a dict for JSON storage (spec §31)."""
    return {
        "model_id": card.model_id,
        "model_version": card.model_version,
        "model_type": card.model_type,
        "training_data_description": card.training_data_description,
        "training_data_sources": card.training_data_sources,
        "feature_contract_version": card.feature_contract_version,
        "evaluation_report": card.evaluation_report,
        "approval_status": card.approval_status,
        "approved_by": card.approved_by,
        "approved_at": card.approved_at,
        "approval_criteria_met": card.approval_criteria_met,
        "intended_use": card.intended_use,
        "limitations": card.limitations,
        "ethical_considerations": card.ethical_considerations,
        "target_definition": card.target_definition,
        "prediction_time_definition": card.prediction_time_definition,
        "split_definition": card.split_definition,
        "calibration_method": card.calibration_method,
        "operating_thresholds": card.operating_thresholds,
        "package_hash": card.package_hash,
        "rollback_instructions": card.rollback_instructions,
        "subgroup_metrics": card.subgroup_metrics,
        "created_at": card.created_at,
    }


def save_model_card(card: ModelCard, directory: Optional[str] = None) -> str:
    """Save a model card as JSON in the model_cards directory (spec §31).

    Args:
        card: ModelCard to save
        directory: Override directory path (defaults to ml/governance/model_cards/)

    Returns:
        Path to the saved JSON file.
    """
    if directory is None:
        directory = os.path.join(os.path.dirname(__file__), "model_cards")
    os.makedirs(directory, exist_ok=True)

    filename = f"{card.model_id}_{card.model_version}.json"
    filepath = os.path.join(directory, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(serialize_model_card(card), f, indent=2, default=str)
    return filepath
