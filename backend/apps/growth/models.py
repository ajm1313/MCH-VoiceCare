"""Growth monitoring models."""
import uuid
from django.db import models
from apps.core.models import TimeStampedModel
from apps.clients.models import Person


class GrowthMeasurement(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    child = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="growth_measurements")
    measurement_date = models.DateField()
    weight_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    length_cm = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    height_cm = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    measurement_position = models.CharField(max_length=20, blank=True)
    muac_mm = models.PositiveIntegerField(null=True, blank=True, verbose_name="MUAC (mm)")
    feeding_status = models.CharField(max_length=50, blank=True)
    recent_illness = models.CharField(max_length=200, blank=True)
    measurement_quality = models.CharField(max_length=50, blank=True)
    scale_id = models.CharField(max_length=50, blank=True)
    length_board_id = models.CharField(max_length=50, blank=True)
    indicator = models.CharField(max_length=30, default="NORMAL")
    recorded_by = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-measurement_date"]
