"""Growth API serializers."""
from rest_framework import serializers
from apps.growth.models import GrowthMeasurement


class GrowthMeasurementSerializer(serializers.ModelSerializer):
    child_name = serializers.CharField(source="child.full_name", read_only=True)

    class Meta:
        model = GrowthMeasurement
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]
