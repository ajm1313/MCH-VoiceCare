"""
Field-specific OCR extractors (spec §16.3).

Extraction strategy (spec §16.3):
    - Printed text: PP-OCRv5 mobile as the starting model. This module uses
      pytesseract when available and gracefully degrades to a structured
      stub otherwise.
    - Checkboxes/marks: classical image processing on fixed regions
      (contour/fill detection).
    - Handwritten digits/dates/BP/lab values: a constrained recognizer.
      A full implementation would use a trained digit model; this module
      provides a constrained digit recognizer that uses pytesseract with
      a digit-only whitelist when available, else a structured stub.

All extractors accept ROI image bytes and return (value, confidence).
"""
import io
import re
from typing import Optional, Tuple

try:
    from PIL import Image, ImageOps, ImageStat
    _PIL_AVAILABLE = True
except ImportError:  # pragma: no cover
    _PIL_AVAILABLE = False

try:
    import pytesseract
    _PYTESSERACT_AVAILABLE = True
except ImportError:
    _PYTESSERACT_AVAILABLE = False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_image(image_bytes: bytes):
    if not _PIL_AVAILABLE:
        raise RuntimeError("Pillow (PIL) is required for field extraction.")
    if not image_bytes:
        raise ValueError("image_bytes is empty")
    return Image.open(io.BytesIO(image_bytes))


def _grayscale(img):
    return img if img.mode == "L" else img.convert("L")


# ---------------------------------------------------------------------------
# Checkbox extractor (spec §16.3)
# ---------------------------------------------------------------------------

class CheckboxExtractor:
    """
    Detect checked state of a checkbox ROI using classical image processing.

    A checked checkbox has a high proportion of dark pixels (ink fill)
    inside its bounding region, whereas an empty checkbox is mostly white
    with only a thin border. We measure the mean luminance of the interior
    (excluding the border) and the dark-pixel fraction.
    """

    # Fraction of dark pixels above which a checkbox is considered checked.
    CHECKED_DARK_FRACTION = 0.25

    def detect_checked_state(self, roi_bytes: bytes) -> bool:
        """Return True if the checkbox appears checked/filled."""
        img = _load_image(roi_bytes)
        gray = _grayscale(img)
        w, h = gray.size
        if w < 4 or h < 4:
            return False

        # Exclude the border (assume ~15% margin on each side).
        margin_x = max(1, int(w * 0.15))
        margin_y = max(1, int(h * 0.15))
        interior = gray.crop((margin_x, margin_y, w - margin_x, h - margin_y))

        stat = ImageStat.Stat(interior)
        mean_lum = stat.mean[0] if stat.mean else 255.0

        # Dark pixel fraction (pixels below 128 luminance).
        histogram = interior.histogram()
        total = sum(histogram) or 1
        dark = sum(histogram[:128])
        dark_fraction = dark / total

        # A checked box has low mean luminance and high dark fraction.
        return dark_fraction >= self.CHECKED_DARK_FRACTION or mean_lum < 128.0

    def extract(self, roi_bytes: bytes) -> Tuple[str, float]:
        """Return ("true"/"false", confidence)."""
        checked = self.detect_checked_state(roi_bytes)
        # Confidence is heuristic: stronger deviation from empty-box mean.
        try:
            img = _load_image(roi_bytes)
            gray = _grayscale(img)
            stat = ImageStat.Stat(gray)
            mean_lum = stat.mean[0] if stat.mean else 255.0
        except Exception:
            mean_lum = 255.0
        # Confidence scales with how far from a blank (255) the region is.
        confidence = min(1.0, abs(255.0 - mean_lum) / 255.0 + 0.5)
        value = "true" if checked else "false"
        return value, round(confidence, 3)


# ---------------------------------------------------------------------------
# Printed text extractor (spec §16.3)
# ---------------------------------------------------------------------------

