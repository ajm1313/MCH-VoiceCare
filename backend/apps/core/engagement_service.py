"""
Engagement-risk model (spec §14).

The engagement model is clinically separate from medical severity. It predicts
the likelihood that a patient is disengaging from care (missed ANC, failed
referral, unreachable contact, inability to reach care) and recommends outreach
actions.

Critical safety invariant (spec §14):
  The engagement model MUST NOT diagnose clinical severity or downgrade
  clinical urgency. It affects outreach only — never the clinical disposition.

Allowed actions (spec §14):
  - REMINDER_SMS  (reminder)
  - CALL_PATIENT  (call)
  - CHO_OUTREACH  (Community Health Officer outreach)
  - HOME_VISIT    (home visit prioritization)
"""
from dataclasses import dataclass, field
from typing import List, Optional, Protocol
from datetime import datetime


# ---------------------------------------------------------------------------
# Risk levels and actions
# ---------------------------------------------------------------------------
class EngagementRiskLevel:
    """Engagement risk level bands."""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class EngagementAction:
    """Recommended outreach actions (spec §14)."""
    REMINDER_SMS = "REMINDER_SMS"
    CALL_PATIENT = "CALL_PATIENT"
    CHO_OUTREACH = "CHO_OUTREACH"
    HOME_VISIT = "HOME_VISIT"


# Action mapping by risk level (spec §14)
ACTION_MAPPING = {
    EngagementRiskLevel.HIGH: [
        EngagementAction.CALL_PATIENT,
        EngagementAction.CHO_OUTREACH,
        EngagementAction.HOME_VISIT,
    ],
    EngagementRiskLevel.MEDIUM: [
        EngagementAction.REMINDER_SMS,
        EngagementAction.CALL_PATIENT,
    ],
    EngagementRiskLevel.LOW: [
        EngagementAction.REMINDER_SMS,
    ],
}


# ---------------------------------------------------------------------------
# Input / Output dataclasses
# ---------------------------------------------------------------------------
@dataclass
class EngagementRiskInput:
    """Input features for engagement risk assessment (spec §14).

    All fields relate to engagement/retention — NOT clinical severity.
    """
    patient_id: str
    pregnancy_episode_id: str
    missed_anc_count: int = 0
    days_since_last_anc: int = 0
    referral_failed: bool = False
    contact_unreachable: bool = False
    distance_to_facility_km: float = 0.0
    preferred_language: str = "en"
    last_contact_attempt_days: int = 0


@dataclass
class EngagementRiskResult:
    """Output of engagement risk assessment (spec §14)."""
    risk_level: str  # LOW, MEDIUM, HIGH
    risk_score: float  # 0.0 to 1.0
    recommended_actions: List[str] = field(default_factory=list)
    reasons: List[str] = field(default_factory=list)
    evaluated_at: str = ""

    def to_dict(self) -> dict:
        return {
            "riskLevel": self.risk_level,
            "riskScore": self.risk_score,
            "recommendedActions": self.recommended_actions,
            "reasons": self.reasons,
            "evaluatedAt": self.evaluated_at,
            # snake_case aliases for internal use
            "risk_level": self.risk_level,
            "risk_score": self.risk_score,
            "recommended_actions": self.recommended_actions,
        }


# ---------------------------------------------------------------------------
# Protocol
# ---------------------------------------------------------------------------
class EngagementRiskAssessor(Protocol):
    """
    Engagement risk assessor protocol (spec §14).

    Concrete implementations:
    - EngagementRiskModel: rule-based scoring (default)
    - StubEngagementRiskAssessor: always returns LOW (for development)
    """

    def assess(self, input: EngagementRiskInput) -> EngagementRiskResult:
        """Assess engagement risk and recommend outreach actions."""
        ...


# ---------------------------------------------------------------------------
# Stub assessor (for development/testing)
# ---------------------------------------------------------------------------
class StubEngagementRiskAssessor:
    """
    Stub engagement assessor for development/testing.

    Always returns LOW risk with a single REMINDER_SMS action.
    This is the default when no engagement model is configured.
    """

    def assess(self, input: EngagementRiskInput) -> EngagementRiskResult:
        return EngagementRiskResult(
            risk_level=EngagementRiskLevel.LOW,
            risk_score=0.0,
            recommended_actions=[EngagementAction.REMINDER_SMS],
            reasons=["Stub assessor — no engagement model configured"],
            evaluated_at=datetime.utcnow().isoformat() + "Z",
        )


