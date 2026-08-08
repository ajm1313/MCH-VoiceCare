"""
Tests for audit log helpers (OCR, ML inference, identifiable export, permission
changes) and role-based permission enforcement (spec §21, §23).
"""
import uuid

from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.enums import SystemRole, MLMode, NotificationClass, NotificationStatus, UrgencyLevel
from apps.organisations.models import OrganisationUnit
from apps.accounts.models import UserAccount, UserRoleScope
from apps.clients.models import Person, Household
from apps.audit.models import AuditEvent
from apps.audit.services import (
    log_ocr_extraction,
    log_ml_inference,
    log_identifiable_export,
    log_permission_change,
)
from apps.notifications.models import Notification


def _make_org(name="Perm Test Org", code="PERMTEST01"):
    return OrganisationUnit.objects.create(name=name, code=code, unit_type="FACILITY")


def _make_user(org, role=SystemRole.SUPER_ADMIN, username="permuser", is_super=True):
    return UserAccount.objects.create_user(
        username=username, password="testpass123",
        organisation_unit=org, system_role=role, is_super_admin=is_super,
    )


class AuditHelperTests(TestCase):
    """Test new audit log helpers create correct AuditEvent records."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org, username="audithelper")

    def test_log_ocr_extraction(self):
        event = log_ocr_extraction(
            actor="device-001",
            device_id="device-001",
            template_id="anc_card_v1",
            extracted_fields={"bp_systolic": 140, "bp_diastolic": 90},
            confidence_scores={"bp_systolic": 0.95, "bp_diastolic": 0.88},
            human_corrected=False,
        )
        self.assertEqual(event.action, "OCR_EXTRACTION")
        self.assertEqual(event.metadata["template_id"], "anc_card_v1")
        self.assertEqual(event.metadata["extracted_fields"]["bp_systolic"], 140)
        self.assertFalse(event.metadata["human_corrected"])

    def test_log_ocr_extraction_corrected(self):
        event = log_ocr_extraction(
            actor="clinician1",
            device_id="device-001",
            template_id="anc_card_v1",
            extracted_fields={"bp_systolic": 140},
            confidence_scores={"bp_systolic": 0.50},
            human_corrected=True,
        )
        self.assertTrue(event.metadata["human_corrected"])

    def test_log_ml_inference(self):
        event = log_ml_inference(
            actor="system",
            model_version="catboost-v1.2.0",
            model_mode=MLMode.SILENT,
            episode_type="PregnancyEpisode",
            episode_id=uuid.uuid4(),
            prediction={"risk_band": "LOW", "probability": 0.23},
            display_state="NOT_SHOWN",
        )
        self.assertEqual(event.action, "ML_INFERENCE")
        self.assertEqual(event.metadata["model_mode"], MLMode.SILENT)
        self.assertEqual(event.metadata["display_state"], "NOT_SHOWN")
        self.assertEqual(event.metadata["prediction"]["risk_band"], "LOW")

    def test_log_ml_inference_assisted(self):
        event = log_ml_inference(
            actor="system",
            model_version="catboost-v2.0.0",
            model_mode=MLMode.ASSISTED,
            episode_type="PregnancyEpisode",
            episode_id=uuid.uuid4(),
            prediction={"risk_band": "PRIORITY", "probability": 0.72},
            display_state="SHOWN",
        )
        self.assertEqual(event.metadata["model_mode"], MLMode.ASSISTED)
        self.assertEqual(event.metadata["display_state"], "SHOWN")

    def test_log_identifiable_export(self):
        event = log_identifiable_export(
            actor="admin1",
            export_type="PATIENT_LIST_CSV",
            record_count=150,
            actor_role=SystemRole.DISTRICT_ADMIN,
        )
        self.assertEqual(event.action, "IDENTIFIABLE_EXPORT")
        self.assertEqual(event.metadata["export_type"], "PATIENT_LIST_CSV")
        self.assertEqual(event.metadata["record_count"], 150)
        self.assertEqual(event.purpose, "AUDIT")

    def test_log_permission_change(self):
        event = log_permission_change(
            actor="admin1",
            target_user="midwife1",
            action_type="ROLE_ASSIGNED",
            old_role="",
            new_role=SystemRole.FACILITY_CLINICAL_USER,
            actor_role=SystemRole.DISTRICT_ADMIN,
        )
        self.assertEqual(event.action, "PERMISSION_CHANGE")
        self.assertEqual(event.metadata["action_type"], "ROLE_ASSIGNED")
        self.assertEqual(event.metadata["new_role"], SystemRole.FACILITY_CLINICAL_USER)
        self.assertEqual(event.purpose, "ADMIN")


class ReadOnlyPermissionTests(TestCase):
    """Test that READ_ONLY users cannot create/update/delete records."""

    def setUp(self):
        self.org = _make_org()
        self.readonly_user = _make_user(
            self.org, role=SystemRole.READ_ONLY, username="readonly", is_super=False,
        )
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.readonly_user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_readonly_cannot_create_notification(self):
        resp = self.client.post("/api/v1/notifications/", {
            "title": "Test",
            "notification_class": NotificationClass.SYSTEM,
            "urgency": UrgencyLevel.ROUTINE,
        }, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_readonly_cannot_update_notification(self):
        notif = Notification.objects.create(
            title="Test", notification_class=NotificationClass.SYSTEM,
            status=NotificationStatus.OPEN, urgency=UrgencyLevel.ROUTINE,
        )
        resp = self.client.patch(f"/api/v1/notifications/{notif.id}/", {
            "title": "Updated",
        }, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_readonly_cannot_delete_notification(self):
        notif = Notification.objects.create(
            title="Test", notification_class=NotificationClass.SYSTEM,
            status=NotificationStatus.OPEN, urgency=UrgencyLevel.ROUTINE,
        )
        resp = self.client.delete(f"/api/v1/notifications/{notif.id}/")
        self.assertEqual(resp.status_code, 403)

    def test_readonly_can_read_notifications(self):
        Notification.objects.create(
            title="Test", notification_class=NotificationClass.SYSTEM,
            status=NotificationStatus.OPEN, urgency=UrgencyLevel.ROUTINE,
        )
        resp = self.client.get("/api/v1/notifications/")
        self.assertEqual(resp.status_code, 200)

    def test_readonly_cannot_create_referral(self):
        hh = Household.objects.create(organisation_unit=self.org)
        patient = Person.objects.create(full_name="Test Patient", household=hh, organisation_unit=self.org)
        resp = self.client.post("/api/v1/referrals/", {
            "patient": str(patient.id),
            "referral_reason": "Test",
        }, format="json")
        self.assertEqual(resp.status_code, 403)


class FacilityUserScopingTests(TestCase):
    """Test that facility-level users are scoped to their facility only."""

    def setUp(self):
        self.org1 = _make_org(name="Facility A", code="FAC_A01")
        self.org2 = _make_org(name="Facility B", code="FAC_B01")
        self.facility_user = _make_user(
            self.org1, role=SystemRole.FACILITY_CLINICAL_USER,
            username="facilityuser", is_super=False,
        )
        self.hh1 = Household.objects.create(organisation_unit=self.org1)
        self.hh2 = Household.objects.create(organisation_unit=self.org2)
        self.patient1 = Person.objects.create(
            full_name="Patient A", household=self.hh1, organisation_unit=self.org1,
        )
        self.patient2 = Person.objects.create(
            full_name="Patient B", household=self.hh2, organisation_unit=self.org2,
        )
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.facility_user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_facility_user_sees_only_own_patients(self):
        resp = self.client.get("/api/v1/clients/persons/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        results = data.get("results", data)
        patient_ids = [p["id"] for p in results]
        self.assertIn(str(self.patient1.id), patient_ids)
        self.assertNotIn(str(self.patient2.id), patient_ids)

    def test_facility_user_cannot_access_other_facility_patient(self):
        resp = self.client.get(f"/api/v1/clients/persons/{self.patient2.id}/")
        self.assertEqual(resp.status_code, 404)


class PermissionChangeAuditTests(TestCase):
    """Test that permission changes (assign_role, revoke_role) are audit logged."""

    def setUp(self):
        self.org = _make_org()
        self.admin = _make_user(self.org, role=SystemRole.DISTRICT_ADMIN, username="admin", is_super=False)
        self.target_user = _make_user(
            self.org, role=SystemRole.FACILITY_CLINICAL_USER,
            username="targetuser", is_super=False,
        )
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.admin)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_assign_role_creates_audit(self):
        resp = self.client.post(f"/api/v1/accounts/users/{self.target_user.id}/assign_role/", {
            "role_code": "MIDWIFE",
            "scope_unit": str(self.org.id),
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(
            AuditEvent.objects.filter(
                action="PERMISSION_CHANGE",
                metadata__action_type="ROLE_ASSIGNED",
                metadata__new_role="MIDWIFE",
            ).exists()
        )

    def test_revoke_role_creates_audit(self):
        scope = UserRoleScope.objects.create(
            user=self.target_user,
            role_code="MIDWIFE",
            scope_unit=self.org,
            assigned_by=self.admin,
        )
        resp = self.client.post(f"/api/v1/accounts/users/{self.target_user.id}/revoke_role/", {
            "scope_id": str(scope.id),
        }, format="json")
        self.assertEqual(resp.status_code, 204)
        self.assertTrue(
            AuditEvent.objects.filter(
                action="PERMISSION_CHANGE",
                metadata__action_type="ROLE_REVOKED",
            ).exists()
        )

    def test_non_admin_cannot_assign_role(self):
        readonly = _make_user(self.org, role=SystemRole.READ_ONLY, username="readonly2", is_super=False)
        client = APIClient()
        refresh = RefreshToken.for_user(readonly)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        resp = client.post(f"/api/v1/accounts/users/{self.target_user.id}/assign_role/", {
            "role_code": "MIDWIFE",
            "scope_unit": str(self.org.id),
        }, format="json")
        self.assertEqual(resp.status_code, 403)
