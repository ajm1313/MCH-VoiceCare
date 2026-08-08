"""Immunisation forms."""
from django import forms

from apps.immunisation.models import (
    ChildImmunisationRecord, VaccineDose, CWCSession, DefaulterEpisode,
)


class ChildRegistrationForm(forms.ModelForm):
    class Meta:
        model = ChildImmunisationRecord
        fields = [
            "child", "primary_caregiver", "date_of_birth",
            "cwc_card_number", "residence_status", "current_chps",
        ]
        widgets = {
            "child": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "primary_caregiver": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "date_of_birth": forms.DateInput(attrs={"class": "input input-bordered w-full", "type": "date"}),
            "cwc_card_number": forms.TextInput(attrs={"class": "input input-bordered w-full"}),
            "residence_status": forms.TextInput(attrs={"class": "input input-bordered w-full"}),
            "current_chps": forms.TextInput(attrs={"class": "input input-bordered w-full"}),
        }


class VaccineDoseForm(forms.ModelForm):
    class Meta:
        model = VaccineDose
        fields = [
            "child_record", "vaccine_code", "vaccine_name", "dose_number",
            "administration_date", "batch_lot", "product_name", "route_site",
            "administered_by",
        ]
        widgets = {
            "child_record": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "vaccine_code": forms.TextInput(attrs={"class": "input input-bordered w-full"}),
            "vaccine_name": forms.TextInput(attrs={"class": "input input-bordered w-full"}),
            "administration_date": forms.DateInput(attrs={"class": "input input-bordered w-full", "type": "date"}),
        }


class CWCSessionForm(forms.ModelForm):
    class Meta:
        model = CWCSession
        fields = ["facility_name", "session_date", "session_type", "status", "expected_count"]
        widgets = {
            "facility_name": forms.TextInput(attrs={"class": "input input-bordered w-full"}),
            "session_date": forms.DateInput(attrs={"class": "input input-bordered w-full", "type": "date"}),
            "session_type": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "status": forms.Select(attrs={"class": "select select-bordered w-full"}),
        }


class DefaulterTraceForm(forms.ModelForm):
    class Meta:
        model = DefaulterEpisode
        fields = ["trace_status", "trace_notes"]
        widgets = {
            "trace_status": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "trace_notes": forms.Textarea(attrs={"class": "textarea textarea-bordered w-full", "rows": 3}),
        }
