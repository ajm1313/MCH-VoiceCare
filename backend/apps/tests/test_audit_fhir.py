"""
Tests for notification actions, audit logging (login/logout/patient search),
and FHIR R4 API endpoints (spec §18.4, §20.1, §23).
"""
import uuid

from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.enums import (
    SystemRole, NotificationClass, NotificationStatus, UrgencyLevel,
)
from apps.organisations.models import OrganisationUnit
from apps.accounts.models import UserAccount
from apps.clients.models import Person, Household
from apps.notifications.models import Notification, ActionRecord
from apps.audit.models import AuditEvent


def _make_org():
    return OrganisationUnit.objects.create(
        name="Test Facility", code="AUDITTEST01", unit_type="FACILITY",
    )

def _make_user(org, role=SystemRole.SUPER_ADMIN, is_super=True, username="audituser"):
    return UserAccount.objects.create_user(
        username=username, password="testpass123",
        organisation_unit=org, system_role=role, is_super_admin=is_super,
    )

def _make_patient(org, name="Audit Patient"):
    hh = Household.objects.create(organisation_unit=org)
    return Person.objects.create(full_name=name, household=hh, organisation_unit=org)


class NotificationActionTests(TestCase):

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org, username="notifuser")
        self.notification = Notification.objects.create(
            title="Test Emergency",
            notification_class=NotificationClass.EMERGENCY,
            status=NotificationStatus.OPEN,
            urgency=UrgencyLevel.EMERGENCY,
        )
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_acknowledge_notification(self):
        resp = self.client.post(f"/api/v1/notifications/{self.notification.id}/acknowledge/")
        self.assertEqual(resp.status_code, 200)
        self.notification.refresh_from_db()
        self.assertEqual(self.notification.status, NotificationStatus.ACKNOWLEDGED)

    def test_acknowledge_creates_action_record(self):
        self.client.post(f"/api/v1/notifications/{self.notification.id}/acknowledge/")
        self.assertTrue(
            ActionRecord.objects.filter(
                notification=self.notification, action_type="ACKNOWLEDGED"
            ).exists()
        )

    def test_acknowledge_creates_audit(self):
        self.client.post(f"/api/v1/notifications/{self.notification.id}/acknowledge/")
        self.assertTrue(
            AuditEvent.objects.filter(action="NOTIFICATION_ACKNOWLEDGED").exists()
        )

    def test_acknowledge_only_open(self):
        self.notification.status = NotificationStatus.ACKNOWLEDGED
        self.notification.save()
        resp = self.client.post(f"/api/v1/notifications/{self.notification.id}/acknowledge/")
        self.assertEqual(resp.status_code, 409)

    def test_resolve_notification(self):
        resp = self.client.post(f"/api/v1/notifications/{self.notification.id}/resolve/")
        self.assertEqual(resp.status_code, 200)
        self.notification.refresh_from_db()
        self.assertEqual(self.notification.status, NotificationStatus.ACTED)

    def test_resolve_already_resolved(self):
        self.notification.status = NotificationStatus.ACTED
        self.notification.save()
        resp = self.client.post(f"/api/v1/notifications/{self.notification.id}/resolve/")
        self.assertEqual(resp.status_code, 409)

    def test_escalate_notification(self):
        resp = self.client.post(f"/api/v1/notifications/{self.notification.id}/escalate/", {
            "urgency": UrgencyLevel.EMERGENCY,
            "notes": "Escalating due to worsening condition",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.notification.refresh_from_db()
        self.assertEqual(self.notification.urgency, UrgencyLevel.EMERGENCY)

    def test_escalate_creates_audit(self):
        self.client.post(f"/api/v1/notifications/{self.notification.id}/escalate/", {
            "urgency": UrgencyLevel.EMERGENCY,
        }, format="json")
        self.assertTrue(
            AuditEvent.objects.filter(action="NOTIFICATION_ESCALATED").exists()
        )


class AuditLoggingTests(TestCase):

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org, username="auditlogin")
        self.patient = _make_patient(self.org, name="Searchable Patient")
        self.client = APIClient()

    def test_login_creates_audit(self):
        resp = self.client.post("/api/v1/accounts/auth/login/", {
            "username": "auditlogin",
            "password": "testpass123",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(AuditEvent.objects.filter(action="LOGIN", actor="auditlogin").exists())

    def test_logout_creates_audit(self):
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        resp = self.client.post("/api/v1/accounts/auth/logout/", {
            "refresh_token": str(refresh),
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(AuditEvent.objects.filter(action="LOGOUT", actor="auditlogin").exists())

    def test_patient_search_creates_audit(self):
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        resp = self.client.get("/api/v1/clients/persons/search/?q=Searchable")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(
            AuditEvent.objects.filter(action="PATIENT_SEARCH").exists()
        )

    def test_patient_open_creates_audit(self):
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        resp = self.client.get(f"/api/v1/clients/persons/{self.patient.id}/")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(
            AuditEvent.objects.filter(
                action="PATIENT_OPEN", entity_id=str(self.patient.id)
            ).exists()
        )


class FHIRAPITests(TestCase):

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org, username="fhiruser")
        self.patient = _make_patient(self.org, name="FHIR Test Patient")
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_capability_statement(self):
        resp = self.client.get("/fhir/R4/metadata")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "CapabilityStatement")
        self.assertEqual(data["fhirVersion"], "4.0.1")

    def test_patient_search(self):
        resp = self.client.get("/fhir/R4/Patient?name=FHIR")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "Bundle")
        self.assertEqual(data["type"], "searchset")
        self.assertTrue(data["total"] >= 1)

    def test_patient_search_by_id(self):
        resp = self.client.get(f"/fhir/R4/Patient?_id={self.patient.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["total"], 1)

    def test_patient_read(self):
        resp = self.client.get(f"/fhir/R4/Patient/{self.patient.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["resourceType"], "Patient")
        self.assertEqual(data["id"], str(self.patient.id))

    def test_patient_read_not_found(self):
        fake_id = uuid.uuid4()
        resp = self.client.get(f"/fhir/R4/Patient/{fake_id}")
        self.assertEqual(resp.status_code, 404)
        data = resp.json()
        self.assertEqual(data["resourceType"], "OperationOutcome")

    def test_patient_read_invalid_uuid(self):
        resp = self.client.get("/fhir/R4/Patient/not-a-uuid")
        self.assertEqual(resp.status_code, 400)

    def test_fhir_patient_search_creates_audit(self):
        self.client.get("/fhir/R4/Patient?name=FHIR")
        self.assertTrue(
            AuditEvent.objects.filter(action="FHIR_PATIENT_SEARCH").exists()
        )

    def test_fhir_patient_read_creates_audit(self):
        self.client.get(f"/fhir/R4/Patient/{self.patient.id}")
        self.assertTrue(
            AuditEvent.objects.filter(action="FHIR_PATIENT_READ").exists()
        )

    def test_fhir_patient_has_name(self):
        resp = self.client.get(f"/fhir/R4/Patient/{self.patient.id}")
        data = resp.json()
        self.assertIn("name", data)
        self.assertEqual(data["name"][0]["family"], "FHIR Test Patient")
