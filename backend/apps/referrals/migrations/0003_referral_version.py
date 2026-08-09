# Generated for optimistic concurrency (spec §19.4)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("referrals", "0002_referral_estimated_transport_time_minutes_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="referral",
            name="version",
            field=models.PositiveIntegerField(default=1),
        ),
    ]
