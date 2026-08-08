"""
Immunisation defaulter prediction engine (spec §12, §39).

Evaluates a ChildImmunisationRecord to determine defaulter risk
based on overdue vaccines, missed CWC sessions, and residence status.

Rule sources:
- Ghana EPI schedule
- WHO immunisation guidelines
"""
from datetime import date, timedelta

from apps.core.enums import DefaulterStatus, TraceStatus
from apps.immunisation.models import ChildImmunisationRecord, DefaulterEpisode


RULE_SET_VERSION = "ghana-epi-v1"
SOURCE_TITLE = "Ghana EPI Immunisation Schedule"
SOURCE_ORG = "Ghana Health Service"
SOURCE_VERSION = "2024"
SOURCE_DATE = "2024-01-01"


# Ghana EPI schedule: vaccine → (dose_number, recommended_age_days, max_acceptable_delay_days)
EPI_SCHEDULE = {
    "BCG": [(1, 0, 30)],
    "OPV": [(1, 0, 30), (2, 42, 30), (3, 70, 30)],
    "PENTA": [(1, 42, 30), (2, 70, 30), (3, 98, 30)],
    "ROTA": [(1, 42, 30), (2, 70, 30)],
    "PCV": [(1, 42, 30), (2, 70, 30), (3, 98, 30)],
    "MEASLES": [(1, 273, 60), (2, 547, 60)],
    "YELLOW_FEVER": [(1, 273, 60)],
    "MEN_A": [(1, 547, 60)],
}


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


def get_expected_vaccines(age_days: int) -> list:
    """Return list of (vaccine_code, dose_number) that should have been given by this age."""
    expected = []
    for vaccine, doses in EPI_SCHEDULE.items():
        for dose_num, recommended_age, max_delay in doses:
            if age_days >= recommended_age:
                expected.append((vaccine, dose_num))
    return expected


def get_missing_vaccines(record: ChildImmunisationRecord) -> list:
    """Return list of (vaccine_code, dose_number) that are overdue."""
    if not record.date_of_birth:
        return []

    today = date.today()
    age_days = (today - record.date_of_birth).days

    expected = get_expected_vaccines(age_days)
    administered = set()
    for dose in record.doses.all():
        administered.add((dose.vaccine_code, dose.dose_number))

    missing = []
    for vaccine_code, dose_num in expected:
        if (vaccine_code, dose_num) not in administered:
            for dn, rec_age, max_delay in EPI_SCHEDULE.get(vaccine_code, []):
                if dn == dose_num:
                    deadline_age = rec_age + max_delay
                    if age_days > deadline_age:
                        days_overdue = age_days - rec_age
                        missing.append({
                            "vaccine_code": vaccine_code,
                            "dose_number": dose_num,
                            "days_overdue": days_overdue,
                            "recommended_age_days": rec_age,
                        })
    return missing


