"""
Tests for telephony prompt pack building and audio asset management (spec §17.2).

Tests:
- Prompt pack building for all supported languages
- Prompt pack consistency validation
- Audio asset upload, retrieval, deactivation, listing
- DEFAULT_PROMPTS contains all required prompts
- Navigation keys are consistent across languages
"""
from django.test import TestCase

from apps.core.telephony_audio import (
    AudioAsset, AudioAssetManager, AudioUploadMetadata, SUPPORTED_LANGUAGES,
)
from apps.core.telephony_prompts import (
    PromptPackBuilder, DEFAULT_PROMPTS, REQUIRED_PROMPT_IDS,
    ensure_prompt_pack_consistency, validate_prompt_pack,
    REPEAT_KEY, BACK_KEY, HUMAN_HELP_KEY,
)
from apps.core.telephony_models import PromptPack


class DefaultPromptsTest(TestCase):
    """Test that DEFAULT_PROMPTS contains all required prompts (spec §17.2)."""

    def test_all_required_prompt_ids_present(self):
        """Every required prompt ID must be in DEFAULT_PROMPTS."""
        for pid in REQUIRED_PROMPT_IDS:
            self.assertIn(pid, DEFAULT_PROMPTS, f"Missing prompt: {pid}")

    def test_danger_sign_prompts_present(self):
        """All seven danger sign prompts must be present."""
        danger_signs = [
            "danger_sign_fever",
            "danger_sign_bleeding",
            "danger_sign_headache",
            "danger_sign_convulsions",
            "danger_sign_swelling",
            "danger_sign_reduced_movement",
            "danger_sign_breathing",
        ]
        for ds in danger_signs:
            self.assertIn(ds, DEFAULT_PROMPTS)
            self.assertIn(ds, REQUIRED_PROMPT_IDS)

    def test_navigation_keys_consistent(self):
        """Navigation keys (repeat, back, human_help) must be the same across all prompts."""
        for pid, cfg in DEFAULT_PROMPTS.items():
            self.assertEqual(cfg["repeat_key"], REPEAT_KEY, f"{pid} has wrong repeat_key")
            self.assertEqual(cfg["back_key"], BACK_KEY, f"{pid} has wrong back_key")
            self.assertEqual(cfg["human_help_key"], HUMAN_HELP_KEY, f"{pid} has wrong human_help_key")

    def test_each_prompt_has_question_code(self):
        """Every prompt must have a question_code."""
        for pid, cfg in DEFAULT_PROMPTS.items():
            self.assertTrue(cfg.get("question_code"), f"{pid} missing question_code")

    def test_each_prompt_has_allowed_keys(self):
        """Every prompt must have allowed_keys (can be empty for informational prompts)."""
        for pid, cfg in DEFAULT_PROMPTS.items():
            self.assertIn("allowed_keys", cfg, f"{pid} missing allowed_keys")
            self.assertIsInstance(cfg["allowed_keys"], list)

    def test_supported_languages(self):
        """Supported languages must include Dagbani, Gonja, English."""
        self.assertIn("dagbani", SUPPORTED_LANGUAGES)
        self.assertIn("gonja", SUPPORTED_LANGUAGES)
        self.assertIn("english", SUPPORTED_LANGUAGES)


