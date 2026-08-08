"""Migration for clinical_thresholds JSON field on SystemConfig (spec §33)."""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0004_signing_key"),
    ]

    operations = [
        migrations.AddField(
            model_name="systemconfig",
            name="clinical_thresholds",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
