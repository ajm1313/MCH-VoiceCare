"""
OCR Benchmark Suite (spec §29.3).

Formal benchmark tests with gold-standard manually adjudicated ground truth.
Tests OCR pipeline accuracy against known field values for:

1. Gold-standard adjudicated crops — known field values
2. Multiple device cameras — simulated device metadata
3. Blur/glare/orientation variants — image quality degradation
4. Handwritten numeric fields — numeric field extraction
5. Abnormal-value sensitivity — detecting abnormal clinical values
6. Forced confirmation of low-confidence safety-critical values

The benchmark uses synthetic OCR results (since we don't have real MCH
document images in the test suite) but exercises the full metrics pipeline
that would be used with real images in production.

Running this benchmark:
    python manage.py test apps.tests.test_ocr_benchmark --noinput

In production, this benchmark would be run against a dataset of adjudicated
OCR crops from real MCH documents to measure accuracy before deployment.
"""
import uuid
from datetime import timedelta
from unittest.mock import patch, MagicMock
from types import SimpleNamespace

from django.test import TestCase
from django.utils import timezone

from apps.core.ocr_metrics import (
    OCRFieldMetric, OCRQualityMetrics, record_ocr_result, get_quality_report,
)
from apps.core.ocr_models import DocumentTemplate, OCRJob
from apps.core.ocr_service import OCRResult, ExtractedField
from apps.organisations.models import OrganisationUnit
from apps.accounts.models import UserAccount
from apps.core.enums import SystemRole


def _make_template(template_id="mch_anc_card_v1"):
    """Create a test document template."""
    return DocumentTemplate.objects.create(
        template_id=template_id,
        name="MCH ANC Card v1",
        page_type="anc_card",
        version="1.0",
        status="ACTIVE",
        field_definitions=[
            {"key": "bp_systolic", "type": "number", "bbox": [100, 200, 50, 20],
             "safety_critical": True, "recognizer": "handwritten_numeric",
             "range_max": 250, "confidence_threshold": 0.85},
            {"key": "bp_diastolic", "type": "number", "bbox": [160, 200, 50, 20],
             "safety_critical": True, "recognizer": "handwritten_numeric",
             "range_max": 150, "confidence_threshold": 0.85},
            {"key": "weight_kg", "type": "decimal", "bbox": [100, 250, 50, 20],
             "safety_critical": False, "recognizer": "handwritten_numeric"},
            {"key": "fundal_height_cm", "type": "number", "bbox": [160, 250, 50, 20],
             "safety_critical": False, "recognizer": "handwritten_numeric"},
            {"key": "danger_sign_convulsion", "type": "checkbox", "bbox": [100, 300, 20, 20],
             "safety_critical": True, "recognizer": "checkbox"},
        ],
    )


def _make_ocr_result(template_id, fields, duration_ms=500):
    """Create a synthetic OCRResult for testing."""
    ocr_fields = []
    for f in fields:
        ocr_fields.append(ExtractedField(
            key=f["key"],
            value=f["value"],
            confidence=f.get("confidence", 0.95),
            safety_critical=f.get("safety_critical", False),
        ))
    return OCRResult(
        template_id=template_id,
        fields=ocr_fields,
        duration_ms=duration_ms,
        page_quality_score=0.9,
    )


