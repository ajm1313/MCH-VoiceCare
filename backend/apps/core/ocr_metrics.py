"""
OCR quality metrics (spec §16.5).

Benchmark at field level, not page-level character accuracy (spec §16.5).

Required metrics:
    - exact-match rate by field
    - abnormal-value sensitivity
    - false-normal rate
    - confirmation rate
    - failure rate by template, device, facility/region, and writer group
    - processing latency

This module provides:
    - OCRQualityMetrics: a dataclass/model for aggregated metrics.
    - OCRFieldMetric: a Django model storing per-field outcome records.
    - record_ocr_result(): records a metric row from an OCRResult / OCRJob.
    - get_quality_report(): aggregates metrics for a template + date range.
"""
import uuid
from dataclasses import dataclass, field as dc_field
from datetime import timedelta
from typing import Optional

from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel


# ---------------------------------------------------------------------------
# Aggregated metrics dataclass (spec §16.5)
# ---------------------------------------------------------------------------

@dataclass
class OCRQualityMetrics:
    """Aggregated OCR quality metrics for a template + date range (spec §16.5)."""
    template_id: str
    total_fields: int = 0
    exact_match_rate: float = 0.0
    abnormal_value_sensitivity: float = 0.0
    false_normal_rate: float = 0.0
    confirmation_rate: float = 0.0
    failure_rate: float = 0.0
    avg_latency_ms: float = 0.0
    field_breakdown: dict = dc_field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "templateId": self.template_id,
            "totalFields": self.total_fields,
            "exactMatchRate": round(self.exact_match_rate, 4),
            "abnormalValueSensitivity": round(self.abnormal_value_sensitivity, 4),
            "falseNormalRate": round(self.false_normal_rate, 4),
            "confirmationRate": round(self.confirmation_rate, 4),
            "failureRate": round(self.failure_rate, 4),
            "avgLatencyMs": round(self.avg_latency_ms, 2),
            "fieldBreakdown": self.field_breakdown,
        }


# ---------------------------------------------------------------------------
# Per-field metric record (Django model)
# ---------------------------------------------------------------------------

