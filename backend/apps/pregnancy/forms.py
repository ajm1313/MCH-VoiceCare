"""Pregnancy forms."""
from django import forms

from apps.pregnancy.models import PregnancyEpisode, PregnancyObservation


class PregnancyRegistrationForm(forms.ModelForm):
    class Meta:
        model = PregnancyEpisode
        fields = [
            "woman", "assigned_chps", "assigned_worker",
            "lmp_date", "lmp_reliability", "dating_method",
            "gravidity", "parity", "living_children",
            "previous_caesarean_count", "previous_uterine_surgery",
            "previous_stillbirth", "previous_neonatal_death",
            "previous_pph", "previous_preeclampsia_eclampsia",
            "previous_preterm_birth", "previous_obstructed_labour",
            "maternal_age_years",
            "height_cm", "booking_weight_kg",
            "chronic_hypertension", "diabetes", "sickle_cell_status",
            "cardiac_disease", "renal_disease", "epilepsy",
            "blood_group", "rhesus_status",
            "travel_time_referral_minutes", "birth_plan_complete",
            "hiv_status", "syphilis_status", "hepatitis_b_status", "tb_status",
            "late_booking_or_missed_anc", "severe_access_barrier",
            "specialist_recommendation_incomplete",
            "maternal_education", "maternal_occupation",
            "number_of_jobs", "average_daily_working_hours",
        ]
        widgets = {
            "woman": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "assigned_chps": forms.TextInput(attrs={"class": "input input-bordered w-full"}),
            "assigned_worker": forms.TextInput(attrs={"class": "input input-bordered w-full"}),
            "lmp_date": forms.DateInput(attrs={"class": "input input-bordered w-full", "type": "date"}),
            "lmp_reliability": forms.Select(attrs={"class": "select select-bordered w-full"}),
            "dating_method": forms.TextInput(attrs={"class": "input input-bordered w-full"}),
        }


class ObservationForm(forms.ModelForm):
    class Meta:
        model = PregnancyObservation
        fields = [
            "bp_systolic", "bp_diastolic", "bp_repeat_after_rest",
            "hb_g_dl", "temperature_c", "respiratory_rate_min",
            "weight_kg", "fundal_height_cm", "fhr_bpm",
            "urine_protein", "urine_glucose", "oedema",
            "movement_status", "fetal_number", "presentation",
            "uterine_size_discrepancy_weeks",
            "vaginal_bleeding", "fluid_leakage", "contractions",
            "severe_headache", "visual_disturbance", "epigastric_pain",
            "convulsion_or_unconsciousness", "severe_abdominal_pain",
            "fever_or_severe_illness", "suspected_shock_or_collapse",
            "severe_breathing_difficulty", "suspected_cord_prolapse",
            "persistent_vomiting_dehydration", "jaundice_or_liver_symptoms",
            "offensive_discharge_with_fever_pain", "anaemia_symptoms",
            "suspected_sepsis", "fetal_heart_seriously_abnormal",
            "severe_anaemia_symptoms_unstable", "emergency_referral_incomplete",
            "definitive_fetal_assessment_done", "growth_trend_static",
            "urgent_referral_incomplete_stable", "fhr_repeat_confirmed",
            "hb_required_by_protocol", "symptom_not_understood",
            "records_conflicting", "client_uncontactable",
            "worker_judgement_critical", "worker_judgement_rationale",
            "danger_signs",
            "capture_route", "human_confirmed", "ocr_confidence",
            "device_id", "source_artifact_id", "template_version",
        ]
        widgets = {
            "danger_signs": forms.Textarea(attrs={"class": "textarea textarea-bordered w-full", "rows": 3}),
            "worker_judgement_rationale": forms.Textarea(attrs={"class": "textarea textarea-bordered w-full", "rows": 2}),
            "capture_route": forms.Select(attrs={"class": "select select-bordered w-full"}, choices=[
                ("MANUAL", "Manual"), ("OCR", "OCR"), ("IVR_DTMF", "IVR/DTMF"),
                ("USSD", "USSD"), ("DEVICE_IMPORT", "Device Import"),
            ]),
            "vaginal_bleeding": forms.Select(attrs={"class": "select select-bordered w-full"}, choices=[
                ("NONE", "None"), ("SPOTTING", "Spotting"), ("HEAVY", "Heavy"),
            ]),
            "fluid_leakage": forms.Select(attrs={"class": "select select-bordered w-full"}, choices=[
                ("NONE", "None"), ("CLEAR", "Clear"), ("MECONIUM", "Meconium-stained"),
                ("BLOOD-STAINED", "Blood-stained"),
            ]),
            "contractions": forms.Select(attrs={"class": "select select-bordered w-full"}, choices=[
                ("NONE", "None"), ("IRREGULAR", "Irregular"), ("REGULAR", "Regular"),
            ]),
            "fetal_number": forms.Select(attrs={"class": "select select-bordered w-full"}, choices=[
                ("SINGLE", "Single"), ("TWIN", "Twin"), ("TRIPLET", "Triplet+"),
            ]),
            "presentation": forms.Select(attrs={"class": "select select-bordered w-full"}, choices=[
                ("CEPHALIC", "Cephalic"), ("BREECH", "Breech"),
                ("TRANSVERSE", "Transverse"), ("UNKNOWN", "Unknown"),
            ]),
        }