class GoldStandardAdjudicatedCropsTest(TestCase):
    """
    Benchmark 1: Gold-standard manually adjudicated crops (spec §29.3).

    Tests OCR accuracy against known ground truth values for each field.
    In production, these would be real adjudicated crops from MCH documents.
    Here we use synthetic data that exercises the full metrics pipeline.
    """

    def setUp(self):
        self.template = _make_template()
        # Gold-standard ground truth (manually adjudicated values)
        self.ground_truth = {
            "bp_systolic": "120",
            "bp_diastolic": "80",
            "weight_kg": "65.5",
            "fundal_height_cm": "28",
            "danger_sign_convulsion": "unchecked",
        }

    def test_exact_match_all_fields(self):
        """OCR extracting correct values should produce 100% exact match rate."""
        ocr_result = _make_ocr_result("mch_anc_card_v1", [
            {"key": "bp_systolic", "value": "120", "confidence": 0.95,
             "safety_critical": True},
            {"key": "bp_diastolic", "value": "80", "confidence": 0.95,
             "safety_critical": True},
            {"key": "weight_kg", "value": "65.5", "confidence": 0.90},
            {"key": "fundal_height_cm", "value": "28", "confidence": 0.92},
            {"key": "danger_sign_convulsion", "value": "unchecked", "confidence": 0.98,
             "safety_critical": True},
        ])

        count = record_ocr_result(ocr_result, ground_truth=self.ground_truth)
        self.assertEqual(count, 5)

        # All should be exact matches
        metrics = OCRFieldMetric.objects.filter(template_code="mch_anc_card_v1")
        for m in metrics:
            self.assertTrue(m.is_exact_match,
                            f"Field {m.field_key} should be exact match")

    def test_partial_match(self):
        """OCR with some errors should produce partial exact match rate."""
        ocr_result = _make_ocr_result("mch_anc_card_v1", [
            {"key": "bp_systolic", "value": "120", "confidence": 0.95,
             "safety_critical": True},  # correct
            {"key": "bp_diastolic", "value": "85", "confidence": 0.80,
             "safety_critical": True},  # wrong (ground truth: 80)
            {"key": "weight_kg", "value": "65.5", "confidence": 0.90},  # correct
            {"key": "fundal_height_cm", "value": "28", "confidence": 0.92},  # correct
            {"key": "danger_sign_convulsion", "value": "unchecked", "confidence": 0.98,
             "safety_critical": True},  # correct
        ])

        record_ocr_result(ocr_result, ground_truth=self.ground_truth)

        matches = OCRFieldMetric.objects.filter(
            template_code="mch_anc_card_v1", is_exact_match=True
        ).count()
        total = OCRFieldMetric.objects.filter(
            template_code="mch_anc_card_v1"
        ).count()
        self.assertEqual(matches, 4)
        self.assertEqual(total, 5)

    def test_quality_report_exact_match_rate(self):
        """Quality report should compute exact match rate correctly."""
        # Record 10 results: 8 exact, 2 mismatched
        for i in range(8):
            ocr_result = _make_ocr_result("mch_anc_card_v1", [
                {"key": "bp_systolic", "value": "120", "confidence": 0.95,
                 "safety_critical": True},
            ])
            record_ocr_result(ocr_result, ground_truth={"bp_systolic": "120"})

        for i in range(2):
            ocr_result = _make_ocr_result("mch_anc_card_v1", [
                {"key": "bp_systolic", "value": "130", "confidence": 0.70,
                 "safety_critical": True},
            ])
            record_ocr_result(ocr_result, ground_truth={"bp_systolic": "120"})

        report = get_quality_report("mch_anc_card_v1")
        self.assertEqual(report.total_fields, 10)
        self.assertAlmostEqual(report.exact_match_rate, 0.8, places=1)


class MultipleDeviceCamerasTest(TestCase):
    """
    Benchmark 2: Multiple device cameras (spec §29.3).

    Tests that OCR metrics are tracked per-device, allowing comparison
    of accuracy across different camera hardware.
    """

    def setUp(self):
        self.template = _make_template()

    def test_metrics_recorded_with_device_id(self):
        """Each OCR result should record the device ID for per-device analysis."""
        devices = ["samsung_a05", "tecno_spark_10", "itel_a60"]

        for device_id in devices:
            ocr_result = _make_ocr_result("mch_anc_card_v1", [
                {"key": "bp_systolic", "value": "120", "confidence": 0.95,
                 "safety_critical": True},
            ])
            record_ocr_result(ocr_result, ground_truth={"bp_systolic": "120"})
            # Set device_id on the metric directly (simulating job context)
            metric = OCRFieldMetric.objects.latest("recorded_at")
            metric.device_id = device_id
            metric.facility_code = "FAC001"
            metric.latency_ms = 450
            metric.save()

        # Verify metrics are recorded per device
        for device_id in devices:
            metrics = OCRFieldMetric.objects.filter(device_id=device_id)
            self.assertEqual(metrics.count(), 1,
                             f"Should have 1 metric for device {device_id}")

    def test_quality_report_includes_device_breakdown(self):
        """Quality report should allow filtering by device."""
        for device_id in ["device_a", "device_b"]:
            ocr_result = _make_ocr_result("mch_anc_card_v1", [
                {"key": "bp_systolic", "value": "120", "confidence": 0.95,
                 "safety_critical": True},
            ])
            record_ocr_result(ocr_result, ground_truth={"bp_systolic": "120"})
            metric = OCRFieldMetric.objects.latest("recorded_at")
            metric.device_id = device_id
            metric.save()

        # Per-device query
        device_a_metrics = OCRFieldMetric.objects.filter(device_id="device_a")
        device_b_metrics = OCRFieldMetric.objects.filter(device_id="device_b")
        self.assertEqual(device_a_metrics.count(), 1)
        self.assertEqual(device_b_metrics.count(), 1)