def run_defaulter_assessment(record: ChildImmunisationRecord) -> dict:
    """
    Evaluate defaulter risk for a child immunisation record.
    Returns dict with defaulter_status, risk_level, fired_rules, missing_vaccines, recommended_action.
    """
    fired = []
    risk_level = "LOW"
    missing = get_missing_vaccines(record)

    def fire(rule):
        fired.append(rule)
        sev = rule["severity"]
        nonlocal risk_level
        if sev == "EMERGENCY":
            risk_level = "CRITICAL"
        elif sev == "PRIORITY" and risk_level != "CRITICAL":
            risk_level = "HIGH"
        elif sev == "WARNING" and risk_level not in ("CRITICAL", "HIGH"):
            risk_level = "MODERATE"

    # ── Overdue vaccine doses ──
    severe_overdue = [m for m in missing if m["days_overdue"] > 60]
    moderate_overdue = [m for m in missing if 30 < m["days_overdue"] <= 60]
    mild_overdue = [m for m in missing if m["days_overdue"] <= 30]

    if severe_overdue:
        vaccine_list = ", ".join(f"{m['vaccine_code']} #{m['dose_number']}" for m in severe_overdue)
        fire(_make_rule(
            "GHS-EPI-SEVERE-OVERDUE", "EMERGENCY",
            f"Severely overdue vaccines (>60 days): {vaccine_list}",
            "OVERDUE_SEVERE"
        ))
    if moderate_overdue:
        vaccine_list = ", ".join(f"{m['vaccine_code']} #{m['dose_number']}" for m in moderate_overdue)
        fire(_make_rule(
            "GHS-EPI-MODERATE-OVERDUE", "PRIORITY",
            f"Overdue vaccines (30-60 days): {vaccine_list}",
            "OVERDUE_MODERATE"
        ))
    if mild_overdue:
        vaccine_list = ", ".join(f"{m['vaccine_code']} #{m['dose_number']}" for m in mild_overdue)
        fire(_make_rule(
            "GHS-EPI-MILD-OVERDUE", "WARNING",
            f"Slightly overdue vaccines (<30 days): {vaccine_list}",
            "OVERDUE_MILD"
        ))

    # ── Overdue count from record ──
    if record.overdue_count >= 3:
        fire(_make_rule(
            "GHS-EPI-MULTIPLE-OVERDUE", "PRIORITY",
            f"Multiple overdue doses ({record.overdue_count})",
            "MULTIPLE_OVERDUE"
        ))

    # ── Residence status risk ──
    if record.residence_status and "migrat" in record.residence_status.lower():
        fire(_make_rule(
            "GHS-EPI-MIGRATORY", "WARNING",
            "Child from migratory family — higher default risk",
            "MIGRATORY"
        ))

    # ── Determine defaulter status ──
    if risk_level == "CRITICAL":
        defaulter_status = DefaulterStatus.LOST
        action = "Immediate home visit required. Activate tracing protocol."
    elif risk_level == "HIGH":
        defaulter_status = DefaulterStatus.ACTIVE
        action = "Phone call to caregiver and schedule catch-up session within 7 days."
    elif risk_level == "MODERATE":
        defaulter_status = DefaulterStatus.ACTIVE
        action = "Send reminder and schedule next CWC attendance."
    else:
        defaulter_status = DefaulterStatus.ACTIVE
        action = "Continue routine immunisation schedule."

    # ── Update record ──
    if missing:
        record.overdue_count = len(missing)
        if record.next_due_date:
            today = date.today()
            if record.next_due_date < today:
                days_overdue = (today - record.next_due_date).days
                if days_overdue > 60:
                    record.defaulter_status = DefaulterStatus.LOST
                elif days_overdue > 30:
                    record.defaulter_status = DefaulterStatus.ACTIVE
        record.save(update_fields=["overdue_count", "defaulter_status", "updated_at"])

    return {
        "defaulter_status": defaulter_status,
        "risk_level": risk_level,
        "fired_rules": fired,
        "missing_vaccines": missing,
        "recommended_action": action,
        "rule_set_version": RULE_SET_VERSION,
    }


def create_defaulter_episode(record: ChildImmunisationRecord, assessment: dict) -> DefaulterEpisode:
    """Create a DefaulterEpisode from assessment results if risk is HIGH or CRITICAL."""
    if assessment["risk_level"] not in ("HIGH", "CRITICAL"):
        return None

    today = date.today()
    days_overdue = max((m["days_overdue"] for m in assessment["missing_vaccines"]), default=0)

    return DefaulterEpisode.objects.create(
        child_record=record,
        child_name=record.child.full_name,
        defaulter_status=assessment["defaulter_status"],
        days_overdue=days_overdue,
        last_visit_date=record.doses.order_by("-administration_date").first().administration_date if record.doses.exists() else None,
        next_due_date=record.next_due_date,
        reason=f"Auto-generated: {len(assessment['missing_vaccines'])} overdue doses",
        trace_status=TraceStatus.PENDING,
    )