# ---------------------------------------------------------------------------
# Engagement risk model (rule-based scoring)
# ---------------------------------------------------------------------------
class EngagementRiskModel:
    """
    Engagement-risk model with rule-based scoring (spec §14).

    Scoring logic (clinically separate from medical severity):
      * missed_anc_count >= 2            -> HIGH
      * days_since_last_anc > 56 (8 wks) -> HIGH
      * referral_failed                  -> HIGH
      * contact_unreachable + days_since_last_anc > 14 -> MEDIUM
      * distance > 15km + missed_anc >= 1              -> MEDIUM
      * else                            -> LOW

    Action mapping:
      * HIGH   -> [CALL_PATIENT, CHO_OUTREACH, HOME_VISIT]
      * MEDIUM -> [REMINDER_SMS, CALL_PATIENT]
      * LOW    -> [REMINDER_SMS]

    The result MUST NOT affect clinicalDisposition (spec §14, §15).
    """

    # Thresholds
    MISSED_ANC_HIGH_THRESHOLD = 2
    DAYS_SINCE_ANC_HIGH = 56  # 8 weeks
    DAYS_SINCE_ANC_MEDIUM = 14
    DISTANCE_MEDIUM_KM = 15.0

    def assess(self, input: EngagementRiskInput) -> EngagementRiskResult:
        reasons: List[str] = []
        risk_level = EngagementRiskLevel.LOW

        # --- HIGH conditions ---
        if input.missed_anc_count >= self.MISSED_ANC_HIGH_THRESHOLD:
            risk_level = EngagementRiskLevel.HIGH
            reasons.append(
                f"Missed {input.missed_anc_count} ANC visits "
                f"(>= {self.MISSED_ANC_HIGH_THRESHOLD})"
            )

        if input.days_since_last_anc > self.DAYS_SINCE_ANC_HIGH:
            risk_level = EngagementRiskLevel.HIGH
            reasons.append(
                f"{input.days_since_last_anc} days since last ANC "
                f"(> {self.DAYS_SINCE_ANC_HIGH} days / 8 weeks)"
            )

        if input.referral_failed:
            risk_level = EngagementRiskLevel.HIGH
            reasons.append("Referral failed — patient may be lost to follow-up")

        # --- MEDIUM conditions (only escalate from LOW) ---
        if risk_level == EngagementRiskLevel.LOW:
            if input.contact_unreachable and input.days_since_last_anc > self.DAYS_SINCE_ANC_MEDIUM:
                risk_level = EngagementRiskLevel.MEDIUM
                reasons.append(
                    f"Contact unreachable and {input.days_since_last_anc} days "
                    f"since last ANC (> {self.DAYS_SINCE_ANC_MEDIUM})"
                )

        if risk_level == EngagementRiskLevel.LOW:
            if input.distance_to_facility_km > self.DISTANCE_MEDIUM_KM and input.missed_anc_count >= 1:
                risk_level = EngagementRiskLevel.MEDIUM
                reasons.append(
                    f"Distance {input.distance_to_facility_km}km to facility "
                    f"(> {self.DISTANCE_MEDIUM_KM}km) with {input.missed_anc_count} missed ANC"
                )

        # If no reasons captured, add a default
        if not reasons:
            reasons.append("No engagement risk factors detected")

        # --- Compute risk score (0.0 to 1.0) ---
        risk_score = self._compute_score(input, risk_level)

        # --- Action mapping ---
        actions = list(ACTION_MAPPING.get(risk_level, [EngagementAction.REMINDER_SMS]))

        return EngagementRiskResult(
            risk_level=risk_level,
            risk_score=risk_score,
            recommended_actions=actions,
            reasons=reasons,
            evaluated_at=datetime.utcnow().isoformat() + "Z",
        )

    def _compute_score(self, input: EngagementRiskInput, risk_level: str) -> float:
        """Compute a continuous risk score in [0.0, 1.0]."""
        score = 0.0

        # Missed ANC contribution (up to 0.3)
        score += min(input.missed_anc_count / 4.0, 1.0) * 0.3

        # Days since last ANC contribution (up to 0.3)
        if input.days_since_last_anc > 0:
            score += min(input.days_since_last_anc / 90.0, 1.0) * 0.3

        # Referral failed (0.2)
        if input.referral_failed:
            score += 0.2

        # Contact unreachable (0.1)
        if input.contact_unreachable:
            score += 0.1

        # Distance contribution (up to 0.1)
        if input.distance_to_facility_km > 0:
            score += min(input.distance_to_facility_km / 50.0, 1.0) * 0.1

        # Clamp to [0, 1]
        score = max(0.0, min(1.0, score))

        # Ensure score is consistent with risk level band
        if risk_level == EngagementRiskLevel.HIGH:
            score = max(score, 0.7)
        elif risk_level == EngagementRiskLevel.MEDIUM:
            score = max(min(score, 0.69), 0.3)
        else:  # LOW
            score = min(score, 0.29)

        return round(score, 4)


# ---------------------------------------------------------------------------
# Adapter accessor (module-level singleton)
# ---------------------------------------------------------------------------
_default_assessor: Optional[EngagementRiskAssessor] = None


def get_engagement_assessor() -> EngagementRiskAssessor:
    """Get the configured engagement risk assessor (default: EngagementRiskModel)."""
    global _default_assessor
    if _default_assessor is None:
        _default_assessor = EngagementRiskModel()
    return _default_assessor


def set_engagement_assessor(assessor: EngagementRiskAssessor) -> None:
    """Override the engagement assessor (for testing)."""
    global _default_assessor
    _default_assessor = assessor


def reset_engagement_assessor() -> None:
    """Reset to default assessor (for testing)."""
    global _default_assessor
    _default_assessor = None