class OCRFieldMetric(TimeStampedModel):
    """
    Per-field OCR outcome record used to compute quality metrics (spec §16.5).

    A row is created when an OCR job is confirmed or rejected. The
    ``ground_truth_value`` is populated from human corrections (or the
    extracted value when confirmed without correction).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    template = models.ForeignKey(
        "core.DocumentTemplate", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="field_metrics",
    )
    ocr_job = models.ForeignKey(
        "core.OCRJob", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="field_metrics",
    )
    template_code = models.CharField(max_length=100, blank=True)
    field_key = models.CharField(max_length=100)
    recognizer = models.CharField(max_length=50, blank=True)

    # Extracted vs ground truth.
    extracted_value = models.TextField(blank=True)
    extracted_confidence = models.FloatField(default=0.0)
    ground_truth_value = models.TextField(blank=True)
    is_exact_match = models.BooleanField(default=False)

    # Outcome flags.
    is_abnormal = models.BooleanField(default=False)
    detected_abnormal = models.BooleanField(default=False)
    is_failure = models.BooleanField(default=False)
    is_confirmed = models.BooleanField(default=False)

    # Context.
    device_id = models.CharField(max_length=100, blank=True)
    facility_code = models.CharField(max_length=100, blank=True)
    writer_group = models.CharField(max_length=100, blank=True)

    # Latency of the parent OCR job (ms).
    latency_ms = models.FloatField(default=0.0)

    recorded_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-recorded_at"]
        indexes = [
            models.Index(fields=["template_code", "recorded_at"], name="ocr_fm_tmpl_dt_idx"),
            models.Index(fields=["field_key"], name="ocr_fm_field_idx"),
            models.Index(fields=["device_id"], name="ocr_fm_device_idx"),
            models.Index(fields=["facility_code"], name="ocr_fm_facility_idx"),
        ]

    def __str__(self):
        return f"OCRFieldMetric({self.template_code}:{self.field_key})"


# ---------------------------------------------------------------------------
# Recording (spec §16.5)
# ---------------------------------------------------------------------------

def record_ocr_result(ocr_result, job=None, ground_truth: Optional[dict] = None) -> int:
    """
    Record per-field metric rows from an OCRResult or OCRJob (spec §16.5).

    Args:
        ocr_result: An OCRResult dataclass OR an OCRJob instance. When an
            OCRJob is passed, its extracted_fields are used.
        job: Optional OCRJob for context (device, facility, latency).
        ground_truth: Optional dict of {field_key: true_value}. When
            omitted, the extracted value is treated as ground truth for
            confirmed jobs (i.e. exact match unless corrected).

    Returns:
        The number of metric rows created.
    """
    ground_truth = ground_truth or {}

    # Normalize: accept either OCRResult or OCRJob.
    fields_data = []
    template_id = ""
    latency_ms = 0.0
    device_id = ""
    facility_code = ""
    writer_group = ""
    is_confirmed_job = False

    if hasattr(ocr_result, "fields") and isinstance(ocr_result.fields, list):
        # OCRResult dataclass
        template_id = ocr_result.template_id or ""
        latency_ms = float(ocr_result.duration_ms or 0)
        for f in ocr_result.fields:
            fields_data.append({
                "key": f.key,
                "value": f.value,
                "confidence": f.confidence,
                "recognizer": "",
                "is_failure": bool(ocr_result.error),
            })
    elif hasattr(ocr_result, "extracted_fields"):
        # OCRJob instance
        template_id = (ocr_result.template.template_id if ocr_result.template else "")
        latency_ms = float(ocr_result.ocr_duration_ms or 0)
        device_id = ocr_result.device_id or ""
        is_confirmed_job = ocr_result.status == "CONFIRMED"
        for f in ocr_result.extracted_fields:
            extracted = f.get("corrected_value") or f.get("value", "")
            fields_data.append({
                "key": f.get("key", ""),
                "value": extracted,
                "confidence": float(f.get("confidence", 0.0)),
                "recognizer": "",
                "is_failure": ocr_result.status == "FAILED",
                "is_confirmed": f.get("human_confirmed", False) or is_confirmed_job,
            })

    if job is not None:
        device_id = job.device_id or device_id
        latency_ms = float(job.ocr_duration_ms or latency_ms)
        if job.template:
            template_id = job.template.template_id or template_id

    created = 0
    for fd in fields_data:
        key = fd.get("key")
        if not key:
            continue
        extracted_value = fd.get("value", "")
        truth = ground_truth.get(key, extracted_value)
        is_exact = (str(extracted_value).strip() == str(truth).strip()) and bool(truth)
        is_failure = fd.get("is_failure", False)
        is_confirmed = fd.get("is_confirmed", False)

        OCRFieldMetric.objects.create(
            template=job.template if job and job.template else None,
            ocr_job=job if job else None,
            template_code=template_id,
            field_key=key,
            recognizer=fd.get("recognizer", ""),
            extracted_value=str(extracted_value),
            extracted_confidence=float(fd.get("confidence", 0.0)),
            ground_truth_value=str(truth),
            is_exact_match=is_exact,
            is_abnormal=False,
            detected_abnormal=False,
            is_failure=is_failure,
            is_confirmed=is_confirmed,
            device_id=device_id,
            facility_code=facility_code,
            writer_group=writer_group,
            latency_ms=latency_ms,
        )
        created += 1

    return created


# ---------------------------------------------------------------------------
# Reporting (spec §16.5)
# ---------------------------------------------------------------------------

def get_quality_report(
    template_id: str,
    date_range: Optional[timedelta] = None,
    start=None,
    end=None,
) -> OCRQualityMetrics:
    """
    Aggregate quality metrics for a template over a date range (spec §16.5).

    Args:
        template_id: The template_id to filter on.
        date_range: A timedelta lookback window (e.g. timedelta(days=30)).
            If neither date_range nor start/end are given, defaults to 30 days.
        start: Explicit start datetime.
        end: Explicit end datetime.

    Returns:
        OCRQualityMetrics with aggregated rates.
    """
    if end is None:
        end = timezone.now()
    if start is None:
        if date_range is not None:
            start = end - date_range
        else:
            start = end - timedelta(days=30)

    qs = OCRFieldMetric.objects.filter(
        template_code=template_id,
        recorded_at__gte=start,
        recorded_at__lte=end,
    )

    rows = list(qs)
    total = len(rows)
    metrics = OCRQualityMetrics(template_id=template_id, total_fields=total)

    if total == 0:
        return metrics

    exact_matches = sum(1 for r in rows if r.is_exact_match)
    failures = sum(1 for r in rows if r.is_failure)
    confirmed = sum(1 for r in rows if r.is_confirmed)
    abnormal_total = sum(1 for r in rows if r.is_abnormal)
    abnormal_detected = sum(1 for r in rows if r.is_abnormal and r.detected_abnormal)
    false_normals = sum(1 for r in rows if r.is_abnormal and not r.detected_abnormal)
    latency_sum = sum(r.latency_ms for r in rows)

    metrics.exact_match_rate = exact_matches / total
    metrics.failure_rate = failures / total
    metrics.confirmation_rate = confirmed / total
    metrics.avg_latency_ms = latency_sum / total

    if abnormal_total > 0:
        metrics.abnormal_value_sensitivity = abnormal_detected / abnormal_total
        metrics.false_normal_rate = false_normals / abnormal_total
    else:
        metrics.abnormal_value_sensitivity = 0.0
        metrics.false_normal_rate = 0.0

    # Per-field breakdown.
    breakdown = {}
    for r in rows:
        bucket = breakdown.setdefault(r.field_key, {"total": 0, "exact": 0, "failures": 0})
        bucket["total"] += 1
        if r.is_exact_match:
            bucket["exact"] += 1
        if r.is_failure:
            bucket["failures"] += 1
    for key, bucket in breakdown.items():
        bucket["exactMatchRate"] = bucket["exact"] / bucket["total"] if bucket["total"] else 0.0
        bucket["failureRate"] = bucket["failures"] / bucket["total"] if bucket["total"] else 0.0
    metrics.field_breakdown = breakdown

    return metrics


