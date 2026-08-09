"""
Base models with UUID PKs, timestamps, and audit fields.
"""
import uuid

from django.db import models

from .enums import SyncStatus


class TimeStampedModel(models.Model):
    """Abstract base with created_at / updated_at."""
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class UUIDModel(TimeStampedModel):
    """Abstract base with UUID PK."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class SyncedModel(UUIDModel):
    """Abstract base with sync_status for offline-first records."""
    sync_status = models.CharField(
        max_length=20,
        choices=SyncStatus.choices,
        default=SyncStatus.SYNCED,
    )

    class Meta:
        abstract = True


# Import concrete models from submodules so Django's app registry
# discovers them for makemigrations and get_models().
# These imports are at the end to avoid circular imports — the abstract
# bases above are defined first.
from apps.core.telephony_audio import AudioAsset  # noqa: F401, E402
from apps.core.telephony_models import PromptPack, TelephonySession, RemoteObservation  # noqa: F401, E402
from apps.core.ocr_models import *  # noqa: F401, E402, F403
from apps.core.config_models import *  # noqa: F401, E402, F403
from apps.core.signing_models import *  # noqa: F401, E402, F403
from apps.core.package_models import *  # noqa: F401, E402, F403
from apps.core.idempotency_models import *  # noqa: F401, E402, F403
