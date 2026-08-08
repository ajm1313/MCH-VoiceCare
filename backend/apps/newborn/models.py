"""
Newborn episode models — birth episode, newborn episode, observations, assessments.
"""
import uuid

from django.db import models

from apps.core.enums import EpisodeStatus, UrgencyLevel, Sex, YesNoUnknown
from apps.core.models import TimeStampedModel
from apps.clients.models import Person


class BirthEpisode(TimeStampedModel):
    """Records the birth event."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    mother = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="births")
    pregnancy = models.ForeignKey(
        "pregnancy.PregnancyEpisode", on_delete=models.SET_NULL, null=True, blank=True,
    )
    birth_datetime = models.DateTimeField(null=True, blank=True)

    # Birth details (aligned with mobile app field names)
    place_of_birth = models.CharField(max_length=200, blank=True)
    skilled_attendant = models.BooleanField(default=True)
    mode_of_delivery = models.CharField(max_length=50, blank=True)
    maternal_fever_labour = models.BooleanField(default=False)
    rupture_membranes_hours = models.PositiveIntegerField(null=True, blank=True)
    liquor_quality = models.CharField(max_length=30, blank=True, default="CLEAR")

    # Legacy fields (kept for backward compatibility — populated from mobile data)
    facility = models.CharField(max_length=200, blank=True)
    birth_location = models.CharField(max_length=100, blank=True)
    delivery_type = models.CharField(max_length=50, blank=True)
    labour_duration_hours = models.PositiveIntegerField(null=True, blank=True)
    complications = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Birth: {self.mother.full_name} ({self.birth_datetime or '—'})"


class NewbornEpisode(TimeStampedModel):
    """A newborn care episode linked to a child person and birth."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    child = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="newborn_episodes")
    birth_episode = models.ForeignKey(BirthEpisode, on_delete=models.SET_NULL, null=True, blank=True)
    mother = models.ForeignKey(Person, on_delete=models.SET_NULL, null=True, blank=True, related_name="newborns")
    pregnancy = models.ForeignKey(
        "pregnancy.PregnancyEpisode", on_delete=models.SET_NULL, null=True, blank=True,
    )
    status = models.CharField(max_length=20, choices=EpisodeStatus.choices, default=EpisodeStatus.ACTIVE)

    # Assignment
    assigned_chps = models.CharField(max_length=200, blank=True)
    assigned_worker = models.CharField(max_length=200, blank=True)

    # Birth details
    multiple_birth_order = models.PositiveIntegerField(null=True, blank=True)
    sex = models.CharField(max_length=10, choices=Sex.choices, default=Sex.UNKNOWN)
    gestational_age_weeks = models.PositiveIntegerField(null=True, blank=True)
    birth_weight_g = models.PositiveIntegerField(null=True, blank=True)
    length_cm = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    head_circumference_cm = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    cried_or_breathed_immediately = models.BooleanField(default=True)
    resuscitation_required = models.BooleanField(default=False)
    resuscitation_duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    apgar_1_min = models.PositiveIntegerField(null=True, blank=True)
    apgar_5_min = models.PositiveIntegerField(null=True, blank=True)

    # Essential care & KMC
    essential_care_complete = models.BooleanField(default=False)
    breastfeeding_initiation_datetime = models.DateTimeField(null=True, blank=True)
    kmc_status = models.CharField(max_length=30, blank=True)
    kmc_hours_24h = models.PositiveIntegerField(null=True, blank=True)
    hospital_discharge_date = models.DateField(null=True, blank=True)
    discharge_diagnoses = models.TextField(blank=True)
    next_follow_up_datetime = models.DateTimeField(null=True, blank=True)

    # Access & caregiver
    travel_time_referral_minutes = models.PositiveIntegerField(null=True, blank=True)
    current_location_status = models.CharField(max_length=50, blank=True)
    maternal_ability_to_care = models.CharField(max_length=30, choices=YesNoUnknown.choices, default=YesNoUnknown.UNKNOWN)
    alternative_caregiver_available = models.BooleanField(default=False)

    # Risk flags
    previous_newborn_unit_admission = models.BooleanField(default=False)
    congenital_abnormality = models.BooleanField(default=False)
    complex_feeding_plan = models.BooleanField(default=False)
    maternal_death = models.BooleanField(default=False)
    severe_access_barrier = models.BooleanField(default=False)
    missed_postnatal_contact = models.BooleanField(default=False)

    # Assessment
    current_urgency = models.CharField(max_length=20, choices=UrgencyLevel.choices, default=UrgencyLevel.ROUTINE)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Newborn: {self.child.full_name} ({self.status})"


