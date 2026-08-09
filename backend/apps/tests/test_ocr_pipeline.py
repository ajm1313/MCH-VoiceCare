"""
Tests for the full OCR pipeline (spec §16.2 - §16.5).

Covers:
    - Preprocessing: blur detection, glare detection, orientation correction
    - ROI extraction
    - Checkbox extractor
    - Full pipeline with a template
    - Template detection
    - Quality metrics recording + reporting
"""
import io
from datetime import date, timedelta

from django.test import TestCase
from django.utils import timezone

from apps.core.enums import SystemRole, Sex
from apps.core.ocr_models import DocumentTemplate, OCRJob
from apps.core.ocr_service import (
    RealOCRAdapter, StubOCRAdapter, set_ocr_adapter, OCRResult, ExtractedField,
)
from apps.core.ocr_preprocessing import (
    blur_detection, glare_detection, orientation_correction,
    run_preprocessing_pipeline,
)
from apps.core.ocr_roi import extract_rois, align_to_template
from apps.core.ocr_extractors import (
    CheckboxExtractor, PrintedTextExtractor, HandwrittenNumberExtractor,
    FieldExtractorFactory,
)
from apps.core.ocr_metrics import (
    record_ocr_result, get_quality_report, OCRFieldMetric, OCRQualityMetrics,
)
from apps.organisations.models import OrganisationUnit
from apps.accounts.models import UserAccount
from apps.clients.models import Person, Household

try:
    from PIL import Image, ImageDraw
    _PIL_AVAILABLE = True
except ImportError:
    _PIL_AVAILABLE = False


# ---------------------------------------------------------------------------
# Image helpers
# ---------------------------------------------------------------------------

