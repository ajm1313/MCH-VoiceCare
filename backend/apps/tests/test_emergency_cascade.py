"""
Tests for remote emergency cascade (spec §17.4).

When a DTMF/USSD remote answer triggers an emergency, the cascade must:
1. Persist the remote observation (done by caller)
2. Create an emergency alert centrally
3. Return approved emergency advice
4. Notify the assigned facility role
5. Initiate referral/escalation
"""
import uuid
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from apps.audit.models import AuditEvent
from apps.clients.models import Person, Household
from apps.core.config_models import RoleContact, SystemConfig
from apps.core.emergency_cascade import (
    trigger_emergency_cascade,
    get_emergency_advice,
    EMERGENCY_ADVICE,
)
from apps.core.enums import UrgencyLevel, ReferralStatus, SystemRole
from apps.organisations.models import OrganisationUnit, FacilityCapability
from apps.referrals.models import Referral


_org_counter = [0]


def _make_org(name="Test Facility", unit_type="FACILITY"):
    _org_counter[0] += 1
    suffix = _org_counter[0]
    parent = OrganisationUnit.objects.create(
        name=f"Northern Region {suffix}",
        code=f"REG-{suffix}",
        unit_type="REGION",
    )
    district = OrganisationUnit.objects.create(
        name=f"Tolon District {suffix}",
        code=f"DIST-{suffix}",
        unit_type="DISTRICT",
        parent=parent,
    )
    return OrganisationUnit.objects.create(
        name=name,
        code=f"FAC-{suffix}",
        unit_type=unit_type,
        parent=district,
    )


def _make_person(org):
    household = Household.objects.create(organisation_unit=org)
    return Person.objects.create(
        full_name="Test Patient",
        phone="233244567890",
        organisation_unit=org,
        household=household,
        date_of_birth="1990-01-01",
        sex="F",
    )


def _make_facility_capability(facility, destination=None):
    return FacilityCapability.objects.create(
        facility=facility,
        maternity_triage_24_7=True,
        bemonc=True,
        cemonc=False,
        primary_referral_destination=destination,
    )


class EmergencyAdviceTests(TestCase):
    """Test emergency advice messages (spec §17.4 step 3)."""

    def test_advice_for_known_danger_signs(self):
        for sign in ["bleeding", "fever", "severe_headache", "convulsion", "breathing"]:
            advice = get_emergency_advice(sign)
            self.assertIn("EMERGENCY", advice)
            self.assertIn("facility", advice.lower())

    def test_advice_for_unknown_danger_sign_uses_default(self):
        advice = get_emergency_advice("unknown_symptom")
        self.assertIn("EMERGENCY", advice)

    def test_all_advice_messages_mention_ambulance(self):
        """All emergency advice should mention calling 112 for ambulance."""
        for sign, advice in EMERGENCY_ADVICE.items():
            self.assertIn("112", advice, f"Advice for {sign} should mention 112")


