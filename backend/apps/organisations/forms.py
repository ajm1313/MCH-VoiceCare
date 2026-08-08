"""Organisation forms."""
from django import forms

from apps.organisations.models import OrganisationUnit, FacilityCapability


class OrganisationUnitForm(forms.ModelForm):
    class Meta:
        model = OrganisationUnit
        fields = [
            "name", "code", "unit_type", "parent",
            "facility_type", "latitude", "longitude", "status",
        ]
        widgets = {
            "name": forms.TextInput(attrs={"class": "input input-bordered w-full"}),
            "code": forms.TextInput(attrs={"class": "input input-bordered w-full"}),
            "unit_type": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "parent": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "facility_type": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "latitude": forms.NumberInput(attrs={"class": "input input-bordered w-full", "step": "0.0000001"}),
            "longitude": forms.NumberInput(attrs={"class": "input input-bordered w-full", "step": "0.0000001"}),
            "status": forms.Select(attrs={"class": "select select-bordered w-full"}),
        }


class FacilityCapabilityForm(forms.ModelForm):
    class Meta:
        model = FacilityCapability
        fields = [
            "facility", "maternity_triage_24_7", "bemonc", "cemonc",
            "theatre", "blood", "specialist_obstetrics", "newborn_support",
            "primary_referral_destination", "backup_referral_destination",
            "verified_at", "verification_expires_at",
        ]
        widgets = {
            "facility": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "primary_referral_destination": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "backup_referral_destination": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "verified_at": forms.DateTimeInput(attrs={"class": "input input-bordered w-full", "type": "datetime-local"}),
            "verification_expires_at": forms.DateTimeInput(attrs={"class": "input input-bordered w-full", "type": "datetime-local"}),
        }
