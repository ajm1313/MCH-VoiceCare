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

from django.utils import timezone

from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.telephony_models import PromptPack, TelephonySession, RemoteObservation
from apps.core.telephony_service import (
    RawWebhook, get_provider, get_available_providers, route_ussd_session,
)
from apps.core.telephony_audio import AudioAsset, AudioAssetManager, AudioUploadMetadata
from apps.core.telephony_prompts import (
    PromptPackBuilder, ensure_prompt_pack_consistency, validate_prompt_pack,
    SUPPORTED_LANGUAGES, REQUIRED_PROMPT_IDS,
)
from apps.core.ussd_service import get_default_navigator, EMERGENCY_ACTION_MAP
from apps.core.permissions import user_can_write
from apps.audit.services import log_audit
from apps.clients.models import Person
from apps.core.emergency_cascade import trigger_emergency_cascade


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

            # Check if this response triggers an emergency (spec §17.4)
            # Emergency question codes start with DANGER_ and the response
            # indicates a danger sign is present
            if self._is_emergency_response(event, response_key):
                session.mark_emergency()
                cascade = trigger_emergency_cascade(
                    danger_sign=self._extract_danger_sign(event, response_key),
                    question_code=event.question_code or "",
                    phone_number=event.phone_number or "",
                    patient=session.patient,
                    session_id=session.session_id,
                    provider=event.provider or "",
                )
                # Log the cascade result
                log_audit(
                    actor=event.provider or "telephony",
                    action="EMERGENCY_CASCADE_TRIGGERED",
                    purpose="DIRECT_CARE",
                    patient_id=session.patient.id if session.patient else None,
                    metadata={
                        "session_id": session.session_id,
                        "alert_id": cascade["alert_id"],
                        "referral_id": cascade["referral_id"],
                        "facility_notified": cascade["facility_notified"],
                        "notification_phone": cascade["notification_phone"],
                    },
                )

        # Handle call ended
        if event.event_type == "call.ended":
            session.complete()

    def _is_emergency_response(self, event, response_key) -> bool:
        """Check if a telephony response triggers an emergency (spec §17.4)."""
        question_code = event.question_code or ""
        # Danger sign question codes start with DANGER_
        if not question_code.startswith("DANGER_"):
            return False
        # A non-zero, non-empty response indicates the danger sign is present
        # For DTMF: key "1" = yes, "0" = no
        # For USSD: the emergency menu selections trigger directly
        return response_key in ("1", "yes", "YES", "true", "TRUE")

    def _extract_danger_sign(self, event, response_key) -> str:
        """Extract the danger sign from the event question code."""
        question_code = event.question_code or ""
        # Map DANGER_* codes to danger signs
        danger_map = {
            "DANGER_BLEEDING": "bleeding",
            "DANGER_FEVER": "fever",
            "DANGER_HEADACHE": "severe_headache",
            "DANGER_CONVULSIONS": "convulsion",
            "DANGER_BREATHING": "breathing",
            "DANGER_OTHER": "other_danger",
        }
        return danger_map.get(question_code, "other_danger")


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


# ── USSD endpoint (spec §17.5) ──

