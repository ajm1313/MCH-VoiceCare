"""
OCR API endpoints (spec §16, §25).

- GET  /api/v1/ocr/templates         — list active document templates
- GET  /api/v1/ocr/templates/{id}    — get a single template
- POST /api/v1/ocr/jobs               — submit a new OCR job
- GET  /api/v1/ocr/jobs               — list OCR jobs
- GET  /api/v1/ocr/jobs/{id}          — get OCR job status
- POST /api/v1/ocr/jobs/{id}/confirm  — confirm extracted fields
- POST /api/v1/ocr/jobs/{id}/reject   — reject extracted fields
"""
import uuid

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import filter_queryset_by_org
from apps.core.ocr_models import DocumentTemplate, OCRJob
from apps.core.ocr_service import get_ocr_adapter, validate_extracted_field
from apps.core.config_models import SystemConfig
from apps.audit.services import log_audit
from apps.clients.models import Person


def _template_to_dict(template):
    """Serialize a DocumentTemplate to a dict."""
    return {
        "id": str(template.id),
        "templateId": template.template_id,
        "name": template.name,
        "pageType": template.page_type,
        "version": template.version,
        "status": template.status,
        "description": template.description,
        "fieldDefinitions": template.field_definitions,
        "referenceImageUrl": template.reference_image_url,
    }


def _ocr_job_to_dict(job):
    """Serialize an OCRJob to a dict."""
    return {
        "id": str(job.id),
        "patientId": str(job.patient_id) if job.patient_id else None,
        "templateId": str(job.template_id) if job.template_id else None,
        "templateName": job.template.name if job.template else None,
        "episode": job.episode,
        "status": job.status,
        "extractedFields": job.extracted_fields,
        "hasUnconfirmedSafetyCritical": job.has_unconfirmed_safety_critical,
        "ocrEngine": job.ocr_engine,
        "ocrDurationMs": job.ocr_duration_ms,
        "ocrError": job.ocr_error,
        "confirmedBy": job.confirmed_by,
        "confirmedAt": job.confirmed_at.isoformat() if job.confirmed_at else None,
        "rejectionReason": job.rejection_reason,
        "capturedAt": job.captured_at.isoformat() if job.captured_at else None,
        "capturedBy": job.captured_by,
        "deviceId": job.device_id,
        "purgeEligibleAt": job.purge_eligible_at.isoformat() if job.purge_eligible_at else None,
        "purgedAt": job.purged_at.isoformat() if job.purged_at else None,
        "createdAt": job.created_at.isoformat() if job.created_at else None,
    }


class OCRTemplateListView(APIView):
    """GET /api/v1/ocr/templates — list active document templates (spec §16.2)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        templates = DocumentTemplate.get_active_templates()
        page_type = request.query_params.get("pageType")
        if page_type:
            templates = templates.filter(page_type=page_type)

        entries = [_template_to_dict(t) for t in templates]

        log_audit(
            actor=request.user.username,
            action="OCR_TEMPLATE_LIST",
            actor_role=request.user.system_role,
            purpose="DIRECT_CARE",
            metadata={"pageType": page_type or "", "result_count": len(entries)},
        )

        return Response({"results": entries, "count": len(entries)})


class OCRTemplateDetailView(APIView):
    """GET /api/v1/ocr/templates/{id} — get a single template."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            uid = uuid.UUID(str(pk))
        except (ValueError, TypeError):
            return Response({"error": "Invalid UUID"}, status=status.HTTP_400_BAD_REQUEST)

        template = DocumentTemplate.objects.filter(id=uid).first()
        if not template:
            return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)

        return Response(_template_to_dict(template))


