"""Tests for FCM push notification service (spec §22)."""
from django.test import TestCase, override_settings
from unittest.mock import patch, MagicMock
import json

from apps.notifications.fcm import send_push_notification, send_push_to_user
from apps.accounts.models import UserAccount, Device
from apps.organisations.models import OrganisationUnit

# A minimal service account JSON for testing
TEST_SERVICE_ACCOUNT = json.dumps({
    "type": "service_account",
    "project_id": "mchvoicecare-test",
    "private_key_id": "test_key_id",
    "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCdoj2gywvnECAh\n-----END PRIVATE KEY-----\n",
    "client_email": "firebase-adminsdk-test@mchvoicecare-test.iam.gserviceaccount.com",
    "client_id": "123456789",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-test%40mchvoicecare-test.iam.gserviceaccount.com",
    "universe_domain": "googleapis.com",
})


@override_settings(FCM_SERVICE_ACCOUNT_JSON=TEST_SERVICE_ACCOUNT)
class FCMServiceTests(TestCase):
    """Test FCM push notification sending."""

    def setUp(self):
        self.org = OrganisationUnit.objects.create(
            name="Test Facility", code="FAC001", unit_type="FACILITY"
        )
        self.user = UserAccount.objects.create_user(
            username="testuser", password="testpass123", organisation_unit=self.org
        )
        self.device = Device.objects.create(
            device_id="device_001",
            facility=self.org,
            fcm_token="fcm_token_abc123",
        )

    @patch("apps.notifications.fcm._get_access_token", return_value="test_access_token")
    def test_send_push_notification_success(self, mock_token):
        """Successfully send a push notification."""
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "name": "projects/mchvoicecare-test/messages/msg_123",
        }).encode()
        mock_response.__enter__ = MagicMock(return_value=mock_response)
        mock_response.__exit__ = MagicMock(return_value=False)

        with patch("urllib.request.urlopen", return_value=mock_response):
            result = send_push_notification(
                fcm_token="fcm_token_abc123",
                title="Test Alert",
                body="This is a test",
                data={"notification_id": "123"},
            )

        self.assertTrue(result["success"])
        self.assertIn("msg_123", result["message_id"])

    def test_send_push_notification_no_service_account(self):
        """Returns error when FCM_SERVICE_ACCOUNT_JSON is not configured."""
        with override_settings(FCM_SERVICE_ACCOUNT_JSON=""):
            result = send_push_notification(
                fcm_token="fcm_token_abc123",
                title="Test",
                body="Test",
            )
        self.assertFalse(result["success"])
        self.assertIn("not configured", result["error"])

    @patch("apps.notifications.fcm._get_access_token", return_value="test_access_token")
    def test_send_push_notification_no_token(self, mock_token):
        """Returns error when no FCM token is provided."""
        result = send_push_notification(
            fcm_token="",
            title="Test",
            body="Test",
        )
        self.assertFalse(result["success"])
        self.assertIn("No FCM token", result["error"])

    @patch("apps.notifications.fcm._get_access_token", return_value="test_access_token")
    def test_send_push_notification_emergency_priority(self, mock_token):
        """Emergency urgency uses high priority."""
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "name": "projects/mchvoicecare-test/messages/msg_456",
        }).encode()
        mock_response.__enter__ = MagicMock(return_value=mock_response)
        mock_response.__exit__ = MagicMock(return_value=False)

        with patch("urllib.request.urlopen", return_value=mock_response) as mock_urlopen:
            send_push_notification(
                fcm_token="fcm_token_abc123",
                title="Emergency",
                body="Patient needs help",
                urgency="EMERGENCY",
            )

        # Verify the request was made with high priority
        call_args = mock_urlopen.call_args[0][0]
        body = json.loads(call_args.data.decode())
        self.assertEqual(body["message"]["android"]["priority"], "HIGH")

    @patch("apps.notifications.fcm._get_access_token", return_value="test_access_token")
    def test_send_push_notification_http_error(self, mock_token):
        """Handles HTTP errors from FCM."""
        import urllib.error
        import io
        mock_error = urllib.error.HTTPError(
            url="https://fcm.googleapis.com/v1/projects/mchvoicecare-test/messages:send",
            code=401,
            msg="Unauthorized",
            hdrs={"Content-Type": "application/json"},
            fp=io.BytesIO(b'{"error": {"message": "Request had invalid authentication credentials"}}'),
        )

        with patch("urllib.request.urlopen", side_effect=mock_error):
            result = send_push_notification(
                fcm_token="fcm_token_abc123",
                title="Test",
                body="Test",
            )
        self.assertFalse(result["success"])
        self.assertIn("401", result["error"])

    @patch("apps.notifications.fcm._get_access_token", return_value="test_access_token")
    def test_send_push_to_user(self, mock_token):
        """Send push to all devices of a user."""
        self.user.organisation_unit = self.org
        self.user.save()

        # Create a second device on the same facility
        Device.objects.create(
            device_id="device_002",
            facility=self.org,
            fcm_token="fcm_token_xyz",
        )

        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "name": "projects/mchvoicecare-test/messages/msg_789",
        }).encode()
        mock_response.__enter__ = MagicMock(return_value=mock_response)
        mock_response.__exit__ = MagicMock(return_value=False)

        with patch("urllib.request.urlopen", return_value=mock_response):
            results = send_push_to_user(
                user_id=self.user.id,
                title="Alert",
                body="Test message",
            )

        # Should have results for devices with fcm_tokens
        self.assertGreaterEqual(len(results), 1)
        for r in results:
            self.assertTrue(r["success"])
