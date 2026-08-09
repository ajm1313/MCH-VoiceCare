# Generated for spec §19.4 — patient identity reconciliation queue

import uuid

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("clients", "0002_person_care_consent_person_ivr_contact_consent_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="PatientReconciliationQueue",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("reason", models.CharField(help_text="Why these records may be duplicates", max_length=200)),
                ("match_score", models.FloatField(default=0.0, help_text="Similarity score 0-1")),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("PENDING", "Pending"),
                            ("RESOLVED_MERGE", "Resolved - Merged"),
                            ("RESOLVED_KEEP_BOTH", "Resolved - Keep Both"),
                            ("RESOLVED_REJECT", "Resolved - Rejected"),
                        ],
                        default="PENDING",
                        max_length=20,
                    ),
                ),
                ("resolved_by", models.CharField(blank=True, max_length=200)),
                ("resolved_at", models.DateTimeField(blank=True, null=True)),
                (
                    "person_a",
                    models.ForeignKey(
                        on_delete=models.CASCADE,
                        related_name="reconciliation_as_a",
                        to="clients.person",
                    ),
                ),
                (
                    "person_b",
                    models.ForeignKey(
                        on_delete=models.CASCADE,
                        related_name="reconciliation_as_b",
                        to="clients.person",
                    ),
                ),
            ],
            options={
                "ordering": ["-match_score", "-created_at"],
            },
            bases=(models.Model,),
        ),
    ]
