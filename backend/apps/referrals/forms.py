"""Referral forms."""
from django import forms
from apps.referrals.models import Referral


class ReferralForm(forms.ModelForm):
    class Meta:
        model = Referral
        fields = [
            "patient", "pregnancy_episode", "newborn_episode",
            "referral_reason", "referring_facility", "destination_facility",
            "urgency", "pre_referral_care",
            "transport_mode", "estimated_transport_time_minutes",
        ]
        widgets = {
            "patient": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "pregnancy_episode": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "newborn_episode": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "referring_facility": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "destination_facility": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "urgency": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "referral_reason": forms.Textarea(attrs={"class": "textarea textarea-bordered w-full", "rows": 3}),
            "pre_referral_care": forms.Textarea(attrs={"class": "textarea textarea-bordered w-full", "rows": 2}),
            "transport_mode": forms.Select(attrs={"class": "select select-bordered w-full"}, choices=[
                ("", "—"), ("AMBULANCE", "Ambulance"), ("HEALTH_SERVICE_VEHICLE", "Health service vehicle"),
                ("PRIVATE_VEHICLE", "Private vehicle"), ("PUBLIC_TRANSPORT", "Public transport"),
                ("ON_FOOT", "On foot"), ("OTHER", "Other"),
            ]),
        }
