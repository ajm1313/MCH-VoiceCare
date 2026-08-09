"""
Telephony prompt pack builder (spec §17.2).

Constructs complete, versioned prompt packs for IVR interactions.
Each prompt pack contains all required IVR prompts for a language,
with audio asset references, allowed DTMF keys, and navigation keys.

Supported languages (spec §17.1): Dagbani, Gonja, English.
The same keypad meanings SHOULD be retained across languages.
"""
import uuid
from typing import Optional

from django.utils import timezone

from apps.core.telephony_models import PromptPack
from apps.core.telephony_audio import AudioAsset, AudioAssetManager, SUPPORTED_LANGUAGES


# ── Default prompt configurations ──
# Each prompt defines the question_code, allowed_keys, and navigation keys.
# The same keypad meanings are retained across languages (spec §17.1).
# audio_asset_id is resolved at build time from the AudioAsset table.

# Standard navigation keys (retained across all languages)
REPEAT_KEY = "9"
BACK_KEY = "0"
HUMAN_HELP_KEY = "*"

# Yes/No/Unknown keys for danger sign questions
YES_NO_KEYS = ["1", "2", "3"]  # 1=Yes, 2=No, 3=Unknown


# All required prompt IDs for a complete prompt pack (spec §17.2)
REQUIRED_PROMPT_IDS = [
    "welcome_message",
    "consent_prompt",
    # Danger sign prompts
    "danger_sign_fever",
    "danger_sign_bleeding",
    "danger_sign_headache",
    "danger_sign_convulsions",
    "danger_sign_swelling",
    "danger_sign_reduced_movement",
    "danger_sign_breathing",
    # Pregnancy information prompts
    "how_many_weeks_pregnant",
    "last_menstrual_period",
    "previous_pregnancies_count",
    # Emergency and closing prompts
    "emergency_advice",
    "call_facility_prompt",
    "thank_you",
]


def _make_prompt_config(prompt_id, question_code, allowed_keys, text_en):
    """Build a prompt configuration dict."""
    return {
        "prompt_id": prompt_id,
        "question_code": question_code,
        "allowed_keys": allowed_keys,
        "repeat_key": REPEAT_KEY,
        "back_key": BACK_KEY,
        "human_help_key": HUMAN_HELP_KEY,
        "text_en": text_en,  # English reference text for recording/back-translation
    }


# Default prompt configurations — shared across all languages
# (text_en is the English reference; each language has its own recording)
DEFAULT_PROMPTS = {
    "welcome_message": _make_prompt_config(
        "welcome_message", "WELCOME", [],
        "Welcome to MCH VoiceCare. This is the maternal health helpline.",
    ),
    "consent_prompt": _make_prompt_config(
        "consent_prompt", "CONSENT", ["1", "2"],
        "Do you consent to share your health information for care? Press 1 for yes, 2 for no.",
    ),
    # Danger sign prompts — each uses Yes/No/Unknown keys
    "danger_sign_fever": _make_prompt_config(
        "danger_sign_fever", "DANGER_FEVER", YES_NO_KEYS,
        "Are you experiencing fever? Press 1 for yes, 2 for no, 3 for not sure.",
    ),
    "danger_sign_bleeding": _make_prompt_config(
        "danger_sign_bleeding", "DANGER_BLEEDING", YES_NO_KEYS,
        "Are you experiencing heavy bleeding? Press 1 for yes, 2 for no, 3 for not sure.",
    ),
    "danger_sign_headache": _make_prompt_config(
        "danger_sign_headache", "DANGER_HEADACHE", YES_NO_KEYS,
        "Are you experiencing severe headache? Press 1 for yes, 2 for no, 3 for not sure.",
    ),
    "danger_sign_convulsions": _make_prompt_config(
        "danger_sign_convulsions", "DANGER_CONVULSIONS", YES_NO_KEYS,
        "Have you had convulsions or fits? Press 1 for yes, 2 for no, 3 for not sure.",
    ),
    "danger_sign_swelling": _make_prompt_config(
        "danger_sign_swelling", "DANGER_SWELLING", YES_NO_KEYS,
        "Do you have swelling of the face or hands? Press 1 for yes, 2 for no, 3 for not sure.",
    ),
    "danger_sign_reduced_movement": _make_prompt_config(
        "danger_sign_reduced_movement", "DANGER_REDUCED_MOVEMENT", YES_NO_KEYS,
        "Have you noticed reduced fetal movement? Press 1 for yes, 2 for no, 3 for not sure.",
    ),
    "danger_sign_breathing": _make_prompt_config(
        "danger_sign_breathing", "DANGER_BREATHING", YES_NO_KEYS,
        "Are you experiencing difficulty breathing? Press 1 for yes, 2 for no, 3 for not sure.",
    ),
    # Pregnancy information prompts
    "how_many_weeks_pregnant": _make_prompt_config(
        "how_many_weeks_pregnant", "WEEKS_PREGNANT", ["1", "2", "3", "4"],
        "How many weeks pregnant are you? Press 1 for less than 12 weeks, "
        "2 for 12 to 28 weeks, 3 for more than 28 weeks, 4 for not sure.",
    ),
    "last_menstrual_period": _make_prompt_config(
        "last_menstrual_period", "LMP", ["1", "2"],
        "Do you remember the first day of your last menstrual period? Press 1 for yes, 2 for no.",
    ),
    "previous_pregnancies_count": _make_prompt_config(
        "previous_pregnancies_count", "PREV_PREGNANCIES", ["1", "2", "3"],
        "How many times have you been pregnant before? Press 1 for none, "
        "2 for one to three, 3 for four or more.",
    ),
    # Emergency and closing prompts
    "emergency_advice": _make_prompt_config(
        "emergency_advice", "EMERGENCY_ADVICE", [],
        "Stay calm. Help is being arranged. Go to the nearest health facility immediately.",
    ),
    "call_facility_prompt": _make_prompt_config(
        "call_facility_prompt", "CALL_FACILITY", ["1", "2"],
        "Would you like us to connect you to your health facility? Press 1 for yes, 2 for no.",
    ),
    "thank_you": _make_prompt_config(
        "thank_you", "THANK_YOU", [],
        "Thank you for calling MCH VoiceCare. Stay safe.",
    ),
}