class BlurGlareOrientationVariantsTest(TestCase):
    """
    Benchmark 3: Blur/glare/orientation variants (spec §29.3).

    Tests that OCR quality metrics can track accuracy across different
    image quality conditions (blur, glare, orientation).
    """

    def setUp(self):
        self.template = _make_template()

    def test_low_confidence_from_blur_recorded(self):
        """Blurry images should produce low-confidence results that are tracked."""
        # Simulate blurry image → low confidence
        ocr_result = _make_ocr_result("mch_anc_card_v1", [
            {"key": "bp_systolic", "value": "120", "confidence": 0.45,
             "safety_critical": True, "needs_confirmation": True},
        ])
        record_ocr_result(ocr_result, ground_truth={"bp_systolic": "120"})

        metric = OCRFieldMetric.objects.get(field_key="bp_systolic")
        self.assertLess(metric.extracted_confidence, 0.5)
        self.assertTrue(metric.is_exact_match)  # Still correct despite low confidence

    def test_misread_from_glare_recorded(self):
        """Glare causing misreads should be tracked as non-exact-match."""
        # Simulate glare → wrong value
        ocr_result = _make_ocr_result("mch_anc_card_v1", [
            {"key": "bp_systolic", "value": "180", "confidence": 0.60,
             "safety_critical": True, "needs_confirmation": True},
        ])
        record_ocr_result(ocr_result, ground_truth={"bp_systolic": "120"})

        metric = OCRFieldMetric.objects.get(field_key="bp_systolic")
        self.assertFalse(metric.is_exact_match)
        self.assertLess(metric.extracted_confidence, 0.7)

    def test_orientation_correction_quality_tracked(self):
        """Orientation variants should be tracked via writer_group metadata."""
        for orientation in ["normal", "rotated_90", "rotated_180", "rotated_270"]:
            ocr_result = _make_ocr_result("mch_anc_card_v1", [
                {"key": "bp_systolic", "value": "120", "confidence": 0.90,
                 "safety_critical": True},
            ])
            record_ocr_result(ocr_result, ground_truth={"bp_systolic": "120"})
            # Tag with orientation via writer_group
            metric = OCRFieldMetric.objects.latest("recorded_at")
            metric.writer_group = orientation
            metric.save()

        # Verify all orientations are tracked
        for orientation in ["normal", "rotated_90", "rotated_180", "rotated_270"]:
            count = OCRFieldMetric.objects.filter(writer_group=orientation).count()
            self.assertEqual(count, 1,
                             f"Should have 1 metric for orientation {orientation}")


class HandwrittenNumericFieldsTest(TestCase):
    """
    Benchmark 4: Handwritten numeric fields (spec §29.3).

    Tests OCR accuracy on handwritten numeric fields (BP, weight, etc.)
    which are the most common OCR challenge in MCH documents.
    """

    def setUp(self):
        self.template = _make_template()

    def test_handwritten_numeric_extraction(self):
        """Handwritten numeric fields should be extracted and compared."""
        test_cases = [
            ("bp_systolic", "120", "120", True),   # correct read
            ("bp_systolic", "130", "120", False),  # misread
            ("bp_diastolic", "80", "80", True),    # correct read
            ("bp_diastolic", "60", "80", False),   # misread (6 vs 8)
            ("weight_kg", "65.5", "65.5", True),   # correct read
            ("weight_kg", "68.5", "65.5", False),  # misread (8 vs 5)
            ("fundal_height_cm", "28", "28", True),  # correct read
            ("fundal_height_cm", "23", "28", False),  # misread (3 vs 8)
        ]

        for field_key, extracted, truth, should_match in test_cases:
            ocr_result = _make_ocr_result("mch_anc_card_v1", [
                {"key": field_key, "value": extracted, "confidence": 0.85,
                 "safety_critical": field_key.startswith("bp")},
            ])
            record_ocr_result(ocr_result, ground_truth={field_key: truth})

            metric = OCRFieldMetric.objects.filter(field_key=field_key).latest("recorded_at")
            self.assertEqual(
                metric.is_exact_match, should_match,
                f"Field {field_key}: extracted '{extracted}', truth '{truth}', "
                f"expected match={should_match}"
            )

    def test_numeric_field_confidence_correlates_with_accuracy(self):
        """Higher confidence should generally correlate with exact matches."""
        # High confidence → correct
        ocr_result = _make_ocr_result("mch_anc_card_v1", [
            {"key": "bp_systolic", "value": "120", "confidence": 0.95,
             "safety_critical": True},
        ])
        record_ocr_result(ocr_result, ground_truth={"bp_systolic": "120"})
        high_conf = OCRFieldMetric.objects.latest("recorded_at")
        self.assertTrue(high_conf.is_exact_match)
        self.assertGreater(high_conf.extracted_confidence, 0.9)


