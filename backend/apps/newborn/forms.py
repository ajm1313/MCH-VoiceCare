"""Newborn forms."""
from django import forms

from apps.newborn.models import BirthEpisode, NewbornEpisode, NewbornObservation


class BirthEpisodeForm(forms.ModelForm):
    class Meta:
        model = BirthEpisode
        fields = [
            "mother", "pregnancy", "birth_datetime",
            "place_of_birth", "skilled_attendant", "mode_of_delivery",
            "maternal_fever_labour", "rupture_membranes_hours", "liquor_quality",
            "facility", "birth_location", "delivery_type",
            "labour_duration_hours", "complications",
        ]
        widgets = {
            "mother": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "pregnancy": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "birth_datetime": forms.DateTimeInput(attrs={"class": "input input-bordered w-full", "type": "datetime-local"}),
            "place_of_birth": forms.TextInput(attrs={"class": "input input-bordered w-full"}),
            "mode_of_delivery": forms.Select(attrs={"class": "select select-bordered w-full"}, choices=[
                ("", "—"), ("SPONTANEOUS_VAGINAL", "Spontaneous vaginal"),
                ("ASSISTED_VAGINAL", "Assisted vaginal"), ("CAESAREAN", "Caesarean"),
            ]),
            "liquor_quality": forms.Select(attrs={"class": "select select-bordered w-full"}, choices=[
                ("CLEAR", "Clear"), ("BLOOD_STAINED", "Blood-stained"),
                ("MECONIUM_STAINED", "Meconium-stained"), ("PURULENT", "Purulent"),
                ("UNKNOWN", "Unknown"),
            ]),
            "facility": forms.TextInput(attrs={"class": "input input-bordered w-full"}),
            "birth_location": forms.TextInput(attrs={"class": "input input-bordered w-full"}),
            "delivery_type": forms.TextInput(attrs={"class": "input input-bordered w-full"}),
            "complications": forms.Textarea(attrs={"class": "textarea textarea-bordered w-full", "rows": 2}),
        }


class NewbornEpisodeForm(forms.ModelForm):
    class Meta:
        model = NewbornEpisode
        fields = [
            "child", "mother", "pregnancy",
            "assigned_chps", "assigned_worker",
            "multiple_birth_order", "sex",
            "gestational_age_weeks", "birth_weight_g", "length_cm", "head_circumference_cm",
            "cried_or_breathed_immediately", "resuscitation_required", "resuscitation_duration_minutes",
            "apgar_1_min", "apgar_5_min",
            "essential_care_complete", "breastfeeding_initiation_datetime",
            "kmc_status", "kmc_hours_24h",
            "hospital_discharge_date", "discharge_diagnoses", "next_follow_up_datetime",
            "travel_time_referral_minutes", "current_location_status",
            "maternal_ability_to_care", "alternative_caregiver_available",
            "previous_newborn_unit_admission", "congenital_abnormality",
            "complex_feeding_plan", "maternal_death",
            "severe_access_barrier", "missed_postnatal_contact",
        ]
        widgets = {
            "child": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "mother": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "pregnancy": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "assigned_chps": forms.TextInput(attrs={"class": "input input-bordered w-full"}),
            "assigned_worker": forms.TextInput(attrs={"class": "input input-bordered w-full"}),
            "sex": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "breastfeeding_initiation_datetime": forms.DateTimeInput(attrs={"class": "input input-bordered w-full", "type": "datetime-local"}),
            "hospital_discharge_date": forms.DateInput(attrs={"class": "input input-bordered w-full", "type": "date"}),
            "next_follow_up_datetime": forms.DateTimeInput(attrs={"class": "input input-bordered w-full", "type": "datetime-local"}),
            "discharge_diagnoses": forms.Textarea(attrs={"class": "textarea textarea-bordered w-full", "rows": 2}),
        }


class NewbornObservationForm(forms.ModelForm):
    class Meta:
        model = NewbornObservation
        fields = [
            "temperature_c", "respiratory_rate_min", "current_weight_g",
            "movement_status",
            "severe_chest_indrawing", "convulsions", "grunting",
            "apnoea_or_gasping", "central_cyanosis", "bulging_fontanelle",
            "abdominal_distension", "yellow_palms_soles",
            "feeding_status", "suck_quality", "feeds_last_24h", "vomiting",
            "jaundice_onset_age_hours", "bilirubin_value",
            "umbilical_status", "skin_pustules_extent", "eye_discharge",
            "urine_passed", "meconium_passed",
            "marked_illness", "suspected_severe_infection",
            "rr_repeat_confirmed", "recurrent_hypothermia_despite_warming",
            "respiratory_abnormality_needs_verification", "newborn_exam_done",
            "discharged_sick_small", "missed_early_followup",
            "is_required_contact", "is_danger_assessment",
            "symptom_not_understood", "caregiver_uncontactable",
            "worker_judgement_critical", "worker_judgement_rationale",
            "capture_route", "human_confirmed", "ocr_confidence",
            "device_id", "source_artifact_id", "template_version",
        ]
        widgets = {
            "worker_judgement_rationale": forms.Textarea(attrs={"class": "textarea textarea-bordered w-full", "rows": 2}),
            "capture_route": forms.Select(attrs={"class": "select select-bordered w-full"}, choices=[
                ("MANUAL", "Manual"), ("OCR", "OCR"), ("IVR_DTMF", "IVR/DTMF"),
                ("USSD", "USSD"), ("DEVICE_IMPORT", "Device Import"),
            ]),
        }