def _solid_image(color, size=(200, 200)) -> bytes:
    """Create a solid-color PNG image."""
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _noisy_image(size=(200, 200)) -> bytes:
    """Create a high-edge (sharp) image with random-ish noise."""
    import random
    img = Image.new("L", size, 128)
    draw = ImageDraw.Draw(img)
    random.seed(42)
    for _ in range(500):
        x = random.randint(0, size[0] - 1)
        y = random.randint(0, size[1] - 1)
        val = random.randint(0, 255)
        draw.point((x, y), fill=val)
    # Add strong edges so FIND_EDGES variance is high (not blurry).
    for i in range(0, size[0], 10):
        draw.line([(i, 0), (i, size[1])], fill=0, width=1)
    for j in range(0, size[1], 10):
        draw.line([(0, j), (size[0], j)], fill=0, width=1)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _blurry_image(size=(200, 200)) -> bytes:
    """Create a smooth gradient image (low edge variance => blurry)."""
    img = Image.new("L", size, 128)
    px = img.load()
    for y in range(size[1]):
        for x in range(size[0]):
            px[x, y] = int(128 + (x / size[0]) * 100)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _glare_image(size=(200, 200)) -> bytes:
    """Create an image dominated by near-white pixels (glare)."""
    img = Image.new("L", size, 250)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _dark_image(size=(200, 200)) -> bytes:
    """Create a dark image (no glare)."""
    img = Image.new("L", size, 30)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _checked_checkbox_image(size=(80, 80)) -> bytes:
    """Create a filled (checked) checkbox ROI."""
    img = Image.new("L", size, 255)
    draw = ImageDraw.Draw(img)
    # Border
    draw.rectangle([0, 0, size[0] - 1, size[1] - 1], outline=0, width=2)
    # Fill interior dark (checked)
    draw.rectangle([8, 8, size[0] - 8, size[1] - 8], fill=0)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _unchecked_checkbox_image(size=(80, 80)) -> bytes:
    """Create an empty (unchecked) checkbox ROI."""
    img = Image.new("L", size, 255)
    draw = ImageDraw.Draw(img)
    # Border only
    draw.rectangle([0, 0, size[0] - 1, size[1] - 1], outline=0, width=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_org():
    return OrganisationUnit.objects.create(
        name="OCR Pipeline Facility", code="OCRPIPE01", unit_type="FACILITY",
    )


def _make_user(org):
    return UserAccount.objects.create_user(
        username="ocrpipe", password="testpass123",
        organisation_unit=org, system_role=SystemRole.SUPER_ADMIN, is_super_admin=True,
    )


def _make_person(org, name="Pipeline Patient"):
    household = Household.objects.create(
        organisation_unit=org, household_name="Pipeline Household",
    )
    return Person.objects.create(
        full_name=name, sex=Sex.FEMALE, date_of_birth=date(1990, 1, 1),
        phone="0240000001", preferred_language="en",
        organisation_unit=org, household=household,
    )


def _make_template_with_bbox():
    """Create a template with bbox definitions for ROI extraction."""
    return DocumentTemplate.objects.create(
        template_id="gh-mch-anc-page-test",
        name="Ghana MCH ANC Page",
        page_type="ANC_PAGE",
        version="2026.1",
        status="ACTIVE",
        page_dimensions="210x297mm",
        field_definitions=[
            {
                "key": "systolic_bp",
                "label": "Systolic BP",
                "type": "number",
                "unit": "mmHg",
                "required": True,
                "safety_critical": True,
                "confidence_threshold": 0.85,
                "range_min": 50,
                "range_max": 300,
                "bbox": [0.1, 0.1, 0.3, 0.1],
                "recognizer": "handwritten_numeric",
            },
            {
                "key": "danger_sign_bleeding",
                "label": "Bleeding (checkbox)",
                "type": "checkbox",
                "required": False,
                "safety_critical": True,
                "confidence_threshold": 0.80,
                "bbox": [0.5, 0.1, 0.1, 0.08],
                "recognizer": "checkbox",
            },
            {
                "key": "patient_name",
                "label": "Patient Name",
                "type": "text",
                "required": True,
                "safety_critical": False,
                "confidence_threshold": 0.80,
                "bbox": [0.1, 0.3, 0.6, 0.1],
                "recognizer": "printed",
            },
        ],
    )


# ---------------------------------------------------------------------------
# Preprocessing tests
# ---------------------------------------------------------------------------

class PreprocessingBlurDetectionTest(TestCase):
    """test_preprocessing_blur_detection (spec §16.2)."""

    def setUp(self):
        if not _PIL_AVAILABLE:
            self.skipTest("Pillow not installed")

    def test_blur_detection_sharp_vs_blurry(self):
        sharp = _noisy_image()
        blurry = _blurry_image()
        sharp_score, sharp_is_blurry = blur_detection(sharp)
        blurry_score, blurry_is_blurry = blur_detection(blurry)
        # The sharp (noisy/edge-rich) image should have a higher score.
        self.assertGreater(sharp_score, blurry_score)
        # The blurry gradient image should be flagged as blurry.
        self.assertTrue(blurry_is_blurry)

    def test_blur_detection_returns_tuple(self):
        score, is_blurry = blur_detection(_solid_image((128, 128, 128)))
        self.assertIsInstance(score, float)
        self.assertIsInstance(is_blurry, bool)


class PreprocessingGlareDetectionTest(TestCase):
    """test_preprocessing_glare_detection (spec §16.2)."""

    def setUp(self):
        if not _PIL_AVAILABLE:
            self.skipTest("Pillow not installed")

    def test_glare_detection_white_vs_dark(self):
        white = _glare_image()
        dark = _dark_image()
        white_score, white_has_glare = glare_detection(white)
        dark_score, dark_has_glare = glare_detection(dark)
        self.assertGreater(white_score, dark_score)
        self.assertTrue(white_has_glare)
        self.assertFalse(dark_has_glare)

    def test_glare_detection_returns_tuple(self):
        score, has_glare = glare_detection(_solid_image((128, 128, 128)))
        self.assertIsInstance(score, float)
        self.assertIsInstance(has_glare, bool)


class OrientationCorrectionTest(TestCase):
    """test_orientation_correction (spec §16.2)."""

    def setUp(self):
        if not _PIL_AVAILABLE:
            self.skipTest("Pillow not installed")

    def test_orientation_correction_returns_bytes_and_angle(self):
        img_bytes = _solid_image((100, 100, 100), size=(100, 100))
        corrected, angle = orientation_correction(img_bytes)
        self.assertIsInstance(corrected, bytes)
        self.assertIn(angle, (0, 90, 180, 270))

    def test_orientation_correction_no_exif_is_noop(self):
        img_bytes = _solid_image((100, 100, 100), size=(120, 80))
        corrected, angle = orientation_correction(img_bytes)
        self.assertEqual(angle, 0)
        # Corrected should still be valid image bytes.
        img = Image.open(io.BytesIO(corrected))
        self.assertEqual(img.size, (120, 80))


class PreprocessingPipelineTest(TestCase):
    """Full preprocessing pipeline integration (spec §16.2)."""

    def setUp(self):
        if not _PIL_AVAILABLE:
            self.skipTest("Pillow not installed")

    def test_run_preprocessing_pipeline_returns_result(self):
        result = run_preprocessing_pipeline(_noisy_image())
        self.assertIsNotNone(result)
        self.assertIsInstance(result.blur_score, float)
        self.assertIsInstance(result.glare_score, float)
        self.assertIsInstance(result.rotation_angle, int)
        self.assertTrue(len(result.processed_image) > 0)
        self.assertIn("blur_detection", result.preprocessing_applied)
        self.assertIn("glare_detection", result.preprocessing_applied)
        self.assertIn("orientation_correction", result.preprocessing_applied)
        self.assertIn("dewarping", result.preprocessing_applied)


# ---------------------------------------------------------------------------
# ROI extraction tests
# ---------------------------------------------------------------------------

class ROIExtractionTest(TestCase):
    """test_roi_extraction (spec §16.2)."""

    def setUp(self):
        if not _PIL_AVAILABLE:
            self.skipTest("Pillow not installed")
        self.template = _make_template_with_bbox()

    def test_extract_rois_returns_dict(self):
        img_bytes = _solid_image((200, 200, 200), size=(1000, 1414))
        rois = extract_rois(img_bytes, self.template)
        self.assertIsInstance(rois, dict)
        # All three fields have bboxes.
        self.assertIn("systolic_bp", rois)
        self.assertIn("danger_sign_bleeding", rois)
        self.assertIn("patient_name", rois)
        # Each ROI should be valid image bytes.
        for key, roi_bytes in rois.items():
            img = Image.open(io.BytesIO(roi_bytes))
            self.assertGreater(img.size[0], 0)
            self.assertGreater(img.size[1], 0)

    def test_extract_rois_skips_fields_without_bbox(self):
        tmpl = DocumentTemplate.objects.create(
            template_id="no-bbox-tmpl",
            name="No Bbox Template",
            page_type="MISC",
            version="1.0",
            status="ACTIVE",
            field_definitions=[
                {"key": "no_bbox_field", "label": "No Bbox", "type": "text"},
            ],
        )
        rois = extract_rois(_solid_image((200, 200, 200)), tmpl)
        self.assertEqual(rois, {})

    def test_align_to_template_returns_bytes(self):
        img_bytes = _solid_image((200, 200, 200), size=(800, 1131))
        aligned = align_to_template(img_bytes, self.template)
        self.assertIsInstance(aligned, bytes)
        img = Image.open(io.BytesIO(aligned))
        # Canonical width applied.
        self.assertEqual(img.size[0], 1000)


# ---------------------------------------------------------------------------
# Checkbox extractor tests
# ---------------------------------------------------------------------------

class CheckboxExtractorTest(TestCase):
    """test_checkbox_extractor (spec §16.3)."""

    def setUp(self):
        if not _PIL_AVAILABLE:
            self.skipTest("Pillow not installed")

    def test_checked_checkbox_detected(self):
        extractor = CheckboxExtractor()
        checked = _checked_checkbox_image()
        self.assertTrue(extractor.detect_checked_state(checked))

    def test_unchecked_checkbox_detected(self):
        extractor = CheckboxExtractor()
        unchecked = _unchecked_checkbox_image()
        self.assertFalse(extractor.detect_checked_state(unchecked))

    def test_extract_returns_value_and_confidence(self):
        extractor = CheckboxExtractor()
        value, confidence = extractor.extract(_checked_checkbox_image())
        self.assertEqual(value, "true")
        self.assertGreaterEqual(confidence, 0.0)
        self.assertLessEqual(confidence, 1.0)

    def test_factory_returns_checkbox_extractor(self):
        ext = FieldExtractorFactory.get_extractor("checkbox")
        self.assertIsInstance(ext, CheckboxExtractor)


# ---------------------------------------------------------------------------
# Full pipeline tests
# ---------------------------------------------------------------------------

class FullPipelineTest(TestCase):
    """test_full_pipeline_with_template (spec §16.2)."""

    def setUp(self):
        if not _PIL_AVAILABLE:
            self.skipTest("Pillow not installed")
        self.template = _make_template_with_bbox()

    def test_run_full_pipeline_returns_ocr_result(self):
        adapter = RealOCRAdapter()
        img_bytes = _solid_image((200, 200, 200), size=(1000, 1414))
        result = adapter.run_full_pipeline(img_bytes, self.template)
        self.assertIsInstance(result, OCRResult)
        self.assertEqual(result.template_id, "gh-mch-anc-page-test")
        self.assertIsNone(result.error)
        # Should have extracted fields for all three defined fields.
        keys = {f.key for f in result.fields}
        self.assertIn("systolic_bp", keys)
        self.assertIn("danger_sign_bleeding", keys)
        self.assertIn("patient_name", keys)
        # Page quality score should be present.
        self.assertIsNotNone(result.page_quality_score)
        # Duration should be non-negative.
        self.assertGreaterEqual(result.duration_ms, 0)

    def test_run_full_pipeline_safety_critical_flag(self):
        adapter = RealOCRAdapter()
        img_bytes = _solid_image((200, 200, 200), size=(1000, 1414))
        result = adapter.run_full_pipeline(img_bytes, self.template)
        bp_field = [f for f in result.fields if f.key == "systolic_bp"][0]
        self.assertTrue(bp_field.safety_critical)


# ---------------------------------------------------------------------------
# Template detection tests
# ---------------------------------------------------------------------------

class TemplateDetectionTest(TestCase):
    """test_template_detection (spec §16.4)."""

    def setUp(self):
        if not _PIL_AVAILABLE:
            self.skipTest("Pillow not installed")
        self.template = _make_template_with_bbox()

    def test_detect_template_returns_none_for_empty_path(self):
        adapter = RealOCRAdapter()
        self.assertIsNone(adapter.detect_template(""))

    def test_detect_template_matches_active_template(self):
        # Create an image with A4-ish aspect ratio (0.707).
        img = Image.new("RGB", (707, 1000), (220, 220, 220))
        import tempfile, os
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as fh:
            img.save(fh, format="PNG")
            path = fh.name
        try:
            adapter = RealOCRAdapter()
            detected = adapter.detect_template(path)
            # Aspect ratio should match the template's page_dimensions (210x297mm).
            self.assertIsNotNone(detected)
            self.assertEqual(detected, "gh-mch-anc-page-test")
        finally:
            os.unlink(path)

    def test_detect_template_returns_none_when_no_templates(self):
        DocumentTemplate.objects.all().delete()
        import tempfile, os
        img = Image.new("RGB", (707, 1000), (220, 220, 220))
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as fh:
            img.save(fh, format="PNG")
            path = fh.name
        try:
            adapter = RealOCRAdapter()
            self.assertIsNone(adapter.detect_template(path))
        finally:
            os.unlink(path)


# ---------------------------------------------------------------------------
# Quality metrics tests
# ---------------------------------------------------------------------------

class QualityMetricsRecordingTest(TestCase):
    """test_quality_metrics_recording (spec §16.5)."""

    def setUp(self):
        self.template = _make_template_with_bbox()
        self.org = _make_org()
        self.patient = _make_person(self.org)

    def test_record_ocr_result_from_ocr_result_dataclass(self):
        result = OCRResult(
            template_id="gh-mch-anc-page-test",
            fields=[
                ExtractedField(key="systolic_bp", value="120", confidence=0.9,
                               safety_critical=True),
                ExtractedField(key="patient_name", value="Ama", confidence=0.8),
            ],
            duration_ms=250,
        )
        created = record_ocr_result(result)
        self.assertEqual(created, 2)
        self.assertEqual(OCRFieldMetric.objects.count(), 2)
        metric = OCRFieldMetric.objects.filter(field_key="systolic_bp").first()
        self.assertIsNotNone(metric)
        self.assertEqual(metric.extracted_value, "120")
        self.assertEqual(metric.template_code, "gh-mch-anc-page-test")
        self.assertAlmostEqual(metric.latency_ms, 250.0)

    def test_record_ocr_result_from_ocr_job(self):
        job = OCRJob.objects.create(
            patient=self.patient,
            template=self.template,
            status="CONFIRMED",
            ocr_duration_ms=300,
            device_id="device-001",
            extracted_fields=[
                {"key": "systolic_bp", "value": "110", "confidence": 0.88,
                 "safety_critical": True, "human_confirmed": True},
            ],
        )
        created = record_ocr_result(job)
        self.assertEqual(created, 1)
        metric = OCRFieldMetric.objects.first()
        self.assertEqual(metric.field_key, "systolic_bp")
        self.assertTrue(metric.is_confirmed)
        self.assertEqual(metric.device_id, "device-001")

    def test_record_with_ground_truth_exact_match(self):
        result = OCRResult(
            template_id="gh-mch-anc-page-test",
            fields=[
                ExtractedField(key="systolic_bp", value="120", confidence=0.9),
            ],
            duration_ms=100,
        )
        record_ocr_result(result, ground_truth={"systolic_bp": "120"})
        metric = OCRFieldMetric.objects.first()
        self.assertTrue(metric.is_exact_match)

    def test_record_with_ground_truth_mismatch(self):
        result = OCRResult(
            template_id="gh-mch-anc-page-test",
            fields=[
                ExtractedField(key="systolic_bp", value="120", confidence=0.9),
            ],
            duration_ms=100,
        )
        record_ocr_result(result, ground_truth={"systolic_bp": "130"})
        metric = OCRFieldMetric.objects.first()
        self.assertFalse(metric.is_exact_match)


class QualityMetricsReportTest(TestCase):
    """test_quality_metrics_report (spec §16.5)."""

    def setUp(self):
        self.template = _make_template_with_bbox()
        self.org = _make_org()
        self.patient = _make_person(self.org)

    def test_get_quality_report_empty(self):
        report = get_quality_report("gh-mch-anc-page-test")
        self.assertIsInstance(report, OCRQualityMetrics)
        self.assertEqual(report.total_fields, 0)
        self.assertEqual(report.exact_match_rate, 0.0)

    def test_get_quality_report_with_records(self):
        # Record several results with known outcomes.
        result = OCRResult(
            template_id="gh-mch-anc-page-test",
            fields=[
                ExtractedField(key="systolic_bp", value="120", confidence=0.9),
                ExtractedField(key="patient_name", value="Ama", confidence=0.8),
            ],
            duration_ms=200,
        )
        record_ocr_result(result, ground_truth={"systolic_bp": "120", "patient_name": "Ama"})
        record_ocr_result(result, ground_truth={"systolic_bp": "130", "patient_name": "Ama"})

        report = get_quality_report("gh-mch-anc-page-test")
        self.assertEqual(report.total_fields, 4)
        # 3 exact matches out of 4 (systolic_bp second record mismatches).
        self.assertAlmostEqual(report.exact_match_rate, 0.75)
        self.assertGreater(report.avg_latency_ms, 0)
        # Field breakdown present.
        self.assertIn("systolic_bp", report.field_breakdown)
        self.assertIn("patient_name", report.field_breakdown)

    def test_get_quality_report_to_dict(self):
        result = OCRResult(
            template_id="gh-mch-anc-page-test",
            fields=[ExtractedField(key="systolic_bp", value="120", confidence=0.9)],
            duration_ms=150,
        )
        record_ocr_result(result, ground_truth={"systolic_bp": "120"})
        report = get_quality_report("gh-mch-anc-page-test")
        d = report.to_dict()
        self.assertEqual(d["templateId"], "gh-mch-anc-page-test")
        self.assertEqual(d["totalFields"], 1)
        self.assertEqual(d["exactMatchRate"], 1.0)
        self.assertIn("fieldBreakdown", d)


# ---------------------------------------------------------------------------
# Adapter singleton safety
# ---------------------------------------------------------------------------

class AdapterSingletonTest(TestCase):
    """Ensure the default adapter remains the stub (safe for existing tests)."""

    def test_default_adapter_is_stub(self):
        from apps.core.ocr_service import get_ocr_adapter
        # Reset to default in case another test changed it.
        set_ocr_adapter(StubOCRAdapter())
        self.assertIsInstance(get_ocr_adapter(), StubOCRAdapter)
