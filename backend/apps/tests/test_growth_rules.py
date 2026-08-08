"""
Tests for growth monitoring rule engine — MUAC classification,
weight-for-age z-scores, weight loss detection (spec §29).
"""
from datetime import date

from django.test import TestCase

from apps.core.enums import UrgencyLevel
from apps.clients.models import Person, Household
from apps.organisations.models import OrganisationUnit
from apps.growth.models import GrowthMeasurement
from apps.growth.rule_engine import classify_muac, classify_weight_for_age, run_growth_assessment


def _make_org():
    return OrganisationUnit.objects.create(
        name="Test Facility", code="GR001", unit_type="FACILITY",
    )


def _make_child(org, dob=None, sex="MALE"):
    household = Household.objects.create(organisation_unit=org)
    if dob is None:
        dob = date.today()
    return Person.objects.create(
        full_name="Test Child", sex=sex, household=household,
        organisation_unit=org, date_of_birth=dob,
    )


class MUACClassificationTests(TestCase):

    def test_sam_below_110(self):
        indicator, severity, _, _ = classify_muac(105)
        self.assertEqual(indicator, "SAM")
        self.assertEqual(severity, "EMERGENCY")

    def test_sam_below_115(self):
        indicator, severity, _, _ = classify_muac(112)
        self.assertEqual(indicator, "SAM")
        self.assertEqual(severity, "EMERGENCY")

    def test_mam_115_to_124(self):
        indicator, severity, _, _ = classify_muac(120)
        self.assertEqual(indicator, "MAM")
        self.assertEqual(severity, "PRIORITY")

    def test_normal_125_plus(self):
        indicator, severity, _, _ = classify_muac(130)
        self.assertEqual(indicator, "NORMAL")
        self.assertIsNone(severity)

    def test_none_muac(self):
        indicator, severity, _, _ = classify_muac(None)
        self.assertEqual(indicator, "NORMAL")


class WeightForAgeTests(TestCase):

    def test_severe_underweight(self):
        z, indicator, severity, _, _ = classify_weight_for_age(5.0, 12, "MALE")
        self.assertEqual(indicator, "SEVERE_UNDERWEIGHT")
        self.assertEqual(severity, "EMERGENCY")
        self.assertLess(z, -3)

    def test_normal_weight(self):
        z, indicator, severity, _, _ = classify_weight_for_age(9.5, 12, "MALE")
        self.assertEqual(indicator, "NORMAL")
        self.assertIsNone(severity)

    def test_missing_data(self):
        z, indicator, severity, _, _ = classify_weight_for_age(None, 12, "MALE")
        self.assertEqual(indicator, "UNKNOWN")


class GrowthAssessmentTests(TestCase):

    def setUp(self):
        self.org = _make_org()
        self.child = _make_child(self.org, dob=date(2025, 1, 1), sex="MALE")

    def test_muac_emergency(self):
        m = GrowthMeasurement.objects.create(
            child=self.child, measurement_date=date.today(),
            muac_mm=108,
        )
        result = run_growth_assessment(m)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_muac_priority(self):
        m = GrowthMeasurement.objects.create(
            child=self.child, measurement_date=date.today(),
            muac_mm=118,
        )
        result = run_growth_assessment(m)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)

    def test_routine_normal(self):
        m = GrowthMeasurement.objects.create(
            child=self.child, measurement_date=date.today(),
            muac_mm=135, weight_kg=9.5,
        )
        result = run_growth_assessment(m)
        self.assertEqual(result["disposition"], UrgencyLevel.ROUTINE)

    def test_weight_loss_emergency(self):
        GrowthMeasurement.objects.create(
            child=self.child, measurement_date=date(2025, 6, 1),
            weight_kg=10.0,
        )
        m = GrowthMeasurement.objects.create(
            child=self.child, measurement_date=date(2025, 7, 1),
            weight_kg=8.5,
        )
        result = run_growth_assessment(m)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_rule_set_version(self):
        m = GrowthMeasurement.objects.create(
            child=self.child, measurement_date=date.today(),
            muac_mm=135,
        )
        result = run_growth_assessment(m)
        self.assertIn("rule_set_version", result)
