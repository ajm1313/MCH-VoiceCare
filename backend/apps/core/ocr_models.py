"""
OCR models — template registry + OCR job tracking (spec §16, §25).

The OCR pipeline operates on versioned Ghana MCH Record Book templates.
Safety-critical OCR fields MUST require human confirmation (spec §16.3, §16.6).
Scan retention is policy-driven (spec §25).
"""
import uuid

from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel


class DocumentTemplate(TimeStampedModel):
    """
    Registry of supported MCH document templates (spec §16.2).

    Each template defines a page type, version, and the fields that can be
    extracted from it, along with per-field OCR confidence thresholds.
    Unknown pages MUST route to manual entry (spec §16.4).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    template_id = models.CharField(max_length=100, unique=True, verbose_name="Template ID")
    name = models.CharField(max_length=200)
    page_type = models.CharField(max_length=50)
    version = models.CharField(max_length=50)
    status = models.CharField(max_length=20, default="ACTIVE")
    description = models.TextField(blank=True)

    # Field definitions: list of dicts, each containing:
    #   - key: field identifier
    #   - label: human-readable label
    #   - type: "text" | "number" | "decimal" | "date" | "checkbox"
    #   - unit: optional unit string
    #   - required: bool
    #   - safety_critical: bool
    #   - confidence_threshold: float (0.0-1.0)
    #   - range_min: optional numeric minimum
    #   - range_max: optional numeric maximum
    #   - bbox: [x, y, width, height] — region coordinates for ROI extraction
    #   - recognizer: "printed" | "handwritten_numeric" | "handwritten_text" | "checkbox"
    #     — which OCR engine to use for this field
    field_definitions = models.JSONField(
        default=list,
        help_text=(
            "List of field definition dicts. Each dict should include: "
            "key, label, type, unit, required, safety_critical, "
            "confidence_threshold, range_min, range_max, "
            "bbox ([x, y, width, height] for ROI extraction), and "
            "recognizer ('printed' | 'handwritten_numeric' | "
            "'handwritten_text' | 'checkbox')."
        ),
    )

    # Template image reference for geometric alignment (spec §16.3)
    reference_image_url = models.CharField(max_length=500, blank=True)

    # Page dimensions for geometric alignment (e.g., "A4", "210x297mm")
    page_dimensions = models.CharField(max_length=100, blank=True)

    # Date from which this template version is active (spec §16.4)
    active_from = models.DateField(null=True, blank=True)

    activated_at = models.DateTimeField(null=True, blank=True)
    retired_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["template_id", "version"], name="doc_tmpl_id_ver_idx"),
            models.Index(fields=["page_type", "status"], name="doc_tmpl_pt_st_idx"),
        ]

    def __str__(self):
        return f"{self.name} v{self.version} ({self.status})"

    @classmethod
    def get_active_templates(cls):
        """Return all active templates."""
        return cls.objects.filter(status="ACTIVE")

    @classmethod
    def get_template(cls, template_id):
        """Get an active template by template_id."""
        return cls.objects.filter(template_id=template_id, status="ACTIVE").first()

    def get_safety_critical_fields(self):
        """Return field definitions marked as safety_critical."""
        return [f for f in self.field_definitions if f.get("safety_critical", False)]

    def get_field(self, field_key):
        """Get a single field definition by key."""
        for f in self.field_definitions:
            if f.get("key") == field_key:
                return f
        return None


class OCRJob(TimeStampedModel):
    """
    Tracks an OCR processing job (spec §16, §25).

    Lifecycle: PENDING → PROCESSING → EXTRACTED → CONFIRMED / REJECTED / FAILED

    Safety-critical fields MUST be human-confirmed before entering clinical
    scoring (spec §16.3, §16.6).
    """
    STATUS_CHOICES = [
        ("PENDING", "Pending — image uploaded, not yet processed"),
        ("PROCESSING", "Processing — OCR in progress"),
        ("EXTRACTED", "Extracted — fields extracted, awaiting confirmation"),
        ("CONFIRMED", "Confirmed — human confirmed, ready for clinical use"),
        ("REJECTED", "Rejected — human rejected the extraction"),
        ("FAILED", "Failed — OCR processing error"),
        ("UNKNOWN_TEMPLATE", "Unknown template — manual entry required (spec §16.4)"),
        ("EXPIRED", "Expired — retention window elapsed, image purged"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(
        "clients.Person", on_delete=models.CASCADE, null=True, blank=True,
        related_name="ocr_jobs",
    )
    template = models.ForeignKey(
        DocumentTemplate, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="ocr_jobs",
    )
    episode = models.CharField(max_length=50, blank=True, verbose_name="Episode Type")

    # Image storage
    image_path = models.CharField(max_length=500, blank=True)
    image_hash = models.CharField(max_length=64, blank=True, verbose_name="SHA-256 of image")

    # Status
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")

    # Extracted data: list of {key, value, confidence, unit, human_confirmed, corrected_value}
    extracted_fields = models.JSONField(default=list)

    # Processing metadata
    ocr_engine = models.CharField(max_length=50, blank=True)
    ocr_duration_ms = models.PositiveIntegerField(null=True, blank=True)
    ocr_error = models.TextField(blank=True)

    # Confirmation
    confirmed_by = models.CharField(max_length=200, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    # Retention (spec §25)
    captured_at = models.DateTimeField(default=timezone.now)
    purge_eligible_at = models.DateTimeField(null=True, blank=True)
    purged_at = models.DateTimeField(null=True, blank=True)

    # Capture metadata (spec §8.2)
    captured_by = models.CharField(max_length=200, blank=True)
    device_id = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status"], name="ocr_job_status_idx"),
            models.Index(fields=["patient", "status"], name="ocr_job_pt_st_idx"),
        ]

    def __str__(self):
        return f"OCR Job {self.id} ({self.status})"

    @property
    def has_unconfirmed_safety_critical(self):
        """Check if any safety-critical fields are not yet human-confirmed."""
        for field in self.extracted_fields:
            if field.get("safety_critical") and not field.get("human_confirmed", False):
                return True
        return False

    @property
    def is_purge_eligible(self):
        """Check if the image is eligible for purging (spec §25)."""
        if self.purged_at is not None:
            return False
        if self.purge_eligible_at is None:
            return False
        return timezone.now() >= self.purge_eligible_at

    def mark_confirmed(self, confirmed_by, field_corrections=None):
        """
        Mark the job as confirmed with optional field corrections (spec §16.6).
        field_corrections: dict of {field_key: corrected_value}
        """
        if field_corrections:
            for field in self.extracted_fields:
                key = field.get("key")
                if key in field_corrections:
                    field["corrected_value"] = field_corrections[key]
                    field["human_confirmed"] = True
                elif field.get("safety_critical"):
                    field["human_confirmed"] = True
        else:
            for field in self.extracted_fields:
                field["human_confirmed"] = True

        self.status = "CONFIRMED"
        self.confirmed_by = confirmed_by
        self.confirmed_at = timezone.now()
        self.save(update_fields=[
            "extracted_fields", "status", "confirmed_by", "confirmed_at", "updated_at",
        ])

    def mark_rejected(self, rejected_by, reason=""):
        """Mark the job as rejected."""
        self.status = "REJECTED"
        self.confirmed_by = rejected_by
        self.confirmed_at = timezone.now()
        self.rejection_reason = reason
        self.save(update_fields=[
            "status", "confirmed_by", "confirmed_at", "rejection_reason", "updated_at",
        ])

    def mark_failed(self, error_message):
        """Mark the job as failed."""
        self.status = "FAILED"
        self.ocr_error = error_message
        self.save(update_fields=["status", "ocr_error", "updated_at"])