class NewbornObservation(TimeStampedModel):
    """A newborn observation record."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    newborn = models.ForeignKey(NewbornEpisode, on_delete=models.CASCADE, related_name="observations")
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
    temperature_c = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    respiratory_rate_min = models.PositiveIntegerField(null=True, blank=True)
    current_weight_g = models.PositiveIntegerField(null=True, blank=True)
    movement_status = models.CharField(max_length=50, blank=True)

    # Danger signs
    severe_chest_indrawing = models.BooleanField(default=False)
    convulsions = models.BooleanField(default=False)
    grunting = models.BooleanField(default=False)
    apnoea_or_gasping = models.BooleanField(default=False)
    central_cyanosis = models.BooleanField(default=False)
    bulging_fontanelle = models.BooleanField(default=False)
    abdominal_distension = models.BooleanField(default=False)
    yellow_palms_soles = models.BooleanField(default=False)

    # Feeding
    feeding_status = models.CharField(max_length=50, blank=True)
    suck_quality = models.CharField(max_length=50, blank=True)
    feeds_last_24h = models.CharField(max_length=50, blank=True)
    vomiting = models.CharField(max_length=50, blank=True)

    # Jaundice
    jaundice_onset_age_hours = models.PositiveIntegerField(null=True, blank=True)
    bilirubin_value = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)

    # Other clinical
    umbilical_status = models.CharField(max_length=50, blank=True)
    skin_pustules_extent = models.CharField(max_length=50, blank=True)
    eye_discharge = models.CharField(max_length=50, blank=True)
    urine_passed = models.CharField(max_length=20, blank=True)
    meconium_passed = models.CharField(max_length=20, blank=True)

    # Worker judgement flags (spec §12 — worker can escalate beyond rules)
    marked_illness = models.BooleanField(default=False)
    suspected_severe_infection = models.BooleanField(default=False)
    rr_repeat_confirmed = models.BooleanField(default=False)
    recurrent_hypothermia_despite_warming = models.BooleanField(default=False)
    respiratory_abnormality_needs_verification = models.BooleanField(default=False)
    newborn_exam_done = models.BooleanField(default=False)
    discharged_sick_small = models.BooleanField(default=False)
    missed_early_followup = models.BooleanField(default=False)
    is_required_contact = models.BooleanField(default=False)
    is_danger_assessment = models.BooleanField(default=False)
    symptom_not_understood = models.BooleanField(default=False)
    caregiver_uncontactable = models.BooleanField(default=False)
    worker_judgement_critical = models.BooleanField(default=False)
    worker_judgement_rationale = models.TextField(blank=True)

    class Meta:
        ordering = ["-recorded_at"]


class NewbornAssessment(TimeStampedModel):
    """Result of running newborn clinical rules."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    episode = models.ForeignKey(NewbornEpisode, on_delete=models.CASCADE, related_name="assessments")
    disposition = models.CharField(max_length=20, choices=UrgencyLevel.choices)
    fired_rules = models.JSONField(default=list)
    recommended_action = models.TextField(blank=True)
    rule_set_version = models.CharField(max_length=50, default="placeholder-v0")
    assessed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-assessed_at"]
