"""
Tests for TTS fallback audio generation (spec §17.2).

Verifies:
- TTS text is generated for all required prompt IDs
- Audio generation works (at least silent placeholder)
- AudioAsset records are created with correct metadata
- TTS assets are marked as tts_fallback
- ensure_fallback_for_prompt skips when professional recording exists
- ensure_all_fallbacks processes all required prompts
- is_tts_asset correctly identifies TTS assets
- Management command runs without errors
"""
from io import StringIO

from django.test import TestCase
from django.core.management import call_command

from apps.core.tts_fallback import (
    TTSFallbackManager,
    DEFAULT_TTS_TEXTS,
)
from apps.core.telephony_audio import AudioAsset, AudioAssetManager, AudioUploadMetadata
from apps.core.telephony_prompts import REQUIRED_PROMPT_IDS


class TTSFallbackTest(TestCase):
    """Tests for TTS fallback generation."""

    def test_get_tts_text_for_known_prompt(self):
        """get_tts_text should return text for known prompt IDs."""
        text = TTSFallbackManager.get_tts_text("welcome_message")
        self.assertIn("Welcome", text)

    def test_get_tts_text_for_unknown_prompt(self):
        """get_tts_text should return a fallback for unknown prompts."""
        text = TTSFallbackManager.get_tts_text("unknown_prompt")
        self.assertIn("unknown_prompt", text)

    def test_get_tts_text_for_dagbani(self):
        """get_tts_text should work for Dagbani (falls back to English text)."""
        text = TTSFallbackManager.get_tts_text("welcome_message", "dagbani")
        self.assertIn("Welcome", text)

    def test_all_required_prompts_have_tts_text(self):
        """Every required prompt ID should have TTS text."""
        for prompt_id in REQUIRED_PROMPT_IDS:
            text = TTSFallbackManager.get_tts_text(prompt_id)
            self.assertTrue(text, f"No TTS text for prompt: {prompt_id}")
            self.assertNotEqual(text, f"Prompt: {prompt_id}",
                                f"No specific TTS text for prompt: {prompt_id}")

    def test_generate_silent_placeholder(self):
        """Silent placeholder should produce valid WAV bytes."""
        audio_bytes, content_type = TTSFallbackManager.generate_silent_placeholder(1.0)
        self.assertGreater(len(audio_bytes), 44)  # At least WAV header
        self.assertEqual(content_type, "audio/wav")
        self.assertTrue(audio_bytes.startswith(b"RIFF"))
        self.assertIn(b"WAVE", audio_bytes[:12])

    def test_generate_tts_audio_returns_bytes(self):
        """generate_tts_audio should return audio bytes and engine info."""
        audio_bytes, content_type, engine = TTSFallbackManager.generate_tts_audio(
            "welcome_message", "english"
        )
        self.assertGreater(len(audio_bytes), 0)
        self.assertIn(content_type, ["audio/wav", "audio/mpeg"])
        self.assertIn(engine, ["pyttsx3", "gtts", "silent"])

    def test_create_tts_fallback_asset(self):
        """create_tts_fallback_asset should create an AudioAsset."""
        asset = TTSFallbackManager.create_tts_fallback_asset("welcome_message", "english")
        self.assertIsNotNone(asset)
        self.assertEqual(asset.language, "english")
        self.assertEqual(asset.prompt_id, "welcome_message")
        self.assertEqual(asset.recorded_by, "tts_fallback")
        self.assertFalse(asset.back_translated)
        self.assertFalse(asset.comprehension_tested)
        self.assertTrue(asset.is_active)

    def test_create_tts_fallback_does_not_overwrite_professional(self):
        """ensure_fallback_for_prompt should skip when professional recording exists."""
        # Create a professional recording
        AudioAssetManager.upload_audio(
            b"professional_audio_bytes",
            AudioUploadMetadata(
                language="english",
                prompt_id="welcome_message",
                recorded_by="voice_actor_1",
                approved_by="clinical_lead",
                back_translated=True,
                comprehension_tested=True,
            ),
        )

        # Ensure fallback should return None (professional exists)
        result = TTSFallbackManager.ensure_fallback_for_prompt("welcome_message", "english")
        self.assertIsNone(result)

    def test_ensure_fallback_creates_when_no_professional(self):
        """ensure_fallback_for_prompt should create TTS when no professional exists."""
        asset = TTSFallbackManager.ensure_fallback_for_prompt("consent_prompt", "english")
        self.assertIsNotNone(asset)
        self.assertTrue(TTSFallbackManager.is_tts_asset(asset))

    def test_ensure_fallback_returns_existing_tts(self):
        """ensure_fallback_for_prompt should return existing TTS if present."""
        # Create TTS fallback
        asset1 = TTSFallbackManager.create_tts_fallback_asset("thank_you", "english")
        self.assertIsNotNone(asset1)

        # Second call should return the existing TTS, not create a new one
        asset2 = TTSFallbackManager.ensure_fallback_for_prompt("thank_you", "english")
        self.assertIsNotNone(asset2)
        self.assertEqual(asset1.id, asset2.id)

    def test_ensure_all_fallbacks(self):
        """ensure_all_fallbacks should process all required prompts."""
        result = TTSFallbackManager.ensure_all_fallbacks("english")
        self.assertIn("created", result)
        self.assertIn("existing", result)
        self.assertIn("skipped", result)
        self.assertIn("errors", result)
        # All prompts should be accounted for
        total = len(result["created"]) + len(result["existing"]) + len(result["skipped"])
        self.assertEqual(total, len(REQUIRED_PROMPT_IDS))

    def test_is_tts_asset_true(self):
        """is_tts_asset should return True for TTS-generated assets."""
        asset = TTSFallbackManager.create_tts_fallback_asset("thank_you", "english")
        self.assertTrue(TTSFallbackManager.is_tts_asset(asset))

    def test_is_tts_asset_false(self):
        """is_tts_asset should return False for professional recordings."""
        asset = AudioAssetManager.upload_audio(
            b"pro_audio",
            AudioUploadMetadata(
                language="english",
                prompt_id="test_prompt",
                recorded_by="professional_actor",
            ),
        )
        self.assertFalse(TTSFallbackManager.is_tts_asset(asset))

    def test_tts_asset_has_checksum(self):
        """TTS assets should have a SHA-256 checksum."""
        asset = TTSFallbackManager.create_tts_fallback_asset("thank_you", "english")
        self.assertEqual(len(asset.checksum_sha256), 64)  # SHA-256 hex

    def test_tts_asset_has_storage_url(self):
        """TTS assets should have a storage URL."""
        asset = TTSFallbackManager.create_tts_fallback_asset("thank_you", "english")
        self.assertTrue(asset.storage_url)


