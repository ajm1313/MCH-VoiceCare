"""
Tests for pregnancy rule engine — rule precedence, emergency non-downgrade,
danger sign detection, boundary values, and missing data handling (spec §29).
"""
from django.test import TestCase

from apps.core.enums import UrgencyLevel
from apps.clients.models import Person, Household
from apps.organisations.models import OrganisationUnit
from apps.pregnancy.models import PregnancyEpisode, PregnancyObservation
from apps.rules import run_pregnancy_assessment


def _make_org(unit_type="FACILITY"):
    return OrganisationUnit.objects.create(
        name="Test Facility",
        code="TEST001",
        unit_type=unit_type,
    )


def _make_woman(org):
    household = Household.objects.create(organisation_unit=org)
    return Person.objects.create(
        full_name="Test Woman",
        sex="FEMALE",
        household=household,
        organisation_unit=org,
    )


def _make_episode(woman, **kwargs):
    defaults = {
        "woman": woman,
        "gravidity": 1,
        "parity": 0,
    }
    defaults.update(kwargs)
    return PregnancyEpisode.objects.create(**defaults)


class PregnancyRuleEngineTests(TestCase):

    def setUp(self):
        self.org = _make_org()
        self.woman = _make_woman(self.org)

    def test_routine_when_no_risk_factors(self):
        """No risk factors and all critical fields present → ROUTINE disposition."""
        episode = _make_episode(self.woman)
        PregnancyObservation.objects.create(
            episode=episode,
            bp_systolic=110, bp_diastolic=70,
            temperature_c=36.5, fhr_bpm=140,
        )
        result = run_pregnancy_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.ROUTINE)
        self.assertEqual(result["fired_rules"], [])
        self.assertIn("routine", result["recommended_action"].lower())
        self.assertEqual(result["missingCriticalFields"], [])

    def test_abstain_when_no_observation(self):
        """No observation at all → ABSTAIN (spec §3.1: missing critical fields)."""
        episode = _make_episode(self.woman)
        result = run_pregnancy_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.ABSTAIN)
        self.assertGreater(len(result["missingCriticalFields"]), 0)

    def test_severe_hypertension_is_emergency(self):
        """SBP ≥160 → EMERGENCY."""
        episode = _make_episode(self.woman)
        PregnancyObservation.objects.create(
            episode=episode,
            bp_systolic=165,
            bp_diastolic=100,
        )
        result = run_pregnancy_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)
        rule_ids = [r["ruleId"] for r in result["fired_rules"]]
        self.assertIn("GH-SMP-BP-SYS-160", rule_ids)

    def test_moderate_hypertension_is_priority(self):
        """SBP 140-159 → PRIORITY, not EMERGENCY."""
        episode = _make_episode(self.woman)
        PregnancyObservation.objects.create(
            episode=episode,
            bp_systolic=145,
            bp_diastolic=95,
        )
        result = run_pregnancy_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)
        rule_ids = [r["ruleId"] for r in result["fired_rules"]]
        self.assertIn("GH-SMP-BP-SYS-140", rule_ids)
        self.assertNotIn("GH-SMP-BP-SYS-160", rule_ids)

    def test_emergency_non_downgrade(self):
        """Emergency rule must not be downgraded by a later priority rule."""
        episode = _make_episode(self.woman, chronic_hypertension=True)
        PregnancyObservation.objects.create(
            episode=episode,
            bp_systolic=170,
            bp_diastolic=115,
            temperature_c=38.5,
        )
        result = run_pregnancy_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_danger_sign_convulsion_is_emergency(self):
        """Convulsion in danger signs → EMERGENCY."""
        episode = _make_episode(self.woman)
        PregnancyObservation.objects.create(
            episode=episode,
            danger_signs="patient had convulsion this morning",
        )
        result = run_pregnancy_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)
        rule_ids = [r["ruleId"] for r in result["fired_rules"]]
        self.assertTrue(any("CONVULSION" in rid for rid in rule_ids))

    def test_danger_sign_bleeding_is_emergency(self):
        """Bleeding in danger signs → EMERGENCY."""
        episode = _make_episode(self.woman)
        PregnancyObservation.objects.create(
            episode=episode,
            danger_signs="vaginal bleeding reported",
        )
        result = run_pregnancy_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_advanced_maternal_age(self):
        """Maternal age ≥35 → PRIORITY."""
        episode = _make_episode(self.woman, maternal_age_years=38)
        result = run_pregnancy_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)
        rule_ids = [r["ruleId"] for r in result["fired_rules"]]
        self.assertIn("GH-SMP-AGE-35", rule_ids)

    def test_adolescent_pregnancy(self):
        """Maternal age <18 → PRIORITY."""
        episode = _make_episode(self.woman, maternal_age_years=16)
        result = run_pregnancy_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)
        rule_ids = [r["ruleId"] for r in result["fired_rules"]]
        self.assertIn("GH-SMP-AGE-UNDER-18", rule_ids)

    def test_grand_multiparity(self):
        """Gravidity ≥5 → PRIORITY."""
        episode = _make_episode(self.woman, gravidity=6)
        result = run_pregnancy_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)
        rule_ids = [r["ruleId"] for r in result["fired_rules"]]
        self.assertIn("GH-SMP-GRAND-MULTI", rule_ids)

    def test_previous_caesarean_count(self):
        """≥2 previous CS → PRIORITY."""
        episode = _make_episode(self.woman, previous_caesarean_count=2)
        result = run_pregnancy_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)

    def test_fetal_bradycardia(self):
        """FHR <110 → PRIORITY."""
        episode = _make_episode(self.woman)
        PregnancyObservation.objects.create(
            episode=episode,
            fhr_bpm=100,
        )
        result = run_pregnancy_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)
        rule_ids = [r["ruleId"] for r in result["fired_rules"]]
        self.assertIn("GH-SMP-FHR-BRADY", rule_ids)

    def test_fetal_tachycardia(self):
        """FHR >160 → PRIORITY."""
        episode = _make_episode(self.woman)
        PregnancyObservation.objects.create(
            episode=episode,
            fhr_bpm=170,
        )
        result = run_pregnancy_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)
        rule_ids = [r["ruleId"] for r in result["fired_rules"]]
        self.assertIn("GH-SMP-FHR-TACHY", rule_ids)

    def test_reduced_fetal_movement(self):
        """Reduced fetal movement → PRIORITY."""
        episode = _make_episode(self.woman)
        PregnancyObservation.objects.create(
            episode=episode,
            movement_status="reduced",
        )
        result = run_pregnancy_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)

    def test_rule_metadata_present(self):
        """Each fired rule must have spec §12.3 metadata fields."""
        episode = _make_episode(self.woman, chronic_hypertension=True)
        result = run_pregnancy_assessment(episode)
        for rule in result["fired_rules"]:
            self.assertIn("ruleId", rule)
            self.assertIn("ruleVersion", rule)
            self.assertIn("severity", rule)
            self.assertIn("reasonCode", rule)
            self.assertIn("reasonText", rule)
            self.assertIn("sourceTitle", rule)
            self.assertIn("sourceVersion", rule)
            self.assertIn("sourceEffectiveDate", rule)

    def test_rule_set_version_in_result(self):
        """Result must include rule_set_version."""
        episode = _make_episode(self.woman)
        result = run_pregnancy_assessment(episode)
        self.assertIn("rule_set_version", result)
        self.assertTrue(result["rule_set_version"])

    def test_bp_boundary_140(self):
        """SBP exactly 140 → PRIORITY (boundary)."""
        episode = _make_episode(self.woman)
        PregnancyObservation.objects.create(
            episode=episode,
            bp_systolic=140,
            bp_diastolic=90,
        )
        result = run_pregnancy_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)

    def test_bp_boundary_160(self):
        """SBP exactly 160 → EMERGENCY (boundary)."""
        episode = _make_episode(self.woman)
        PregnancyObservation.objects.create(
            episode=episode,
            bp_systolic=160,
            bp_diastolic=110,
        )
        result = run_pregnancy_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_no_observation_still_works(self):
        """Episode with no observations should still evaluate history rules."""
        episode = _make_episode(self.woman, previous_stillbirth=True)
        result = run_pregnancy_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)
