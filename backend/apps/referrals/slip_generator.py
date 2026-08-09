"""
Printable referral slip generator (spec §18.5).

Generates a printable/human-readable referral slip with:
- patient identifier
- pregnancy episode identifier
- referral episode identifier
- destination
- urgency
- pre-referral care
- QR code
- short human-readable code

The QR payload uses an opaque lookup token — no unnecessary clinical
details in the QR (spec §18.5).
"""
import html
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from django.template.loader import render_to_string

from apps.referrals.models import Referral
from apps.referrals.rule_engine import classify_referral_urgency


@dataclass
class ReferralSlipData:
    """Data for a printable referral slip (spec §18.5)."""
    patient_id: str
    patient_name: str  # Empty if no consent to share name
    pregnancy_episode_id: Optional[str] = None
    referral_episode_id: str = ""
    destination_facility_name: str = ""
    destination_facility_contact: str = ""
    urgency_level: str = "ROUTINE"
    pre_referral_care: str = ""
    qr_token: str = ""
    short_code: str = ""
    referring_facility_name: str = ""
    referring_facility_contact: str = ""
    created_at: str = ""
    referring_clinician_name: str = ""
    referral_reason: str = ""
    status: str = ""


def generate_slip_data(referral_id) -> ReferralSlipData:
    """
    Generate referral slip data from a Referral instance.

    Ensures the QR token and short code are populated (generates them
    if not already present on the referral).

    Args:
        referral_id: UUID of the Referral

    Returns:
        ReferralSlipData dataclass

    Raises:
        Referral.DoesNotExist if the referral is not found
    """
    referral = Referral.objects.select_related(
        "patient", "referring_facility", "destination_facility",
    ).get(id=referral_id)

    # Ensure QR token and short code exist
    if not referral.qr_token:
        result = classify_referral_urgency(referral)
        referral.qr_token = result["qr_token"]
        referral.short_code = result["short_code"]
        referral.save(update_fields=["qr_token", "short_code", "updated_at"])

    # Patient name — only include if care consent is given (spec §26)
    patient = referral.patient
    patient_name = ""
    if patient and getattr(patient, "care_consent", True):
        patient_name = patient.full_name or ""

    # Facility info
    dest_name = ""
    dest_contact = ""
    if referral.destination_facility:
        dest_name = referral.destination_facility.name or ""
        dest_contact = getattr(referral.destination_facility, "phone", "") or ""

    ref_name = ""
    ref_contact = ""
    if referral.referring_facility:
        ref_name = referral.referring_facility.name or ""
        ref_contact = getattr(referral.referring_facility, "phone", "") or ""

    return ReferralSlipData(
        patient_id=str(patient.id) if patient else "",
        patient_name=patient_name,
        pregnancy_episode_id=str(referral.pregnancy_episode_id) if referral.pregnancy_episode_id else None,
        referral_episode_id=str(referral.id),
        destination_facility_name=dest_name,
        destination_facility_contact=dest_contact,
        urgency_level=referral.urgency,
        pre_referral_care=referral.pre_referral_care or "",
        qr_token=referral.qr_token or "",
        short_code=referral.short_code or "",
        referring_facility_name=ref_name,
        referring_facility_contact=ref_contact,
        created_at=referral.created_at.isoformat() if referral.created_at else "",
        referring_clinician_name=referral.created_by or "",
        referral_reason=referral.referral_reason or "",
        status=referral.status or "",
    )


def render_slip_html(slip_data: ReferralSlipData) -> str:
    """
    Render the referral slip as a standalone printable HTML document.

    This is a self-contained HTML template (not extending base.html) so it
    can be served via the API endpoint and printed directly.
    """
    context = {
        "slip": slip_data,
        # Also provide escaped values for inline use
        "patient_name_esc": html.escape(slip_data.patient_name or "—"),
        "patient_id_esc": html.escape(slip_data.patient_id or "—"),
        "destination_esc": html.escape(slip_data.destination_facility_name or "—"),
        "referring_esc": html.escape(slip_data.referring_facility_name or "—"),
        "urgency_esc": html.escape(slip_data.urgency_level or "ROUTINE"),
        "short_code_esc": html.escape(slip_data.short_code or "—"),
        "qr_token_esc": html.escape(slip_data.qr_token or ""),
        "pre_referral_care_esc": html.escape(slip_data.pre_referral_care or "—"),
        "referral_reason_esc": html.escape(slip_data.referral_reason or "—"),
        "clinician_esc": html.escape(slip_data.referring_clinician_name or "—"),
        "referral_id_esc": html.escape(slip_data.referral_episode_id or "—"),
        "pregnancy_episode_esc": html.escape(slip_data.pregnancy_episode_id or "—"),
        "created_at_esc": html.escape(slip_data.created_at or "—"),
        "status_esc": html.escape(slip_data.status or "—"),
        "dest_contact_esc": html.escape(slip_data.destination_facility_contact or ""),
        "ref_contact_esc": html.escape(slip_data.referring_facility_contact or ""),
    }

    try:
        return render_to_string("referrals/referral_slip.html", context)
    except Exception:
        # Fallback to inline template if the template file is not found
        return _render_inline_html(slip_data)


