# Generated for OCR quality metrics model (spec §16.5)

import django.db.models.deletion
import django.utils.timezone
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0012_audio_asset"),
    ]

    operations = [
        migrations.CreateModel(
            name="OCRFieldMetric",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("template_code", models.CharField(blank=True, max_length=100)),
                ("field_key", models.CharField(max_length=100)),
                ("recognizer", models.CharField(blank=True, max_length=50)),
                ("extracted_value", models.TextField(blank=True)),
                ("extracted_confidence", models.FloatField(default=0.0)),
                ("ground_truth_value", models.TextField(blank=True)),
                ("is_exact_match", models.BooleanField(default=False)),
                ("is_abnormal", models.BooleanField(default=False)),
                ("detected_abnormal", models.BooleanField(default=False)),
                ("is_failure", models.BooleanField(default=False)),
                ("is_confirmed", models.BooleanField(default=False)),
                ("device_id", models.CharField(blank=True, max_length=100)),
                ("facility_code", models.CharField(blank=True, max_length=100)),
                ("writer_group", models.CharField(blank=True, max_length=100)),
                ("latency_ms", models.FloatField(default=0.0)),
                ("recorded_at", models.DateTimeField(default=django.utils.timezone.now)),
                (
                    "ocr_job",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="field_metrics",
                        to="core.ocrjob",
                    ),
                ),
                (
                    "template",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="field_metrics",
                        to="core.documenttemplate",
                    ),
                ),
            ],
            options={
                "ordering": ["-recorded_at"],
            },
        ),
        migrations.AddIndex(
            model_name="ocrfieldmetric",
            index=models.Index(
                fields=["template_code", "recorded_at"], name="ocr_fm_tmpl_dt_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="ocrfieldmetric",
            index=models.Index(fields=["field_key"], name="ocr_fm_field_idx"),
        ),
        migrations.AddIndex(
            model_name="ocrfieldmetric",
            index=models.Index(fields=["device_id"], name="ocr_fm_device_idx"),
        ),
        migrations.AddIndex(
            model_name="ocrfieldmetric",
            index=models.Index(fields=["facility_code"], name="ocr_fm_facility_idx"),
        ),
    ]

