"""Organisation API serializers."""
from rest_framework import serializers
from apps.organisations.models import OrganisationUnit, FacilityCapability


class OrganisationUnitSerializer(serializers.ModelSerializer):
    parent_name = serializers.CharField(source="parent.name", read_only=True)
    path = serializers.CharField(read_only=True)

    class Meta:
        model = OrganisationUnit
        fields = [
            "id", "name", "code", "unit_type", "parent", "parent_name",
            "facility_type", "latitude", "longitude", "status", "path",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class FacilityCapabilitySerializer(serializers.ModelSerializer):
    facility_name = serializers.CharField(source="facility.name", read_only=True)

    class Meta:
        model = FacilityCapability
        fields = [
            "id", "facility", "facility_name",
            "maternity_triage_24_7", "bemonc", "cemonc",
            "theatre", "blood", "specialist_obstetrics", "newborn_support",
            "primary_referral_destination", "backup_referral_destination",
            "verified_at", "verification_expires_at",
        ]
        read_only_fields = ["id"]
