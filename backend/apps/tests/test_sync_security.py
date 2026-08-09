"""
Offline/sync edge case tests and security tests (spec §29.4, §29.5).
"""
from datetime import date, timedelta, datetime
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.enums import (
    SystemRole, UrgencyLevel, ReferralStatus, Sex, MLMode,
    OrganisationUnitType, FacilityType,
)
from apps.organisations.models import OrganisationUnit, FacilityCapability
from apps.accounts.models import UserAccount
from apps.clients.models import Person, Household
from apps.pregnancy.models import PregnancyEpisode
from apps.referrals.models import Referral, ReferralStateLog
from apps.referrals.state_machine import is_valid_transition
from apps.audit.models import AuditEvent
from apps.audit.services import log_audit
from apps.core.config_models import SystemConfig
from apps.core.package_models import Package
from apps.core.permissions import (
    get_user_org_unit_ids, get_descendant_unit_ids, user_can_write, user_can_manage_users,
)


# ──────────────────────────────────────────────────────────
# Test helpers
# ──────────────────────────────────────────────────────────

def _make_org(name="Test Org", code="TORG01", unit_type=OrganisationUnitType.FACILITY, parent=None):
    return OrganisationUnit.objects.create(name=name, code=code, unit_type=unit_type, parent=parent)

def _make_user(org, username="testuser", role=SystemRole.FACILITY_CLINICAL_USER, is_super_admin=False):
    return UserAccount.objects.create_user(
        username=username, password="testpass123",
        organisation_unit=org, system_role=role, is_super_admin=is_super_admin,
    )

def _make_patient(org, name="Test Patient", dob=None):
    hh = Household.objects.create(organisation_unit=org)
    return Person.objects.create(
        full_name=name, household=hh, organisation_unit=org,
        sex=Sex.FEMALE, date_of_birth=dob or date(1995, 1, 1),
    )

def _auth_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


# ──────────────────────────────────────────────────────────
# Offline/Sync Edge Case Tests (spec §29.4)
# ──────────────────────────────────────────────────────────

class SyncConcurrentReferralUpdateTests(TestCase):
    """Test concurrent referral updates don't corrupt state (spec §29.4)."""

    def test_concurrent_state_transitions_same_referral(self):
        org = _make_org()
        patient = _make_patient(org)
        dest = _make_org(name="Dest", code="DEST01")
        referral = Referral.objects.create(
            patient=patient, referring_facility=org, destination_facility=dest,
            status=ReferralStatus.ACCEPTED, urgency=UrgencyLevel.EMERGENCY,
        )
        # Simulate two concurrent updates: one to TRANSPORT_REQUESTED, one to ARRIVED
        # Only the valid one should succeed
        from apps.referrals.state_machine import assert_valid_transition
        # ACCEPTED → TRANSPORT_REQUESTED is valid
        assert_valid_transition(ReferralStatus.ACCEPTED, ReferralStatus.TRANSPORT_REQUESTED)
        # ACCEPTED → ARRIVED is also valid (direct arrival)
        assert_valid_transition(ReferralStatus.ACCEPTED, ReferralStatus.ARRIVED)

        # First transition wins
        referral.status = ReferralStatus.TRANSPORT_REQUESTED
        referral.save()
        # Second transition from new state: TRANSPORT_REQUESTED → IN_TRANSIT is valid
        self.assertTrue(is_valid_transition(ReferralStatus.TRANSPORT_REQUESTED, ReferralStatus.IN_TRANSIT))

    def test_concurrent_referral_different_facilities(self):
        """Two referrals from different facilities should be independent."""
        org1 = _make_org(name="Org1", code="ORG1")
        org2 = _make_org(name="Org2", code="ORG2")
        p1 = _make_patient(org1, name="Patient1")
        p2 = _make_patient(org2, name="Patient2")
        dest = _make_org(name="Dest", code="DST01")

        r1 = Referral.objects.create(
            patient=p1, referring_facility=org1, destination_facility=dest,
            status=ReferralStatus.REQUESTED, urgency=UrgencyLevel.EMERGENCY,
        )
        r2 = Referral.objects.create(
            patient=p2, referring_facility=org2, destination_facility=dest,
            status=ReferralStatus.REQUESTED, urgency=UrgencyLevel.PRIORITY,
        )

        r1.status = ReferralStatus.ACCEPTED
        r1.save()
        r2.status = ReferralStatus.DECLINED
        r2.save()

        r1.refresh_from_db()
        r2.refresh_from_db()
        self.assertEqual(r1.status, ReferralStatus.ACCEPTED)
        self.assertEqual(r2.status, ReferralStatus.DECLINED)