class USSDEndpointView(APIView):
    """
    POST /api/v1/telephony/ussd — USSD menu navigation endpoint (spec §17.5).

    Accepts: sessionId, phoneNumber, text (concatenated input levels)
    Returns: USSD response text (continue or end)

    Integrates with USSDNavigator for menu tree navigation.
    USSD providers (Africa's Talking, etc.) send callbacks with
    concatenated input levels separated by '*'.
    """
    permission_classes = [AllowAny]  # USSD callbacks come from providers

    def post(self, request):
        session_id = request.data.get("sessionId", "")
        phone_number = request.data.get("phoneNumber", "")
        text = request.data.get("text", "")
        language = request.data.get("language", "english")

        if not session_id:
            return Response(
                {"error": "sessionId is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Route through the USSD navigator via the telephony service
        response_text, is_end = route_ussd_session(
            session_id, phone_number, text, language,
        )

        # Log the USSD interaction
        log_audit(
            actor=phone_number or "ussd",
            action="USSD_SESSION_INPUT",
            purpose="DIRECT_CARE",
            metadata={
                "sessionId": session_id,
                "phoneNumber": phone_number,
                "input": text,
                "isEnd": is_end,
            },
        )

        # Check if an emergency was triggered during USSD navigation (spec §17.4)
        navigator = get_default_navigator()
        ussd_session = navigator._sessions.get(session_id)
        if ussd_session and ussd_session.state.get("emergency"):
            emergency_info = ussd_session.state["emergency"]
            danger_sign = emergency_info.get("danger_sign", "unknown")
            question_code = emergency_info.get("question_code", "")

            # Try to identify patient by phone number
            patient = None
            if phone_number:
                normalized = phone_number.strip().lstrip("+")
                patient = Person.objects.filter(phone=normalized).first()
                if not patient:
                    patient = Person.objects.filter(alternate_phone=normalized).first()

            cascade = trigger_emergency_cascade(
                danger_sign=danger_sign,
                question_code=question_code,
                phone_number=phone_number,
                patient=patient,
                session_id=session_id,
                provider="ussd",
            )

            # Append the emergency advice to the USSD response
            response_text = cascade["advice"]

            log_audit(
                actor=phone_number or "ussd",
                action="EMERGENCY_CASCADE_TRIGGERED",
                purpose="DIRECT_CARE",
                patient_id=patient.id if patient else None,
                metadata={
                    "session_id": session_id,
                    "danger_sign": danger_sign,
                    "alert_id": cascade["alert_id"],
                    "referral_id": cascade["referral_id"],
                    "facility_notified": cascade["facility_notified"],
                },
            )

        # Return in the format expected by USSD providers
        # Africa's Talking expects: {"text": "...", "responseType": "END"|"CONTINUE"}
        # Some providers expect plain text with "CON " or "END " prefix
        response_type = "END" if is_end else "CONTINUE"
        return Response({
            "text": response_text,
            "responseType": response_type,
            "sessionId": session_id,
        })


# ── Prompt pack upload endpoint (admin only) ──

class PromptPackUploadView(APIView):
    """
    POST /api/v1/telephony/prompt-packs — upload a new prompt pack (admin only, spec §17.2).

    Accepts prompt pack configuration and builds a complete pack using
    the PromptPackBuilder. Only admin users can upload new prompt packs.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # Only admin users can upload prompt packs
        if not user_can_write(request.user):
            return Response(
                {"error": "Only admin users can upload prompt packs"},
                status=status.HTTP_403_FORBIDDEN,
            )

        language = request.data.get("language", "")
        if language not in SUPPORTED_LANGUAGES:
            return Response(
                {"error": f"Unsupported language. Supported: {SUPPORTED_LANGUAGES}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        prompts_config = request.data.get("promptsConfig")
        approved_by = request.data.get("approvedBy", request.user.username)
        back_translated = request.data.get("backTranslated", False)
        comprehension_tested = request.data.get("comprehensionTested", False)

        try:
            pack = PromptPackBuilder.build_prompt_pack(language, prompts_config)
            pack.approved_by = approved_by
            pack.back_translated = back_translated
            pack.comprehension_tested = comprehension_tested
            if approved_by:
                pack.approved_at = timezone.now()
            pack.save(update_fields=[
                "approved_by", "approved_at", "back_translated",
                "comprehension_tested", "updated_at",
            ])
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # Validate consistency
        missing = ensure_prompt_pack_consistency(pack)
        is_valid, issues = validate_prompt_pack(pack)

        log_audit(
            actor=request.user.username,
            action="PROMPT_PACK_UPLOADED",
            actor_role=request.user.system_role,
            purpose="SYSTEM_CONFIG",
            metadata={
                "packId": pack.pack_id,
                "language": language,
                "missingPrompts": missing,
                "isValid": is_valid,
            },
        )

        result = _prompt_pack_to_dict(pack)
        result["missingPrompts"] = missing
        result["validationIssues"] = issues
        result["isValid"] = is_valid
        return Response(result, status=status.HTTP_201_CREATED)


# ── Audio asset serving endpoint ──

class AudioAssetView(APIView):
    """
    GET /api/v1/telephony/audio/{asset_id} — serve audio file metadata/URL (spec §17.2).

    Returns the audio asset metadata and storage URL. In production,
    this would redirect to a signed S3 URL or stream the file.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, asset_id):
        asset = AudioAssetManager.get_asset(asset_id)
        if not asset:
            return Response(
                {"error": f"Audio asset not found: {asset_id}"},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response({
            "audioAssetId": asset.audio_asset_id,
            "language": asset.language,
            "promptId": asset.prompt_id,
            "contentType": asset.content_type,
            "durationSeconds": asset.duration_seconds,
            "fileSizeBytes": asset.file_size_bytes,
            "storageUrl": asset.storage_url,
            "recordedBy": asset.recorded_by,
            "approvedBy": asset.approved_by,
            "approvedAt": asset.approved_at.isoformat() if asset.approved_at else None,
            "backTranslated": asset.back_translated,
            "comprehensionTested": asset.comprehension_tested,
            "checksumSha256": asset.checksum_sha256,
            "version": asset.version,
            "isActive": asset.is_active,
        })


class AudioAssetUploadView(APIView):
    """
    POST /api/v1/telephony/audio — upload a new audio asset (spec §17.2).

    Accepts multipart file upload with metadata. Only admin users can upload.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not user_can_write(request.user):
            return Response(
                {"error": "Only admin users can upload audio assets"},
                status=status.HTTP_403_FORBIDDEN,
            )

        language = request.data.get("language", "")
        prompt_id = request.data.get("promptId", "")
        if not language or not prompt_id:
            return Response(
                {"error": "language and promptId are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if language not in SUPPORTED_LANGUAGES:
            return Response(
                {"error": f"Unsupported language. Supported: {SUPPORTED_LANGUAGES}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get file bytes from upload or raw body
        file_obj = request.FILES.get("file")
        if file_obj:
            file_bytes = file_obj.read()
            content_type = file_obj.content_type or "audio/mpeg"
        else:
            file_bytes = request.body or b""
            content_type = "audio/mpeg"

        if not file_bytes:
            return Response(
                {"error": "No audio file provided"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        metadata = AudioUploadMetadata(
            language=language,
            prompt_id=prompt_id,
            recorded_by=request.data.get("recordedBy", request.user.username),
            content_type=content_type,
            duration_seconds=float(request.data.get("durationSeconds", 0)),
            approved_by=request.data.get("approvedBy", ""),
            back_translated=request.data.get("backTranslated", False),
            comprehension_tested=request.data.get("comprehensionTested", False),
            version=int(request.data.get("version", 1)),
        )

        asset = AudioAssetManager.upload_audio(file_bytes, metadata)

        log_audit(
            actor=request.user.username,
            action="AUDIO_ASSET_UPLOADED",
            actor_role=request.user.system_role,
            purpose="SYSTEM_CONFIG",
            metadata={
                "audioAssetId": asset.audio_asset_id,
                "language": language,
                "promptId": prompt_id,
                "version": asset.version,
            },
        )

        return Response({
            "audioAssetId": asset.audio_asset_id,
            "language": asset.language,
            "promptId": asset.prompt_id,
            "checksumSha256": asset.checksum_sha256,
            "fileSizeBytes": asset.file_size_bytes,
            "version": asset.version,
            "isActive": asset.is_active,
        }, status=status.HTTP_201_CREATED)
