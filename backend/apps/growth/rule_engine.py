"""
Growth monitoring rule engine — MUAC and weight-for-age classification
using WHO growth standards (spec §12, §39).

Rule sources:
- WHO Child Growth Standards (2006)
- Ghana Health Service IMCI guidelines
"""
from apps.core.enums import UrgencyLevel
from apps.growth.models import GrowthMeasurement


RULE_SET_VERSION = "who-growth-2006-v1"
SOURCE_TITLE = "WHO Child Growth Standards"
SOURCE_ORG = "World Health Organization"
SOURCE_VERSION = "2006"
SOURCE_DATE = "2006-04-27"


def _make_rule(rule_id, severity, reason, code=""):
    return {
        "ruleId": rule_id,
        "ruleVersion": "1.0.0",
        "severity": severity,
        "reasonCode": code,
        "reasonText": reason,
        "sourceTitle": SOURCE_TITLE,
        "sourceVersion": SOURCE_VERSION,
        "sourceEffectiveDate": SOURCE_DATE,
    }


def classify_muac(muac_mm: int, age_months: int = None) -> tuple:
    """
    Classify MUAC using WHO thresholds.
    Returns (indicator, severity, rule_id, reason).
    """
    if muac_mm is None:
        return ("NORMAL", None, None, None)

    # WHO/UNICEF 2023 revised MUAC thresholds for children 6-59 months
    if muac_mm < 110:
        return ("SAM", "EMERGENCY", "WHO-MUAC-SAM-110",
                "Severe Acute Malnutrition (MUAC <110mm)")
    if muac_mm < 115:
        return ("SAM", "EMERGENCY", "WHO-MUAC-SAM-115",
                "Severe Acute Malnutrition (MUAC <115mm)")
    if muac_mm < 125:
        return ("MAM", "PRIORITY", "WHO-MUAC-MAM-125",
                "Moderate Acute Malnutrition (MUAC 115-124mm)")

    return ("NORMAL", None, None, None)


def classify_weight_for_age(weight_kg, age_months, sex):
    """
    Simplified weight-for-age z-score approximation.
    Returns (z_score_estimate, indicator, severity, rule_id, reason).

    Uses WHO reference weights for approximate z-score calculation.
    For production, replace with full WHO LMS reference tables.
    """
    if weight_kg is None or age_months is None or not sex:
        return (None, "UNKNOWN", None, None, None)

    # WHO weight-for-age median approximations (simplified)
    # Source: WHO Child Growth Standards (2006)
    # This is a simplified lookup; production should use full LMS tables
    who_median = {
        "MALE": {0: 3.3, 1: 4.5, 2: 5.6, 3: 6.4, 4: 7.0, 6: 7.9, 9: 8.9,
                 12: 9.6, 18: 10.3, 24: 11.1, 36: 13.0, 48: 14.4, 60: 16.3},
        "FEMALE": {0: 3.2, 1: 4.2, 2: 5.1, 3: 5.8, 4: 6.4, 6: 7.3, 9: 8.2,
                   12: 8.9, 18: 9.6, 24: 10.4, 36: 12.2, 48: 13.6, 60: 15.3},
    }

    sex_key = sex.upper() if isinstance(sex, str) else sex
    ref = who_median.get(sex_key, who_median["MALE"])

    # Find nearest age reference
    ages = sorted(ref.keys())
    if age_months <= ages[0]:
        median = ref[ages[0]]
    elif age_months >= ages[-1]:
        median = ref[ages[-1]]
    else:
        # Linear interpolation
        lower = max(a for a in ages if a <= age_months)
        upper = min(a for a in ages if a >= age_months)
        if lower == upper:
            median = ref[lower]
        else:
            ratio = (age_months - lower) / (upper - lower)
            median = ref[lower] + ratio * (ref[upper] - ref[lower])

    if median <= 0:
        return (None, "UNKNOWN", None, None, None)

    # Approximate z-score: (weight - median) / (median * 0.1)
    # WHO SD is roughly 10-15% of median for weight-for-age
    sd = median * 0.12
    z_score = (float(weight_kg) - median) / sd

    if z_score < -3:
        return (z_score, "SEVERE_UNDERWEIGHT", "EMERGENCY",
                "WHO-WFA-Z-3", "Severe underweight (z-score < -3)")
    if z_score < -2:
        return (z_score, "UNDERWEIGHT", "PRIORITY",
                "WHO-WFA-Z-2", "Underweight (z-score < -2)")
    if z_score > 3:
        return (z_score, "OVERWEIGHT", "PRIORITY",
                "WHO-WFA-Z3", "Possible overweight (z-score > 3)")

    return (z_score, "NORMAL", None, None, None)


