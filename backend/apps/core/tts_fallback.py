"""
TTS fallback for telephony audio prompts (spec §17.2).

When professionally recorded audio assets are not available for a given
language + prompt_id, this module generates a placeholder audio file
using text-to-speech (TTS). This allows the IVR system to function
during development, testing, and initial deployment before professional
recordings are available.

IMPORTANT (spec §17.2): TTS audio is NOT a substitute for professionally
recorded, clinically approved, back-translated, comprehension-tested
audio. TTS audio MUST be marked with `tts_generated=True` and MUST NOT
be used in production clinical settings without governance approval.

Supported TTS engines:
  1. pyttsx3 (offline, cross-platform) — preferred for development
  2. gTTS (Google Translate TTS, online) — fallback if pyttsx3 unavailable
  3. Silent placeholder — last resort if no TTS engine available
"""
import io
import os
import hashlib
import tempfile
from typing import Optional, Tuple

from django.core.files.storage import default_storage
from django.conf import settings
from django.utils import timezone


# ── Default TTS text for each prompt ID ──
# These are English fallback texts. For Dagbani/Gonja, the TTS engine
# will attempt to pronounce the text as-is (which may not be accurate,
# but is sufficient for functional testing).
DEFAULT_TTS_TEXTS = {
    "welcome_message": "Welcome to the Maternal and Child Health VoiceCare system.",
    "consent_prompt": "Do you consent to participate? Press 1 for yes, 2 for no.",
    "danger_sign_fever": "Do you have a fever? Press 1 for yes, 2 for no, 3 for unknown.",
    "danger_sign_bleeding": "Are you experiencing any bleeding? Press 1 for yes, 2 for no, 3 for unknown.",
    "danger_sign_headache": "Do you have a severe headache? Press 1 for yes, 2 for no, 3 for unknown.",
    "danger_sign_convulsions": "Have you had any convulsions or fits? Press 1 for yes, 2 for no, 3 for unknown.",
    "danger_sign_swelling": "Do you have swelling of the face or hands? Press 1 for yes, 2 for no, 3 for unknown.",
    "danger_sign_reduced_movement": "Has the baby's movement reduced? Press 1 for yes, 2 for no, 3 for unknown.",
    "danger_sign_breathing": "Are you experiencing difficulty breathing? Press 1 for yes, 2 for no, 3 for unknown.",
    "how_many_weeks_pregnant": "How many weeks pregnant are you? Enter the number of weeks.",
    "last_menstrual_period": "When was your last menstrual period? Enter the date.",
    "previous_pregnancies_count": "How many previous pregnancies have you had? Enter the number.",
    "emergency_advice": "This is an emergency. Please go to the nearest health facility immediately.",
    "call_facility_prompt": "Please call your nearest health facility now. Press 1 to connect, or hang up to end the call.",
    "thank_you": "Thank you for using the Maternal and Child Health VoiceCare system. Goodbye.",
    "invalid_input": "Invalid input. Please try again.",
    "repeat_prompt": "Press 9 to repeat, 0 to go back, or star to speak to an agent.",
}


