"""Migration for OCR models — DocumentTemplate + OCRJob (spec §16, §25)."""
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0005_clinical_thresholds"),
        ("clients", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="DocumentTemplate",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("template_id", models.CharField(max_length=100, unique=True, verbose_name="Template ID")),
                ("name", models.CharField(max_length=200)),
                ("page_type", models.CharField(max_length=50)),
                ("version", models.CharField(max_length=50)),
                ("status", models.CharField(default="ACTIVE", max_length=20)),
                ("description", models.TextField(blank=True)),
                ("field_definitions", models.JSONField(default=list)),
                ("reference_image_url", models.CharField(blank=True, max_length=500)),
                ("activated_at", models.DateTimeField(blank=True, null=True)),
                ("retired_at", models.DateTimeField(blank=True, null=True)),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(fields=["template_id", "version"], name="doc_tmpl_id_ver_idx"),
                    models.Index(fields=["page_type", "status"], name="doc_tmpl_pt_st_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="OCRJob",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("episode", models.CharField(blank=True, max_length=50, verbose_name="Episode Type")),
                ("image_path", models.CharField(blank=True, max_length=500)),
                ("image_hash", models.CharField(blank=True, max_length=64, verbose_name="SHA-256 of image")),
                ("status", models.CharField(choices=[("PENDING", "Pending — image uploaded, not yet processed"), ("PROCESSING", "Processing — OCR in progress"), ("EXTRACTED", "Extracted — fields extracted, awaiting confirmation"), ("CONFIRMED", "Confirmed — human confirmed, ready for clinical use"), ("REJECTED", "Rejected — human rejected the extraction"), ("FAILED", "Failed — OCR processing error"), ("EXPIRED", "Expired — retention window elapsed, image purged")], default="PENDING", max_length=20)),
                ("extracted_fields", models.JSONField(default=list)),
                ("ocr_engine", models.CharField(blank=True, max_length=50)),
                ("ocr_duration_ms", models.PositiveIntegerField(blank=True, null=True)),
                ("ocr_error", models.TextField(blank=True)),
                ("confirmed_by", models.CharField(blank=True, max_length=200)),
                ("confirmed_at", models.DateTimeField(blank=True, null=True)),
                ("rejection_reason", models.TextField(blank=True)),
                ("captured_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("purge_eligible_at", models.DateTimeField(blank=True, null=True)),
                ("purged_at", models.DateTimeField(blank=True, null=True)),
                ("captured_by", models.CharField(blank=True, max_length=200)),
                ("device_id", models.CharField(blank=True, max_length=100)),
                ("patient", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="ocr_jobs", to="clients.person")),
                ("template", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="ocr_jobs", to="core.documenttemplate")),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(fields=["status"], name="ocr_job_status_idx"),
                    models.Index(fields=["patient", "status"], name="ocr_job_pt_st_idx"),
                ],
            },
        ),
    ]