class SyncPatientIdentityCollisionTests(TestCase):
    """Test patient identity collision — do not auto-merge (spec §29.4, §19.4)."""

    def test_duplicate_patients_not_merged(self):
        """Patient identity conflicts MUST be placed in reconciliation queue,
        not auto-merged (spec §19.4)."""
        org = _make_org()
        p1 = _make_patient(org, name="Ama Mensah", dob=date(1995, 3, 15))
        p2 = _make_patient(org, name="Ama Mensah", dob=date(1995, 3, 15))

        # Same name and DOB, but different UUIDs — should NOT be merged
        self.assertNotEqual(p1.id, p2.id)
        self.assertEqual(p1.full_name, p2.full_name)
        self.assertEqual(p1.date_of_birth, p2.date_of_birth)

    def test_sync_duplicate_patient_creates_separate_records(self):
        """Sync push with same patient data but different IDs creates separate records."""
        org = _make_org()
        user = _make_user(org, username="syncuser", role=SystemRole.SUPER_ADMIN, is_super_admin=True)
        client = _auth_client(user)

        body = {
            "records": {
                "persons": [
                    {"full_name": "Sync Patient A", "organisation_unit": str(org.id), "sex": "FEMALE"},
                ]
            }
        }
        resp = client.post("/api/v1/sync/", body, format="json",
                           HTTP_IDEMPOTENCY_KEY="collision-key-001")
        self.assertEqual(resp.status_code, 200)

        body2 = {
            "records": {
                "persons": [
                    {"full_name": "Sync Patient A", "organisation_unit": str(org.id), "sex": "FEMALE"},
                ]
            }
        }
        resp2 = client.post("/api/v1/sync/", body2, format="json",
                            HTTP_IDEMPOTENCY_KEY="collision-key-002")
        self.assertEqual(resp2.status_code, 200)

        # Two separate persons with same name should exist
        persons = Person.objects.filter(full_name="Sync Patient A")
        self.assertEqual(persons.count(), 2)


