"""
Tests for missingCriticalFields computation in the rule engine (spec §12.2, §3.1).

Verifies that:
- Missing critical fields are correctly identified and reported
- ABSTAIN is produced when no rules fire and critical fields are missing
- Emergency/Priority rules still fire even when critical fields are missing
- All critical fields present → ROUTINE (when no rules fire)
"""
from django.test import TestCase

from apps.core.enums import UrgencyLevel
from apps.organisations.models import OrganisationUnit
from apps.clients.models import Person, Household
from apps.pregnancy.models import PregnancyEpisode, PregnancyObservation
from apps.newborn.models import NewbornEpisode, NewbornObservation
from apps.rules import run_pregnancy_assessment, CRITICAL_FIELDS
from apps.newborn.rule_engine import run_newborn_assessment, NEWBORN_CRITICAL_FIELDS


def _make_org():
    return OrganisationUnit.objects.create(name="MCF Test Org", code="MCF001", unit_type="FACILITY")


def _make_person(org, name="Test Woman"):
    hh = Household.objects.create(organisation_unit=org)
    return Person.objects.create(full_name=name, household=hh, organisation_unit=org,
                                 date_of_birth="1990-01-01", sex="F")


def _make_child(org, name="Test Baby"):
    hh = Household.objects.create(organisation_unit=org)
    return Person.objects.create(full_name=name, household=hh, organisation_unit=org,
                                 date_of_birth="2025-01-01", sex="M")


# ── Pregnancy: missingCriticalFields computation ──

class MissingCriticalFieldsPregnancyTests(TestCase):
    """Test missingCriticalFields computation in pregnancy rule engine (spec §12.2)."""

    def test_no_observation_all_fields_missing(self):
        """No observation → all critical fields reported as missing."""
        org = _make_org()
        patient = _make_person(org)
        ep = PregnancyEpisode.objects.create(woman=patient)
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.ABSTAIN)
        self.assertEqual(len(result["missingCriticalFields"]), len(CRITICAL_FIELDS))
        for field_name, _ in CRITICAL_FIELDS:
            self.assertIn(field_name, result["missingCriticalFields"])

    def test_all_critical_fields_present_no_missing(self):
        """All critical fields present → empty missingCriticalFields."""
        org = _make_org()
        patient = _make_person(org)
        ep = PregnancyEpisode.objects.create(woman=patient)
        PregnancyObservation.objects.create(
            episode=ep,
            bp_systolic=110, bp_diastolic=70,
            temperature_c=36.5, fhr_bpm=140,
        )
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["missingCriticalFields"], [])
        self.assertEqual(result["disposition"], UrgencyLevel.ROUTINE)

    def test_partial_critical_fields_missing(self):
        """Some critical fields missing → only those reported."""
        org = _make_org()
        patient = _make_person(org)
        ep = PregnancyEpisode.objects.create(woman=patient)
        PregnancyObservation.objects.create(
            episode=ep,
            bp_systolic=110, bp_diastolic=70,
            # Missing: temperature_c, fhr_bpm
        )
        result = run_pregnancy_assessment(ep)
        self.assertIn("temperature_c", result["missingCriticalFields"])
        self.assertIn("fhr_bpm", result["missingCriticalFields"])
        self.assertNotIn("bp_systolic", result["missingCriticalFields"])
        self.assertNotIn("bp_diastolic", result["missingCriticalFields"])
        # No rules fired + missing fields → ABSTAIN
        self.assertEqual(result["disposition"], UrgencyLevel.ABSTAIN)

    def test_emergency_rule_fires_despite_missing_fields(self):
        """Emergency rules fire even when critical fields are missing (spec §3.1)."""
        org = _make_org()
        patient = _make_person(org)
        ep = PregnancyEpisode.objects.create(woman=patient)
        PregnancyObservation.objects.create(
            episode=ep,
            bp_systolic=170, bp_diastolic=100,
            # Missing: temperature_c, fhr_bpm
        )
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)
        # Missing fields are still reported
        self.assertIn("temperature_c", result["missingCriticalFields"])
        self.assertIn("fhr_bpm", result["missingCriticalFields"])

    def test_priority_rule_fires_despite_missing_fields(self):
        """Priority rules fire even when critical fields are missing."""
        org = _make_org()
        patient = _make_person(org)
        ep = PregnancyEpisode.objects.create(woman=patient)
        PregnancyObservation.objects.create(
            episode=ep,
            bp_systolic=145, bp_diastolic=85,
            # Missing: temperature_c, fhr_bpm
        )
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)
        self.assertIn("temperature_c", result["missingCriticalFields"])

    def test_danger_sign_emergency_with_missing_fields(self):
        """Danger sign emergency fires even with all critical fields missing."""
        org = _make_org()
        patient = _make_person(org)
        ep = PregnancyEpisode.objects.create(woman=patient)
        PregnancyObservation.objects.create(
            episode=ep,
            danger_signs="convulsions",
            # No vitals at all
        )
        result = run_pregnancy_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)
        self.assertGreater(len(result["missingCriticalFields"]), 0)

    def test_missing_fields_listed_in_result(self):
        """missingCriticalFields is always present in the result."""
        org = _make_org()
        patient = _make_person(org)
        ep = PregnancyEpisode.objects.create(woman=patient)
        result = run_pregnancy_assessment(ep)
        self.assertIn("missingCriticalFields", result)
        self.assertIsInstance(result["missingCriticalFields"], list)