class PromptPackBuilderTest(TestCase):
    """Test prompt pack building (spec §17.2)."""

    def test_build_prompt_pack_english(self):
        """Build a complete prompt pack for English."""
        pack = PromptPackBuilder.build_prompt_pack("english")
        self.assertEqual(pack.language, "english")
        self.assertEqual(pack.status, "ACTIVE")
        self.assertEqual(len(pack.prompts), len(REQUIRED_PROMPT_IDS))

    def test_build_prompt_pack_dagbani(self):
        """Build a complete prompt pack for Dagbani."""
        pack = PromptPackBuilder.build_prompt_pack("dagbani")
        self.assertEqual(pack.language, "dagbani")
        self.assertEqual(len(pack.prompts), len(REQUIRED_PROMPT_IDS))

    def test_build_prompt_pack_gonja(self):
        """Build a complete prompt pack for Gonja."""
        pack = PromptPackBuilder.build_prompt_pack("gonja")
        self.assertEqual(pack.language, "gonja")
        self.assertEqual(len(pack.prompts), len(REQUIRED_PROMPT_IDS))

    def test_build_prompt_pack_unsupported_language(self):
        """Building a pack for an unsupported language should raise ValueError."""
        with self.assertRaises(ValueError):
            PromptPackBuilder.build_prompt_pack("french")

    def test_build_prompt_pack_deactivates_previous(self):
        """Building a new pack should retire the previous active pack for that language."""
        pack1 = PromptPackBuilder.build_prompt_pack("english")
        self.assertEqual(pack1.status, "ACTIVE")
        pack2 = PromptPackBuilder.build_prompt_pack("english")
        pack1.refresh_from_db()
        self.assertEqual(pack1.status, "RETIRED")
        self.assertEqual(pack2.status, "ACTIVE")

    def test_build_prompt_pack_has_all_required_prompts(self):
        """Built pack must contain all required prompt IDs."""
        pack = PromptPackBuilder.build_prompt_pack("english")
        prompt_ids = {p["prompt_id"] for p in pack.prompts}
        for required_id in REQUIRED_PROMPT_IDS:
            self.assertIn(required_id, prompt_ids)

    def test_build_prompt_pack_prompts_have_navigation_keys(self):
        """Each prompt in the built pack must have navigation keys."""
        pack = PromptPackBuilder.build_prompt_pack("english")
        for p in pack.prompts:
            self.assertEqual(p["repeat_key"], REPEAT_KEY)
            self.assertEqual(p["back_key"], BACK_KEY)
            self.assertEqual(p["human_help_key"], HUMAN_HELP_KEY)

    def test_build_prompt_pack_with_custom_config(self):
        """Build a pack with a custom prompts config override."""
        custom_config = dict(DEFAULT_PROMPTS)
        # Remove one prompt to test partial config
        del custom_config["thank_you"]
        pack = PromptPackBuilder.build_prompt_pack("english", custom_config)
        prompt_ids = {p["prompt_id"] for p in pack.prompts}
        self.assertNotIn("thank_you", prompt_ids)


class PromptPackConsistencyTest(TestCase):
    """Test prompt pack consistency validation (spec §17.2)."""

    def test_consistent_pack_no_missing(self):
        """A complete pack should have no missing prompts."""
        pack = PromptPackBuilder.build_prompt_pack("english")
        missing = ensure_prompt_pack_consistency(pack)
        self.assertEqual(missing, [])

    def test_incomplete_pack_reports_missing(self):
        """An incomplete pack should report missing prompts."""
        pack = PromptPack.objects.create(
            pack_id="test-incomplete-v1",
            name="Incomplete Pack",
            version="1.0",
            language="english",
            status="ACTIVE",
            prompts=[
                {"prompt_id": "welcome_message", "question_code": "WELCOME"},
            ],
        )
        missing = ensure_prompt_pack_consistency(pack)
        self.assertIn("consent_prompt", missing)
        self.assertIn("danger_sign_fever", missing)

    def test_validate_prompt_pack_unapproved(self):
        """An unapproved pack should fail validation."""
        pack = PromptPackBuilder.build_prompt_pack("english")
        # Don't set approval metadata
        is_valid, issues = validate_prompt_pack(pack)
        self.assertFalse(is_valid)
        self.assertTrue(any("approved" in i.lower() for i in issues))

    def test_validate_prompt_pack_approved(self):
        """An approved, back-translated, comprehension-tested pack should pass."""
        pack = PromptPackBuilder.build_prompt_pack("english")
        pack.approved_by = "clinical_committee"
        pack.back_translated = True
        pack.comprehension_tested = True
        pack.save()
        is_valid, issues = validate_prompt_pack(pack)
        self.assertTrue(is_valid)
        self.assertEqual(issues, [])


