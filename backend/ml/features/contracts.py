"""
Feature contract for clinical risk ML (spec §13.1).

Defines the canonical feature set for the pregnancy severe-maternal-outcome
risk model. This contract MUST be clinically approved before use in ASSISTED
mode (spec §10.10, §13.1).

The feature contract is versioned and signed alongside the model package.
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class FeatureDefinition:
    """Definition of a single ML feature."""
    name: str
    label: str
    feature_type: str  # "numeric", "categorical", "boolean"
    unit: Optional[str] = None
    required: bool = True
    default_value: Optional[float] = None
    range_min: Optional[float] = None
    range_max: Optional[float] = None
    categories: Optional[list] = None
    source_fact_key: str = ""  # Key in the clinical facts dict
    description: str = ""


# Pregnancy severe-maternal-outcome feature contract (spec §13.1)
# Placeholder features — MUST be clinically validated before ASSISTED mode
PREGNANCY_FEATURE_CONTRACT = [
    FeatureDefinition(
        name="maternal_age_years",
        label="Maternal Age (years)",
        feature_type="numeric",
        unit="years",
        required=True,
        range_min=10,
        range_max=55,
        source_fact_key="maternal_age",
        description="Age of the pregnant person at the time of the encounter",
    ),
    FeatureDefinition(
        name="gravidity",
        label="Gravidity",
        feature_type="numeric",
        required=True,
        range_min=0,
        range_max=30,
        source_fact_key="gravidity",
        description="Total number of pregnancies including current",
    ),
    FeatureDefinition(
        name="parity",
        label="Parity",
        feature_type="numeric",
        required=True,
        range_min=0,
        range_max=30,
        source_fact_key="parity",
        description="Total number of prior births >= 20 weeks",
    ),
    FeatureDefinition(
        name="previous_caesarean_count",
        label="Previous Caesarean Count",
        feature_type="numeric",
        required=False,
        default_value=0,
        range_min=0,
        range_max=10,
        source_fact_key="previous_caesarean",
        description="Number of prior caesarean deliveries",
    ),
    FeatureDefinition(
        name="bp_systolic_mm_hg",
        label="Systolic Blood Pressure",
        feature_type="numeric",
        unit="mmHg",
        required=True,
        range_min=60,
        range_max=250,
        source_fact_key="bp_systolic",
        description="Most recent systolic blood pressure",
    ),
    FeatureDefinition(
        name="bp_diastolic_mm_hg",
        label="Diastolic Blood Pressure",
        feature_type="numeric",
        unit="mmHg",
        required=True,
        range_min=40,
        range_max=150,
        source_fact_key="bp_diastolic",
        description="Most recent diastolic blood pressure",
    ),
    FeatureDefinition(
        name="hb_g_dl",
        label="Haemoglobin",
        feature_type="numeric",
        unit="g/dL",
        required=False,
        default_value=11.0,
        range_min=3.0,
        range_max=20.0,
        source_fact_key="hb_g_dl",
        description="Most recent haemoglobin measurement",
    ),
    FeatureDefinition(
        name="gestational_age_days",
        label="Gestational Age (days)",
        feature_type="numeric",
        unit="days",
        required=True,
        range_min=0,
        range_max=300,
        source_fact_key="gestational_age_days",
        description="Gestational age at the time of the encounter",
    ),
    FeatureDefinition(
        name="chronic_hypertension",
        label="Chronic Hypertension",
        feature_type="boolean",
        required=False,
        default_value=0,
        source_fact_key="chronic_hypertension",
        description="Pre-existing chronic hypertension diagnosis",
    ),
    FeatureDefinition(
        name="diabetes",
        label="Diabetes (any type)",
        feature_type="boolean",
        required=False,
        default_value=0,
        source_fact_key="diabetes",
        description="Pre-existing or gestational diabetes",
    ),
    FeatureDefinition(
        name="previous_stillbirth",
        label="Previous Stillbirth",
        feature_type="boolean",
        required=False,
        default_value=0,
        source_fact_key="previous_stillbirth",
        description="History of prior stillbirth",
    ),
    FeatureDefinition(
        name="previous_preeclampsia_eclampsia",
        label="Previous Pre-eclampsia/Eclampsia",
        feature_type="boolean",
        required=False,
        default_value=0,
        source_fact_key="previous_preeclampsia",
        description="History of prior pre-eclampsia or eclampsia",
    ),
]


def get_feature_contract(module: str = "pregnancy") -> list:
    """Get the feature contract for a module."""
    if module == "pregnancy":
        return PREGNANCY_FEATURE_CONTRACT
    return []


def get_feature_names(module: str = "pregnancy") -> list:
    """Get just the feature names for a module."""
    return [f.name for f in get_feature_contract(module)]


def validate_features(features: dict, module: str = "pregnancy") -> list:
    """
    Validate extracted features against the contract (spec §13.1).

    Returns a list of validation error strings (empty if valid).
    """
    errors = []
    for fdef in get_feature_contract(module):
        val = features.get(fdef.name)

        if fdef.required and (val is None or val == ""):
            errors.append(f"Required feature '{fdef.name}' is missing")
            continue

        if val is None or val == "":
            continue  # Optional missing is OK

        # Range check for numeric features
        if fdef.feature_type == "numeric":
            try:
                num_val = float(val)
                if fdef.range_min is not None and num_val < fdef.range_min:
                    errors.append(f"Feature '{fdef.name}' value {num_val} below min {fdef.range_min}")
                if fdef.range_max is not None and num_val > fdef.range_max:
                    errors.append(f"Feature '{fdef.name}' value {num_val} above max {fdef.range_max}")
            except (ValueError, TypeError):
                errors.append(f"Feature '{fdef.name}' value '{val}' is not numeric")

        # Category check for categorical features
        if fdef.feature_type == "categorical" and fdef.categories:
            if val not in fdef.categories:
                errors.append(f"Feature '{fdef.name}' value '{val}' not in allowed categories")

    return errors
