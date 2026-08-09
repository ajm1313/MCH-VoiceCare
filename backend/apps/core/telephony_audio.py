"""
Telephony audio asset management (spec §17.2).

Audio assets are professionally recorded, clinically approved, back-translated,
and comprehension-tested prompt audio files. Each asset is versioned and
checksummed for integrity.

Prompt lifecycle (spec §17.2):
1. clinically approved
2. professionally recorded by humans
3. independently back-translated
4. comprehension-tested with pregnant women and midwives
5. versioned
"""
import hashlib
import uuid
from dataclasses import dataclass, field
from typing import Optional

from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel


# Supported languages in the first release (spec §17.1)
SUPPORTED_LANGUAGES = ["dagbani", "gonja", "english"]


class AudioAsset(TimeStampedModel):
    """
    A single audio prompt asset (spec §17.2).

    Each asset is a professionally recorded, clinically approved audio file
    for a specific prompt in a specific language. Assets are versioned and
    checksummed for integrity verification.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    audio_asset_id = models.CharField(max_length=100, unique=True, verbose_name="Audio Asset ID")
    language = models.CharField(max_length=20, verbose_name="Language")
    prompt_id = models.CharField(max_length=100, verbose_name="Prompt ID")
    content_type = models.CharField(max_length=50, default="audio/mpeg")
    duration_seconds = models.FloatField(default=0.0)
    file_size_bytes = models.PositiveIntegerField(default=0)
    storage_url = models.CharField(max_length=500, blank=True)

    # Recording & approval metadata (spec §17.2)
    recorded_by = models.CharField(max_length=200, blank=True)
    approved_by = models.CharField(max_length=200, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    # Quality assurance flags (spec §17.2)
    back_translated = models.BooleanField(default=False)
    comprehension_tested = models.BooleanField(default=False)

    # Integrity & versioning
    checksum_sha256 = models.CharField(max_length=64, blank=True)
    version = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["language", "prompt_id"], name="audio_asset_lang_pid_idx"),
            models.Index(fields=["language", "is_active"], name="audio_asset_lang_act_idx"),
            models.Index(fields=["audio_asset_id"], name="audio_asset_id_idx"),
        ]

    def __str__(self):
        return f"AudioAsset {self.audio_asset_id} ({self.language}/{self.prompt_id} v{self.version})"

    @classmethod
    def get_active_asset(cls, language, prompt_id):
        """Get the active audio asset for a language + prompt_id."""
        return cls.objects.filter(
            language=language, prompt_id=prompt_id, is_active=True,
        ).order_by("-version").first()


@dataclass
class AudioUploadMetadata:
    """Metadata for uploading an audio asset."""
    language: str
    prompt_id: str
    recorded_by: str = ""
    content_type: str = "audio/mpeg"
    duration_seconds: float = 0.0
    approved_by: str = ""
    back_translated: bool = False
    comprehension_tested: bool = False
    version: int = 1
    storage_url: str = ""
    extra: dict = field(default_factory=dict)


class AudioAssetManager:
    """
    Manages the lifecycle of audio assets (spec §17.2).

    Handles upload, retrieval, deactivation, and listing of audio assets.
    In production, storage_url would point to S3 or a CDN with signed URLs.
    """

    @staticmethod
    def _compute_checksum(file_bytes: bytes) -> str:
        """Compute SHA-256 checksum of audio file bytes."""
        return hashlib.sha256(file_bytes).hexdigest()

    @staticmethod
    def upload_audio(file_bytes: bytes, metadata: AudioUploadMetadata) -> AudioAsset:
        """
        Upload a new audio asset.

        Computes the SHA-256 checksum, determines file size, and creates
        the AudioAsset record. In production, file_bytes would be persisted
        to S3/object storage and storage_url set to the resulting URL.
        """
        checksum = AudioAssetManager._compute_checksum(file_bytes)
        file_size = len(file_bytes)

        # Generate a unique audio_asset_id
        audio_asset_id = f"audio_{metadata.prompt_id}_{metadata.language}_v{metadata.version}_{uuid.uuid4().hex[:8]}"

        # Deactivate previous active assets for the same language+prompt
        AudioAsset.objects.filter(
            language=metadata.language,
            prompt_id=metadata.prompt_id,
            is_active=True,
        ).update(is_active=False)

        asset = AudioAsset.objects.create(
            audio_asset_id=audio_asset_id,
            language=metadata.language,
            prompt_id=metadata.prompt_id,
            content_type=metadata.content_type,
            duration_seconds=metadata.duration_seconds,
            file_size_bytes=file_size,
            storage_url=metadata.storage_url or f"media://audio/{audio_asset_id}",
            recorded_by=metadata.recorded_by,
            approved_by=metadata.approved_by,
            approved_at=timezone.now() if metadata.approved_by else None,
            back_translated=metadata.back_translated,
            comprehension_tested=metadata.comprehension_tested,
            checksum_sha256=checksum,
            version=metadata.version,
            is_active=True,
        )
        return asset

    @staticmethod
    def get_audio_url(asset_id: str) -> Optional[str]:
        """
        Get the URL for an audio asset.

        Returns the storage_url. In production, this would return a signed
        S3 URL with an expiry for secure access.
        """
        try:
            asset = AudioAsset.objects.get(audio_asset_id=asset_id)
        except AudioAsset.DoesNotExist:
            return None
        return asset.storage_url

    @staticmethod
    def deactivate_audio(asset_id: str) -> bool:
        """Mark an audio asset as inactive (retire it)."""
        updated = AudioAsset.objects.filter(audio_asset_id=asset_id).update(is_active=False)
        return updated > 0

    @staticmethod
    def list_prompts(language: str) -> list:
        """
        List all active audio assets for a given language.

        Returns a list of AudioAsset objects ordered by prompt_id.
        """
        return list(
            AudioAsset.objects.filter(language=language, is_active=True).order_by("prompt_id")
        )

    @staticmethod
    def get_asset(asset_id: str) -> Optional[AudioAsset]:
        """Get an AudioAsset by its audio_asset_id."""
        try:
            return AudioAsset.objects.get(audio_asset_id=asset_id)
        except AudioAsset.DoesNotExist:
            return None
