"""
OCR adapter interface (spec §16.3, §16.6).

The OCR engine is kept behind a field-level extractor interface (spec §10.8).
PP-OCRv5 is the starting model for printed text; checkboxes use classical
image processing; handwritten digits use a constrained recognizer.

This module defines the adapter interface and a stub implementation that
returns empty extractions. The actual PP-OCRv5 integration will be added
in a later phase after benchmark validation (spec §16.5, §29.3).
"""
from dataclasses import dataclass, field
from typing import Optional


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
        for f in self.fields:
            if f.safety_critical and f.confidence < 0.85:
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


# Singleton adapter instance — replace with PP-OCRv5 adapter when ready
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
    threshold = field_def.get("confidence_threshold", 0.85)
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
