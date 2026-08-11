"""
FCM (Firebase Cloud Messaging) push notification service (spec §22).

Sends push notifications to mobile devices via Firebase Cloud Messaging
HTTP v1 API using a service account JSON for authentication.

The service account JSON is stored in the FCM_SERVICE_ACCOUNT_JSON env var
(as a raw JSON string) and never exposed to the client.

Usage:
    from apps.notifications.fcm import send_push_notification
    send_push_notification(
        fcm_token="device_token_here",
        title="Emergency Alert",
        body="Patient requires immediate attention",
        data={"notification_id": str(uuid), "urgency": "EMERGENCY"},
    )
"""
import logging
import json
import time
import urllib.request
import urllib.error
import urllib.parse
from django.conf import settings

logger = logging.getLogger(__name__)

# FCM HTTP v1 endpoint template
FCM_V1_URL = "https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"

# OAuth2 token endpoint for service account
OAUTH2_TOKEN_URL = "https://oauth2.googleapis.com/token"

# Cache for the OAuth2 access token (tokens last ~1 hour)
_access_token_cache = {"token": None, "expires_at": 0}


def _get_service_account_info() -> dict | None:
    """Load the service account JSON from settings."""
    raw = getattr(settings, "FCM_SERVICE_ACCOUNT_JSON", "")
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError) as e:
        logger.error(f"FCM service account JSON parse error: {e}")
        return None


def _get_access_token() -> str | None:
    """Obtain an OAuth2 access token using the service account JSON.

    Uses JWT-based assertion as per Google's service account auth flow.
    Caches the token until 5 minutes before expiry.
    """
    # Return cached token if still valid
    if _access_token_cache["token"] and time.time() < _access_token_cache["expires_at"]:
        return _access_token_cache["token"]

    sa = _get_service_account_info()
    if not sa:
        return None

    import base64

    # Build the JWT assertion
    header = {"alg": "RS256", "typ": "JWT"}
    now = int(time.time())
    claim_set = {
        "iss": sa["client_email"],
        "scope": "https://www.googleapis.com/auth/firebase.messaging",
        "aud": OAUTH2_TOKEN_URL,
        "exp": now + 3600,
        "iat": now,
    }

    def b64url(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")

    header_b64 = b64url(json.dumps(header, separators=(",", ":")).encode())
    payload_b64 = b64url(json.dumps(claim_set, separators=(",", ":")).encode())
    signing_input = f"{header_b64}.{payload_b64}"

    # Sign with the private key using RSA-SHA256
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding
    except ImportError:
        logger.error("cryptography package not installed — cannot sign FCM JWT")
        return None

    private_key_pem = sa["private_key"].replace("\\n", "\n").encode()
    private_key = serialization.load_pem_private_key(private_key_pem, password=None)
    signature = private_key.sign(
        signing_input.encode(),
        padding.PKCS1v15(),
        hashes.SHA256(),
    )
    signature_b64 = b64url(signature)

    jwt_assertion = f"{signing_input}.{signature_b64}"

    # Exchange the JWT for an access token
    payload = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": jwt_assertion,
    }).encode()

    try:
        req = urllib.request.Request(
            OAUTH2_TOKEN_URL,
            data=payload,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            result = json.loads(response.read().decode("utf-8"))
            token = result.get("access_token")
            expires_in = result.get("expires_in", 3600)
            if token:
                _access_token_cache["token"] = token
                _access_token_cache["expires_at"] = time.time() + expires_in - 300
                return token
    except Exception as e:
        logger.error(f"FCM OAuth2 token fetch failed: {e}")
        return None

    return None


def send_push_notification(
    fcm_token: str,
    title: str,
    body: str,
    data: dict | None = None,
    urgency: str = "ROUTINE",
) -> dict:
    """Send a push notification via FCM HTTP v1 API (spec §22).

    Args:
        fcm_token: The device's FCM registration token
        title: Notification title
        body: Notification body text
        data: Optional data payload (delivered to the app even in background)
        urgency: Urgency level — affects notification priority on Android

    Returns:
        dict with 'success' (bool) and 'message_id' or 'error'
    """
    sa = _get_service_account_info()
    if not sa:
        logger.warning("FCM_SERVICE_ACCOUNT_JSON not configured — push notification not sent")
        return {"success": False, "error": "FCM_SERVICE_ACCOUNT_JSON not configured"}

    if not fcm_token:
        return {"success": False, "error": "No FCM token provided"}

    access_token = _get_access_token()
    if not access_token:
        return {"success": False, "error": "Failed to obtain FCM access token"}

    # Android notification priority based on urgency
    priority = "HIGH" if urgency in ("EMERGENCY", "PRIORITY") else "NORMAL"

    # Build the HTTP v1 message payload
    message = {
        "token": fcm_token,
        "notification": {
            "title": title,
            "body": body,
        },
        "android": {
            "priority": priority,
            "notification": {
                "channel_id": f"mch_{urgency.lower()}",
                "notification_priority": "PRIORITY_MAX" if urgency == "EMERGENCY" else "PRIORITY_DEFAULT",
                "default_sound": True,
                "tag": urgency.lower(),
            },
        },
    }

    if data:
        # HTTP v1 requires data values to be strings
        message["data"] = {k: str(v) for k, v in data.items()}

    url = FCM_V1_URL.format(project_id=sa["project_id"])

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps({"message": message}).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            result = json.loads(response.read().decode("utf-8"))
            message_name = result.get("name", "")
            return {"success": True, "message_id": message_name}
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        logger.error(f"FCM HTTP error {e.code}: {error_body}")
        return {"success": False, "error": f"HTTP {e.code}: {error_body}"}
    except urllib.error.URLError as e:
        logger.error(f"FCM network error: {e.reason}")
        return {"success": False, "error": str(e.reason)}
    except Exception as e:
        logger.error(f"FCM unexpected error: {e}")
        return {"success": False, "error": str(e)}


def send_push_to_user(user_id, title: str, body: str, data: dict | None = None, urgency: str = "ROUTINE") -> list:
    """Send push notifications to all active devices at the user's facility.

    Devices are registered against the user's organisation unit (facility),
    not directly against the user. This sends to all non-revoked devices
    at the same facility that have an FCM token.

    Args:
        user_id: The UserAccount UUID
        title: Notification title
        body: Notification body text
        data: Optional data payload
        urgency: Urgency level

    Returns:
        List of results (one per device with an FCM token)
    """
    from apps.accounts.models import Device, UserAccount

    try:
        user = UserAccount.objects.get(id=user_id)
    except UserAccount.DoesNotExist:
        return [{"success": False, "error": "User not found"}]

    if not user.organisation_unit_id:
        return [{"success": False, "error": "User has no organisation unit"}]

    devices = Device.objects.filter(
        facility_id=user.organisation_unit_id,
        is_revoked=False,
    ).exclude(fcm_token="")

    results = []
    for device in devices:
        result = send_push_notification(device.fcm_token, title, body, data, urgency)
        results.append(result)

    if not results:
        return [{"success": False, "error": "No devices with FCM tokens at this facility"}]

    return results
