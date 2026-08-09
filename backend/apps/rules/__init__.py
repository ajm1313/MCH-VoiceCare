"""
Pregnancy rule engine — deterministic danger-sign rules (spec §12).
Production default is RULES_ONLY. All rules use GHS Safe Motherhood Protocol
thresholds (2016) with WHO 2016 ANC recommendations where applicable.
"""
from apps.core.enums import UrgencyLevel


RULE_SET_VERSION = "ghs-smp-2016-v1"
SOURCE_TITLE = "Ghana Safe Motherhood Protocol"
SOURCE_ORG = "Ghana Health Service"
SOURCE_VERSION = "2016"
SOURCE_DATE = "2016-01-01"


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


def run_pregnancy_assessment(episode) -> dict:
    """
    Evaluate deterministic rules for a pregnancy episode.
    Returns dict with disposition, fired_rules, recommended_action.
    """
    fired = []
    disposition = UrgencyLevel.ROUTINE

    def fire(rule_id, severity, reason, code=""):
        nonlocal disposition
        fired.append(_make_rule(rule_id, severity, reason, code))
        if severity == "EMERGENCY":
            disposition = UrgencyLevel.EMERGENCY
        elif severity == "PRIORITY" and disposition != UrgencyLevel.EMERGENCY:
            disposition = UrgencyLevel.PRIORITY

    # ── History-based rules ──
    if episode.previous_preeclampsia_eclampsia:
        fire("GH-SMP-HX-PREECLAMPSIA", "PRIORITY", "Previous preeclampsia/eclampsia", "HISTORY")
    if episode.previous_pph:
        fire("GH-SMP-HX-PPH", "PRIORITY", "Previous postpartum haemorrhage", "HISTORY")
    if episode.previous_stillbirth:
        fire("GH-SMP-HX-STILLBIRTH", "PRIORITY", "Previous stillbirth", "HISTORY")
    if episode.previous_neonatal_death:
        fire("GH-SMP-HX-NND", "PRIORITY", "Previous neonatal death", "HISTORY")
    if episode.previous_obstructed_labour:
        fire("GH-SMP-HX-OBSTRUCTED", "PRIORITY", "Previous obstructed labour", "HISTORY")
    if episode.chronic_hypertension:
        fire("GH-SMP-HX-HTN", "PRIORITY", "Chronic hypertension", "HISTORY")
    if episode.diabetes:
        fire("GH-SMP-HX-DM", "PRIORITY", "Diabetes mellitus", "HISTORY")
    if episode.cardiac_disease:
        fire("GH-SMP-HX-CARDIAC", "PRIORITY", "Cardiac disease", "HISTORY")
    if episode.previous_caesarean_count >= 2:
        fire("GH-SMP-HX-REPEAT-CS", "PRIORITY", "Multiple previous caesarean sections", "HISTORY")

    # ── Maternal age ──
    if episode.maternal_age_years and episode.maternal_age_years >= 35:
        fire("GH-SMP-AGE-35", "PRIORITY", "Advanced maternal age (≥35)", "MATERNAL_AGE")
    if episode.maternal_age_years and episode.maternal_age_years < 18:
        fire("GH-SMP-AGE-UNDER-18", "PRIORITY", "Adolescent pregnancy (<18)", "MATERNAL_AGE")

    # ── Parity ──
    if episode.gravidity >= 5:
        fire("GH-SMP-GRAND-MULTI", "PRIORITY", "Grand multiparity (≥5 pregnancies)", "PARITY")

    # ── Observation-based rules (latest observation) ──
    latest_obs = episode.observations.first()
    if latest_obs:
        # Severe hypertension
        if latest_obs.bp_systolic and latest_obs.bp_systolic >= 160:
            fire("GH-SMP-BP-SYS-160", "EMERGENCY", "Severe hypertension (SBP ≥160)", "BP")
        if latest_obs.bp_diastolic and latest_obs.bp_diastolic >= 110:
            fire("GH-SMP-BP-DIA-110", "EMERGENCY", "Severe hypertension (DBP ≥110)", "BP")
        # Moderate hypertension
        if latest_obs.bp_systolic and 140 <= latest_obs.bp_systolic < 160:
            fire("GH-SMP-BP-SYS-140", "PRIORITY", "Hypertension (SBP 140–159)", "BP")
        if latest_obs.bp_diastolic and 90 <= latest_obs.bp_diastolic < 110:
            fire("GH-SMP-BP-DIA-90", "PRIORITY", "Hypertension (DBP 90–109)", "BP")
        # Fetal heart rate
        if latest_obs.fhr_bpm:
            if latest_obs.fhr_bpm < 110:
                fire("GH-SMP-FHR-BRADY", "PRIORITY", "Fetal bradycardia (FHR <110)", "FHR")
            elif latest_obs.fhr_bpm > 160:
                fire("GH-SMP-FHR-TACHY", "PRIORITY", "Fetal tachycardia (FHR >160)", "FHR")
        # Fever
        if latest_obs.temperature_c and float(latest_obs.temperature_c) >= 38.0:
            fire("GH-SMP-FEVER", "PRIORITY", "Maternal fever ≥38°C", "TEMPERATURE")
        # Proteinuria
        if latest_obs.urine_protein and latest_obs.urine_protein in ("3", "+++", "4", "++++"):
            fire("GH-SMP-PROTEINURIA", "PRIORITY", "Significant proteinuria", "URINE")
        # Reduced fetal movement
        if latest_obs.movement_status and "reduced" in latest_obs.movement_status.lower():
            fire("GH-SMP-REDUCED-MOVEMENT", "PRIORITY", "Reduced fetal movement", "MOVEMENT")

    # ── Danger signs from free text ──
    if latest_obs and latest_obs.danger_signs:
        signs = latest_obs.danger_signs.lower()
        emergency_signs = {
            "convulsion": "Convulsions",
            "seizure": "Seizures",
            "bleeding": "Vaginal bleeding",
            "haemorrhage": "Haemorrhage",
            "hemorrhage": "Hemorrhage",
            "unconscious": "Unconsciousness",
            "severe headache": "Severe headache",
            "blurred vision": "Blurred vision",
            "epigastric pain": "Severe epigastric pain",
        }
        for sign, label in emergency_signs.items():
            if sign in signs:
                fire(f"GH-SMP-DANGER-{sign.upper().replace(' ', '-')}", "EMERGENCY",
                     f"Danger sign: {label}", "DANGER_SIGN")

    # ── System flags ──
    if episode.severe_access_barrier:
        fire("GH-SMP-ACCESS-BARRIER", "PRIORITY", "Severe access barrier", "ACCESS")
    if episode.late_booking_or_missed_anc:
        fire("GH-SMP-LATE-BOOKING", "PRIORITY", "Late booking or missed ANC", "ACCESS")

    if not fired:
        disposition = UrgencyLevel.ROUTINE

    action_map = {
        UrgencyLevel.EMERGENCY: "Refer immediately to nearest CEmONC facility. Activate emergency protocol.",
        UrgencyLevel.PRIORITY: "Arrange priority review at facility within 48 hours.",
        UrgencyLevel.ROUTINE: "Continue routine ANC schedule per GHS guidelines.",
        UrgencyLevel.ABSTAIN: "Insufficient data — manual review required.",
    }

    return {
        "disposition": disposition,
        "fired_rules": fired,
        "recommended_action": action_map.get(disposition, ""),
        "rule_set_version": RULE_SET_VERSION,
    }
