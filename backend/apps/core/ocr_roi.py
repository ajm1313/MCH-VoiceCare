"""
ROI (region-of-interest) extraction for OCR (spec §16.2).

After preprocessing and template alignment, the document image is cropped
into per-field ROIs using the bounding boxes declared in the
DocumentTemplate field_definitions. Each ROI is then fed to the
appropriate field extractor (spec §16.3).

This module uses Pillow (PIL) for cropping and a basic corner-marker
based alignment.
"""
import io
from typing import Dict, Optional, Tuple

try:
    from PIL import Image, ImageOps
    _PIL_AVAILABLE = True
except ImportError:  # pragma: no cover - Pillow is a hard dependency
    _PIL_AVAILABLE = False


def _load_image(image_bytes: bytes):
    if not _PIL_AVAILABLE:
        raise RuntimeError(
            "Pillow (PIL) is required for ROI extraction but is not installed."
        )
    if not image_bytes:
        raise ValueError("image_bytes is empty")
    return Image.open(io.BytesIO(image_bytes))


def _to_bytes(img) -> bytes:
    buf = io.BytesIO()
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    img.save(buf, format="PNG")
    return buf.getvalue()


def _normalize_bbox(bbox, img_width: int, img_height: int) -> Tuple[int, int, int, int]:
    """
    Normalize a bbox to (left, upper, right, lower) crop coordinates.

    The template bbox may be expressed in absolute pixels or as fractions
    of the page (0.0-1.0). Fractions are detected when all values are <= 1.0.
    """
    if not bbox or len(bbox) < 4:
        return (0, 0, img_width, img_height)

    x, y, w, h = bbox[0], bbox[1], bbox[2], bbox[3]

    # Detect fractional coordinates (0.0-1.0).
    if all(0.0 <= v <= 1.0 for v in (x, y, w, h)):
        left = int(x * img_width)
        upper = int(y * img_height)
        right = int((x + w) * img_width)
        lower = int((y + h) * img_height)
    else:
        left = int(x)
        upper = int(y)
        right = int(x + w)
        lower = int(y + h)

    # Clamp to image bounds.
    left = max(0, min(left, img_width))
    upper = max(0, min(upper, img_height))
    right = max(0, min(right, img_width))
    lower = max(0, min(lower, img_height))

    # Ensure a valid crop region.
    if right <= left:
        right = min(left + 1, img_width)
    if lower <= upper:
        lower = min(upper + 1, img_height)

    return (left, upper, right, lower)


def extract_rois(image_bytes: bytes, template) -> Dict[str, bytes]:
    """
    Extract per-field ROI crops from an image using template bboxes (spec §16.2).

    Args:
        image_bytes: Preprocessed image bytes.
        template: A DocumentTemplate (or duck-typed object) with a
            ``field_definitions`` list. Each field dict may contain a
            ``bbox`` of [x, y, width, height].

    Returns:
        Dict mapping field_key -> ROI image bytes (PNG). Fields without a
        bbox are skipped.
    """
    img = _load_image(image_bytes)
    img_width, img_height = img.size

    rois: Dict[str, bytes] = {}
    field_defs = getattr(template, "field_definitions", None) or []
    for field_def in field_defs:
        key = field_def.get("key")
        bbox = field_def.get("bbox")
        if not key or not bbox:
            continue
        crop_box = _normalize_bbox(bbox, img_width, img_height)
        roi = img.crop(crop_box)
        rois[key] = _to_bytes(roi)

    return rois


def align_to_template(image_bytes: bytes, template) -> bytes:
    """
    Geometrically align an image to a template (spec §16.2).

    A full implementation detects corner markers and applies a homography.
    This basic implementation performs auto-contrast normalization and a
    no-op pass-through when corner detection is unavailable, keeping the
    pipeline functional. When a ``page_dimensions`` hint is present on the
    template, the image is resized to a canonical working width so ROI
    bboxes (which may be authored against a reference resolution) align
    consistently.
    """
    img = _load_image(image_bytes)

    # Canonical working width for alignment (pixels).
    CANONICAL_WIDTH = 1000

    page_dims = getattr(template, "page_dimensions", "") or ""
    if page_dims:
        # Resize maintaining aspect ratio to canonical width.
        w, h = img.size
        if w > 0 and w != CANONICAL_WIDTH:
            new_height = int(h * (CANONICAL_WIDTH / w))
            img = img.resize((CANONICAL_WIDTH, new_height), Image.LANCZOS)

    # Auto-contrast to improve downstream corner/edge detection.
    if img.mode != "L":
        gray = img.convert("L")
    else:
        gray = img
    auto = ImageOps.autocontrast(gray)
    if img.mode == "RGB":
        result = auto.convert("RGB")
    else:
        result = auto

    return _to_bytes(result)
