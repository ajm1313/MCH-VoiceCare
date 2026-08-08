"""
Pregnancy episode models — ANC registration, observations, assessments.
"""
import uuid

from django.db import models

from apps.core.enums import (
    EpisodeStatus, UrgencyLevel, YesNoUnknown, Sex,
)
from apps.core.models import TimeStampedModel
from apps.clients.models import Person


class PregnancyEpisode(TimeStampedModel):
    """A single pregnancy episode for a woman."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    woman = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="pregnancies")
    status = models.CharField(
        max_length=20, choices=EpisodeStatus.choices, default=EpisodeStatus.ACTIVE,
    )

    # Assignment
    assigned_chps = models.CharField(max_length=200, blank=True)
    assigned_worker = models.CharField(max_length=200, blank=True)

    # Dating
    lmp_date = models.DateField(null=True, blank=True, verbose_name="Last Menstrual Period")
    lmp_reliability = models.CharField(max_length=20, choices=YesNoUnknown.choices, default=YesNoUnknown.UNKNOWN)
    dating_method = models.CharField(max_length=50, blank=True)

    # Obstetric history
    gravidity = models.PositiveIntegerField(default=0)
    parity = models.PositiveIntegerField(default=0)
    living_children = models.PositiveIntegerField(default=0)
    previous_caesarean_count = models.PositiveIntegerField(default=0)
    previous_uterine_surgery = models.BooleanField(default=False)
    previous_stillbirth = models.BooleanField(default=False)
    previous_neonatal_death = models.BooleanField(default=False)
    previous_pph = models.BooleanField(default=False, verbose_name="Previous PPH")
    previous_preeclampsia_eclampsia = models.BooleanField(default=False)
    previous_preterm_birth = models.BooleanField(default=False)
    previous_obstructed_labour = models.BooleanField(default=False)
    maternal_age_years = models.PositiveIntegerField(null=True, blank=True)

    # Baseline & medical
    height_cm = models.PositiveIntegerField(null=True, blank=True)
    booking_weight_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    chronic_hypertension = models.BooleanField(default=False)
    diabetes = models.BooleanField(default=False)
    sickle_cell_status = models.CharField(max_length=30, blank=True)
    cardiac_disease = models.BooleanField(default=False)
    renal_disease = models.BooleanField(default=False)
    epilepsy = models.BooleanField(default=False)
    blood_group = models.CharField(max_length=10, blank=True)
    rhesus_status = models.CharField(max_length=10, blank=True)
    travel_time_referral_minutes = models.PositiveIntegerField(null=True, blank=True)
    birth_plan_complete = models.BooleanField(default=False)

    # Infection screening (confidential)
    hiv_status = models.CharField(max_length=20, blank=True)
    syphilis_status = models.CharField(max_length=20, blank=True)
    hepatitis_b_status = models.CharField(max_length=20, blank=True)
    tb_status = models.CharField(max_length=20, blank=True)

    # System flags
    late_booking_or_missed_anc = models.BooleanField(default=False)
    severe_access_barrier = models.BooleanField(default=False)
    specialist_recommendation_incomplete = models.BooleanField(default=False)

    # Socio-economic context (collected by mobile app)
    maternal_education = models.CharField(max_length=50, blank=True)
    maternal_occupation = models.CharField(max_length=100, blank=True)
    number_of_jobs = models.PositiveIntegerField(default=1)
    average_daily_working_hours = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)

    # Assessment result
    current_urgency = models.CharField(
        max_length=20, choices=UrgencyLevel.choices, default=UrgencyLevel.ROUTINE,
    )
    closed_at = models.DateTimeField(null=True, blank=True)
    close_reason = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Pregnancy: {self.woman.full_name} ({self.status})"


class PregnancyObservation(TimeStampedModel):
    """A single ANC observation record."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    episode = models.ForeignKey(PregnancyEpisode, on_delete=models.CASCADE, related_name="observations")
    recorded_by = models.CharField(max_length=200, blank=True)
    recorded_at = models.DateTimeField(auto_now_add=True)

    # Provenance (spec §9)
    capture_route = models.CharField(max_length=20, default="MANUAL")
    captured_by = models.CharField(max_length=200, blank=True)
    human_confirmed = models.BooleanField(default=True)
    ocr_confidence = models.FloatField(null=True, blank=True)
    device_id = models.CharField(max_length=200, blank=True)
    source_artifact_id = models.CharField(max_length=200, blank=True)
    template_version = models.CharField(max_length=50, blank=True)
    correction_of_id = models.CharField(max_length=200, blank=True)
    correction_reason = models.TextField(blank=True)

    # Vitals
    bp_systolic = models.PositiveIntegerField(null=True, blank=True)
    bp_diastolic = models.PositiveIntegerField(null=True, blank=True)
    bp_repeat_after_rest = models.BooleanField(default=False)
    hb_g_dl = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True, verbose_name="Haemoglobin")
    temperature_c = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    respiratory_rate_min = models.PositiveIntegerField(null=True, blank=True)
    weight_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    fundal_height_cm = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    fhr_bpm = models.PositiveIntegerField(null=True, blank=True, verbose_name="Fetal Heart Rate")

    # Urine
    urine_protein = models.CharField(max_length=20, blank=True)
    urine_glucose = models.CharField(max_length=20, blank=True)
    oedema = models.CharField(max_length=20, blank=True)

    # Fetal assessment
    movement_status = models.CharField(max_length=50, blank=True)
    fetal_number = models.CharField(max_length=20, blank=True, default="SINGLE")
    presentation = models.CharField(max_length=20, blank=True, default="UNKNOWN")
    uterine_size_discrepancy_weeks = models.PositiveIntegerField(null=True, blank=True)

    # Danger signs (individual booleans — spec §12 rule engine input)
    danger_signs = models.TextField(blank=True)
    vaginal_bleeding = models.CharField(max_length=20, blank=True, default="NONE")
    fluid_leakage = models.CharField(max_length=20, blank=True, default="NONE")
    contractions = models.CharField(max_length=20, blank=True, default="NONE")
    severe_headache = models.BooleanField(default=False)
    visual_disturbance = models.BooleanField(default=False)
    epigastric_pain = models.BooleanField(default=False)
    convulsion_or_unconsciousness = models.BooleanField(default=False)
    severe_abdominal_pain = models.BooleanField(default=False)
    fever_or_severe_illness = models.BooleanField(default=False)
    suspected_shock_or_collapse = models.BooleanField(default=False)
    severe_breathing_difficulty = models.BooleanField(default=False)
    suspected_cord_prolapse = models.BooleanField(default=False)
    persistent_vomiting_dehydration = models.BooleanField(default=False)
    jaundice_or_liver_symptoms = models.BooleanField(default=False)
    offensive_discharge_with_fever_pain = models.BooleanField(default=False)
    anaemia_symptoms = models.BooleanField(default=False)

    # Worker judgement flags (spec §12 — worker can escalate beyond rules)
    suspected_sepsis = models.BooleanField(default=False)
    fetal_heart_seriously_abnormal = models.BooleanField(default=False)
    severe_anaemia_symptoms_unstable = models.BooleanField(default=False)
    emergency_referral_incomplete = models.BooleanField(default=False)
    definitive_fetal_assessment_done = models.BooleanField(default=False)
    growth_trend_static = models.BooleanField(default=False)
    urgent_referral_incomplete_stable = models.BooleanField(default=False)
    fhr_repeat_confirmed = models.BooleanField(default=False)
    hb_required_by_protocol = models.BooleanField(default=False)
    symptom_not_understood = models.BooleanField(default=False)
    records_conflicting = models.BooleanField(default=False)
    client_uncontactable = models.BooleanField(default=False)
    worker_judgement_critical = models.BooleanField(default=False)
    worker_judgement_rationale = models.TextField(blank=True)

    class Meta:
        ordering = ["-recorded_at"]


class PregnancyAssessment(TimeStampedModel):
    """Result of running clinical rules on a pregnancy episode."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    episode = models.ForeignKey(PregnancyEpisode, on_delete=models.CASCADE, related_name="assessments")
    disposition = models.CharField(max_length=20, choices=UrgencyLevel.choices)
    fired_rules = models.JSONField(default=list)
    recommended_action = models.TextField(blank=True)
    rule_set_version = models.CharField(max_length=50, default="placeholder-v0")
    assessed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-assessed_at"]