def run_growth_assessment(measurement: GrowthMeasurement) -> dict:
    """
    Evaluate growth monitoring rules for a single measurement.
    Returns dict with disposition, fired_rules, recommended_action, indicators.
    """
    fired = []
    disposition = UrgencyLevel.ROUTINE
    indicators = []

    def fire(rule):
        nonlocal disposition
        fired.append(rule)
        sev = rule["severity"]
        if sev == "EMERGENCY":
            disposition = UrgencyLevel.EMERGENCY
        elif sev == "PRIORITY" and disposition != UrgencyLevel.EMERGENCY:
            disposition = UrgencyLevel.PRIORITY

    # ── MUAC classification ──
    if measurement.muac_mm:
        indicator, severity, rule_id, reason = classify_muac(measurement.muac_mm)
        indicators.append(f"MUAC: {indicator}")
        if rule_id:
            fire(_make_rule(rule_id, severity, reason, "MUAC"))

    # ── Weight-for-age classification ──
    child = measurement.child
    if measurement.weight_kg and child and child.date_of_birth:
        from datetime import date
        age_days = (measurement.measurement_date - child.date_of_birth).days
        age_months = age_days // 30
        if age_months <= 60:
            z_score, indicator, severity, rule_id, reason = classify_weight_for_age(
                measurement.weight_kg, age_months, child.sex
            )
            if z_score is not None:
                indicators.append(f"WFA z-score: {z_score:.1f} ({indicator})")
            if rule_id:
                fire(_make_rule(rule_id, severity, reason, "WFA"))

    # ── Weight loss / failure to thrive (compare with previous) ──
    if child:
        prev = GrowthMeasurement.objects.filter(
            child=child,
            measurement_date__lt=measurement.measurement_date,
        ).exclude(id=measurement.id).order_by("-measurement_date").first()

        if prev and prev.weight_kg and measurement.weight_kg:
            weight_change = float(measurement.weight_kg) - float(prev.weight_kg)
            if weight_change < 0 and float(prev.weight_kg) > 0:
                pct_loss = (weight_change / float(prev.weight_kg)) * 100
                if pct_loss < -10:
                    fire(_make_rule(
                        "WHO-WEIGHT-LOSS-10", "EMERGENCY",
                        f"Weight loss >10% since last visit ({pct_loss:.1f}%)",
                        "WEIGHT_LOSS"
                    ))
                elif pct_loss < -5:
                    fire(_make_rule(
                        "WHO-WEIGHT-LOSS-5", "PRIORITY",
                        f"Weight loss >5% since last visit ({pct_loss:.1f}%)",
                        "WEIGHT_LOSS"
                    ))

    # ── Feeding concerns ──
    if measurement.feeding_status and "not" in measurement.feeding_status.lower():
        fire(_make_rule(
            "GHS-FEEDING-CONCERN", "PRIORITY",
            "Feeding concern reported", "FEEDING"
        ))

    # ── Recent illness ──
    if measurement.recent_illness and measurement.recent_illness.strip():
        illness_lower = measurement.recent_illness.lower()
        severe_keywords = ["diarrhoea", "diarrhea", "vomiting", "fever", "malaria", "pneumonia"]
        for kw in severe_keywords:
            if kw in illness_lower:
                fire(_make_rule(
                    f"GHS-ILLNESS-{kw.upper()}", "PRIORITY",
                    f"Recent illness: {measurement.recent_illness}", "ILLNESS"
                ))
                break

    if not fired:
        disposition = UrgencyLevel.ROUTINE

    action_map = {
        UrgencyLevel.EMERGENCY: "Refer immediately for therapeutic feeding programme.",
        UrgencyLevel.PRIORITY: "Arrange nutrition assessment and supplementary feeding.",
        UrgencyLevel.ROUTINE: "Continue routine growth monitoring schedule.",
        UrgencyLevel.ABSTAIN: "Insufficient data — manual review required.",
    }

    return {
        "disposition": disposition,
        "fired_rules": fired,
        "recommended_action": action_map.get(disposition, ""),
        "indicators": indicators,
        "rule_set_version": RULE_SET_VERSION,
    }
