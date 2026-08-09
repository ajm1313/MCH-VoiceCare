# Generated for spec §16.4 — add active_from and page_dimensions to DocumentTemplate

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0009_alter_ocrjob_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="documenttemplate",
            name="active_from",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="documenttemplate",
            name="page_dimensions",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AlterField(
            model_name="documenttemplate",
            name="field_definitions",
            field=models.JSONField(
                default=list,
                help_text=(
                    "List of field definition dicts. Each dict should include: "
                    "key, label, type, unit, required, safety_critical, "
                    "confidence_threshold, range_min, range_max, "
                    "bbox ([x, y, width, height] for ROI extraction), and "
                    "recognizer ('printed' | 'handwritten_numeric' | "
                    "'handwritten_text' | 'checkbox')."
                ),
            ),
        ),
    ]
