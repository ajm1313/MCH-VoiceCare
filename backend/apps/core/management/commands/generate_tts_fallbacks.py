"""
Generate TTS fallback audio for telephony prompts (spec §17.2).

Creates text-to-speech placeholder audio for all required IVR prompts
that don't have professional recordings. This allows the IVR system to
function during development and testing.

Usage:
    python manage.py generate_tts_fallbacks
    python manage.py generate_tts_fallbacks --language dagbani
    python manage.py generate_tts_fallbacks --language english --dry-run

IMPORTANT: TTS audio is NOT clinically approved and MUST NOT be used in
production without governance approval (spec §17.2).
"""
from django.core.management.base import BaseCommand

from apps.core.tts_fallback import TTSFallbackManager, DEFAULT_TTS_TEXTS
from apps.core.telephony_prompts import REQUIRED_PROMPT_IDS
from apps.core.telephony_audio import SUPPORTED_LANGUAGES


class Command(BaseCommand):
    help = (
        "Generate TTS fallback audio for telephony prompts (spec §17.2). "
        "Creates placeholder audio for prompts without professional recordings."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--language",
            type=str,
            default="english",
            choices=SUPPORTED_LANGUAGES,
            help="Language to generate fallbacks for (default: english).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be generated without creating assets.",
        )

    def handle(self, *args, **options):
        language = options["language"]
        dry_run = options["dry_run"]

        self.stdout.write(
            self.style.WARNING(
                "=" * 70 + "\n"
                "TTS FALLBACK GENERATION (spec §17.2)\n"
                "=" * 70 + "\n"
                "WARNING: TTS audio is NOT clinically approved and MUST NOT\n"
                "be used in production without governance approval.\n"
                "=" * 70
            )
        )

        if dry_run:
            self.stdout.write(f"\n[DRY RUN] Language: {language}")
            self.stdout.write(f"Required prompts: {len(REQUIRED_PROMPT_IDS)}\n")
            for prompt_id in REQUIRED_PROMPT_IDS:
                text = TTSFallbackManager.get_tts_text(prompt_id, language)
                self.stdout.write(f"  {prompt_id}: \"{text[:60]}...\"")
            self.stdout.write(
                self.style.SUCCESS(f"\nDry run complete — {len(REQUIRED_PROMPT_IDS)} prompt(s) would be generated.")
            )
            return

        self.stdout.write(f"\nGenerating TTS fallbacks for language: {language}")
        self.stdout.write(f"Required prompts: {len(REQUIRED_PROMPT_IDS)}\n")

        result = TTSFallbackManager.ensure_all_fallbacks(language)

        # Report results
        if result["created"]:
            self.stdout.write(
                self.style.SUCCESS(f"Created {len(result['created'])} new TTS asset(s):")
            )
            for pid in result["created"]:
                self.stdout.write(f"  + {pid}")

        if result["existing"]:
            self.stdout.write(
                f"Already exists: {len(result['existing'])} TTS asset(s)"
            )

        if result["skipped"]:
            self.stdout.write(
                f"Skipped (professional recording exists): {len(result['skipped'])}"
            )

        if result["errors"]:
            self.stdout.write(
                self.style.ERROR(f"Errors: {len(result['errors'])}")
            )
            for err in result["errors"]:
                self.stdout.write(f"  ! {err['prompt_id']}: {err['error']}")

        total = len(result["created"]) + len(result["existing"]) + len(result["skipped"])
        self.stdout.write(
            self.style.SUCCESS(f"\nComplete — {total}/{len(REQUIRED_PROMPT_IDS)} prompt(s) processed.")
        )