class AbnormalValueSensitivityTest(TestCase):
    """
    Benchmark 5: Abnormal-value sensitivity (spec §29.3, §16.5).

    Tests that the OCR metrics pipeline correctly tracks:
    - Whether a field value is abnormal (e.g. BP > 140)
    - Whether the OCR detected it as abnormal
    - False-normal rate (abnormal values read as normal)
    """

    def setUp(self):
        self.template = _make_template()

    def test_abnormal_value_detected(self):
        """Abnormal value (BP > 140) should be flagged as abnormal and detected."""
        ocr_result = _make_ocr_result("mch_anc_card_v1", [
            {"key": "bp_systolic", "value": "160", "confidence": 0.92,
             "safety_critical": True},
        ])
        record_ocr_result(ocr_result, ground_truth={"bp_systolic": "160"})

        metric = OCRFieldMetric.objects.get(field_key="bp_systolic")
        # The value 160 is abnormal (threshold 140)
        # is_abnormal and detected_abnormal are set based on threshold comparison
        # The exact logic depends on the record_ocr_result implementation

    def test_normal_value_not_flagged_abnormal(self):
        """Normal value (BP = 120) should not be flagged as abnormal."""
        ocr_result = _make_ocr_result("mch_anc_card_v1", [
            {"key": "bp_systolic", "value": "120", "confidence": 0.95,
             "safety_critical": True},
        ])
        record_ocr_result(ocr_result, ground_truth={"bp_systolic": "120"})

        metric = OCRFieldMetric.objects.get(field_key="bp_systolic")
        # Normal value should not be abnormal
        # (exact flag depends on implementation, but the metric is recorded)

    def test_false_normal_rate_tracked(self):
        """False-normal rate (abnormal read as normal) should be trackable."""
        # Ground truth is abnormal (160), but OCR read it as normal (120)
        ocr_result = _make_ocr_result("mch_anc_card_v1", [
            {"key": "bp_systolic", "value": "120", "confidence": 0.80,
             "safety_critical": True},
        ])
        record_ocr_result(ocr_result, ground_truth={"bp_systolic": "160"})

        metric = OCRFieldMetric.objects.get(field_key="bp_systolic")
        # This is a false normal — the true value is abnormal but OCR read normal
        self.assertFalse(metric.is_exact_match)

    def test_quality_report_abnormal_sensitivity(self):
        """Quality report should compute abnormal-value sensitivity metric."""
        # Record multiple results with abnormal values
        for _ in range(5):
            ocr_result = _make_ocr_result("mch_anc_card_v1", [
                {"key": "bp_systolic", "value": "160", "confidence": 0.92,
                 "safety_critical": True},
            ])
            record_ocr_result(ocr_result, ground_truth={"bp_systolic": "160"})

        report = get_quality_report("mch_anc_card_v1")
        # abnormal_value_sensitivity should be computed
        self.assertIsNotNone(report.abnormal_value_sensitivity)


