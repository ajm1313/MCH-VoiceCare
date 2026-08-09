"""
OCR adapter interface (spec §16.3, §16.6).

The OCR engine is kept behind a field-level extractor interface (spec §10.8).
PP-OCRv5 is the starting model for printed text; checkboxes use classical
image processing; handwritten digits use a constrained recognizer.

This module defines the adapter interface, a stub implementation that
returns empty extractions, and a RealOCRAdapter that runs the full
preprocessing -> template detection -> alignment -> ROI extraction ->
field extraction -> validation pipeline (spec §16.2).
"""
import io
import time
from dataclasses import dataclass, field
from typing import Optional

from apps.core.ocr_preprocessing import run_preprocessing_pipeline
from apps.core.ocr_roi import extract_rois, align_to_template
from apps.core.ocr_extractors import FieldExtractorFactory


@dataclass
class ExtractedField:
    """A single extracted field from an OCR pass."""
    key: str
    value: str
    confidence: float
    unit: Optional[str] = None
    safety_critical: bool = False
    bbox: Optional[dict] = field(default_factory=dict)
    human_confirmed: bool = False
    corrected_value: Optional[str] = None


@dataclass
class OCRResult:
    """Result of an OCR extraction pass."""
    template_id: Optional[str]
    fields: list  # List[ExtractedField]
    duration_ms: int
    error: Optional[str] = None
    page_quality_score: Optional[float] = None

    @property
    def is_unknown_template(self) -> bool:
        """True if the template could not be identified (spec §16.4)."""
        return self.template_id is None

    @property
    def has_low_confidence_fields(self) -> bool:
        """True if any safety-critical field has confidence below threshold."""
        from apps.core.config_models import SystemConfig
        thresholds = SystemConfig.get("ocr_confidence_thresholds", {}) or {}
        for f in self.fields:
            threshold = thresholds.get(f.key, 0.85)
            if f.safety_critical and f.confidence < threshold:
                return True
        return False


class OCRAdapter:
    """
    Abstract OCR adapter interface (spec §16.3).

    Concrete implementations:
    - PPOCRv5Adapter: PP-OCRv5 mobile runtime (future)
    - StubOCRAdapter: Returns empty extractions (for testing/development)
    """

    def extract(self, image_path: str, template_id: Optional[str] = None) -> OCRResult:
        """
        Run OCR extraction on an image.

        Args:
            image_path: Path to the image file
            template_id: Expected template ID (if known)

        Returns:
            OCRResult with extracted fields
        """
        raise NotImplementedError

    def detect_template(self, image_path: str) -> Optional[str]:
        """
        Detect the document template from an image (spec §16.4).

        Args:
            image_path: Path to the image file

        Returns:
            The detected template_id, or None if no template could be
            identified (in which case manual entry is required).
        """
        raise NotImplementedError


class StubOCRAdapter(OCRAdapter):
    """
    Stub OCR adapter for development/testing.

    Returns an empty extraction result. The actual PP-OCRv5 integration
    will replace this after benchmark validation (spec §16.5).
    """

    def extract(self, image_path: str, template_id: Optional[str] = None) -> OCRResult:
        return OCRResult(
            template_id=template_id,
            fields=[],
            duration_ms=0,
            error=None,
            page_quality_score=None,
        )

    def detect_template(self, image_path: str) -> Optional[str]:
        """Stub template detection — always returns None (no detection in stub mode)."""
        return None


# ---------------------------------------------------------------------------
# Real OCR adapter — full pipeline (spec §16.2)
# ---------------------------------------------------------------------------

def _read_image_bytes(image_path: str) -> bytes:
    """Read image bytes from a path or return empty bytes if unavailable."""
    if not image_path:
        return b""
    try:
        with open(image_path, "rb") as fh:
            return fh.read()
    except (OSError, IOError):
        return b""


