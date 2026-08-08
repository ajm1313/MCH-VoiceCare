"""
Referral urgency auto-classification engine (spec §18, §39).

Determines referral urgency from linked clinical episode assessments,
referral reason keywords, and pre-referral care indicators.
"""
import uuid

from apps.core.enums import UrgencyLevel, ReferralStatus
from apps.referrals.models import Referral


RULE_SET_VERSION = "ghs-referral-v1"
SOURCE_TITLE = "Ghana Safe Motherhood Protocol"
SOURCE_ORG = "Ghana Health Service"
SOURCE_VERSION = "2016"
SOURCE_DATE = "2016-01-01"


EMERGENCY_KEYWORDS = [
    "haemorrhage", "hemorrhage", "bleeding", "convulsion", "seizure",
    "eclampsia", "unconscious", "obstructed labour", "obstructed labor",
    "ruptured uterus", "sepsis", "severe", "apnoea", "apnea", "asphyxia",
    "cyanosis", "stillbirth", "neonatal death", "maternal death",
]

PRIORITY_KEYWORDS = [
    "preeclampsia", "pre-eclampsia", "hypertension", "fever", "preterm",
    "low birth weight", "malpresentation", "breech", "failed progress",
    "abnormal presentation", "referral", "review",
]


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


def classify_referral_urgency(referral: Referral) -> dict:
    """
    Auto-classify referral urgency from clinical context.
    Returns dict with urgency, fired_rules, recommended_action, qr_token, short_code.
    """
    fired = []
    urgency = UrgencyLevel.ROUTINE

    def fire(rule):
        fired.append(rule)
        nonlocal urgency
        sev = rule["severity"]
        if sev == "EMERGENCY":
            urgency = UrgencyLevel.EMERGENCY
        elif sev == "PRIORITY" and urgency != UrgencyLevel.EMERGENCY:
            urgency = UrgencyLevel.PRIORITY

    # ── From linked pregnancy episode assessment ──
    if referral.pregnancy_episode:
        ep = referral.pregnancy_episode
        if ep.current_urgency == UrgencyLevel.EMERGENCY:
            fire(_make_rule(
                "GHS-REF-PREG-EMERGENCY", "EMERGENCY",
                "Linked pregnancy episode has emergency urgency",
                "PREGNANCY_LINK"
            ))
        elif ep.current_urgency == UrgencyLevel.PRIORITY:
            fire(_make_rule(
                "GHS-REF-PREG-PRIORITY", "PRIORITY",
                "Linked pregnancy episode has priority urgency",
                "PREGNANCY_LINK"
            ))

    # ── From linked newborn episode assessment ──
    if referral.newborn_episode:
        ep = referral.newborn_episode
        if ep.current_urgency == UrgencyLevel.EMERGENCY:
            fire(_make_rule(
                "GHS-REF-NB-EMERGENCY", "EMERGENCY",
                "Linked newborn episode has emergency urgency",
                "NEWBORN_LINK"
            ))
        elif ep.current_urgency == UrgencyLevel.PRIORITY:
            fire(_make_rule(
                "GHS-REF-NB-PRIORITY", "PRIORITY",
                "Linked newborn episode has priority urgency",
                "NEWBORN_LINK"
            ))

    # ── From referral reason keywords ──
    reason_lower = (referral.referral_reason or "").lower()
    for kw in EMERGENCY_KEYWORDS:
        if kw in reason_lower:
            fire(_make_rule(
                f"GHS-REF-KW-{kw.upper().replace(' ', '-')}", "EMERGENCY",
                f"Emergency keyword in referral reason: '{kw}'",
                "REASON_KEYWORD"
            ))
            break  # One emergency keyword is enough

    if urgency != UrgencyLevel.EMERGENCY:
        for kw in PRIORITY_KEYWORDS:
            if kw in reason_lower:
                fire(_make_rule(
                    f"GHS-REF-KW-{kw.upper().replace(' ', '-')}", "PRIORITY",
                    f"Priority keyword in referral reason: '{kw}'",
                    "REASON_KEYWORD"
                ))
                break

    # ── From pre-referral care indicators ──
    pre_care_lower = (referral.pre_referral_care or "").lower()
    emergency_care_keywords = ["iv fluids", "oxygen", "anticonvulsant", "magnesium sulfate",
                                "blood transfusion", "emergency", "resuscitation"]
    for kw in emergency_care_keywords:
        if kw in pre_care_lower:
            fire(_make_rule(
                "GHS-REF-PRE-CARE-EMERGENCY", "EMERGENCY",
                f"Emergency pre-referral care indicated: '{kw}'",
                "PRE_REFERRAL_CARE"
            ))
            break

    # ── Generate QR token and short code if not present ──
    qr_token = referral.qr_token
    short_code = referral.short_code
    if not qr_token:
        qr_token = uuid.uuid4().hex
    if not short_code:
        short_code = qr_token[:8].upper()

    # ── Recommended action based on urgency ──
    action_map = {
        UrgencyLevel.EMERGENCY: (
            "Activate emergency referral protocol: notify receiving facility immediately, "
            "activate ambulance (112), provide pre-referral care, do not delay transport."
        ),
        UrgencyLevel.PRIORITY: (
            "Arrange priority transport within approved timeframe. "
            "Notify receiving facility and confirm acceptance."
        ),
        UrgencyLevel.ROUTINE: (
            "Schedule routine referral appointment. Provide referral slip to patient."
        ),
        UrgencyLevel.ABSTAIN: (
            "Insufficient clinical data — manual urgency assessment required."
        ),
    }

    return {
        "urgency": urgency,
        "fired_rules": fired,
        "recommended_action": action_map.get(urgency, ""),
        "qr_token": qr_token,
        "short_code": short_code,
        "rule_set_version": RULE_SET_VERSION,
    }


def apply_urgency_classification(referral: Referral) -> dict:
    """
    Classify and persist urgency, QR token, and short code on the referral.
    Also transitions DRAFT → REQUESTED if urgency is determined.
    """
    result = classify_referral_urgency(referral)

    referral.urgency = result["urgency"]
    referral.qr_token = result["qr_token"]
    referral.short_code = result["short_code"]

    if referral.status == ReferralStatus.DRAFT:
        referral.status = ReferralStatus.REQUESTED

    referral.save(update_fields=["urgency", "qr_token", "short_code", "status", "updated_at"])

    return result
