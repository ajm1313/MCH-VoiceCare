"""Client forms."""
from django import forms

from apps.clients.models import Person, Household


class PersonForm(forms.ModelForm):
    """Full person demographics form — used standalone and inline in registration."""

    class Meta:
        model = Person
        fields = [
            "full_name", "date_of_birth", "sex", "national_id",
            "phone", "alternate_phone", "address", "community", "landmark",
            "preferred_language", "household", "organisation_unit",
            "sensitive_content_consent", "communication_opt_out",
            "care_consent", "model_training_consent", "research_consent",
            "research_waiver_status",
            "ivr_contact_consent", "ussd_contact_consent",
            "safe_calling_times", "shared_phone_status",
            "deceased", "deceased_verified",
        ]
        widgets = {
            "full_name": forms.TextInput(attrs={"class": "input input-bordered w-full"}),
            "date_of_birth": forms.DateInput(attrs={"class": "input input-bordered w-full", "type": "date"}),
            "sex": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "national_id": forms.TextInput(attrs={"class": "input input-bordered w-full"}),
            "phone": forms.TextInput(attrs={"class": "input input-bordered w-full"}),
            "alternate_phone": forms.TextInput(attrs={"class": "input input-bordered w-full"}),
            "address": forms.Textarea(attrs={"class": "textarea textarea-bordered w-full", "rows": 2}),
            "community": forms.TextInput(attrs={"class": "input input-bordered w-full"}),
            "landmark": forms.Textarea(attrs={"class": "textarea textarea-bordered w-full", "rows": 2}),
            "preferred_language": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "household": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "organisation_unit": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "safe_calling_times": forms.TextInput(attrs={"class": "input input-bordered w-full", "placeholder": "e.g. Mon-Fri 9am-4pm"}),
            "shared_phone_status": forms.Select(attrs={"class": "select select-bordered w-full"}, choices=[("", "—"), ("PERSONAL", "Personal phone"), ("SHARED", "Shared phone"), ("COMMUNITY", "Community phone")]),
            "research_waiver_status": forms.TextInput(attrs={"class": "input input-bordered w-full", "placeholder": "e.g. APPROVED_WAIVER_2026_001"}),
        }


class HouseholdForm(forms.ModelForm):
    class Meta:
        model = Household
        fields = [
            "household_name", "head_person_name", "location_description",
            "latitude", "longitude", "phone", "organisation_unit",
        ]
        widgets = {
            "household_name": forms.TextInput(attrs={"class": "input input-bordered w-full"}),
            "head_person_name": forms.TextInput(attrs={"class": "input input-bordered w-full"}),
            "location_description": forms.Textarea(attrs={"class": "textarea textarea-bordered w-full", "rows": 2}),
            "latitude": forms.NumberInput(attrs={"class": "input input-bordered w-full", "step": "0.0000001"}),
            "longitude": forms.NumberInput(attrs={"class": "input input-bordered w-full", "step": "0.0000001"}),
            "phone": forms.TextInput(attrs={"class": "input input-bordered w-full"}),
            "organisation_unit": forms.Select(attrs={"class": "select select-bordered w-full"}),
        }