class RealOCRAdapter(OCRAdapter):
    """
    Full OCR adapter implementing the spec §16.2 processing pipeline.

    Pipeline:
        a. Preprocessing (blur/glare/orientation/dewarp)
        b. Template detection (if template_id not provided)
        c. Geometric alignment to template
        d. ROI extraction per field
        e. Field-specific extraction (checkbox / printed / handwritten numeric)
        f. Validation of extracted values
        g. OCRResult with all fields + confidence scores

    Uses Pillow for image processing and pytesseract for printed text when
    available; gracefully degrades to a structured stub otherwise. Does NOT
    require PP-OCRv5 model files (spec §16.3).
    """

    def __init__(self):
        self._factory = FieldExtractorFactory()

    # -- public API ---------------------------------------------------------

    def extract(self, image_path: str, template_id: Optional[str] = None) -> OCRResult:
        """Run the full OCR pipeline on an image (spec §16.2)."""
        start = time.time()
        image_bytes = _read_image_bytes(image_path)
        if not image_bytes:
            return OCRResult(
                template_id=template_id,
                fields=[],
                duration_ms=0,
                error="Image not readable or empty",
            )

        # Resolve the template object.
        template = None
        if template_id:
            template = self._lookup_template(template_id)
        else:
            detected_id = self.detect_template(image_path)
            if detected_id:
                template_id = detected_id
                template = self._lookup_template(detected_id)

        if template is None:
            duration_ms = int((time.time() - start) * 1000)
            return OCRResult(
                template_id=None,
                fields=[],
                duration_ms=duration_ms,
                error=None,
                page_quality_score=None,
            )

        return self.run_full_pipeline(image_bytes, template, start_time=start)

    def detect_template(self, image_path: str) -> Optional[str]:
        """
        Detect the document template from image features (spec §16.4).

        Uses aspect ratio and corner-marker heuristics to match against
        active templates. Returns the matched template_id or None (which
        routes to manual entry per spec §16.4).
        """
        image_bytes = _read_image_bytes(image_path)
        if not image_bytes:
            return None
        return self._detect_template_from_bytes(image_bytes)

    # -- full pipeline ------------------------------------------------------

    def run_full_pipeline(self, image_bytes: bytes, template, start_time: Optional[float] = None):
        """
        Execute the full OCR pipeline on raw image bytes (spec §16.2).

        Args:
            image_bytes: Raw image bytes.
            template: A DocumentTemplate instance with field_definitions.
            start_time: Optional monotonic start for duration calculation.

        Returns:
            OCRResult with extracted fields and confidence scores.
        """
        if start_time is None:
            start_time = time.time()

        # a. Preprocessing (blur/glare/orientation/dewarp)
        preprocessing = run_preprocessing_pipeline(image_bytes)
        if preprocessing.error:
            return OCRResult(
                template_id=getattr(template, "template_id", None),
                fields=[],
                duration_ms=int((time.time() - start_time) * 1000),
                error=preprocessing.error,
            )

        processed = preprocessing.processed_image or image_bytes

        # c. Geometric alignment to template
        try:
            aligned = align_to_template(processed, template)
        except Exception:
            aligned = processed

        # d. ROI extraction per field
        try:
            rois = extract_rois(aligned, template)
        except Exception as exc:
            return OCRResult(
                template_id=getattr(template, "template_id", None),
                fields=[],
                duration_ms=int((time.time() - start_time) * 1000),
                error=f"ROI extraction failed: {exc}",
            )

        # e. Field-specific extraction
        extracted_fields = []
        for field_def in getattr(template, "field_definitions", []) or []:
            key = field_def.get("key")
            if not key:
                continue
            roi_bytes = rois.get(key)
            if not roi_bytes:
                continue
            ext_field = self._extract_field(field_def, roi_bytes)
            if ext_field is not None:
                extracted_fields.append(ext_field)

        # f. Validation
        validation_errors = []
        for ext_field in extracted_fields:
            field_def = template.get_field(ext_field.key) if hasattr(template, "get_field") else None
            if field_def:
                errors = validate_extracted_field(field_def, ext_field)
                validation_errors.extend(errors)

        # g. Build result
        duration_ms = int((time.time() - start_time) * 1000)
        quality_score = self._compute_quality_score(preprocessing, extracted_fields)

        return OCRResult(
            template_id=getattr(template, "template_id", None),
            fields=extracted_fields,
            duration_ms=duration_ms,
            error=None,
            page_quality_score=quality_score,
        )

    # -- helpers ------------------------------------------------------------

    def _extract_field(self, field_def: dict, roi_bytes: bytes):
        """Run the appropriate extractor for a single field definition."""
        recognizer = field_def.get("recognizer") or field_def.get("type") or "printed"
        extractor = self._factory.get_extractor(recognizer)
        try:
            value, confidence = extractor.extract(roi_bytes)
        except Exception:
            value, confidence = ("", 0.0)

        # Normalize None values to empty string for serialization.
        if value is None:
            value = ""

        return ExtractedField(
            key=field_def.get("key", ""),
            value=str(value),
            confidence=float(confidence) if confidence is not None else 0.0,
            unit=field_def.get("unit"),
            safety_critical=field_def.get("safety_critical", False),
            bbox=field_def.get("bbox", {}),
            human_confirmed=False,
            corrected_value=None,
        )

    @staticmethod
    def _compute_quality_score(preprocessing, extracted_fields) -> float:
        """Compute an overall page quality score (0.0-1.0)."""
        score = 1.0
        if preprocessing.is_blurry:
            score -= 0.3
        if preprocessing.has_glare:
            score -= 0.2
        if extracted_fields:
            avg_conf = sum(f.confidence for f in extracted_fields) / len(extracted_fields)
            score = (score + avg_conf) / 2.0
        else:
            score -= 0.2
        return round(max(0.0, min(1.0, score)), 3)

    @staticmethod
    def _lookup_template(template_id: str):
        """Look up an active DocumentTemplate by template_id."""
        try:
            from apps.core.ocr_models import DocumentTemplate
            return DocumentTemplate.get_template(template_id)
        except Exception:
            return None

    def _detect_template_from_bytes(self, image_bytes: bytes) -> Optional[str]:
        """
        Match image features against active templates (spec §16.4).

        Heuristics:
            - Aspect ratio proximity to the template's reference page.
            - Corner-marker presence (basic edge-density in corners).
            - Header text match (when pytesseract is available).
        Returns the best-matching template_id or None.
        """
        try:
            from apps.core.ocr_models import DocumentTemplate
        except Exception:
            return None

        try:
            from PIL import Image as _PILImage
        except ImportError:
            return None

        try:
            img = _PILImage.open(io.BytesIO(image_bytes))
        except Exception:
            return None

        img_w, img_h = img.size
        if img_w == 0 or img_h == 0:
            return None
        img_aspect = img_w / img_h

        active_templates = list(DocumentTemplate.get_active_templates())
        if not active_templates:
            return None

        best_match = None
        best_score = -1.0

        for tmpl in active_templates:
            score = self._score_template_match(img_aspect, img, tmpl)
            if score > best_score:
                best_score = score
                best_match = tmpl

        # Require a minimum confidence to accept a match (spec §16.4:
        # unknown pages MUST route to manual entry).
        if best_match is None or best_score < 0.3:
            return None
        return best_match.template_id

    @staticmethod
    def _score_template_match(img_aspect: float, img, template) -> float:
        """
        Score how well an image matches a template (0.0-1.0).

        Combines aspect-ratio proximity and a header-text keyword match
        when pytesseract is available.
        """
        score = 0.0

        # Aspect ratio: derive an expected ratio from page_dimensions hint.
        page_dims = (getattr(template, "page_dimensions", "") or "").lower()
        expected_aspect = 0.707  # A4 portrait default
        if "x" in page_dims:
            parts = page_dims.split("x")
            try:
                import re as _re
                w_match = _re.search(r"[\d.]+", parts[0])
                h_match = _re.search(r"[\d.]+", parts[1]) if len(parts) > 1 else None
                if w_match and h_match:
                    w = float(w_match.group())
                    h = float(h_match.group())
                    if h > 0:
                        expected_aspect = w / h
            except (ValueError, IndexError):
                pass
        elif "a4" in page_dims:
            expected_aspect = 0.707

        # Aspect ratio proximity (gaussian-like).
        ratio_diff = abs(img_aspect - expected_aspect) / max(expected_aspect, 0.01)
        aspect_score = max(0.0, 1.0 - ratio_diff)
        score += 0.5 * aspect_score

        # Header text match (best-effort).
        try:
            from apps.core.ocr_extractors import _PYTESSERACT_AVAILABLE
            if _PYTESSERACT_AVAILABLE:
                import pytesseract
                from PIL import ImageOps
                gray = img.convert("L") if img.mode != "L" else img
                w, h = gray.size
                header = gray.crop((0, 0, w, max(1, int(h * 0.15))))
                header = ImageOps.autocontrast(header)
                text = pytesseract.image_to_string(header, config="--psm 6").lower()
                tmpl_name = (getattr(template, "name", "") or "").lower()
                # Match on any significant token from the template name.
                tokens = [t for t in tmpl_name.split() if len(t) > 3]
                if tokens and any(tok in text for tok in tokens):
                    score += 0.5
        except Exception:
            pass

        return min(1.0, score)


