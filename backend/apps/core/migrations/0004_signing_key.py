"""Migration for SigningKey model (spec §4.2, §24)."""
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0003_package_model"),
    ]

    operations = [
        migrations.CreateModel(
            name="SigningKey",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("key_id", models.CharField(max_length=100, unique=True, verbose_name="Key ID")),
                ("public_key_base64", models.TextField(verbose_name="Public Key (base64-encoded Ed25519)")),
                ("algorithm", models.CharField(default="Ed25519", max_length=20)),
                ("status", models.CharField(
                    choices=[("ACTIVE", "Active"), ("REVOKED", "Revoked"), ("SUPERSEDED", "Superseded")],
                    default="ACTIVE", max_length=20,
                )),
                ("activated_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                ("notes", models.TextField(blank=True)),
            ],
            options={
                "ordering": ["-activated_at"],
                "indexes": [models.Index(fields=["key_id", "status"], name="signing_key_id_status_idx")],
            },
        ),
    ]
