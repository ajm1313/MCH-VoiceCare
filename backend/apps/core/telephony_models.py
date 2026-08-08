"""
Telephony models — prompt packs, telephony sessions, remote observations (spec §17).

Prompt packs are versioned, clinically approved, professionally recorded.
Telephony sessions track IVR/USSD interactions.
Remote observations capture DTMF/USSD patient responses.
"""
import uuid

from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel


class PromptPack(TimeStampedModel):
    """
    Versioned, clinically approved prompt pack (spec §17.2).

    Prompts MUST be:
    1. clinically approved
    2. professionally recorded by humans
    3. independently back-translated
    4. comprehension-tested
    5. versioned
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    pack_id = models.CharField(max_length=100, unique=True, verbose_name="Pack ID")
    name = models.CharField(max_length=200)
    version = models.CharField(max_length=50)
    language = models.CharField(max_length=20)
    status = models.CharField(max_length=20, default="ACTIVE")
    description = models.TextField(blank=True)

    # Prompts: list of prompt definitions (spec §17.2)
    # Each: {prompt_id, prompt_version, language, audio_asset_id, question_code,
    #         allowed_keys, repeat_key, back_key, human_help_key, text}
    prompts = models.JSONField(default=list)

    # Approval metadata
    approved_by = models.CharField(max_length=200, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    back_translated = models.BooleanField(default=False)
    comprehension_tested = models.BooleanField(default=False)

    activated_at = models.DateTimeField(null=True, blank=True)
    retired_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["pack_id", "version"], name="prompt_pack_id_ver_idx"),
            models.Index(fields=["language", "status"], name="prompt_pack_lang_st_idx"),
        ]

    def __str__(self):
        return f"{self.name} v{self.version} ({self.language})"

    @classmethod
    def get_active_packs(cls):
        """Return all active prompt packs."""
        return cls.objects.filter(status="ACTIVE")

    @classmethod
    def get_active_pack(cls, language):
        """Get the active prompt pack for a language."""
        return cls.objects.filter(language=language, status="ACTIVE").first()

    def get_prompt(self, question_code):
        """Get a single prompt by question_code."""
        for p in self.prompts:
            if p.get("question_code") == question_code:
                return p
        return None


class TelephonySession(TimeStampedModel):
    """
    Tracks an IVR or USSD session (spec §17).

    Lifecycle: INITIATED → IN_PROGRESS → COMPLETED / FAILED / TIMEOUT
    """
    CHANNEL_CHOICES = [
        ("IVR", "IVR — Voice + DTMF"),
        ("USSD", "USSD — Structured selections"),
    ]
    STATUS_CHOICES = [
        ("INITIATED", "Initiated"),
        ("IN_PROGRESS", "In Progress"),
        ("COMPLETED", "Completed"),
        ("FAILED", "Failed"),
        ("TIMEOUT", "Timeout"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session_id = models.CharField(max_length=200, unique=True, verbose_name="Provider Session ID")
    channel = models.CharField(max_length=10, choices=CHANNEL_CHOICES)
    provider = models.CharField(max_length=50, blank=True)

    # Patient identification
    phone_number = models.CharField(max_length=20)
    patient = models.ForeignKey(
        "clients.Person", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="telephony_sessions",
    )
    language = models.CharField(max_length=20, default="english")

    # Prompt pack used
    prompt_pack = models.ForeignKey(
        PromptPack, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="sessions",
    )

    # Session state
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="INITIATED")
    current_question_code = models.CharField(max_length=100, blank=True)
    responses = models.JSONField(default=list)  # List of {question_code, key, timestamp}

    # Timing
    started_at = models.DateTimeField(default=timezone.now)
    ended_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(null=True, blank=True)

    # Emergency flag (spec §17.4)
    triggered_emergency = models.BooleanField(default=False)

    class Meta:
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["phone_number", "status"], name="tel_sess_ph_st_idx"),
            models.Index(fields=["patient", "status"], name="tel_sess_pt_st_idx"),
        ]

    def __str__(self):
        return f"{self.channel} session {self.session_id} ({self.status})"

    def add_response(self, question_code, key):
        """Add a DTMF/USSD response to the session."""
        self.responses.append({
            "question_code": question_code,
            "key": key,
            "timestamp": timezone.now().isoformat(),
        })
        self.save(update_fields=["responses", "updated_at"])

    def complete(self):
        """Mark the session as completed."""
        self.status = "COMPLETED"
        self.ended_at = timezone.now()
        if self.started_at:
            delta = self.ended_at - self.started_at
            self.duration_seconds = int(delta.total_seconds())
        self.save(update_fields=["status", "ended_at", "duration_seconds", "updated_at"])

    def mark_emergency(self):
        """Mark that this session triggered an emergency rule (spec §17.4)."""
        self.triggered_emergency = True
        self.save(update_fields=["triggered_emergency", "updated_at"])


class RemoteObservation(TimeStampedModel):
    """
    A patient observation captured via DTMF/USSD (spec §17, §8.2).

    Remote observations are central-first (spec §9.3) — they are persisted
    centrally and synced to the facility app later.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        TelephonySession, on_delete=models.CASCADE, related_name="observations",
    )
    patient = models.ForeignKey(
        "clients.Person", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="remote_observations",
    )

    # Observation data
    question_code = models.CharField(max_length=100)
    question_text = models.TextField(blank=True)
    response_key = models.CharField(max_length=10)
    response_value = models.CharField(max_length=200, blank=True)

    # Mapping to clinical facts (spec §17.3: structured answer mapping)
    mapped_facts = models.JSONField(default=dict)

    # Capture metadata (spec §8.2)
    capture_route = models.CharField(max_length=20, default="IVR_DTMF")
    source_prompt_id = models.CharField(max_length=100, blank=True)
    template_version = models.CharField(max_length=50, blank=True)
    captured_at = models.DateTimeField(default=timezone.now)

    # Emergency flag
    is_emergency = models.BooleanField(default=False)

    # Sync status (central-first)
    sync_status = models.CharField(max_length=20, default="SYNCED")

    class Meta:
        ordering = ["-captured_at"]
        indexes = [
            models.Index(fields=["patient", "captured_at"], name="remote_obs_pt_ct_idx"),
            models.Index(fields=["is_emergency"], name="remote_obs_emrg_idx"),
        ]

    def __str__(self):
        return f"Remote obs: {self.question_code} = {self.response_key} ({self.capture_route})"