class PrintedTextExtractor:
    """
    Extract printed text from an ROI (spec §16.3).

    Uses pytesseract when available. When pytesseract is not installed,
    degrades to a structured stub that returns an empty string with low
    confidence so the caller can route to manual confirmation.
    """

    def extract_text(self, roi_bytes: bytes) -> Tuple[str, float]:
        """Return (text, confidence) where confidence is 0.0-1.0."""
        if not _PYTESSERACT_AVAILABLE:
            # Structured stub: no text engine available.
            return "", 0.0

        try:
            img = _load_image(roi_bytes)
            gray = _grayscale(img)
            # PSM 6 = "Assume a single uniform block of text."
            text = pytesseract.image_to_string(gray, config="--psm 6")
            text = text.strip()
            # pytesseract does not return per-image confidence directly;
            # use a heuristic based on text length and image stats.
            confidence = self._estimate_confidence(gray, text)
            return text, confidence
        except Exception:
            return "", 0.0

    def extract(self, roi_bytes: bytes) -> Tuple[str, float]:
        return self.extract_text(roi_bytes)

    @staticmethod
    def _estimate_confidence(gray_img, text: str) -> float:
        if not text:
            return 0.2
        # Longer, alphanumeric text is more trustworthy.
        alnum = sum(1 for c in text if c.isalnum())
        ratio = alnum / max(len(text), 1)
        # Baseline 0.7, boosted by alphanumeric ratio.
        return round(min(0.98, 0.7 + 0.28 * ratio), 3)


# ---------------------------------------------------------------------------
# Handwritten number extractor (spec §16.3)
# ---------------------------------------------------------------------------

class HandwrittenNumberExtractor:
    """
    Constrained handwritten digit/number recognition (spec §16.3).

    Uses pytesseract with a digit-only whitelist when available. Otherwise
    returns a structured stub. Only digits, decimal points, and slashes
    (for dates/BP) are retained.
    """

    _ALLOWED = re.compile(r"[0-9./]+")

    def extract_number(self, roi_bytes: bytes) -> Tuple[Optional[str], float]:
        """Return (value, confidence). value may be None if no digits found."""
        if not _PYTESSERACT_AVAILABLE:
            return None, 0.0

        try:
            img = _load_image(roi_bytes)
            gray = _grayscale(img)
            # PSM 7 = "Treat the image as a single text line."
            # Whitelist digits, dot, slash for BP/dates/decimals.
            raw = pytesseract.image_to_string(
                gray,
                config="--psm 7 -c tessedit_char_whitelist=0123456789./",
            )
            raw = raw.strip()
            match = self._ALLOWED.findall(raw)
            if not match:
                return None, 0.2
            value = "".join(match)
            confidence = self._estimate_confidence(gray, value)
            return value, confidence
        except Exception:
            return None, 0.0

    def extract(self, roi_bytes: bytes) -> Tuple[Optional[str], float]:
        return self.extract_number(roi_bytes)

    @staticmethod
    def _estimate_confidence(gray_img, value: str) -> float:
        if not value:
            return 0.2
        digits = sum(1 for c in value if c.isdigit())
        ratio = digits / max(len(value), 1)
        return round(min(0.95, 0.6 + 0.35 * ratio), 3)


# ---------------------------------------------------------------------------
# Factory (spec §16.3)
# ---------------------------------------------------------------------------

class FieldExtractorFactory:
    """
    Factory mapping field recognizer types to extractor instances (spec §16.3).

    Recognizer values (from DocumentTemplate.field_definitions):
        - "printed"            -> PrintedTextExtractor
        - "handwritten_numeric"-> HandwrittenNumberExtractor
        - "handwritten_text"   -> PrintedTextExtractor (degraded)
        - "checkbox"           -> CheckboxExtractor
    """

    _printed = None
    _handwritten_number = None
    _checkbox = None

    @classmethod
    def get_extractor(cls, field_type: str):
        """
        Return the extractor for a recognizer/field type.

        Args:
            field_type: One of the ``recognizer`` values, or a field
                ``type`` ("checkbox", "number", "decimal", "date", "text").
        """
        # Normalize common aliases.
        ft = (field_type or "").lower().strip()

        if ft in ("checkbox",):
            if cls._checkbox is None:
                cls._checkbox = CheckboxExtractor()
            return cls._checkbox

        if ft in ("handwritten_numeric", "handwritten_number", "number", "decimal", "date"):
            if cls._handwritten_number is None:
                cls._handwritten_number = HandwrittenNumberExtractor()
            return cls._handwritten_number

        # Default: printed text (also used for handwritten_text as degraded).
        if cls._printed is None:
            cls._printed = PrintedTextExtractor()
        return cls._printed
