"""
Telephony webhook API endpoints (spec §17, §22).

POST /api/v1/telephony/webhooks/{provider}
  - Receives webhooks from telephony providers (Twilio, Africa's Talking)
  - Verifies HMAC-SHA256 signature (spec §22)
  - Extracts DTMF/USSD events
  - Creates/updates telephony sessions
  - Maps responses to clinical facts
  - Triggers emergency cascade if needed (spec §17.4)

GET  /api/v1/telephony/prompt-packs
  - Lists active prompt packs by language

GET  /api/v1/telephony/prompt-packs/{language}
  - Gets the active prompt pack for a specific language
"""
import json
import uuid

from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.telephony_models import PromptPack, TelephonySession, RemoteObservation
from apps.core.telephony_service import (
    RawWebhook, get_provider, get_available_providers,
)
from apps.audit.services import log_audit
from apps.clients.models import Person


def _prompt_pack_to_dict(pack):
    """Serialize a PromptPack to a dict."""
    return {
        "id": str(pack.id),
        "packId": pack.pack_id,
        "name": pack.name,
        "version": pack.version,
        "language": pack.language,
        "status": pack.status,
        "description": pack.description,
        "prompts": pack.prompts,
        "approvedBy": pack.approved_by,
        "approvedAt": pack.approved_at.isoformat() if pack.approved_at else None,
        "backTranslated": pack.back_translated,
        "comprehensionTested": pack.comprehension_tested,
    }


def _session_to_dict(session):
    """Serialize a TelephonySession to a dict."""
    return {
        "id": str(session.id),
        "sessionId": session.session_id,
        "channel": session.channel,
        "provider": session.provider,
        "phoneNumber": session.phone_number,
        "patientId": str(session.patient_id) if session.patient_id else None,
        "language": session.language,
        "status": session.status,
        "currentQuestionCode": session.current_question_code,
        "responses": session.responses,
        "startedAt": session.started_at.isoformat() if session.started_at else None,
        "endedAt": session.ended_at.isoformat() if session.ended_at else None,
        "durationSeconds": session.duration_seconds,
        "triggeredEmergency": session.triggered_emergency,
    }