class OCRJobCreateView(APIView):
    """
    POST /api/v1/ocr/jobs — submit a new OCR job (spec §16).

    The mobile app captures an image, uploads it, and creates an OCR job.
    The backend runs the OCR adapter and returns the extracted fields.
    Safety-critical fields MUST be human-confirmed before clinical use.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        patient_id = request.data.get("patientId")
        template_id = request.data.get("templateId")
        episode = request.data.get("episode", "")
        image_path = request.data.get("imagePath", "")
        image_hash = request.data.get("imageHash", "")
        captured_by = request.data.get("capturedBy", request.user.username)
        device_id = request.data.get("deviceId", "")

        # Validate patient
        patient = None
        if patient_id:
            try:
                uid = uuid.UUID(str(patient_id))
                qs = filter_queryset_by_org(Person.objects.all(), request.user)
                patient = qs.filter(id=uid).first()
                if not patient:
                    return Response({"error": "Patient not found"}, status=status.HTTP_404_NOT_FOUND)
            except (ValueError, TypeError):
                return Response({"error": "Invalid patient UUID"}, status=status.HTTP_400_BAD_REQUEST)

        # Validate template
        template = None
        if template_id:
            try:
                uid = uuid.UUID(str(template_id))
                template = DocumentTemplate.objects.filter(id=uid, status="ACTIVE").first()
                if not template:
                    return Response({"error": "Template not found or inactive"}, status=status.HTTP_404_NOT_FOUND)
            except (ValueError, TypeError):
                return Response({"error": "Invalid template UUID"}, status=status.HTTP_400_BAD_REQUEST)

        # Create the OCR job
        job = OCRJob.objects.create(
            patient=patient,
            template=template,
            episode=episode,
            image_path=image_path,
            image_hash=image_hash,
            status="PROCESSING",
            captured_by=captured_by,
            device_id=device_id,
        )

        # Run OCR extraction
        adapter = get_ocr_adapter()
        result = adapter.extract(image_path, template.template_id if template else None)

        job.ocr_engine = "stub"
        job.ocr_duration_ms = result.duration_ms

        if result.error:
            job.mark_failed(result.error)
            return Response({"error": "OCR processing failed", "detail": result.error},
                          status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Convert extracted fields to dict format with validation
        extracted = []
        validation_errors = []
        for f in result.fields:
            field_dict = {
                "key": f.key,
                "value": f.value,
                "confidence": f.confidence,
                "unit": f.unit,
                "safety_critical": f.safety_critical,
                "human_confirmed": False,
                "corrected_value": None,
            }

            # Validate against template field definition if available
            if template:
                field_def = template.get_field(f.key)
                if field_def:
                    field_dict["safety_critical"] = field_def.get("safety_critical", False)
                    errors = validate_extracted_field(field_def, f)
                    if errors:
                        field_dict["validation_errors"] = errors
                        validation_errors.extend(errors)

            extracted.append(field_dict)

        job.extracted_fields = extracted
        job.status = "EXTRACTED"
        job.save(update_fields=["extracted_fields", "status", "ocr_engine", "ocr_duration_ms", "updated_at"])

        # Set purge eligibility based on scan retention config (spec §25)
        config = SystemConfig.get_config()
        retention_hours = config.scan_temporary_retention_hours
        from django.utils import timezone
        from datetime import timedelta
        job.purge_eligible_at = timezone.now() + timedelta(hours=retention_hours)
        job.save(update_fields=["purge_eligible_at", "updated_at"])

        log_audit(
            actor=request.user.username,
            action="OCR_JOB_CREATED",
            actor_role=request.user.system_role,
            entity_type="OCRJob",
            entity_id=str(job.id),
            patient_id=patient.id if patient else None,
            purpose="DIRECT_CARE",
            metadata={
                "templateId": template.template_id if template else None,
                "fieldCount": len(extracted),
                "hasValidationErrors": bool(validation_errors),
            },
        )

        return Response(_ocr_job_to_dict(job), status=status.HTTP_201_CREATED)


class OCRJobListView(APIView):
    """GET /api/v1/ocr/jobs — list OCR jobs for the user's org."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = OCRJob.objects.all()
        patient_id = request.query_params.get("patientId")
        if patient_id:
            try:
                uid = uuid.UUID(str(patient_id))
                qs = qs.filter(patient_id=uid)
            except (ValueError, TypeError):
                pass

        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        count = request.query_params.get("_count", "50")
        try:
            count = min(int(count), 200)
        except ValueError:
            count = 50

        jobs = list(qs[:count])
        entries = [_ocr_job_to_dict(j) for j in jobs]

        return Response({"results": entries, "count": len(entries)})


class OCRJobDetailView(APIView):
    """GET /api/v1/ocr/jobs/{id} — get OCR job status."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            uid = uuid.UUID(str(pk))
        except (ValueError, TypeError):
            return Response({"error": "Invalid UUID"}, status=status.HTTP_400_BAD_REQUEST)

        job = OCRJob.objects.filter(id=uid).first()
        if not job:
            return Response({"error": "OCR job not found"}, status=status.HTTP_404_NOT_FOUND)

        return Response(_ocr_job_to_dict(job))


class OCRJobConfirmView(APIView):
    """
    POST /api/v1/ocr/jobs/{id}/confirm — confirm extracted fields (spec §16.6).

    Safety-critical fields MUST be human-confirmed before entering clinical
    scoring. The request body may include field corrections.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            uid = uuid.UUID(str(pk))
        except (ValueError, TypeError):
            return Response({"error": "Invalid UUID"}, status=status.HTTP_400_BAD_REQUEST)

        job = OCRJob.objects.filter(id=uid).first()
        if not job:
            return Response({"error": "OCR job not found"}, status=status.HTTP_404_NOT_FOUND)

        if job.status not in ("EXTRACTED",):
            return Response({"error": f"Job is in {job.status} state, cannot confirm"},
                          status=status.HTTP_400_BAD_REQUEST)

        field_corrections = request.data.get("fieldCorrections", {})
        confirmed_by = request.data.get("confirmedBy", request.user.username)

        job.mark_confirmed(confirmed_by, field_corrections)

        log_audit(
            actor=request.user.username,
            action="OCR_JOB_CONFIRMED",
            actor_role=request.user.system_role,
            entity_type="OCRJob",
            entity_id=str(job.id),
            patient_id=job.patient_id,
            purpose="DIRECT_CARE",
            metadata={
                "corrections": list(field_corrections.keys()) if field_corrections else [],
            },
        )

        return Response(_ocr_job_to_dict(job))


class OCRJobRejectView(APIView):
    """POST /api/v1/ocr/jobs/{id}/reject — reject extracted fields (spec §16.6)."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            uid = uuid.UUID(str(pk))
        except (ValueError, TypeError):
            return Response({"error": "Invalid UUID"}, status=status.HTTP_400_BAD_REQUEST)

        job = OCRJob.objects.filter(id=uid).first()
        if not job:
            return Response({"error": "OCR job not found"}, status=status.HTTP_404_NOT_FOUND)

        if job.status not in ("EXTRACTED",):
            return Response({"error": f"Job is in {job.status} state, cannot reject"},
                          status=status.HTTP_400_BAD_REQUEST)

        reason = request.data.get("reason", "")
        rejected_by = request.data.get("rejectedBy", request.user.username)

        job.mark_rejected(rejected_by, reason)

        log_audit(
            actor=request.user.username,
            action="OCR_JOB_REJECTED",
            actor_role=request.user.system_role,
            entity_type="OCRJob",
            entity_id=str(job.id),
            patient_id=job.patient_id,
            purpose="DIRECT_CARE",
            metadata={"reason": reason},
        )

        return Response(_ocr_job_to_dict(job))
