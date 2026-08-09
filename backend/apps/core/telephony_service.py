"""
Telephony gateway adapter interface (spec §17.3).

Because the live Ghana telecom/aggregator provider is not fixed, implement
a Protocol-based adapter so no business logic depends directly on a single
provider SDK.

Supported providers:
- Twilio (international fallback)
- Africa's Talking (Ghana-local)
- StubProvider (development/testing)

Webhook security: HMAC-SHA256 signature verification (spec §22).
"""
import hashlib
import hmac
import json
from dataclasses import dataclass, field
from typing import Optional, Protocol


@dataclass
class RawWebhook:
    """Raw webhook payload from a telephony provider."""
    provider: str
    headers: dict
    body: str
    body_dict: dict = field(default_factory=dict)


@dataclass
class VerifiedTelephonyEvent:
    """A verified telephony event extracted from a webhook."""
    provider: str
    event_type: str  # "call.started", "dtmf", "ussd.session", "ussd.response", "call.ended"
    session_id: str
    phone_number: str
    dtmf_key: Optional[str] = None
    ussd_text: Optional[str] = None
    question_code: Optional[str] = None
    language: Optional[str] = None
    raw_payload: dict = field(default_factory=dict)


@dataclass
class OutboundCallRequest:
    """Request to initiate an outbound call."""
    phone_number: str
    language: str = "english"
    prompt_pack_id: Optional[str] = None
    metadata: dict = field(default_factory=dict)


@dataclass
class NeutralSmsRequest:
    """Request to send a neutral (non-clinical) SMS."""
    phone_number: str
    message: str
    metadata: dict = field(default_factory=dict)


class TelephonyGateway(Protocol):
    """
    Telephony gateway protocol (spec §17.3).

    No business logic may depend directly on a single provider SDK.
    """

    def verify_webhook(self, request: RawWebhook) -> VerifiedTelephonyEvent:
        """Verify the webhook signature and extract the telephony event."""
        ...

    def begin_call(self, call: OutboundCallRequest) -> str:
        """Initiate an outbound call. Returns provider call ID."""
        ...

    def send_neutral_sms(self, request: NeutralSmsRequest) -> str:
        """Send a neutral SMS. Returns provider message ID."""
        ...


class StubTelephonyGateway:
    """
    Stub telephony gateway for development/testing.

    Does not verify signatures (always passes) and returns mock IDs.
    """

    def verify_webhook(self, request: RawWebhook) -> VerifiedTelephonyEvent:
        body = request.body_dict or {}
        return VerifiedTelephonyEvent(
            provider=request.provider,
            event_type=body.get("event_type", "dtmf"),
            session_id=body.get("session_id", "stub-session-001"),
            phone_number=body.get("phone_number", "0240000000"),
            dtmf_key=body.get("dtmf_key"),
            ussd_text=body.get("ussd_text"),
            question_code=body.get("question_code"),
            language=body.get("language", "english"),
            raw_payload=body,
        )

    def begin_call(self, call: OutboundCallRequest) -> str:
        return f"stub-call-{call.phone_number}"

    def send_neutral_sms(self, request: NeutralSmsRequest) -> str:
        return f"stub-sms-{request.phone_number}"


class TwilioGateway:
    """
    Twilio telephony gateway adapter (spec §17.3).

    Webhook security: Twilio uses HMAC-SHA256 with the auth token as key.
    The signature is sent in the `X-Twilio-Signature` header.
    """

    def __init__(self, auth_token: str, account_sid: str = ""):
        self.auth_token = auth_token
        self.account_sid = account_sid

    def verify_webhook(self, request: RawWebhook) -> VerifiedTelephonyEvent:
        # Verify HMAC-SHA256 signature (spec §22)
        signature_header = request.headers.get("X-Twilio-Signature", "")
        if not self._verify_signature(request, signature_header):
            raise ValueError("Invalid Twilio webhook signature")

        body = request.body_dict
        return VerifiedTelephonyEvent(
            provider="twilio",
            event_type=self._detect_event_type(body),
            session_id=body.get("CallSid", body.get("MessageSid", "")),
            phone_number=body.get("From", "").replace("whatsapp:", ""),
            dtmf_key=body.get("Digits"),
            ussd_text=body.get("UssdText"),
            question_code=body.get("question_code"),
            language=body.get("language", "english"),
            raw_payload=body,
        )

    def _verify_signature(self, request: RawWebhook, signature_header: str) -> bool:
        """
        Verify Twilio webhook signature.

        Twilio signs: URL + sorted POST params, HMAC-SHA256 with auth token.
        """
        if not self.auth_token:
            return True  # Skip verification if no token configured (dev mode)

        # Build the string to sign: URL + sorted params
        url = request.headers.get("X-Original-URL", "")
        params = request.body_dict or {}

        # Sort params by key and concatenate
        sorted_str = url
        for key in sorted(params.keys()):
            sorted_str += key + str(params[key])

        # Compute HMAC-SHA256
        computed = hmac.new(
            self.auth_token.encode(),
            sorted_str.encode(),
            hashlib.sha256,
        ).digest()

        # Compare with base64-encoded signature
        import base64
        expected = base64.b64encode(computed).decode()
        return hmac.compare_digest(expected, signature_header)

    def _detect_event_type(self, body: dict) -> str:
        if body.get("CallSid") and body.get("Digits"):
            return "dtmf"
        elif body.get("CallSid"):
            return "call.started"
        elif body.get("MessageSid"):
            return "call.ended"
        elif body.get("UssdText"):
            return "ussd.response"
        return "unknown"

    def begin_call(self, call: OutboundCallRequest) -> str:
        # In production, this would call the Twilio API
        return f"twilio-call-{call.phone_number}"

    def send_neutral_sms(self, request: NeutralSmsRequest) -> str:
        # In production, this would call the Twilio API
        return f"twilio-sms-{request.phone_number}"


