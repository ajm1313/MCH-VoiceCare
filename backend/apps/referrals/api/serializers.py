"""Referral API serializers."""
from rest_framework import serializers
from apps.referrals.models import Referral, ReferralStateLog


class ReferralSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    destination_name = serializers.CharField(source="destination_facility.name", read_only=True)

    class Meta:
        model = Referral
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at", "qr_token", "short_code", "acknowledged_at", "arrived_at", "closed_at"]


class ReferralStateLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReferralStateLog
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]
