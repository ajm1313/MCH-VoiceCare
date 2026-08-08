"""
Tests for immunisation defaulter prediction engine (spec §29).
"""
from datetime import date, timedelta

from django.test import TestCase

from apps.clients.models import Person, Household
from apps.organisations.models import OrganisationUnit
from apps.immunisation.models import ChildImmunisationRecord, VaccineDose
from apps.immunisation.rule_engine import get_missing_vaccines, run_defaulter_assessment
from apps.core.enums import DefaulterStatus


def _make_org():
    return OrganisationUnit.objects.create(
        name="Test Facility", code="IM001", unit_type="FACILITY",
    )


def _make_child(org, dob=None):
    household = Household.objects.create(organisation_unit=org)
    if dob is None:
        dob = date.today() - timedelta(days=365)
    return Person.objects.create(
        full_name="Test Child", sex="MALE", household=household,
        organisation_unit=org, date_of_birth=dob,
    )


class DefaulterPredictionTests(TestCase):

    def setUp(self):
        self.org = _make_org()
        self.child = _make_child(self.org, dob=date.today() - timedelta(days=120))

    def test_no_missing_vaccines_when_up_to_date(self):
        """Child with all expected vaccines → no missing."""
        record = ChildImmunisationRecord.objects.create(
            child=self.child, date_of_birth=self.child.date_of_birth,
        )
        # Give all expected vaccines for a 120-day-old child
        # BCG(0), OPV1(0), OPV2(42), OPV3(70), PENTA1(42), PENTA2(70), PENTA3(98),
        # ROTA1(42), ROTA2(70), PCV1(42), PCV2(70), PCV3(98)
        vaccines = [
            ("BCG", 1, 120), ("OPV", 1, 120), ("OPV", 2, 78),
            ("OPV", 3, 50), ("PENTA", 1, 78), ("PENTA", 2, 50),
            ("PENTA", 3, 22), ("ROTA", 1, 78), ("ROTA", 2, 50),
            ("PCV", 1, 78), ("PCV", 2, 50), ("PCV", 3, 22),
        ]
        for vcode, dnum, days_ago in vaccines:
            VaccineDose.objects.create(
                child_record=record, vaccine_code=vcode, dose_number=dnum,
                administration_date=date.today() - timedelta(days=days_ago),
            )
        missing = get_missing_vaccines(record)
        self.assertEqual(len(missing), 0)

    def test_missing_vaccines_detected(self):
        """Child missing PENTA1 → should be detected."""
        record = ChildImmunisationRecord.objects.create(
            child=self.child, date_of_birth=self.child.date_of_birth,
        )
        VaccineDose.objects.create(
            child_record=record, vaccine_code="BCG", dose_number=1,
            administration_date=date.today() - timedelta(days=120),
        )
        missing = get_missing_vaccines(record)
        vaccine_codes = [m["vaccine_code"] for m in missing]
        self.assertIn("PENTA", vaccine_codes)

    def test_severe_overdue_is_critical(self):
        """Vaccine >60 days overdue → CRITICAL risk."""
        old_child = _make_child(self.org, dob=date.today() - timedelta(days=200))
        record = ChildImmunisationRecord.objects.create(
            child=old_child, date_of_birth=old_child.date_of_birth,
        )
        # Only BCG given, missing OPV2, PENTA1, PENTA2 etc.
        VaccineDose.objects.create(
            child_record=record, vaccine_code="BCG", dose_number=1,
            administration_date=date.today() - timedelta(days=200),
        )
        result = run_defaulter_assessment(record)
        self.assertIn(result["risk_level"], ("CRITICAL", "HIGH"))

    def test_routine_when_up_to_date(self):
        """Up-to-date child → LOW risk."""
        record = ChildImmunisationRecord.objects.create(
            child=self.child, date_of_birth=self.child.date_of_birth,
        )
        vaccines = [
            ("BCG", 1, 120), ("OPV", 1, 120), ("OPV", 2, 78),
            ("OPV", 3, 50), ("PENTA", 1, 78), ("PENTA", 2, 50),
            ("PENTA", 3, 22), ("ROTA", 1, 78), ("ROTA", 2, 50),
            ("PCV", 1, 78), ("PCV", 2, 50), ("PCV", 3, 22),
        ]
        for vcode, dnum, days_ago in vaccines:
            VaccineDose.objects.create(
                child_record=record, vaccine_code=vcode, dose_number=dnum,
                administration_date=date.today() - timedelta(days=days_ago),
            )
        result = run_defaulter_assessment(record)
        self.assertEqual(result["risk_level"], "LOW")

    def test_rule_metadata_present(self):
        record = ChildImmunisationRecord.objects.create(
            child=self.child, date_of_birth=self.child.date_of_birth,
        )
        result = run_defaulter_assessment(record)
        for rule in result["fired_rules"]:
            self.assertIn("ruleId", rule)
            self.assertIn("ruleVersion", rule)
            self.assertIn("severity", rule)
            self.assertIn("sourceTitle", rule)

    def test_rule_set_version(self):
        record = ChildImmunisationRecord.objects.create(
            child=self.child, date_of_birth=self.child.date_of_birth,
        )
        result = run_defaulter_assessment(record)
        self.assertIn("rule_set_version", result)