# ── Newborn: missingCriticalFields computation ──

class MissingCriticalFieldsNewbornTests(TestCase):
    """Test missingCriticalFields computation in newborn rule engine (spec §12.2)."""

    def test_no_observation_all_fields_missing(self):
        """No observation → all critical fields reported as missing."""
        org = _make_org()
        child = _make_child(org)
        ep = NewbornEpisode.objects.create(child=child, birth_weight_g=3200)
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.ABSTAIN)
        self.assertEqual(len(result["missingCriticalFields"]), len(NEWBORN_CRITICAL_FIELDS))

    def test_all_critical_fields_present(self):
        """All critical fields present → empty missingCriticalFields."""
        org = _make_org()
        child = _make_child(org)
        ep = NewbornEpisode.objects.create(child=child, birth_weight_g=3200)
        NewbornObservation.objects.create(
            newborn=ep,
            temperature_c=36.5, respiratory_rate_min=40, current_weight_g=3100,
        )
        result = run_newborn_assessment(ep)
        self.assertEqual(result["missingCriticalFields"], [])
        self.assertEqual(result["disposition"], UrgencyLevel.ROUTINE)

    def test_partial_critical_fields_missing(self):
        """Some critical fields missing → only those reported."""
        org = _make_org()
        child = _make_child(org)
        ep = NewbornEpisode.objects.create(child=child, birth_weight_g=3200)
        NewbornObservation.objects.create(
            newborn=ep,
            temperature_c=36.5,
            # Missing: respiratory_rate_min, current_weight_g
        )
        result = run_newborn_assessment(ep)
        self.assertIn("respiratory_rate_min", result["missingCriticalFields"])
        self.assertIn("current_weight_g", result["missingCriticalFields"])
        self.assertNotIn("temperature_c", result["missingCriticalFields"])
        self.assertEqual(result["disposition"], UrgencyLevel.ABSTAIN)

    def test_emergency_rule_fires_despite_missing_fields(self):
        """Emergency rules fire even when critical fields are missing."""
        org = _make_org()
        child = _make_child(org)
        ep = NewbornEpisode.objects.create(child=child, birth_weight_g=1200)
        # No observation — all critical fields missing
        result = run_newborn_assessment(ep)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)
        self.assertGreater(len(result["missingCriticalFields"]), 0)

    def test_missing_fields_listed_in_result(self):
        """missingCriticalFields is always present in the result."""
        org = _make_org()
        child = _make_child(org)
        ep = NewbornEpisode.objects.create(child=child, birth_weight_g=3200)
        result = run_newborn_assessment(ep)
        self.assertIn("missingCriticalFields", result)
        self.assertIsInstance(result["missingCriticalFields"], list)