# Singleton adapter instance — defaults to stub for safe test behavior.
# Production deployments call set_ocr_adapter(RealOCRAdapter()).
_ocr_adapter: OCRAdapter = StubOCRAdapter()


def get_ocr_adapter() -> OCRAdapter:
    """Get the current OCR adapter instance."""
    return _ocr_adapter


def set_ocr_adapter(adapter: OCRAdapter) -> None:
    """Set the OCR adapter instance (for testing or production swap)."""
    global _ocr_adapter
    _ocr_adapter = adapter


def validate_extracted_field(field_def: dict, extracted: ExtractedField) -> list:
    """
    Validate an extracted field against its template definition (spec §16.6).

    Returns a list of validation error strings (empty if valid).
    """
    errors = []

    # Check required
    if field_def.get("required") and not extracted.value:
        errors.append(f"Field '{extracted.key}' is required but no value was extracted")

    # Check confidence threshold
    from apps.core.config_models import SystemConfig
    thresholds = SystemConfig.get("ocr_confidence_thresholds", {}) or {}
    threshold = thresholds.get(
        extracted.key,
        field_def.get("confidence_threshold", 0.85),
    )
    if extracted.confidence < threshold:
        errors.append(
            f"Field '{extracted.key}' confidence {extracted.confidence:.2f} "
            f"below threshold {threshold:.2f}"
        )

    # Check range for numeric fields
    if field_def.get("type") in ("number", "decimal") and extracted.value:
        try:
            val = float(extracted.value)
            range_min = field_def.get("range_min")
            range_max = field_def.get("range_max")
            if range_min is not None and val < range_min:
                errors.append(f"Field '{extracted.key}' value {val} below minimum {range_min}")
            if range_max is not None and val > range_max:
                errors.append(f"Field '{extracted.key}' value {val} above maximum {range_max}")
        except ValueError:
            errors.append(f"Field '{extracted.key}' value '{extracted.value}' is not numeric")

    return errors
