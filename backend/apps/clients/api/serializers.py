"""Client API serializers."""
from rest_framework import serializers
from apps.clients.models import Person, Household, CaregiverLink


class PersonSerializer(serializers.ModelSerializer):
    age_years = serializers.IntegerField(read_only=True)
    household_name = serializers.CharField(source="household.household_name", read_only=True)

    class Meta:
        model = Person
        fields = [
            "id", "full_name", "date_of_birth", "sex", "national_id",
            "phone", "alternate_phone", "address", "community", "landmark",
            "preferred_language", "household", "household_name",
            "organisation_unit", "sensitive_content_consent",
            "communication_opt_out", "deceased", "deceased_verified",
            "age_years", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "age_years", "created_at", "updated_at"]


class HouseholdSerializer(serializers.ModelSerializer):
    class Meta:
        model = Household
        fields = [
            "id", "household_name", "head_person_name", "location_description",
            "latitude", "longitude", "phone", "organisation_unit",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class CaregiverLinkSerializer(serializers.ModelSerializer):
    child_name = serializers.CharField(source="child.full_name", read_only=True)
    caregiver_name = serializers.CharField(source="caregiver.full_name", read_only=True)

    class Meta:
        model = CaregiverLink
        fields = [
            "id", "child", "child_name", "caregiver", "caregiver_name",
            "relationship", "is_primary", "created_at",
        ]
        read_only_fields = ["id", "created_at"]
