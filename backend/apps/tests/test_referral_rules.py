"""
Tests for referral urgency auto-classification and state machine (spec §18, §29).
"""
import uuid

from django.test import TestCase

from apps.core.enums import UrgencyLevel, ReferralStatus
from apps.clients.models import Person, Household
from apps.organisations.models import OrganisationUnit
from apps.referrals.models import Referral, ReferralStateLog
from apps.referrals.rule_engine import classify_referral_urgency, apply_urgency_classification


def _make_org():
    return OrganisationUnit.objects.create(
        name="Test Facility", code="RF001", unit_type="FACILITY",
    )


def _make_patient(org):
    household = Household.objects.create(organisation_unit=org)
    return Person.objects.create(
        full_name="Test Patient", sex="FEMALE", household=household,
        organisation_unit=org,
    )


class ReferralUrgencyTests(TestCase):

    def setUp(self):
        self.org = _make_org()
        self.patient = _make_patient(self.org)

    def test_emergency_keyword_bleeding(self):
        """Referral reason with 'bleeding' → EMERGENCY."""
        referral = Referral(patient=self.patient, referral_reason="severe vaginal bleeding")
        result = classify_referral_urgency(referral)
        self.assertEqual(result["urgency"], UrgencyLevel.EMERGENCY)

    def test_emergency_keyword_convulsion(self):
        referral = Referral(patient=self.patient, referral_reason="patient had convulsion")
        result = classify_referral_urgency(referral)
        self.assertEqual(result["urgency"], UrgencyLevel.EMERGENCY)

    def test_priority_keyword_hypertension(self):
        referral = Referral(patient=self.patient, referral_reason="hypertension review needed")
        result = classify_referral_urgency(referral)
        self.assertEqual(result["urgency"], UrgencyLevel.PRIORITY)

    def test_routine_no_keywords(self):
        referral = Referral(patient=self.patient, referral_reason="routine antenatal check")
        result = classify_referral_urgency(referral)
        self.assertEqual(result["urgency"], UrgencyLevel.ROUTINE)

    def test_pre_referral_care_emergency(self):
        """Pre-referral care with 'oxygen' → EMERGENCY."""
        referral = Referral(
            patient=self.patient,
            referral_reason="respiratory distress",
            pre_referral_care="oxygen provided",
        )
        result = classify_referral_urgency(referral)
        self.assertEqual(result["urgency"], UrgencyLevel.EMERGENCY)

    def test_qr_token_generated(self):
        """QR token and short code are generated when absent."""
        referral = Referral(patient=self.patient, referral_reason="routine check")
        result = classify_referral_urgency(referral)
        self.assertTrue(result["qr_token"])
        self.assertTrue(result["short_code"])
        self.assertEqual(len(result["short_code"]), 8)

    def test_existing_qr_token_preserved(self):
        """Existing QR token is not overwritten."""
        existing_token = "existing-token-123"
        referral = Referral(
            patient=self.patient,
            referral_reason="routine check",
            qr_token=existing_token,
            short_code="EXISTING1",
        )
        result = classify_referral_urgency(referral)
        self.assertEqual(result["qr_token"], existing_token)
        self.assertEqual(result["short_code"], "EXISTING1")

    def test_apply_persists_and_transitions(self):
        """apply_urgency_classification persists urgency and transitions DRAFT → REQUESTED."""
        referral = Referral.objects.create(
            patient=self.patient,
            referring_facility=self.org,
            referral_reason="severe bleeding",
            status=ReferralStatus.DRAFT,
        )
        result = apply_urgency_classification(referral)
        referral.refresh_from_db()
        self.assertEqual(referral.urgency, UrgencyLevel.EMERGENCY)
        self.assertEqual(referral.status, ReferralStatus.REQUESTED)
        self.assertTrue(referral.qr_token)
        self.assertTrue(referral.short_code)

    def test_non_draft_not_transitioned(self):
        """Non-DRAFT referrals should not be auto-transitioned."""
        referral = Referral.objects.create(
            patient=self.patient,
            referring_facility=self.org,
            referral_reason="routine check",
            status=ReferralStatus.ACCEPTED,
        )
        apply_urgency_classification(referral)
        referral.refresh_from_db()
        self.assertEqual(referral.status, ReferralStatus.ACCEPTED)

    def test_rule_metadata_present(self):
        referral = Referral(patient=self.patient, referral_reason="severe bleeding")
        result = classify_referral_urgency(referral)
        for rule in result["fired_rules"]:
            self.assertIn("ruleId", rule)
            self.assertIn("ruleVersion", rule)
            self.assertIn("severity", rule)
            self.assertIn("sourceTitle", rule)


class ReferralStateMachineTests(TestCase):
    """Test referral state transitions per spec §18.3."""

    def setUp(self):
        self.org = _make_org()
        self.patient = _make_patient(self.org)
        self.referral = Referral.objects.create(
            patient=self.patient,
            referring_facility=self.org,
            status=ReferralStatus.DRAFT,
        )

    def test_draft_to_requested(self):
        self.referral.status = ReferralStatus.REQUESTED
        self.referral.save()
        self.assertEqual(Referral.objects.get(id=self.referral.id).status, ReferralStatus.REQUESTED)

    def test_requested_to_accepted(self):
        self.referral.status = ReferralStatus.REQUESTED
        self.referral.save()
        self.referral.status = ReferralStatus.ACCEPTED
        self.referral.save()
        ReferralStateLog.objects.create(
            referral=self.referral,
            from_status=ReferralStatus.REQUESTED,
            to_status=ReferralStatus.ACCEPTED,
            actor="test_user",
        )
        self.assertEqual(ReferralStateLog.objects.count(), 1)

    def test_full_happy_path(self):
        """DRAFT → REQUESTED → ACCEPTED → IN_TRANSIT → ARRIVED → DISPOSITION_RECORDED → CLOSED"""
        states = [
            ReferralStatus.REQUESTED,
            ReferralStatus.ACCEPTED,
            ReferralStatus.IN_TRANSIT,
            ReferralStatus.ARRIVED,
            ReferralStatus.DISPOSITION_RECORDED,
            ReferralStatus.CLOSED,
        ]
        prev = ReferralStatus.DRAFT
        for state in states:
            self.referral.status = state
            self.referral.save()
            ReferralStateLog.objects.create(
                referral=self.referral,
                from_status=prev,
                to_status=state,
                actor="test_user",
            )
            prev = state
        self.referral.refresh_from_db()
        self.assertEqual(self.referral.status, ReferralStatus.CLOSED)
        self.assertEqual(ReferralStateLog.objects.count(), 6)