class TTSFallbackCommandTest(TestCase):
    """Tests for the generate_tts_fallbacks management command."""

    def test_dry_run(self):
        """Dry run should not create any assets."""
        out = StringIO()
        err = StringIO()
        call_command("generate_tts_fallbacks", "--dry-run", stdout=out, stderr=err)
        output = out.getvalue()
        self.assertIn("DRY RUN", output)
        self.assertIn("welcome_message", output)
        # No assets should have been created
        self.assertEqual(AudioAsset.objects.filter(recorded_by="tts_fallback").count(), 0)

    def test_command_creates_assets(self):
        """Command should create TTS assets for all prompts."""
        out = StringIO()
        err = StringIO()
        call_command("generate_tts_fallbacks", "--language", "english", stdout=out, stderr=err)
        output = out.getvalue()
        self.assertIn("Complete", output)
        # At least some assets should have been created
        tts_count = AudioAsset.objects.filter(recorded_by="tts_fallback").count()
        self.assertGreater(tts_count, 0)

    def test_command_with_dagbani(self):
        """Command should work with Dagbani language."""
        out = StringIO()
        err = StringIO()
        call_command("generate_tts_fallbacks", "--language", "dagbani", stdout=out, stderr=err)
        output = out.getvalue()
        self.assertIn("dagbani", output.lower())