class AfricasTalkingGateway:
    """
    Africa's Talking telephony gateway adapter (spec §17.3).

    Webhook security: Africa's Talking does not use HMAC by default;
    we add a shared-secret HMAC header for our webhook endpoint.
    """

    def __init__(self, api_key: str = "", shared_secret: str = ""):
        self.api_key = api_key
        self.shared_secret = shared_secret

    def verify_webhook(self, request: RawWebhook) -> VerifiedTelephonyEvent:
        # Verify HMAC-SHA256 with shared secret (spec §22)
        if self.shared_secret:
            signature_header = request.headers.get("X-AfricasTalking-Signature", "")
            if not self._verify_signature(request, signature_header):
                raise ValueError("Invalid Africa's Talking webhook signature")

        body = request.body_dict
        return VerifiedTelephonyEvent(
            provider="africas_talking",
            event_type=self._detect_event_type(body),
            session_id=body.get("sessionId", ""),
            phone_number=body.get("phoneNumber", ""),
            dtmf_key=body.get("dtmfDigits"),
            ussd_text=body.get("text"),
            question_code=body.get("question_code"),
            language=body.get("language", "english"),
            raw_payload=body,
        )

    def _verify_signature(self, request: RawWebhook, signature_header: str) -> bool:
        computed = hmac.new(
            self.shared_secret.encode(),
            request.body.encode(),
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(computed, signature_header)

    def _detect_event_type(self, body: dict) -> str:
        if body.get("sessionId") and body.get("dtmfDigits"):
            return "dtmf"
        elif body.get("sessionId") and body.get("text") is not None:
            return "ussd.response"
        elif body.get("sessionId"):
            return "call.started"
        return "unknown"

    def begin_call(self, call: OutboundCallRequest) -> str:
        return f"at-call-{call.phone_number}"

    def send_neutral_sms(self, request: NeutralSmsRequest) -> str:
        return f"at-sms-{request.phone_number}"


# --- USSD gateway integration (spec §17.5) ---

def route_ussd_session(session_id: str, phone_number: str, text: str, language: str = "english"):
    """
    Route a USSD session through the USSD navigator (spec §17.5).

    This integrates the telephony gateway with the USSD menu navigator.
    Providers (Africa's Talking, etc.) send USSD callbacks with
    concatenated input levels; this function parses them and delegates
    to the USSDNavigator.

    Args:
        session_id: Provider session ID
        phone_number: Caller phone number
        text: Concatenated USSD input (levels separated by '*')
        language: Preferred language

    Returns:
        (response_text, is_end) tuple
    """
    from apps.core.ussd_service import get_default_navigator

    navigator = get_default_navigator()

    # USSD providers (Africa's Talking, etc.) send the FULL accumulated text
    # on each callback, not just the latest input. For example:
    #   1st callback: text=""       → show main menu
    #   2nd callback: text="3"      → user selected 3, show emergency menu
    #   3rd callback: text="3*1"    → user selected 3 then 1, trigger bleeding
    #
    # To handle this correctly, we reset the session to the main menu and
    # replay all inputs from the beginning each time.
    navigator.end_session(session_id)
    session = navigator.start_session(phone_number, language)

    # Parse concatenated input — levels separated by '*'
    levels = text.split("*") if text else []
    response_text = ""
    is_end = False

    if not levels or (len(levels) == 1 and levels[0] == ""):
        # Initial request — show main menu
        response_text, is_end = navigator.handle_input(session, "")
    else:
        # Process each level of input from the beginning
        for level in levels:
            response_text, is_end = navigator.handle_input(session, level)
            if is_end:
                break

    if is_end:
        navigator.end_session(session_id)

    return response_text, is_end


# --- Provider registry ---

_providers: dict[str, TelephonyGateway] = {
    "stub": StubTelephonyGateway(),
}


def register_provider(name: str, gateway: TelephonyGateway) -> None:
    """Register a telephony provider gateway."""
    _providers[name] = gateway


def get_provider(name: str) -> Optional[TelephonyGateway]:
    """Get a registered telephony provider by name."""
    return _providers.get(name)


def get_available_providers() -> list[str]:
    """Get list of registered provider names."""
    return list(_providers.keys())