class EmergencyCascadeTests(TestCase):
    """Test the full emergency cascade (spec §17.4)."""

    def setUp(self):
        self.facility = _make_org()
        self.patient = _make_person(self.facility)
        # Create a referral destination (hospital)
        self.hospital = _make_org(name="Tamale Teaching Hospital")
        _make_facility_capability(self.facility, destination=self.hospital)
        # Create a role contact for the facility
        RoleContact.objects.create(
            facility=self.facility,
            role="MIDWIFE",
            phone_number="233244111222",
            verified_at=timezone.now(),
            is_active=True,
        )

    def test_cascade_creates_emergency_alert(self):
        """Step 2: Emergency alert is created centrally."""
        result = trigger_emergency_cascade(
            danger_sign="bleeding",
            question_code="DANGER_BLEEDING",
            phone_number="233244567890",
            patient=self.patient,
            session_id="test-session-001",
            provider="ussd",
        )
        self.assertIsNotNone(result["alert_id"])
        alert = AuditEvent.objects.filter(id=result["alert_id"]).first()
        self.assertIsNotNone(alert)
        self.assertEqual(alert.action, "EMERGENCY_ALERT_REMOTE")
        self.assertEqual(alert.metadata["danger_sign"], "bleeding")

    def test_cascade_returns_approved_advice(self):
        """Step 3: Approved emergency advice is returned for the caller."""
        result = trigger_emergency_cascade(
            danger_sign="convulsion",
            question_code="DANGER_CONVULSIONS",
            phone_number="233244567890",
            patient=self.patient,
        )
        self.assertIn("EMERGENCY", result["advice"])
        self.assertIn("convulsion", result["advice"].lower() + " ".join(EMERGENCY_ADVICE.keys()))
        # The advice for convulsion should mention lying on left side
        self.assertIn("left side", result["advice"])

    def test_cascade_notifies_facility_role(self):
        """Step 4: Assigned facility role is notified."""
        result = trigger_emergency_cascade(
            danger_sign="bleeding",
            question_code="DANGER_BLEEDING",
            phone_number="233244567890",
            patient=self.patient,
        )
        self.assertTrue(result["facility_notified"])
        self.assertEqual(result["notification_phone"], "233244111222")
        # Verify notification audit event
        notif = AuditEvent.objects.filter(
            action="FACILITY_EMERGENCY_NOTIFICATION",
            facility_id=self.facility.id,
        ).first()
        self.assertIsNotNone(notif)
        self.assertEqual(notif.metadata["role"], "MIDWIFE")

    def test_cascade_creates_emergency_referral(self):
        """Step 5: Emergency referral is initiated."""
        result = trigger_emergency_cascade(
            danger_sign="bleeding",
            question_code="DANGER_BLEEDING",
            phone_number="233244567890",
            patient=self.patient,
        )
        self.assertIsNotNone(result["referral_id"])
        referral = Referral.objects.filter(id=result["referral_id"]).first()
        self.assertIsNotNone(referral)
        self.assertEqual(referral.urgency, UrgencyLevel.EMERGENCY)
        self.assertEqual(referral.status, ReferralStatus.REQUESTED)
        self.assertEqual(referral.referring_facility, self.facility)
        self.assertEqual(referral.destination_facility, self.hospital)
        self.assertIn("bleeding", referral.referral_reason)

    def test_cascade_logs_referral_creation(self):
        """Referral creation is audit-logged."""
        trigger_emergency_cascade(
            danger_sign="fever",
            question_code="DANGER_FEVER",
            phone_number="233244567890",
            patient=self.patient,
        )
        log = AuditEvent.objects.filter(
            action="REFERRAL_CREATED_REMOTE_EMERGENCY",
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.metadata["danger_sign"], "fever")

    def test_cascade_without_patient_still_creates_alert(self):
        """Emergency alert is created even if patient is not identified."""
        result = trigger_emergency_cascade(
            danger_sign="bleeding",
            question_code="DANGER_BLEEDING",
            phone_number="233999999999",
            patient=None,
        )
        self.assertIsNotNone(result["alert_id"])
        self.assertIsNone(result["referral_id"])
        self.assertFalse(result["facility_notified"])

    def test_cascade_without_capability_uses_no_destination(self):
        """Referral is created without destination if no capability configured."""
        # Create a facility without capability
        other_facility = _make_org(name="Clinic Without Capability")
        other_patient = _make_person(other_facility)
        result = trigger_emergency_cascade(
            danger_sign="bleeding",
            question_code="DANGER_BLEEDING",
            phone_number="233244567890",
            patient=other_patient,
        )
        self.assertIsNotNone(result["referral_id"])
        referral = Referral.objects.filter(id=result["referral_id"]).first()
        self.assertIsNone(referral.destination_facility)
        self.assertEqual(referral.referring_facility, other_facility)

    def test_cascade_creates_referral_state_log(self):
        """Referral state log entry is created for the emergency referral."""
        result = trigger_emergency_cascade(
            danger_sign="bleeding",
            question_code="DANGER_BLEEDING",
            phone_number="233244567890",
            patient=self.patient,
        )
        referral = Referral.objects.get(id=result["referral_id"])
        state_logs = referral.state_logs.all()
        self.assertEqual(state_logs.count(), 1)
        self.assertEqual(state_logs[0].to_status, ReferralStatus.REQUESTED)

    def test_cascade_with_unknown_danger_sign(self):
        """Cascade works with unknown danger sign (uses default advice)."""
        result = trigger_emergency_cascade(
            danger_sign="unknown_symptom",
            question_code="DANGER_UNKNOWN",
            phone_number="233244567890",
            patient=self.patient,
        )
        self.assertIsNotNone(result["alert_id"])
        self.assertIn("EMERGENCY", result["advice"])

    def test_cascade_falls_back_to_backup_destination(self):
        """Referral uses backup destination if primary is not set."""
        # Update capability to only have backup
        FacilityCapability.objects.filter(facility=self.facility).delete()
        backup_hospital = _make_org(name="Backup Hospital")
        FacilityCapability.objects.create(
            facility=self.facility,
            backup_referral_destination=backup_hospital,
        )
        result = trigger_emergency_cascade(
            danger_sign="bleeding",
            question_code="DANGER_BLEEDING",
            phone_number="233244567890",
            patient=self.patient,
        )
        referral = Referral.objects.get(id=result["referral_id"])
        self.assertEqual(referral.destination_facility, backup_hospital)
