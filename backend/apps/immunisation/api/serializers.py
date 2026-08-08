"""Immunisation API serializers."""
from rest_framework import serializers
from apps.immunisation.models import (
    ChildImmunisationRecord, VaccineDose, CWCSession, CWCSessionAttendance, DefaulterEpisode,
)


class ChildImmunisationRecordSerializer(serializers.ModelSerializer):
    child_name = serializers.CharField(source="child.full_name", read_only=True)

    class Meta:
        model = ChildImmunisationRecord
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class VaccineDoseSerializer(serializers.ModelSerializer):
    class Meta:
        model = VaccineDose
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class CWCSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CWCSession
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class CWCSessionAttendanceSerializer(serializers.ModelSerializer):
    child_name = serializers.CharField(source="child.full_name", read_only=True)

    class Meta:
        model = CWCSessionAttendance
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class DefaulterEpisodeSerializer(serializers.ModelSerializer):
    child_name = serializers.CharField(source="child_record.child.full_name", read_only=True)

    class Meta:
        model = DefaulterEpisode
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]
