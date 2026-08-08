"""Newborn API serializers."""
from rest_framework import serializers
from apps.newborn.models import BirthEpisode, NewbornEpisode, NewbornObservation, NewbornAssessment


class BirthEpisodeSerializer(serializers.ModelSerializer):
    mother_name = serializers.CharField(source="mother.full_name", read_only=True)

    class Meta:
        model = BirthEpisode
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class NewbornEpisodeSerializer(serializers.ModelSerializer):
    child_name = serializers.CharField(source="child.full_name", read_only=True)
    mother_name = serializers.CharField(source="mother.full_name", read_only=True)

    class Meta:
        model = NewbornEpisode
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at", "current_urgency", "closed_at"]


class NewbornObservationSerializer(serializers.ModelSerializer):
    class Meta:
        model = NewbornObservation
        fields = "__all__"
        read_only_fields = ["id", "recorded_at", "created_at", "updated_at"]


class NewbornAssessmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = NewbornAssessment
        fields = "__all__"
        read_only_fields = ["id", "assessed_at", "created_at", "updated_at"]