def _render_inline_html(slip_data: ReferralSlipData) -> str:
    """Inline fallback HTML template for the referral slip."""
    urgency_class = {
        "EMERGENCY": "urgency-emergency",
        "PRIORITY": "urgency-priority",
        "ROUTINE": "urgency-routine",
    }.get(slip_data.urgency_level, "urgency-routine")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Referral Slip — {html.escape(slip_data.short_code or slip_data.referral_episode_id)}</title>
<style>
  body {{ font-family: 'Segoe UI', Arial, sans-serif; margin: 20px; color: #1a1a1a; }}
  .slip {{ max-width: 600px; margin: 0 auto; border: 2px solid #333; border-radius: 8px; padding: 24px; }}
  .header {{ text-align: center; border-bottom: 2px solid #e0e0e0; padding-bottom: 16px; margin-bottom: 16px; }}
  .header h1 {{ font-size: 22px; margin: 0; }}
  .urgency {{ display: inline-block; padding: 4px 16px; border-radius: 4px; font-weight: bold; color: #fff; margin-top: 8px; }}
  .urgency-emergency {{ background: #dc2626; }}
  .urgency-priority {{ background: #f59e0b; }}
  .urgency-routine {{ background: #6b7280; }}
  .section {{ margin-bottom: 16px; }}
  .label {{ font-size: 11px; color: #666; text-transform: uppercase; font-weight: 600; }}
  .value {{ font-size: 14px; font-weight: 500; }}
  .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }}
  .qr-box {{ text-align: center; margin: 16px 0; }}
  .short-code {{ font-size: 28px; font-weight: 800; letter-spacing: 3px; text-align: center; padding: 12px; border: 2px dashed #ccc; border-radius: 8px; }}
  .signatures {{ display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; }}
  .sig-line {{ border-top: 1px solid #333; margin-top: 40px; padding-top: 4px; text-align: center; font-size: 11px; color: #666; }}
  @media print {{ .no-print {{ display: none; }} body {{ margin: 0; }} }}
</style>
</head>
<body>
<div class="slip">
  <div class="header">
    <h1>REFERRAL SLIP</h1>
    <p style="font-size:12px;color:#666;margin:4px 0 0">MCH VoiceCare — Maternal &amp; Child Health</p>
    <div class="urgency {urgency_class}">{html.escape(slip_data.urgency_level)}</div>
  </div>
  <div class="grid">
    <div class="section"><div class="label">Short Code</div><div class="value">{html.escape(slip_data.short_code or '—')}</div></div>
    <div class="section"><div class="label">Date / Time</div><div class="value">{html.escape(slip_data.created_at or '—')}</div></div>
  </div>
  <div class="grid">
    <div class="section"><div class="label">Patient Name</div><div class="value">{html.escape(slip_data.patient_name or '—')}</div></div>
    <div class="section"><div class="label">Patient ID</div><div class="value" style="font-family:monospace;font-size:12px">{html.escape(slip_data.patient_id or '—')}</div></div>
  </div>
  <div class="grid">
    <div class="section"><div class="label">Referral ID</div><div class="value" style="font-family:monospace;font-size:12px">{html.escape(slip_data.referral_episode_id or '—')}</div></div>
    <div class="section"><div class="label">Pregnancy Episode</div><div class="value" style="font-family:monospace;font-size:12px">{html.escape(slip_data.pregnancy_episode_id or '—')}</div></div>
  </div>
  <div class="section"><div class="label">Referral Reason</div><div class="value">{html.escape(slip_data.referral_reason or '—')}</div></div>
  <div class="grid">
    <div class="section"><div class="label">From (Referring Facility)</div><div class="value">{html.escape(slip_data.referring_facility_name or '—')}</div></div>
    <div class="section"><div class="label">To (Destination)</div><div class="value">{html.escape(slip_data.destination_facility_name or '—')}</div></div>
  </div>
  <div class="section"><div class="label">Pre-referral Care Given</div><div class="value">{html.escape(slip_data.pre_referral_care or '—')}</div></div>
  <div class="section"><div class="label">Referring Clinician</div><div class="value">{html.escape(slip_data.referring_clinician_name or '—')}</div></div>
  <div class="short-code">{html.escape(slip_data.short_code or '—')}</div>
  <div class="qr-box">
    <div class="label">QR Token</div>
    <div style="font-family:monospace;font-size:10px;word-break:break-all">{html.escape(slip_data.qr_token or '—')}</div>
  </div>
  <div class="signatures">
    <div class="sig-line">Referring Clinician Signature</div>
    <div class="sig-line">Receiving Facility Stamp</div>
  </div>
</div>
</body>
</html>"""


def render_slip_pdf(slip_data: ReferralSlipData) -> Optional[bytes]:
    """
    Render the referral slip as a PDF.

    Uses reportlab if available, otherwise returns None (caller should
    fall back to HTML).

    Args:
        slip_data: ReferralSlipData instance

    Returns:
        PDF bytes, or None if no PDF library is available
    """
    # Try reportlab first (more commonly available)
    try:
        return _render_pdf_reportlab(slip_data)
    except (ImportError, Exception):
        pass

    # Try weasyprint as a fallback
    try:
        return _render_pdf_weasyprint(slip_data)
    except (ImportError, Exception):
        pass

    return None


def _render_pdf_reportlab(slip_data: ReferralSlipData) -> bytes:
    """Render PDF using reportlab."""
    from io import BytesIO
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.lib.colors import HexColor
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    )
    from reportlab.lib.enums import TA_CENTER

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20*mm, bottomMargin=20*mm,
                            leftMargin=20*mm, rightMargin=20*mm)
    styles = getSampleStyleSheet()
    elements = []

    # Title
    title_style = ParagraphStyle("Title", parent=styles["Title"], fontSize=20, alignment=TA_CENTER)
    elements.append(Paragraph("REFERRAL SLIP", title_style))
    elements.append(Paragraph("MCH VoiceCare — Maternal &amp; Child Health",
                              ParagraphStyle("Sub", parent=styles["Normal"], alignment=TA_CENTER,
                                             fontSize=10, textColor=HexColor("#666666"))))

    # Urgency badge
    urgency_colors = {
        "EMERGENCY": HexColor("#dc2626"),
        "PRIORITY": HexColor("#f59e0b"),
        "ROUTINE": HexColor("#6b7280"),
    }
    urgency_color = urgency_colors.get(slip_data.urgency_level, HexColor("#6b7280"))
    urgency_style = ParagraphStyle("Urgency", parent=styles["Normal"], alignment=TA_CENTER,
                                   fontSize=14, textColor=urgency_color, fontName="Helvetica-Bold")
    elements.append(Spacer(1, 6*mm))
    elements.append(Paragraph(slip_data.urgency_level, urgency_style))
    elements.append(Spacer(1, 6*mm))

    # Data table
    label_style = ParagraphStyle("Label", parent=styles["Normal"], fontSize=9, textColor=HexColor("#666666"))
    value_style = ParagraphStyle("Value", parent=styles["Normal"], fontSize=11)

    def esc(s):
        return html.escape(str(s)) if s else "—"

    rows = [
        [Paragraph("Short Code", label_style), Paragraph(esc(slip_data.short_code), value_style),
         Paragraph("Date / Time", label_style), Paragraph(esc(slip_data.created_at), value_style)],
        [Paragraph("Patient Name", label_style), Paragraph(esc(slip_data.patient_name), value_style),
         Paragraph("Patient ID", label_style), Paragraph(esc(slip_data.patient_id), value_style)],
        [Paragraph("Referral ID", label_style), Paragraph(esc(slip_data.referral_episode_id), value_style),
         Paragraph("Pregnancy Episode", label_style), Paragraph(esc(slip_data.pregnancy_episode_id), value_style)],
        [Paragraph("From (Referring)", label_style), Paragraph(esc(slip_data.referring_facility_name), value_style),
         Paragraph("To (Destination)", label_style), Paragraph(esc(slip_data.destination_facility_name), value_style)],
        [Paragraph("Referring Clinician", label_style), Paragraph(esc(slip_data.referring_clinician_name), value_style),
         Paragraph("Status", label_style), Paragraph(esc(slip_data.status), value_style)],
    ]

    table = Table(rows, colWidths=[35*mm, 55*mm, 35*mm, 55*mm])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, HexColor("#e0e0e0")),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 6*mm))

    # Referral reason and pre-referral care
    elements.append(Paragraph("Referral Reason", label_style))
    elements.append(Paragraph(esc(slip_data.referral_reason), value_style))
    elements.append(Spacer(1, 4*mm))
    elements.append(Paragraph("Pre-referral Care Given", label_style))
    elements.append(Paragraph(esc(slip_data.pre_referral_care), value_style))
    elements.append(Spacer(1, 6*mm))

    # QR token
    elements.append(Paragraph("QR Token", label_style))
    elements.append(Paragraph(esc(slip_data.qr_token),
                              ParagraphStyle("QR", parent=styles["Normal"], fontSize=8, fontName="Courier")))
    elements.append(Spacer(1, 10*mm))

    # Signature lines
    sig_data = [
        [Paragraph("", value_style), Paragraph("", value_style)],
        [Paragraph("Referring Clinician Signature", label_style),
         Paragraph("Receiving Facility Stamp", label_style)],
    ]
    sig_table = Table(sig_data, colWidths=[90*mm, 90*mm])
    sig_table.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (0, 0), 0.5, HexColor("#333333")),
        ("LINEABOVE", (1, 0), (1, 0), 0.5, HexColor("#333333")),
        ("ALIGN", (0, 1), (-1, 1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, 0), 30),
    ]))
    elements.append(sig_table)

    doc.build(elements)
    return buf.getvalue()


def _render_pdf_weasyprint(slip_data: ReferralSlipData) -> bytes:
    """Render PDF using weasyprint."""
    from weasyprint import HTML
    html_content = render_slip_html(slip_data)
    return HTML(string=html_content).write_pdf()
