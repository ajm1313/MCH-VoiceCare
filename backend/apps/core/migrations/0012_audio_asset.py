"""Migration for AudioAsset model — telephony audio asset management (spec §17.2)."""
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0011_add_role_contact_model"),
    ]

    operations = [
        migrations.CreateModel(
            name="AudioAsset",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("audio_asset_id", models.CharField(max_length=100, unique=True, verbose_name="Audio Asset ID")),
                ("language", models.CharField(max_length=20, verbose_name="Language")),
                ("prompt_id", models.CharField(max_length=100, verbose_name="Prompt ID")),
                ("content_type", models.CharField(default="audio/mpeg", max_length=50)),
                ("duration_seconds", models.FloatField(default=0.0)),
                ("file_size_bytes", models.PositiveIntegerField(default=0)),
                ("storage_url", models.CharField(blank=True, max_length=500)),
                ("recorded_by", models.CharField(blank=True, max_length=200)),
                ("approved_by", models.CharField(blank=True, max_length=200)),
                ("approved_at", models.DateTimeField(blank=True, null=True)),
                ("back_translated", models.BooleanField(default=False)),
                ("comprehension_tested", models.BooleanField(default=False)),
                ("checksum_sha256", models.CharField(blank=True, max_length=64)),
                ("version", models.PositiveIntegerField(default=1)),
                ("is_active", models.BooleanField(default=True)),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(fields=["language", "prompt_id"], name="audio_asset_lang_pid_idx"),
                    models.Index(fields=["language", "is_active"], name="audio_asset_lang_act_idx"),
                    models.Index(fields=["audio_asset_id"], name="audio_asset_id_idx"),
                ],
            },
        ),
    ]