class TelephonyWebhookView(APIView):
    """
    POST /api/v1/telephony/webhooks/{provider} — receive telephony webhooks (spec §17, §22).

    Webhook security: HMAC-SHA256 signature verification (spec §22).
    The provider adapter verifies the signature before processing.

    Permission is AllowAny because webhooks come from external providers,
    but the HMAC signature provides authentication.
    """
    permission_classes = [AllowAny]

    def post(self, request, provider):
        # Get the provider gateway
        gateway = get_provider(provider)
        if not gateway:
            return Response(
                {"error": f"Unknown telephony provider: {provider}. Available: {get_available_providers()}"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Build raw webhook
        try:
            body_dict = request.data if hasattr(request, 'data') else {}
            body_str = json.dumps(body_dict) if body_dict else request.body.decode('utf-8', errors='ignore')
        except Exception:
            body_dict = {}
            body_str = ""

        raw = RawWebhook(
            provider=provider,
            headers=dict(request.headers),
            body=body_str,
            body_dict=body_dict,
        )

        # Verify webhook signature and extract event (spec §22)
        try:
            event = gateway.verify_webhook(raw)
        except ValueError as e:
            log_audit(
                actor=provider,
                action="TELEPHONY_WEBHOOK_SIGNATURE_FAILED",
                purpose="SYSTEM_SECURITY",
                metadata={"provider": provider, "error": str(e)},
            )
            return Response({"error": "Webhook signature verification failed"},
                          status=status.HTTP_401_UNAUTHORIZED)
        except Exception as e:
            return Response({"error": f"Webhook processing error: {str(e)}"},
                          status=status.HTTP_400_BAD_REQUEST)

        # Process the event
        session = self._get_or_create_session(event)
        if session:
            self._process_event(event, session)

        log_audit(
            actor=provider,
            action="TELEPHONY_WEBHOOK_RECEIVED",
            purpose="DIRECT_CARE",
            metadata={
                "eventType": event.event_type,
                "sessionId": event.session_id,
                "phoneNumber": event.phone_number,
            },
        )

        # Return a response appropriate for the provider
        # For IVR: Twilio expects TwiML; Africa's Talking expects a text response
        if provider == "twilio":
            # Return minimal TwiML
            return Response(
                {"Response": {"Say": "Thank you."}},
                content_type="application/xml",
            )
        else:
            return Response({"status": "processed", "sessionId": event.session_id})

    def _get_or_create_session(self, event):
        """Get or create a telephony session for the event."""
        if not event.session_id:
            return None

        session = TelephonySession.objects.filter(session_id=event.session_id).first()
        if session:
            return session

        # Try to identify patient by phone number
        patient = None
        if event.phone_number:
            # Normalize phone number (strip whitespace, leading +)
            normalized = event.phone_number.strip().lstrip("+")
            patient = Person.objects.filter(phone=normalized).first()
            if not patient:
                patient = Person.objects.filter(alternate_phone=normalized).first()

        channel = "USSD" if event.ussd_text is not None else "IVR"
        return TelephonySession.objects.create(
            session_id=event.session_id,
            channel=channel,
            provider=event.provider,
            phone_number=event.phone_number,
            patient=patient,
            language=event.language or "english",
            status="IN_PROGRESS",
        )

    def _process_event(self, event, session):
        """Process a telephony event and create observations."""
        # Update session state
        if event.question_code:
            session.current_question_code = event.question_code
            session.save(update_fields=["current_question_code", "updated_at"])

        # Record DTMF/USSD response
        if event.dtmf_key or event.ussd_text:
            response_key = event.dtmf_key or event.ussd_text or ""
            session.add_response(event.question_code or "", response_key)

            # Create a remote observation (spec §17, §8.2)
            RemoteObservation.objects.create(
                session=session,
                patient=session.patient,
                question_code=event.question_code or "",
                response_key=response_key,
                capture_route="IVR_DTMF" if event.dtmf_key else "USSD",
                source_prompt_id=event.question_code or "",
            )

        # Handle call ended
        if event.event_type == "call.ended":
            session.complete()


class PromptPackListView(APIView):
    """GET /api/v1/telephony/prompt-packs — list active prompt packs (spec §17.2)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        packs = PromptPack.get_active_packs()
        language = request.query_params.get("language")
        if language:
            packs = packs.filter(language=language)

        entries = [_prompt_pack_to_dict(p) for p in packs]

        log_audit(
            actor=request.user.username,
            action="PROMPT_PACK_LIST",
            actor_role=request.user.system_role,
            purpose="DIRECT_CARE",
            metadata={"language": language or "", "result_count": len(entries)},
        )

        return Response({"results": entries, "count": len(entries)})


class PromptPackByLanguageView(APIView):
    """GET /api/v1/telephony/prompt-packs/{language} — get active pack for a language."""
    permission_classes = [IsAuthenticated]

    def get(self, request, language):
        pack = PromptPack.get_active_pack(language)
        if not pack:
            return Response({"error": f"No active prompt pack for language: {language}"},
                          status=status.HTTP_404_NOT_FOUND)

        return Response(_prompt_pack_to_dict(pack))


class TelephonySessionListView(APIView):
    """GET /api/v1/telephony/sessions — list telephony sessions."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = TelephonySession.objects.all()
        phone = request.query_params.get("phone")
        if phone:
            qs = qs.filter(phone_number=phone)

        patient_id = request.query_params.get("patientId")
        if patient_id:
            try:
                uid = uuid.UUID(str(patient_id))
                qs = qs.filter(patient_id=uid)
            except (ValueError, TypeError):
                pass

        count = request.query_params.get("_count", "50")
        try:
            count = min(int(count), 200)
        except ValueError:
            count = 50

        sessions = list(qs[:count])
        entries = [_session_to_dict(s) for s in sessions]

        return Response({"results": entries, "count": len(entries)})
