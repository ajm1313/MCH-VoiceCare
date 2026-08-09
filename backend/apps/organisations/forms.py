"""Organisation forms."""
from django import forms

from apps.organisations.models import OrganisationUnit


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
