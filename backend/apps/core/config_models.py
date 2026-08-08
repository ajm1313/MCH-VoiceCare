"""
System configuration model — externally configurable settings (spec §33, §34).

All settings that MUST NOT be hard-coded are stored here and can be
updated at runtime without code changes. Feature flags follow spec §34.
"""
import uuid

from django.db import models
from django.core.cache import cache

from apps.core.enums import MLMode
from apps.core.models import TimeStampedModel


CONFIG_CACHE_KEY = "system_config_singleton"
CONFIG_CACHE_TTL = 300  # 5 minutes


class SystemConfig(TimeStampedModel):
    """
    Singleton configuration record for system-wide settings.
    Only one row should exist — use get_config() to access it.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Clinical ML mode (spec §3.2) — production default MUST be RULES_ONLY
    clinical_ml_mode = models.CharField(
        max_length=20, choices=MLMode.choices, default=MLMode.RULES_ONLY,
    )

    # Feature flags (spec §34)
    engagement_model_enabled = models.BooleanField(default=False)
    ocr_enabled = models.BooleanField(default=True)
    ivr_dtmf_enabled = models.BooleanField(default=True)
    ussd_enabled = models.BooleanField(default=True)
    speech_capture_enabled = models.BooleanField(default=False)  # MUST be false in first release
    remote_emergency_cascade_enabled = models.BooleanField(default=True)
    print_referral_slip_enabled = models.BooleanField(default=True)

    # Sync settings (spec §33)
    sync_batch_size = models.PositiveIntegerField(default=100)
    sync_retry_max = models.PositiveIntegerField(default=5)
    sync_retry_backoff_base_seconds = models.PositiveIntegerField(default=30)

    # Referral settings (spec §33)
    referral_ack_timeout_minutes = models.PositiveIntegerField(default=30)
    referral_escalation_timeout_minutes = models.PositiveIntegerField(default=60)

    # Scan retention (spec §25)
    scan_retention_mode = models.CharField(max_length=30, default="TEMPORARY_WORKING_COPY")
    scan_temporary_retention_hours = models.PositiveIntegerField(default=24)

    # Rule bundle version (spec §33)
    active_rule_bundle_version = models.CharField(max_length=50, default="ghs-smp-2016-v1")

    # Clinical thresholds (spec §33) — JSON dict of threshold key → numeric value.
    # Keys match the mobile clinicalThresholds.ts config keys.
    # Defaults reflect Ghana Safe Motherhood / WHO reference values.
    clinical_thresholds = models.JSONField(default=dict, blank=True)

    # OCR confidence thresholds by field (spec §34) — JSON dict of field_name → min_confidence
    ocr_confidence_thresholds = models.JSONField(default=dict, blank=True)

    # Supported MCH template versions (spec §34) — JSON list of supported template version strings
    supported_mch_template_versions = models.JSONField(default=list, blank=True)

    # Referral destinations (spec §34) — JSON list of facility codes for referral routing
    referral_destinations = models.JSONField(default=list, blank=True)

    # Role-based contact numbers (spec §18.2, §34) — JSON dict of role → {phone, verified_at, expires_at}
    role_contact_numbers = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "System Configuration"
        verbose_name_plural = "System Configuration"

    def save(self, *args, **kwargs):
        """Ensure only one config row exists and invalidate cache."""
        self.pk = self.pk or uuid.uuid4()
        cache.delete(CONFIG_CACHE_KEY)
        super().save(*args, **kwargs)

    @classmethod
    def get_config(cls) -> "SystemConfig":
        """Get or create the singleton config, with caching."""
        config = cache.get(CONFIG_CACHE_KEY)
        if config is None:
            config, _ = cls.objects.get_or_create(pk=cls.objects.first().pk if cls.objects.exists() else None)
            cache.set(CONFIG_CACHE_KEY, config, CONFIG_CACHE_TTL)
        return config

    @classmethod
    def get(cls, key: str, default=None):
        """Get a specific configuration value by field name."""
        config = cls.get_config()
        return getattr(config, key, default)

    @classmethod
    def is_feature_enabled(cls, flag: str) -> bool:
        """Check if a feature flag is enabled."""
        return cls.get(flag, False)