class AudioAssetManagerTest(TestCase):
    """Test audio asset management (spec §17.2)."""

    def test_upload_audio_creates_asset(self):
        """Uploading audio should create an AudioAsset."""
        file_bytes = b"fake-audio-content"
        metadata = AudioUploadMetadata(
            language="english",
            prompt_id="welcome_message",
            recorded_by="voice_actor_1",
        )
        asset = AudioAssetManager.upload_audio(file_bytes, metadata)
        self.assertIsNotNone(asset)
        self.assertEqual(asset.language, "english")
        self.assertEqual(asset.prompt_id, "welcome_message")
        self.assertTrue(asset.is_active)
        self.assertEqual(asset.file_size_bytes, len(file_bytes))
        self.assertTrue(asset.checksum_sha256)

    def test_upload_audio_computes_checksum(self):
        """Upload should compute SHA-256 checksum."""
        import hashlib
        file_bytes = b"test-audio-data"
        metadata = AudioUploadMetadata(language="english", prompt_id="consent_prompt")
        asset = AudioAssetManager.upload_audio(file_bytes, metadata)
        expected = hashlib.sha256(file_bytes).hexdigest()
        self.assertEqual(asset.checksum_sha256, expected)

    def test_upload_audio_deactivates_previous(self):
        """Uploading a new version should deactivate the previous active asset."""
        metadata = AudioUploadMetadata(language="english", prompt_id="welcome_message", version=1)
        asset1 = AudioAssetManager.upload_audio(b"v1-audio", metadata)
        self.assertTrue(asset1.is_active)

        metadata.version = 2
        asset2 = AudioAssetManager.upload_audio(b"v2-audio", metadata)
        asset1.refresh_from_db()
        self.assertFalse(asset1.is_active)
        self.assertTrue(asset2.is_active)

    def test_get_audio_url(self):
        """get_audio_url should return the storage URL."""
        metadata = AudioUploadMetadata(
            language="english", prompt_id="welcome_message",
            storage_url="s3://bucket/audio.mp3",
        )
        asset = AudioAssetManager.upload_audio(b"audio", metadata)
        url = AudioAssetManager.get_audio_url(asset.audio_asset_id)
        self.assertEqual(url, "s3://bucket/audio.mp3")

    def test_get_audio_url_not_found(self):
        """get_audio_url should return None for non-existent asset."""
        url = AudioAssetManager.get_audio_url("nonexistent-asset")
        self.assertIsNone(url)

    def test_deactivate_audio(self):
        """deactivate_audio should mark asset as inactive."""
        metadata = AudioUploadMetadata(language="english", prompt_id="welcome_message")
        asset = AudioAssetManager.upload_audio(b"audio", metadata)
        result = AudioAssetManager.deactivate_audio(asset.audio_asset_id)
        self.assertTrue(result)
        asset.refresh_from_db()
        self.assertFalse(asset.is_active)

    def test_deactivate_audio_not_found(self):
        """deactivate_audio should return False for non-existent asset."""
        result = AudioAssetManager.deactivate_audio("nonexistent")
        self.assertFalse(result)

    def test_list_prompts(self):
        """list_prompts should return active assets for a language."""
        AudioAssetManager.upload_audio(
            b"audio1", AudioUploadMetadata(language="english", prompt_id="welcome_message"),
        )
        AudioAssetManager.upload_audio(
            b"audio2", AudioUploadMetadata(language="english", prompt_id="consent_prompt"),
        )
        AudioAssetManager.upload_audio(
            b"audio3", AudioUploadMetadata(language="dagbani", prompt_id="welcome_message"),
        )
        english_assets = AudioAssetManager.list_prompts("english")
        self.assertEqual(len(english_assets), 2)
        for a in english_assets:
            self.assertEqual(a.language, "english")
            self.assertTrue(a.is_active)

    def test_list_prompts_empty(self):
        """list_prompts should return empty list for language with no assets."""
        assets = AudioAssetManager.list_prompts("gonja")
        self.assertEqual(assets, [])

    def test_get_asset(self):
        """get_asset should return the AudioAsset by ID."""
        metadata = AudioUploadMetadata(language="english", prompt_id="welcome_message")
        asset = AudioAssetManager.upload_audio(b"audio", metadata)
        retrieved = AudioAssetManager.get_asset(asset.audio_asset_id)
        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved.audio_asset_id, asset.audio_asset_id)

    def test_get_asset_not_found(self):
        """get_asset should return None for non-existent asset."""
        self.assertIsNone(AudioAssetManager.get_asset("nonexistent"))

    def test_get_active_asset(self):
        """get_active_asset should return the active asset for a language+prompt."""
        metadata = AudioUploadMetadata(language="english", prompt_id="welcome_message")
        asset = AudioAssetManager.upload_audio(b"audio", metadata)
        active = AudioAsset.get_active_asset("english", "welcome_message")
        self.assertIsNotNone(active)
        self.assertEqual(active.audio_asset_id, asset.audio_asset_id)

    def test_upload_with_approval_metadata(self):
        """Upload with approved_by should set approved_at."""
        metadata = AudioUploadMetadata(
            language="english", prompt_id="welcome_message",
            approved_by="clinical_committee",
            back_translated=True,
            comprehension_tested=True,
        )
        asset = AudioAssetManager.upload_audio(b"audio", metadata)
        self.assertEqual(asset.approved_by, "clinical_committee")
        self.assertIsNotNone(asset.approved_at)
        self.assertTrue(asset.back_translated)
        self.assertTrue(asset.comprehension_tested)
