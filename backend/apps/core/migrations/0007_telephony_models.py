"""Migration for telephony models — PromptPack, TelephonySession, RemoteObservation (spec §17)."""
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0006_ocr_models"),
        ("clients", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="PromptPack",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("pack_id", models.CharField(max_length=100, unique=True, verbose_name="Pack ID")),
                ("name", models.CharField(max_length=200)),
                ("version", models.CharField(max_length=50)),
                ("language", models.CharField(max_length=20)),
                ("status", models.CharField(default="ACTIVE", max_length=20)),
                ("description", models.TextField(blank=True)),
                ("prompts", models.JSONField(default=list)),
                ("approved_by", models.CharField(blank=True, max_length=200)),
                ("approved_at", models.DateTimeField(blank=True, null=True)),
                ("back_translated", models.BooleanField(default=False)),
                ("comprehension_tested", models.BooleanField(default=False)),
                ("activated_at", models.DateTimeField(blank=True, null=True)),
                ("retired_at", models.DateTimeField(blank=True, null=True)),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(fields=["pack_id", "version"], name="prompt_pack_id_ver_idx"),
                    models.Index(fields=["language", "status"], name="prompt_pack_lang_st_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="TelephonySession",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("session_id", models.CharField(max_length=200, unique=True, verbose_name="Provider Session ID")),
                ("channel", models.CharField(choices=[("IVR", "IVR — Voice + DTMF"), ("USSD", "USSD — Structured selections")], max_length=10)),
                ("provider", models.CharField(blank=True, max_length=50)),
                ("phone_number", models.CharField(max_length=20)),
                ("language", models.CharField(default="english", max_length=20)),
                ("status", models.CharField(choices=[("INITIATED", "Initiated"), ("IN_PROGRESS", "In Progress"), ("COMPLETED", "Completed"), ("FAILED", "Failed"), ("TIMEOUT", "Timeout")], default="INITIATED", max_length=20)),
                ("current_question_code", models.CharField(blank=True, max_length=100)),
                ("responses", models.JSONField(default=list)),
                ("started_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("ended_at", models.DateTimeField(blank=True, null=True)),
                ("duration_seconds", models.PositiveIntegerField(blank=True, null=True)),
                ("triggered_emergency", models.BooleanField(default=False)),
                ("patient", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="telephony_sessions", to="clients.person")),
                ("prompt_pack", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="sessions", to="core.promptpack")),
            ],
            options={
                "ordering": ["-started_at"],
                "indexes": [
                    models.Index(fields=["phone_number", "status"], name="tel_sess_ph_st_idx"),
                    models.Index(fields=["patient", "status"], name="tel_sess_pt_st_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="RemoteObservation",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("question_code", models.CharField(max_length=100)),
                ("question_text", models.TextField(blank=True)),
                ("response_key", models.CharField(max_length=10)),
                ("response_value", models.CharField(blank=True, max_length=200)),
                ("mapped_facts", models.JSONField(default=dict)),
                ("capture_route", models.CharField(default="IVR_DTMF", max_length=20)),
                ("source_prompt_id", models.CharField(blank=True, max_length=100)),
                ("template_version", models.CharField(blank=True, max_length=50)),
                ("captured_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("is_emergency", models.BooleanField(default=False)),
                ("sync_status", models.CharField(default="SYNCED", max_length=20)),
                ("patient", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="remote_observations", to="clients.person")),
                ("session", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="observations", to="core.telephonysession")),
            ],
            options={
                "ordering": ["-captured_at"],
                "indexes": [
                    models.Index(fields=["patient", "captured_at"], name="remote_obs_pt_ct_idx"),
                    models.Index(fields=["is_emergency"], name="remote_obs_emrg_idx"),
                ],
            },
        ),
    ]