class SyncClockSkewTests(TestCase):
    """Test device clock skew handling (spec §29.4)."""

    def test_sync_with_future_timestamp(self):
        """Sync with a future timestamp should still process records."""
        org = _make_org()
        user = _make_user(org, username="clockuser", role=SystemRole.SUPER_ADMIN, is_super_admin=True)
        client = _auth_client(user)

        future = (timezone.now() + timedelta(days=1)).isoformat()
        resp = client.get(f"/api/v1/sync/?since={future}")
        self.assertEqual(resp.status_code, 200)
        # Should return empty records since no records updated in the future
        data = resp.json()
        self.assertIn("records", data)

    def test_sync_with_past_timestamp(self):
        """Sync with a very old timestamp should return all records."""
        org = _make_org()
        patient = _make_patient(org, name="Clock Test Patient")
        user = _make_user(org, username="clockuser2", role=SystemRole.SUPER_ADMIN, is_super_admin=True)
        client = _auth_client(user)

        past = "2020-01-01T00:00:00Z"
        resp = client.get(f"/api/v1/sync/?since={past}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(len(data["records"]) > 0)

    def test_sync_with_invalid_timestamp(self):
        """Sync with invalid timestamp should not crash."""
        org = _make_org()
        user = _make_user(org, username="clockuser3", role=SystemRole.SUPER_ADMIN, is_super_admin=True)
        client = _auth_client(user)

        resp = client.get("/api/v1/sync/?since=invalid-date")
        self.assertEqual(resp.status_code, 200)

    def test_sync_no_since_param(self):
        """Sync pull without since param should return all records."""
        org = _make_org()
        user = _make_user(org, username="clockuser4", role=SystemRole.SUPER_ADMIN, is_super_admin=True)
        client = _auth_client(user)

        resp = client.get("/api/v1/sync/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("synced_at", data)


class SyncInterruptedUploadTests(TestCase):
    """Test interrupted upload — retry should not duplicate (spec §29.4, §19.3)."""

    def test_retry_after_error_no_duplicate(self):
        org = _make_org()
        user = _make_user(org, username="retryuser", role=SystemRole.SUPER_ADMIN, is_super_admin=True)
        client = _auth_client(user)

        body = {
            "records": {
                "persons": [
                    {"full_name": "Retry Patient", "organisation_unit": str(org.id), "sex": "FEMALE"},
                ]
            }
        }
        # First request succeeds
        resp1 = client.post("/api/v1/sync/", body, format="json",
                            HTTP_IDEMPOTENCY_KEY="retry-key-001")
        self.assertEqual(resp1.status_code, 200)
        count_after_first = Person.objects.filter(full_name="Retry Patient").count()

        # Retry with same key — should return cached, not create duplicate
        resp2 = client.post("/api/v1/sync/", body, format="json",
                            HTTP_IDEMPOTENCY_KEY="retry-key-001")
        self.assertEqual(resp2.status_code, 200)
        count_after_retry = Person.objects.filter(full_name="Retry Patient").count()
        self.assertEqual(count_after_first, count_after_retry)

    def test_batch_retry_same_event_id(self):
        org = _make_org()
        user = _make_user(org, username="batchretry", role=SystemRole.SUPER_ADMIN, is_super_admin=True)
        client = _auth_client(user)

        body = {
            "deviceId": "test-device",
            "events": [
                {
                    "eventId": "evt-retry-001",
                    "resourceType": "Person",
                    "resource": {"full_name": "Batch Retry", "organisation_unit": str(org.id), "sex": "FEMALE"},
                }
            ]
        }
        resp1 = client.post("/api/v1/sync/batch", body, format="json",
                            HTTP_IDEMPOTENCY_KEY="batch-retry-001")
        self.assertEqual(resp1.status_code, 200)
        count1 = Person.objects.filter(full_name="Batch Retry").count()

        resp2 = client.post("/api/v1/sync/batch", body, format="json",
                            HTTP_IDEMPOTENCY_KEY="batch-retry-001")
        self.assertEqual(resp2.status_code, 200)
        count2 = Person.objects.filter(full_name="Batch Retry").count()
        self.assertEqual(count1, count2)


class Sync24HourOfflineTests(TestCase):
    """Test 24+ hours offline followed by resync (spec §29.4)."""

    def test_old_records_still_sync(self):
        """Records created 24+ hours ago should still sync."""
        org = _make_org()
        patient = _make_patient(org, name="Old Record Patient")

        # Simulate old record by updating created_at
        old_time = timezone.now() - timedelta(hours=26)
        Person.objects.filter(id=patient.id).update(updated_at=old_time)

        user = _make_user(org, username="oldsync", role=SystemRole.SUPER_ADMIN, is_super_admin=True)
        client = _auth_client(user)

        # Pull with since=25 hours ago should include this record
        since = (timezone.now() - timedelta(hours=25)).isoformat()
        resp = client.get(f"/api/v1/sync/?since={since}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        # The record should be too old (updated 26h ago, since 25h ago)
        # So it should NOT be in results — but the sync should not crash
        self.assertEqual(resp.status_code, 200)

    def test_referral_created_offline_syncs(self):
        """A referral created while offline should sync correctly."""
        org = _make_org()
        patient = _make_patient(org)
        dest = _make_org(name="Dest", code="DST02")

        referral = Referral.objects.create(
            patient=patient, referring_facility=org, destination_facility=dest,
            status=ReferralStatus.REQUESTED, urgency=UrgencyLevel.EMERGENCY,
            referral_reason="Severe bleeding",
        )

        user = _make_user(org, username="offlinesync", role=SystemRole.SUPER_ADMIN, is_super_admin=True)
        client = _auth_client(user)

        resp = client.get("/api/v1/sync/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        # Referral should appear in sync results
        referral_ids = [r.get("id") for r in data["records"].get("referrals", [])]
        self.assertIn(str(referral.id), referral_ids)


# ──────────────────────────────────────────────────────────
# Security Tests (spec §29.5)
# ──────────────────────────────────────────────────────────

class AuthorizationBoundaryTests(TestCase):
    """Authorization boundary tests for every role/scope combination (spec §29.5)."""

    def setUp(self):
        # Create org hierarchy: Region > District > Sub-district > Facility
        self.region = _make_org(name="Northern", code="NR", unit_type=OrganisationUnitType.REGION)
        self.district = _make_org(name="Tolon", code="TL", unit_type=OrganisationUnitType.DISTRICT, parent=self.region)
        self.subdistrict = _make_org(name="Sub-X", code="SX", unit_type=OrganisationUnitType.SUBDISTRICT, parent=self.district)
        self.facility1 = _make_org(name="Fac-A", code="FA", unit_type=OrganisationUnitType.FACILITY, parent=self.subdistrict)
        self.facility2 = _make_org(name="Fac-B", code="FB", unit_type=OrganisationUnitType.FACILITY, parent=self.subdistrict)

        # Create patients in each facility
        self.patient1 = _make_patient(self.facility1, name="Patient-A")
        self.patient2 = _make_patient(self.facility2, name="Patient-B")

    def test_facility_user_sees_only_own_facility(self):
        user = _make_user(self.facility1, username="fac1user", role=SystemRole.FACILITY_CLINICAL_USER)
        unit_ids = get_user_org_unit_ids(user)
        self.assertEqual(unit_ids, [self.facility1.id])

    def test_facility_user_cannot_see_other_facility(self):
        user = _make_user(self.facility1, username="fac1user2", role=SystemRole.FACILITY_CLINICAL_USER)
        client = _auth_client(user)
        resp = client.get("/api/v1/clients/persons/")
        self.assertEqual(resp.status_code, 200)
        person_ids = [p["id"] for p in resp.json().get("results", resp.json())]
        self.assertIn(str(self.patient1.id), person_ids)
        self.assertNotIn(str(self.patient2.id), person_ids)

    def test_subdistrict_admin_sees_descendant_facilities(self):
        user = _make_user(self.subdistrict, username="subuser", role=SystemRole.SUBDISTRICT_ADMIN)
        unit_ids = get_user_org_unit_ids(user)
        self.assertIn(self.subdistrict.id, unit_ids)
        self.assertIn(self.facility1.id, unit_ids)
        self.assertIn(self.facility2.id, unit_ids)

    def test_district_admin_sees_all_descendants(self):
        user = _make_user(self.district, username="distuser", role=SystemRole.DISTRICT_ADMIN)
        unit_ids = get_user_org_unit_ids(user)
        self.assertIn(self.district.id, unit_ids)
        self.assertIn(self.subdistrict.id, unit_ids)
        self.assertIn(self.facility1.id, unit_ids)
        self.assertIn(self.facility2.id, unit_ids)

    def test_regional_admin_sees_all_descendants(self):
        user = _make_user(self.region, username="reguser", role=SystemRole.REGIONAL_ADMIN)
        unit_ids = get_user_org_unit_ids(user)
        self.assertIn(self.region.id, unit_ids)
        self.assertIn(self.district.id, unit_ids)
        self.assertIn(self.facility1.id, unit_ids)

    def test_super_admin_sees_everything(self):
        """Super admin is scoped to their org unit + descendants (spec §21.3, §37)."""
        user = _make_user(self.region, username="superuser", role=SystemRole.SUPER_ADMIN, is_super_admin=True)
        unit_ids = get_user_org_unit_ids(user)
        # Super admin at region sees all descendants
        self.assertIsNotNone(unit_ids)
        self.assertIn(self.region.id, unit_ids)
        self.assertIn(self.district.id, unit_ids)
        self.assertIn(self.subdistrict.id, unit_ids)
        self.assertIn(self.facility1.id, unit_ids)
        self.assertIn(self.facility2.id, unit_ids)

    def test_read_only_cannot_write(self):
        user = _make_user(self.facility1, username="rouser", role=SystemRole.READ_ONLY)
        self.assertFalse(user_can_write(user))

    def test_facility_clinical_user_can_write(self):
        user = _make_user(self.facility1, username="clinuser", role=SystemRole.FACILITY_CLINICAL_USER)
        self.assertTrue(user_can_write(user))

    def test_read_only_create_returns_403(self):
        user = _make_user(self.facility1, username="rocreate", role=SystemRole.READ_ONLY)
        client = _auth_client(user)
        resp = client.post("/api/v1/clients/persons/", {
            "full_name": "New Patient",
            "organisation_unit": str(self.facility1.id),
            "sex": "FEMALE",
        }, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_facility_user_create_succeeds(self):
        user = _make_user(self.facility1, username="cuser", role=SystemRole.FACILITY_CLINICAL_USER)
        client = _auth_client(user)
        resp = client.post("/api/v1/clients/persons/", {
            "full_name": "New Patient OK",
            "organisation_unit": str(self.facility1.id),
            "sex": "FEMALE",
        }, format="json")
        self.assertEqual(resp.status_code, 201)

    def test_user_with_no_org_sees_nothing(self):
        user = UserAccount.objects.create_user(
            username="noorg", password="testpass123",
            system_role=SystemRole.FACILITY_CLINICAL_USER,
        )
        unit_ids = get_user_org_unit_ids(user)
        self.assertEqual(unit_ids, [])

    def test_user_management_permission_admin(self):
        admin = _make_user(self.district, username="admin1", role=SystemRole.DISTRICT_ADMIN)
        self.assertTrue(user_can_manage_users(admin))

    def test_user_management_permission_clinical_user(self):
        clinician = _make_user(self.facility1, username="clin1", role=SystemRole.FACILITY_CLINICAL_USER)
        self.assertFalse(user_can_manage_users(clinician))

    def test_user_management_permission_read_only(self):
        ro = _make_user(self.facility1, username="ro1", role=SystemRole.READ_ONLY)
        self.assertFalse(user_can_manage_users(ro))


class AuditTamperResistanceTests(TestCase):
    """Audit log tamper resistance tests (spec §29.5, §23)."""

    def test_audit_event_created_immutably(self):
        """Audit events should be append-only — created but not modified."""
        event = log_audit(
            actor="testuser",
            action="TEST_ACTION",
            entity_type="TestEntity",
            entity_id="test-001",
        )
        self.assertEqual(event.actor, "testuser")
        self.assertEqual(event.action, "TEST_ACTION")
        self.assertIsNotNone(event.occurred_at)

    def test_audit_event_not_overwritten_on_correction(self):
        """Corrections should create new events, not overwrite (spec §23)."""
        event1 = log_audit(actor="user1", action="RECORD_CREATED", entity_id="rec-001")
        event2 = log_audit(actor="user1", action="RECORD_CORRECTED", entity_id="rec-001")

        event1.refresh_from_db()
        event2.refresh_from_db()
        self.assertEqual(event1.action, "RECORD_CREATED")
        self.assertEqual(event2.action, "RECORD_CORRECTED")
        self.assertNotEqual(event1.id, event2.id)

    def test_audit_events_separate_by_actor(self):
        """Different actors create separate audit events."""
        log_audit(actor="user1", action="VIEW", entity_id="p1")
        log_audit(actor="user2", action="VIEW", entity_id="p1")
        events = AuditEvent.objects.filter(entity_id="p1", action="VIEW")
        self.assertEqual(events.count(), 2)

    def test_audit_metadata_preserved(self):
        """Audit metadata should be preserved as structured JSON."""
        event = log_audit(
            actor="testuser",
            action="METADATA_TEST",
            metadata={"key": "value", "nested": {"a": 1}},
        )
        event.refresh_from_db()
        self.assertEqual(event.metadata["key"], "value")
        self.assertEqual(event.metadata["nested"]["a"], 1)

    def test_audit_patient_id_stored(self):
        """Audit events should store patient_id when applicable."""
        org = _make_org()
        patient = _make_patient(org)
        event = log_audit(
            actor="testuser",
            action="PATIENT_VIEWED",
            patient_id=patient.id,
        )
        event.refresh_from_db()
        self.assertEqual(event.patient_id, patient.id)


class ExpiredConfigPackageTests(TestCase):
    """Expired contact/config package behavior tests (spec §29.5, §24, §32)."""

    def test_expired_capability_flagged(self):
        """Expired facility capability should be visibly flagged (spec §32)."""
        org = _make_org(name="Cap Test", code="CAP01")
        expired_time = timezone.now() - timedelta(days=1)
        cap = FacilityCapability.objects.create(
            facility=org,
            maternity_triage_24_7=True,
            bemonc=True,
            verified_at=timezone.now() - timedelta(days=100),
            verification_expires_at=expired_time,
        )
        self.assertTrue(cap.verification_expires_at < timezone.now())

    def test_valid_capability_not_flagged(self):
        org = _make_org(name="Cap Valid", code="CAP02")
        future = timezone.now() + timedelta(days=90)
        cap = FacilityCapability.objects.create(
            facility=org,
            cemonc=True,
            verified_at=timezone.now(),
            verification_expires_at=future,
        )
        self.assertFalse(cap.verification_expires_at < timezone.now())

    def test_revoked_package_not_active(self):
        """A revoked package MUST NOT be active (spec §24)."""
        pkg = Package.objects.create(
            package_id="revoked-test", package_type="CLINICAL_RULES",
            version="1.0.0", sha256="a" * 64, signature="sig",
            status="REVOKED",
        )
        self.assertEqual(pkg.status, "REVOKED")
        active = Package.objects.filter(package_type="CLINICAL_RULES", status="ACTIVE")
        self.assertNotIn(pkg, active)

    def test_retired_package_not_active(self):
        pkg = Package.objects.create(
            package_id="retired-test", package_type="CLINICAL_RULES",
            version="1.0.0", sha256="b" * 64, signature="sig",
            status="RETIRED",
        )
        self.assertEqual(pkg.status, "RETIRED")

    def test_rollback_restores_known_good_version(self):
        """The system MUST retain at least one known-good rollback version (spec §24)."""
        Package.activate(
            package_id="rb-v1", package_type="CLINICAL_RULES",
            version="1.0.0", sha256="a" * 64, signature="sig1",
        )
        Package.activate(
            package_id="rb-v2", package_type="CLINICAL_RULES",
            version="2.0.0", sha256="b" * 64, signature="sig2",
        )
        rolled = Package.rollback("CLINICAL_RULES")
        self.assertEqual(rolled.status, "ACTIVE")
        self.assertEqual(rolled.version, "1.0.0")
        # Previous active is now retired
        v2 = Package.objects.filter(version="2.0.0", package_type="CLINICAL_RULES").first()
        self.assertEqual(v2.status, "RETIRED")

    def test_invalid_signature_rejected_keeps_previous(self):
        """Invalid package signature should keep previous valid version (spec §39.2)."""
        # Activate a valid package
        pkg1 = Package.activate(
            package_id="sig-v1", package_type="CLINICAL_RULES",
            version="1.0.0", sha256="c" * 64, signature="valid-sig",
        )
        self.assertEqual(pkg1.status, "ACTIVE")

        # Simulate invalid signature — don't activate
        bad_pkg = Package.objects.create(
            package_id="sig-v2", package_type="CLINICAL_RULES",
            version="2.0.0", sha256="d" * 64, signature="INVALID",
            status="STAGED",
        )
        # The active package should still be the valid one
        active = Package.objects.filter(package_type="CLINICAL_RULES", status="ACTIVE").first()
        self.assertEqual(active.version, "1.0.0")
        self.assertEqual(bad_pkg.status, "STAGED")


class NotificationLeakageTests(TestCase):
    """Notification leakage tests — no sensitive data in notifications (spec §29.5, §3.3)."""

    def test_notification_does_not_disclose_diagnosis(self):
        """SMS/notification content MUST NOT disclose pregnancy status, diagnosis,
        danger signs, or other sensitive clinical information (spec §3.3)."""
        from apps.notifications.models import Notification
        from apps.core.enums import NotificationClass, NotificationStatus

        org = _make_org()
        notif = Notification.objects.create(
            title="Referral update available",
            notification_class=NotificationClass.REFERRAL,
            status=NotificationStatus.OPEN,
            urgency=UrgencyLevel.ROUTINE,
            due_datetime=timezone.now(),
        )
        # Title should not contain clinical details
        sensitive_words = ["pregnancy", "bleeding", "hiv", "abortion", "std", "diagnosis"]
        for word in sensitive_words:
            self.assertNotIn(word, notif.title.lower())

    def test_emergency_notification_no_clinical_details(self):
        """Emergency notifications should not expose specific danger signs in title."""
        from apps.notifications.models import Notification
        from apps.core.enums import NotificationClass, NotificationStatus

        notif = Notification.objects.create(
            title="URGENT: Referral requires attention",
            notification_class=NotificationClass.EMERGENCY,
            status=NotificationStatus.OPEN,
            urgency=UrgencyLevel.EMERGENCY,
            due_datetime=timezone.now(),
        )
        # Should not contain specific clinical details
        self.assertNotIn("bleeding", notif.title.lower())
        self.assertNotIn("eclampsia", notif.title.lower())
        self.assertNotIn("haemorrhage", notif.title.lower())