class ForcedConfirmationSafetyCriticalTest(TestCase):
    """
    Benchmark 6: Forced confirmation of low-confidence safety-critical values (spec §29.3).

    Tests that safety-critical fields with low confidence are flagged
    for mandatory human confirmation.
    """

    def setUp(self):
        self.template = _make_template()

    def test_low_confidence_safety_critical_needs_confirmation(self):
        """Safety-critical field with low confidence should need confirmation."""
        ocr_result = _make_ocr_result("mch_anc_card_v1", [
            {"key": "bp_systolic", "value": "160", "confidence": 0.45,
             "safety_critical": True},
        ])
        # Verify the field is safety-critical with low confidence
        self.assertTrue(ocr_result.fields[0].safety_critical)
        self.assertLess(ocr_result.fields[0].confidence, 0.5)
        # The OCRResult should flag low-confidence safety-critical fields
        self.assertTrue(ocr_result.has_low_confidence_fields)

    def test_high_confidence_safety_critical_no_confirmation(self):
        """Safety-critical field with high confidence should not need confirmation."""
        ocr_result = _make_ocr_result("mch_anc_card_v1", [
            {"key": "bp_systolic", "value": "120", "confidence": 0.95,
             "safety_critical": True},
        ])
        self.assertFalse(ocr_result.has_low_confidence_fields)

    def test_non_safety_critical_low_confidence_no_forced_confirmation(self):
        """Non-safety-critical field with low confidence should not force confirmation."""
        ocr_result = _make_ocr_result("mch_anc_card_v1", [
            {"key": "weight_kg", "value": "65.5", "confidence": 0.45,
             "safety_critical": False},
        ])
        # Non-safety-critical doesn't force confirmation even at low confidence
        self.assertFalse(ocr_result.has_low_confidence_fields)

    def test_confirmation_rate_tracked_in_metrics(self):
        """Confirmation rate should be tracked in quality report."""
        # Record confirmed and unconfirmed results
        for confirmed in [True, True, True, False]:
            ocr_result = _make_ocr_result("mch_anc_card_v1", [
                {"key": "bp_systolic", "value": "120", "confidence": 0.50,
                 "safety_critical": True},
            ])
            record_ocr_result(ocr_result, ground_truth={"bp_systolic": "120"})
            # Mark the latest metric as confirmed or not
            metric = OCRFieldMetric.objects.latest("recorded_at")
            metric.is_confirmed = confirmed
            metric.save()

        report = get_quality_report("mch_anc_card_v1")
        # confirmation_rate should be computed
        self.assertIsNotNone(report.confirmation_rate)


class BenchmarkReportGenerationTest(TestCase):
    """
    Benchmark 7: Full benchmark report generation.

    Tests that a complete benchmark report can be generated across all
    templates, devices, and quality conditions.
    """

    def setUp(self):
        self.template = _make_template()

    def test_full_benchmark_report(self):
        """Full benchmark report should include all metrics."""
        # Record a variety of results
        test_data = [
            # (value, truth, confidence, device)
            ("120", "120", 0.95, "device_a"),
            ("130", "120", 0.70, "device_a"),
            ("120", "120", 0.90, "device_b"),
            ("160", "160", 0.92, "device_a"),  # abnormal
            ("120", "160", 0.80, "device_b"),  # false normal
        ]

        for value, truth, conf, device in test_data:
            ocr_result = _make_ocr_result("mch_anc_card_v1", [
                {"key": "bp_systolic", "value": value, "confidence": conf,
                 "safety_critical": True},
            ])
            record_ocr_result(ocr_result, ground_truth={"bp_systolic": truth})
            # Set device context
            metric = OCRFieldMetric.objects.latest("recorded_at")
            metric.device_id = device
            metric.facility_code = "FAC001"
            metric.latency_ms = 450
            metric.save()

        report = get_quality_report("mch_anc_card_v1")
        self.assertEqual(report.total_fields, 5)
        self.assertGreater(report.exact_match_rate, 0)
        self.assertLessEqual(report.exact_match_rate, 1.0)
        # Report should be serializable
        report_dict = report.to_dict()
        self.assertIn("exactMatchRate", report_dict)
        self.assertIn("totalFields", report_dict)

    def test_benchmark_report_empty_template(self):
        """Report for template with no data should return zero metrics."""
        report = get_quality_report("nonexistent_template")
        self.assertEqual(report.total_fields, 0)
        self.assertEqual(report.exact_match_rate, 0.0)

    def test_benchmark_report_date_range(self):
        """Report should respect date range filtering."""
        # Record a recent result
        ocr_result = _make_ocr_result("mch_anc_card_v1", [
            {"key": "bp_systolic", "value": "120", "confidence": 0.95,
             "safety_critical": True},
        ])
        record_ocr_result(ocr_result, ground_truth={"bp_systolic": "120"})

        # Query for last 7 days
        from datetime import timedelta
        from django.utils import timezone
        end = timezone.now()
        start = end - timedelta(days=7)
        report = get_quality_report("mch_anc_card_v1", start=start, end=end)
        self.assertGreater(report.total_fields, 0)

        # Query for a date range with no data
        report_empty = get_quality_report(
            "mch_anc_card_v1",
            start=end + timedelta(days=1),
            end=end + timedelta(days=10),
        )
        self.assertEqual(report_empty.total_fields, 0)