class TTSFallbackManager:
    """
    Manages TTS-generated fallback audio for telephony prompts (spec §17.2).

    Generates placeholder audio when professional recordings are unavailable.
    All TTS audio is marked as such and MUST NOT be used in production
    clinical settings without governance approval.
    """

    # TTS engine priority: pyttsx3 > gTTS > silent
    _pyttsx3_available = None
    _gtts_available = None

    @classmethod
    def _check_pyttsx3(cls) -> bool:
        """Check if pyttsx3 is available (cached)."""
        if cls._pyttsx3_available is None:
            try:
                import pyttsx3  # noqa: F401
                cls._pyttsx3_available = True
            except ImportError:
                cls._pyttsx3_available = False
        return cls._pyttsx3_available

    @classmethod
    def _check_gtts(cls) -> bool:
        """Check if gTTS is available (cached)."""
        if cls._gtts_available is None:
            try:
                from gtts import gTTS  # noqa: F401
                cls._gtts_available = True
            except ImportError:
                cls._gtts_available = False
        return cls._gtts_available

    @staticmethod
    def get_tts_text(prompt_id: str, language: str = "english") -> str:
        """
        Get the TTS text for a prompt ID.

        For English, returns the default text. For Dagbani/Gonja, returns
        the English text as a fallback (TTS will pronounce it phonetically).
        """
        return DEFAULT_TTS_TEXTS.get(prompt_id, f"Prompt: {prompt_id}")

    @staticmethod
    def generate_pyttsx3(text: str) -> Tuple[bytes, str]:
        """
        Generate audio using pyttsx3 (offline TTS).

        Returns (audio_bytes, content_type).
        """
        import pyttsx3

        # Create a temporary file for the audio output
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            engine = pyttsx3.init()
            engine.save_to_file(text, tmp_path)
            engine.runAndWait()

            with open(tmp_path, "rb") as f:
                audio_bytes = f.read()
            return audio_bytes, "audio/wav"
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    @staticmethod
    def generate_gtts(text: str, language: str = "english") -> Tuple[bytes, str]:
        """
        Generate audio using gTTS (Google Translate TTS, online).

        Returns (audio_bytes, content_type).
        """
        from gtts import gTTS

        # Map our language names to gTTS language codes
        lang_map = {
            "english": "en",
            "dagbani": "en",  # gTTS doesn't support Dagbani, use English
            "gonja": "en",     # gTTS doesn't support Gonja, use English
        }
        tld = lang_map.get(language, "en")

        buf = io.BytesIO()
        tts = gTTS(text=text, lang=tld, tld="com")
        tts.write_to_fp(buf)
        return buf.getvalue(), "audio/mpeg"

    @staticmethod
    def generate_silent_placeholder(duration_seconds: float = 2.0) -> Tuple[bytes, str]:
        """
        Generate a silent WAV file as a last-resort placeholder.

        Returns (audio_bytes, content_type).
        """
        # Minimal WAV header + silence
        # 8000 Hz, 8-bit, mono — smallest valid WAV
        sample_rate = 8000
        num_samples = int(sample_rate * duration_seconds)
        data_size = num_samples  # 1 byte per sample (8-bit)

        # WAV header (44 bytes) + data
        header = b"RIFF"
        header += (36 + data_size).to_bytes(4, "little")  # file size - 8
        header += b"WAVE"
        header += b"fmt "
        header += (16).to_bytes(4, "little")  # chunk size
        header += (1).to_bytes(2, "little")   # audio format (PCM)
        header += (1).to_bytes(2, "little")   # num channels (mono)
        header += sample_rate.to_bytes(4, "little")  # sample rate
        header += sample_rate.to_bytes(4, "little")  # byte rate
        header += (1).to_bytes(2, "little")   # block align
        header += (8).to_bytes(2, "little")   # bits per sample
        header += b"data"
        header += data_size.to_bytes(4, "little")

        audio_bytes = header + (b"\x80" * data_size)  # 0x80 = silence in 8-bit unsigned
        return audio_bytes, "audio/wav"

    @classmethod
    def generate_tts_audio(
        cls, prompt_id: str, language: str = "english"
    ) -> Tuple[bytes, str, str]:
        """
        Generate TTS audio for a prompt.

        Tries pyttsx3 first (offline), then gTTS (online), then silent placeholder.

        Returns (audio_bytes, content_type, engine_used).
        engine_used is one of: "pyttsx3", "gtts", "silent"
        """
        text = cls.get_tts_text(prompt_id, language)

        # Try pyttsx3 (offline, preferred for development)
        if cls._check_pyttsx3():
            try:
                audio_bytes, content_type = cls.generate_pyttsx3(text)
                return audio_bytes, content_type, "pyttsx3"
            except Exception:
                pass  # Fall through to gTTS

        # Try gTTS (online)
        if cls._check_gtts():
            try:
                audio_bytes, content_type = cls.generate_gtts(text, language)
                return audio_bytes, content_type, "gtts"
            except Exception:
                pass  # Fall through to silent

        # Last resort: silent placeholder
        audio_bytes, content_type = cls.generate_silent_placeholder()
        return audio_bytes, content_type, "silent"

    @classmethod
    def create_tts_fallback_asset(
        cls, prompt_id: str, language: str = "english"
    ) -> Optional["AudioAsset"]:
        """
        Create an AudioAsset record with TTS-generated audio.

        The asset is marked with:
          - recorded_by = "tts_fallback"
          - back_translated = False
          - comprehension_tested = False
          - is_active = True (so it can be used immediately)

        The audio file is stored in default_storage under the audio/ prefix.

        Returns the AudioAsset, or None if generation failed.
        """
        from apps.core.telephony_audio import AudioAsset, AudioAssetManager, AudioUploadMetadata

        audio_bytes, content_type, engine = cls.generate_tts_audio(prompt_id, language)

        # Compute checksum
        checksum = hashlib.sha256(audio_bytes).hexdigest()

        # Store the audio file
        audio_asset_id = f"tts_{prompt_id}_{language}_{engine}_{checksum[:8]}"
        storage_path = f"audio/tts/{audio_asset_id}.{content_type.split('/')[-1]}"

        try:
            default_storage.save(storage_path, io.BytesIO(audio_bytes))
            storage_url = default_storage.url(storage_path) if hasattr(default_storage, "url") else f"media://{storage_path}"
        except Exception:
            storage_url = f"media://audio/tts/{audio_asset_id}"

        # Check if a TTS asset already exists for this prompt+language
        existing = AudioAsset.objects.filter(
            language=language,
            prompt_id=prompt_id,
            recorded_by="tts_fallback",
            is_active=True,
        ).first()

        if existing:
            # Update the existing TTS asset
            existing.checksum_sha256 = checksum
            existing.file_size_bytes = len(audio_bytes)
            existing.content_type = content_type
            existing.storage_url = storage_url
            existing.version += 1
            existing.save()
            return existing

        # Deactivate any previous TTS assets for this prompt+language
        AudioAsset.objects.filter(
            language=language,
            prompt_id=prompt_id,
            recorded_by="tts_fallback",
        ).update(is_active=False)

        # Create the new TTS asset
        metadata = AudioUploadMetadata(
            language=language,
            prompt_id=prompt_id,
            recorded_by="tts_fallback",
            content_type=content_type,
            duration_seconds=len(audio_bytes) / 8000.0,  # rough estimate
            approved_by="",  # TTS audio is NOT approved
            back_translated=False,
            comprehension_tested=False,
            version=1,
            storage_url=storage_url,
        )

        # Use the manager to create the asset
        asset = AudioAssetManager.upload_audio(audio_bytes, metadata)
        # Override the recorded_by to mark it as TTS
        asset.recorded_by = "tts_fallback"
        asset.save(update_fields=["recorded_by"])
        return asset

    @classmethod
    def ensure_fallback_for_prompt(
        cls, prompt_id: str, language: str = "english"
    ) -> Optional["AudioAsset"]:
        """
        Ensure a TTS fallback exists for a prompt.

        If a professional recording exists, do nothing.
        If no professional recording exists, create a TTS fallback.

        Returns the TTS fallback AudioAsset, or None if a professional
        recording already exists.
        """
        from apps.core.telephony_audio import AudioAsset

        # Check if a professional recording exists
        professional = AudioAsset.objects.filter(
            language=language,
            prompt_id=prompt_id,
            is_active=True,
        ).exclude(recorded_by="tts_fallback").first()

        if professional:
            return None  # Professional recording exists, no fallback needed

        # Check if a TTS fallback already exists
        existing_tts = AudioAsset.objects.filter(
            language=language,
            prompt_id=prompt_id,
            recorded_by="tts_fallback",
            is_active=True,
        ).first()

        if existing_tts:
            return existing_tts

        # Create a new TTS fallback
        return cls.create_tts_fallback_asset(prompt_id, language)

    @classmethod
    def ensure_all_fallbacks(cls, language: str = "english") -> dict:
        """
        Ensure TTS fallbacks exist for all required prompts.

        Returns a dict with:
          - "created": list of prompt_ids that got new TTS assets
          - "existing": list of prompt_ids that already had TTS assets
          - "skipped": list of prompt_ids that have professional recordings
          - "errors": list of {prompt_id, error} for failures
        """
        from apps.core.telephony_prompts import REQUIRED_PROMPT_IDS

        result = {"created": [], "existing": [], "skipped": [], "errors": []}

        for prompt_id in REQUIRED_PROMPT_IDS:
            try:
                from apps.core.telephony_audio import AudioAsset

                # Check for professional recording
                professional = AudioAsset.objects.filter(
                    language=language,
                    prompt_id=prompt_id,
                    is_active=True,
                ).exclude(recorded_by="tts_fallback").first()

                if professional:
                    result["skipped"].append(prompt_id)
                    continue

                # Check for existing TTS
                existing_tts = AudioAsset.objects.filter(
                    language=language,
                    prompt_id=prompt_id,
                    recorded_by="tts_fallback",
                    is_active=True,
                ).first()

                if existing_tts:
                    result["existing"].append(prompt_id)
                    continue

                # Create new TTS fallback
                asset = cls.create_tts_fallback_asset(prompt_id, language)
                if asset:
                    result["created"].append(prompt_id)
                else:
                    result["errors"].append({"prompt_id": prompt_id, "error": "Failed to create"})
            except Exception as e:
                result["errors"].append({"prompt_id": prompt_id, "error": str(e)})

        return result

    @staticmethod
    def is_tts_asset(asset: "AudioAsset") -> bool:
        """Check if an AudioAsset was generated by TTS."""
        return asset.recorded_by == "tts_fallback"
