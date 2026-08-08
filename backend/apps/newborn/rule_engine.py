"""
Newborn rule engine — deterministic danger-sign rules.
Uses WHO/UNICEF newborn care guidelines and Ghana Health Service protocols.
"""
from apps.core.enums import UrgencyLevel
from apps.newborn.models import NewbornEpisode


RULE_SET_VERSION = "who-newborn-2017-v1"
SOURCE_TITLE = "WHO Newborn Care Guidelines"
SOURCE_ORG = "World Health Organization"
SOURCE_VERSION = "2017"
SOURCE_DATE = "2017-01-01"


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


def run_newborn_assessment(episode: NewbornEpisode) -> dict:
    fired = []
    disposition = UrgencyLevel.ROUTINE

    def fire(rule_id, severity, reason, code=""):
        nonlocal disposition
        fired.append(_make_rule(rule_id, severity, reason, code))
        if severity == "EMERGENCY":
            disposition = UrgencyLevel.EMERGENCY
        elif severity == "PRIORITY" and disposition != UrgencyLevel.EMERGENCY:
            disposition = UrgencyLevel.PRIORITY

    # ── Birth weight ──
    if episode.birth_weight_g:
        if episode.birth_weight_g < 1000:
            fire("WHO-NB-ELBW", "EMERGENCY", "Extremely low birth weight (<1000g)", "BIRTH_WEIGHT")
        elif episode.birth_weight_g < 1500:
            fire("WHO-NB-VLBW", "EMERGENCY", "Very low birth weight (<1500g)", "BIRTH_WEIGHT")
        elif episode.birth_weight_g < 2000:
            fire("WHO-NB-LBW", "PRIORITY", "Low birth weight (<2000g)", "BIRTH_WEIGHT")
        elif episode.birth_weight_g < 2500:
            fire("WHO-NB-LBW-2500", "PRIORITY", "Low birth weight (<2500g)", "BIRTH_WEIGHT")

    # ── Gestational age ──
    if episode.gestational_age_weeks:
        if episode.gestational_age_weeks < 28:
            fire("WHO-NB-EXTREME-PRETERM", "EMERGENCY", "Extreme preterm (<28 weeks)", "GESTATIONAL_AGE")
        elif episode.gestational_age_weeks < 32:
            fire("WHO-NB-PRETERM-32", "EMERGENCY", "Very preterm (<32 weeks)", "GESTATIONAL_AGE")
        elif episode.gestational_age_weeks < 37:
            fire("WHO-NB-PRETERM-37", "PRIORITY", "Preterm (<37 weeks)", "GESTATIONAL_AGE")

    # ── Apgar scores ──
    if episode.apgar_1_min is not None and episode.apgar_1_min < 4:
        fire("WHO-NB-APGAR-1-LOW", "EMERGENCY", "Severely depressed Apgar-1 (<4)", "APGAR")
    elif episode.apgar_1_min is not None and episode.apgar_1_min < 7:
        fire("WHO-NB-APGAR-1-MOD", "PRIORITY", "Moderately depressed Apgar-1 (4-6)", "APGAR")
    if episode.apgar_5_min is not None and episode.apgar_5_min < 7:
        fire("WHO-NB-APGAR-5-LOW", "EMERGENCY", "Low Apgar-5 (<7)", "APGAR")

    # ── Resuscitation ──
    if episode.resuscitation_required:
        if episode.resuscitation_duration_minutes and episode.resuscitation_duration_minutes > 10:
            fire("WHO-NB-RESUSC-PROLONGED", "EMERGENCY", "Prolonged resuscitation (>10min)", "RESUSCITATION")
        else:
            fire("WHO-NB-RESUSC", "PRIORITY", "Resuscitation required at birth", "RESUSCITATION")

    # ── Risk flags ──
    if episode.congenital_abnormality:
        fire("WHO-NB-CONGENITAL", "PRIORITY", "Congenital abnormality", "RISK_FLAG")
    if episode.maternal_death:
        fire("WHO-NB-MATERNAL-DEATH", "PRIORITY", "Maternal death — social protection needed", "RISK_FLAG")
    if episode.previous_newborn_unit_admission:
        fire("WHO-NB-PREV-NICU", "PRIORITY", "Previous newborn unit admission", "RISK_FLAG")
    if episode.severe_access_barrier:
        fire("WHO-NB-ACCESS", "PRIORITY", "Severe access barrier", "RISK_FLAG")
    if episode.missed_postnatal_contact:
        fire("WHO-NB-MISSED-PNC", "PRIORITY", "Missed postnatal contact", "RISK_FLAG")
    if episode.complex_feeding_plan:
        fire("WHO-NB-COMPLEX-FEED", "PRIORITY", "Complex feeding plan required", "RISK_FLAG")

    # ── Breastfeeding ──
    if not episode.cried_or_breathed_immediately:
        fire("WHO-NB-NO-IMMEDIATE-CRY", "PRIORITY", "Did not cry/breathe immediately", "BIRTH_EVENT")

    # ── Latest observation ──
    latest = episode.observations.first()
    if latest:
        # PSBI (Possible Severe Bacterial Infection) — emergency signs
        if latest.convulsions:
            fire("WHO-NB-CONVULSIONS", "EMERGENCY", "Convulsions", "PSBI")
        if latest.central_cyanosis:
            fire("WHO-NB-CYANOSIS", "EMERGENCY", "Central cyanosis", "PSBI")
        if latest.apnoea_or_gasping:
            fire("WHO-NB-APNOEA", "EMERGENCY", "Apnoea or gasping", "PSBI")
        if latest.severe_chest_indrawing:
            fire("WHO-NB-INDRAWING", "EMERGENCY", "Severe chest indrawing", "PSBI")
        if latest.bulging_fontanelle:
            fire("WHO-NB-FONTANELLE", "EMERGENCY", "Bulging fontanelle (possible meningitis)", "PSBI")

        # Priority signs
        if latest.grunting:
            fire("WHO-NB-GRUNTING", "PRIORITY", "Grunting", "RESPIRATORY")
        if latest.temperature_c:
            temp = float(latest.temperature_c)
            if temp < 35.0:
                fire("WHO-NB-HYPOTHERMIA", "EMERGENCY", "Severe hypothermia (<35°C)", "TEMPERATURE")
            elif temp < 36.0:
                fire("WHO-NB-MILD-HYPOTHERMIA", "PRIORITY", "Mild hypothermia (35-36°C)", "TEMPERATURE")
            elif temp >= 37.5:
                fire("WHO-NB-FEVER", "PRIORITY", f"Fever ({temp}°C)", "TEMPERATURE")
        if latest.respiratory_rate_min and latest.respiratory_rate_min >= 60:
            fire("WHO-NB-TACHYPNEA", "PRIORITY", f"Tachypnoea (RR ≥60/min)", "RESPIRATORY")

        # Feeding issues
        if latest.feeding_status and "not" in latest.feeding_status.lower():
            fire("WHO-NB-NOT-FEEDING", "EMERGENCY", "Not feeding well", "FEEDING")
        if latest.vomiting and "persistent" in latest.vomiting.lower():
            fire("WHO-NB-VOMITING", "PRIORITY", "Persistent vomiting", "FEEDING")

        # Jaundice
        if latest.jaundice_onset_age_hours and latest.jaundice_onset_age_hours < 24:
            fire("WHO-NB-EARLY-JAUNDICE", "EMERGENCY", "Jaundice within first 24 hours", "JAUNDICE")
        elif latest.yellow_palms_soles:
            fire("WHO-NB-SEVERE-JAUNDICE", "EMERGENCY", "Yellow palms/soles — severe jaundice", "JAUNDICE")

        # Umbilical infection
        if latest.umbilical_status and "red" in latest.umbilical_status.lower():
            fire("WHO-NB-UMBILICAL-INFECTION", "PRIORITY", "Umbilical redness/infection", "INFECTION")

        # Weight loss
        if latest.current_weight_g and episode.birth_weight_g:
            weight_loss_pct = ((episode.birth_weight_g - latest.current_weight_g) / episode.birth_weight_g) * 100
            if weight_loss_pct > 10:
                fire("WHO-NB-WEIGHT-LOSS-10", "EMERGENCY",
                     f"Weight loss >10% since birth ({weight_loss_pct:.1f}%)", "WEIGHT_LOSS")
            elif weight_loss_pct > 7:
                fire("WHO-NB-WEIGHT-LOSS-7", "PRIORITY",
                     f"Weight loss >7% since birth ({weight_loss_pct:.1f}%)", "WEIGHT_LOSS")

        # Worker judgement
        if latest.worker_judgement_critical:
            fire("WHO-NB-WORKER-CRITICAL", "EMERGENCY",
                 f"Worker judgement: critical — {latest.worker_judgement_rationale}", "WORKER_JUDGEMENT")

    if not fired:
        disposition = UrgencyLevel.ROUTINE

    action_map = {
        UrgencyLevel.EMERGENCY: "Refer immediately to newborn care unit. Initiate pre-referral treatment.",
        UrgencyLevel.PRIORITY: "Arrange priority newborn review within 24 hours.",
        UrgencyLevel.ROUTINE: "Continue routine newborn care and essential care practices.",
        UrgencyLevel.ABSTAIN: "Insufficient data — manual review required.",
    }

    return {
        "disposition": disposition,
        "fired_rules": fired,
        "recommended_action": action_map.get(disposition, ""),
        "rule_set_version": RULE_SET_VERSION,
    }
