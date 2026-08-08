"""Growth forms."""
from django import forms
from apps.growth.models import GrowthMeasurement


class GrowthMeasurementForm(forms.ModelForm):
    class Meta:
        model = GrowthMeasurement
        fields = [
            "child", "measurement_date", "weight_kg", "length_cm", "height_cm",
            "measurement_position", "muac_mm", "feeding_status", "recent_illness",
            "measurement_quality", "scale_id", "length_board_id",
        ]
        widgets = {
            "child": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "measurement_date": forms.DateInput(attrs={"class": "input input-bordered w-full", "type": "date"}),
        }
