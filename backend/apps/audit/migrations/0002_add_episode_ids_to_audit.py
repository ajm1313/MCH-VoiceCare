# Generated for spec §23 — add pregnancy_episode_id and referral_episode_id

import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("audit", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="auditevent",
            name="pregnancy_episode_id",
            field=models.UUIDField(blank=True, null=True, verbose_name="Pregnancy Episode ID"),
        ),
        migrations.AddField(
            model_name="auditevent",
            name="referral_episode_id",
            field=models.UUIDField(blank=True, null=True, verbose_name="Referral Episode ID"),
        ),
    ]