# Language-specific display names
LANGUAGE_NAMES = {
    "dagbani": "Dagbani",
    "gonja": "Gonja",
    "english": "English",
}


class PromptPackBuilder:
    """
    Builds complete prompt packs for IVR interactions (spec §17.2).

    A prompt pack contains all required IVR prompts for a language,
    with audio asset references resolved from the AudioAsset table.
    """

    @staticmethod
    def build_prompt_pack(language: str, prompts_config: Optional[dict] = None) -> PromptPack:
        """
        Build a complete prompt pack for a language.

        Args:
            language: One of SUPPORTED_LANGUAGES (dagbani, gonja, english)
            prompts_config: Optional override of DEFAULT_PROMPTS.
                            If None, DEFAULT_PROMPTS is used.

        Returns:
            A saved PromptPack instance with all prompts and audio asset references.
        """
        if language not in SUPPORTED_LANGUAGES:
            raise ValueError(
                f"Unsupported language: {language}. Supported: {SUPPORTED_LANGUAGES}"
            )

        config = prompts_config if prompts_config is not None else DEFAULT_PROMPTS

        prompts = []
        for prompt_id in REQUIRED_PROMPT_IDS:
            cfg = config.get(prompt_id)
            if cfg is None:
                # Skip missing prompts — consistency validation will catch this
                continue

            # Resolve audio asset from the AudioAsset table
            asset = AudioAsset.get_active_asset(language, prompt_id)
            audio_asset_id = asset.audio_asset_id if asset else ""

            prompts.append({
                "prompt_id": cfg["prompt_id"],
                "prompt_version": "1.0",
                "language": language,
                "audio_asset_id": audio_asset_id,
                "question_code": cfg["question_code"],
                "allowed_keys": cfg["allowed_keys"],
                "repeat_key": cfg["repeat_key"],
                "back_key": cfg["back_key"],
                "human_help_key": cfg["human_help_key"],
                "text": cfg.get("text_en", ""),
            })

        # Deactivate previous active packs for this language
        PromptPack.objects.filter(language=language, status="ACTIVE").update(
            status="RETIRED", retired_at=timezone.now(),
        )

        pack = PromptPack.objects.create(
            pack_id=f"ghs-prompts-{language}-v{uuid.uuid4().hex[:6]}",
            name=f"GHS IVR Prompts ({LANGUAGE_NAMES.get(language, language)})",
            version="1.0",
            language=language,
            status="ACTIVE",
            description=f"Complete IVR prompt pack for {LANGUAGE_NAMES.get(language, language)}",
            prompts=prompts,
            approved_by="",
            back_translated=False,
            comprehension_tested=False,
            activated_at=timezone.now(),
        )
        return pack

    @staticmethod
    def build_prompt_pack_from_assets(language: str) -> PromptPack:
        """
        Build a prompt pack using all active audio assets for a language.

        This scans the AudioAsset table for active assets and constructs
        a prompt pack from them.
        """
        assets = AudioAssetManager.list_prompts(language)
        prompts_config = dict(DEFAULT_PROMPTS)

        # Override with any asset-specific prompt_ids
        for asset in assets:
            if asset.prompt_id in prompts_config:
                prompts_config[asset.prompt_id] = dict(prompts_config[asset.prompt_id])

        return PromptPackBuilder.build_prompt_pack(language, prompts_config)


def ensure_prompt_pack_consistency(pack: PromptPack) -> list:
    """
    Validate that a prompt pack contains all required prompts (spec §17.2).

    Returns a list of missing prompt_ids. An empty list means the pack is consistent.
    """
    present_ids = {p.get("prompt_id") for p in pack.prompts}
    missing = [pid for pid in REQUIRED_PROMPT_IDS if pid not in present_ids]
    return missing


def validate_prompt_pack(pack: PromptPack) -> tuple:
    """
    Full validation of a prompt pack.

    Returns (is_valid, list_of_issues).
    """
    issues = []

    # Check all required prompts are present
    missing = ensure_prompt_pack_consistency(pack)
    if missing:
        issues.append(f"Missing required prompts: {', '.join(missing)}")

    # Check each prompt has required fields
    for p in pack.prompts:
        pid = p.get("prompt_id", "<unknown>")
        for field_name in ["question_code", "allowed_keys", "repeat_key", "back_key", "human_help_key"]:
            if field_name not in p:
                issues.append(f"Prompt '{pid}' missing field: {field_name}")

    # Check approval metadata (spec §17.2)
    if not pack.approved_by:
        issues.append("Prompt pack has no approved_by — prompts MUST be clinically approved")
    if not pack.back_translated:
        issues.append("Prompt pack not marked as back_translated (spec §17.2)")
    if not pack.comprehension_tested:
        issues.append("Prompt pack not marked as comprehension_tested (spec §17.2)")

    return (len(issues) == 0, issues)
