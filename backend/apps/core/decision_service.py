"""
Unified clinical decision result — combines rule, ML, and engagement
outputs into one immutable result object (spec §15).

Decision precedence (spec §15):
  ABSTAIN due to unsafe/insufficient data -> manual review before routine
  EMERGENCY rule -> EMERGENCY_NOW regardless of ML
  PRIORITY rule -> at least PRIORITY_REVIEW
  Validated ML -> may escalate, never de-escalate rule result
  Engagement risk -> affects outreach only
"""
import uuid
from datetime import datetime

from apps.core.enums import UrgencyLevel, ClinicalDisposition, MLMode
from apps.core.config_models import SystemConfig


def build_unified_decision(
    patient_id: str,
    pregnancy_episode_id: str = "",
    encounter_id: str = "",
    rule_result: dict = None,
    ml_result: dict = None,
    engagement_result: dict = None,
    missing_critical_fields: list = None,
) -> dict:
    """
    Combine rule, ML, and engagement outputs into a unified decision.

    Args:
        patient_id: UUID of the patient
        pregnancy_episode_id: UUID of the pregnancy episode
        encounter_id: UUID of the encounter
        rule_result: Output from the deterministic rule engine
        ml_result: Output from the clinical ML model (or None)
        engagement_result: Output from the engagement risk model (or None)
        missing_critical_fields: List of missing critical field names

    Returns:
        Immutable unified decision dict per spec §15.
    """
    rule_result = rule_result or {}
    ml_result = ml_result or {}
    engagement_result = engagement_result or {}
    missing_critical_fields = missing_critical_fields or []

    config = SystemConfig.get_config()
    ml_mode = config.clinical_ml_mode

    # Step 1: Determine rule-based disposition
    rule_disposition = rule_result.get("disposition", UrgencyLevel.ROUTINE)
    rule_fired = rule_result.get("fired_rules", [])

    # Step 2: Check for ABSTAIN — missing critical data
    if missing_critical_fields:
        clinical_disposition = ClinicalDisposition.ABSTAIN
        requires_human_confirmation = True
    elif rule_disposition == UrgencyLevel.ABSTAIN:
        clinical_disposition = ClinicalDisposition.ABSTAIN
        requires_human_confirmation = True
    elif rule_disposition == UrgencyLevel.EMERGENCY:
        clinical_disposition = ClinicalDisposition.EMERGENCY_NOW
        requires_human_confirmation = True
    elif rule_disposition == UrgencyLevel.PRIORITY:
        clinical_disposition = ClinicalDisposition.PRIORITY_REVIEW
        requires_human_confirmation = True
    else:
        clinical_disposition = ClinicalDisposition.ROUTINE
        requires_human_confirmation = False

    # Step 3: ML can only escalate, never de-escalate (spec §3.1, §15)
    # ML is only active in ASSISTED mode
    if ml_mode == MLMode.ASSISTED and ml_result:
        ml_risk_band = ml_result.get("riskBand", "NOT_SHOWN")
        ml_abstained = ml_result.get("abstained", False)

        if not ml_abstained:
            # ML can escalate from ROUTINE to PRIORITY_REVIEW
            if clinical_disposition == ClinicalDisposition.ROUTINE:
                if ml_risk_band in ("HIGH", "PRIORITY"):
                    clinical_disposition = ClinicalDisposition.PRIORITY_REVIEW
                    requires_human_confirmation = True
            # ML MUST NOT de-escalate EMERGENCY_NOW or PRIORITY_REVIEW
            # This is the non-downgrade invariant (spec §3.1)

    # Step 4: Engagement risk affects outreach only, not clinical disposition
    engagement_risk_level = engagement_result.get("risk_level", "LOW") if engagement_result else "LOW"

    # Step 5: Collect reasons from all sources
    reasons = []
    for rule in rule_fired:
        reasons.append(f"Rule {rule.get('ruleId', '')}: {rule.get('reasonText', '')}")
    if ml_mode != MLMode.RULES_ONLY and ml_result:
        if ml_result.get("riskBand", "NOT_SHOWN") != "NOT_SHOWN":
            reasons.append(f"ML risk band: {ml_result.get('riskBand')}")
    if engagement_result and engagement_risk_level != "LOW":
        reasons.append(f"Engagement risk: {engagement_risk_level}")

    return {
        "decisionId": str(uuid.uuid4()),
        "patientId": patient_id,
        "pregnancyEpisodeId": pregnancy_episode_id,
        "encounterId": encounter_id,
        "clinicalDisposition": clinical_disposition,
        "ruleResult": rule_result,
        "clinicalRiskResult": ml_result if ml_mode != MLMode.RULES_ONLY else None,
        "engagementRiskResult": engagement_result if engagement_result else None,
        "reasons": reasons,
        "missingCriticalFields": missing_critical_fields,
        "requiresHumanConfirmation": requires_human_confirmation,
        "mlMode": ml_mode,
        "createdAt": datetime.utcnow().isoformat() + "Z",
    }
