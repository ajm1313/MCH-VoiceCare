"""Pregnancy API serializers."""
from rest_framework import serializers
from apps.pregnancy.models import PregnancyEpisode, PregnancyObservation, PregnancyAssessment


class PregnancyEpisodeSerializer(serializers.ModelSerializer):
    woman_name = serializers.CharField(source="woman.full_name", read_only=True)

    class Meta:
        model = PregnancyEpisode
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at", "current_urgency", "closed_at"]


class PregnancyObservationSerializer(serializers.ModelSerializer):
    class Meta:
        model = PregnancyObservation
        fields = "__all__"
        read_only_fields = ["id", "recorded_at", "created_at", "updated_at"]


class PregnancyAssessmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = PregnancyAssessment
        fields = "__all__"
        read_only_fields = ["id", "assessed_at", "created_at", "updated_at"]
