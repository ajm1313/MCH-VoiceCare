"""
Tests for newborn rule engine — danger signs, birth weight tiers,
Apgar scores, jaundice, and emergency non-downgrade (spec §29).
"""
from django.test import TestCase

from apps.core.enums import UrgencyLevel
from apps.clients.models import Person, Household
from apps.organisations.models import OrganisationUnit
from apps.newborn.models import NewbornEpisode, NewbornObservation
from apps.newborn.rule_engine import run_newborn_assessment


def _make_org():
    return OrganisationUnit.objects.create(
        name="Test Facility", code="NB001", unit_type="FACILITY",
    )


def _make_child(org, sex="MALE"):
    household = Household.objects.create(organisation_unit=org)
    return Person.objects.create(
        full_name="Test Baby", sex=sex, household=household, organisation_unit=org,
    )


def _make_episode(child, **kwargs):
    defaults = {"child": child}
    defaults.update(kwargs)
    return NewbornEpisode.objects.create(**defaults)


class NewbornRuleEngineTests(TestCase):

    def setUp(self):
        self.org = _make_org()
        self.child = _make_child(self.org)

    def test_routine_when_no_risk(self):
        episode = _make_episode(self.child, birth_weight_g=3200, gestational_age_weeks=39)
        result = run_newborn_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.ROUTINE)

    def test_vlbw_is_emergency(self):
        """Birth weight <1500g → EMERGENCY."""
        episode = _make_episode(self.child, birth_weight_g=1200)
        result = run_newborn_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_lbw_is_priority(self):
        """Birth weight 2000-2499g → PRIORITY."""
        episode = _make_episode(self.child, birth_weight_g=2200)
        result = run_newborn_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)

    def test_extreme_preterm_is_emergency(self):
        """Gestational age <28 weeks → EMERGENCY."""
        episode = _make_episode(self.child, gestational_age_weeks=26)
        result = run_newborn_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_convulsions_is_emergency(self):
        """Convulsions → EMERGENCY (PSBI)."""
        episode = _make_episode(self.child, birth_weight_g=3000)
        NewbornObservation.objects.create(newborn=episode, convulsions=True)
        result = run_newborn_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_central_cyanosis_is_emergency(self):
        episode = _make_episode(self.child, birth_weight_g=3000)
        NewbornObservation.objects.create(newborn=episode, central_cyanosis=True)
        result = run_newborn_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_apnoea_is_emergency(self):
        episode = _make_episode(self.child, birth_weight_g=3000)
        NewbornObservation.objects.create(newborn=episode, apnoea_or_gasping=True)
        result = run_newborn_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_hypothermia_is_emergency(self):
        """Temperature <35°C → EMERGENCY."""
        episode = _make_episode(self.child, birth_weight_g=3000)
        NewbornObservation.objects.create(newborn=episode, temperature_c=34.0)
        result = run_newborn_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_mild_hypothermia_is_priority(self):
        """Temperature 35-36°C → PRIORITY."""
        episode = _make_episode(self.child, birth_weight_g=3000)
        NewbornObservation.objects.create(newborn=episode, temperature_c=35.5)
        result = run_newborn_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)

    def test_early_jaundice_is_emergency(self):
        """Jaundice within first 24 hours → EMERGENCY."""
        episode = _make_episode(self.child, birth_weight_g=3000)
        NewbornObservation.objects.create(newborn=episode, jaundice_onset_age_hours=12)
        result = run_newborn_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_not_feeding_well_is_emergency(self):
        episode = _make_episode(self.child, birth_weight_g=3000)
        NewbornObservation.objects.create(newborn=episode, feeding_status="not feeding well")
        result = run_newborn_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_low_apgar_5min_is_emergency(self):
        """Apgar-5 <7 → EMERGENCY."""
        episode = _make_episode(self.child, birth_weight_g=3000, apgar_5_min=5)
        result = run_newborn_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_emergency_non_downgrade(self):
        """Emergency rule must not be downgraded by later priority rules."""
        episode = _make_episode(self.child, birth_weight_g=1200, congenital_abnormality=True)
        NewbornObservation.objects.create(
            newborn=episode, convulsions=True, grunting=True, temperature_c=35.5,
        )
        result = run_newborn_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_rule_metadata_present(self):
        episode = _make_episode(self.child, birth_weight_g=1200)
        result = run_newborn_assessment(episode)
        for rule in result["fired_rules"]:
            self.assertIn("ruleId", rule)
            self.assertIn("ruleVersion", rule)
            self.assertIn("severity", rule)
            self.assertIn("sourceTitle", rule)
            self.assertIn("sourceEffectiveDate", rule)

    def test_rule_set_version_in_result(self):
        episode = _make_episode(self.child, birth_weight_g=3000)
        result = run_newborn_assessment(episode)
        self.assertIn("rule_set_version", result)

    def test_weight_loss_emergency(self):
        """Weight loss >10% → EMERGENCY."""
        episode = _make_episode(self.child, birth_weight_g=3000)
        NewbornObservation.objects.create(newborn=episode, current_weight_g=2600)
        result = run_newborn_assessment(episode)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)
