"""
Person and Household models — the core demographic entities.
A Person can be a pregnant woman, newborn child, or caregiver.
"""
import uuid

from django.db import models

from apps.core.enums import Sex, YesNoUnknown, Language
from apps.core.models import TimeStampedModel


class Household(TimeStampedModel):
    """A household groups related persons geographically."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household_name = models.CharField(max_length=200)
    head_person_name = models.CharField(max_length=200, blank=True)
    location_description = models.TextField(blank=True)
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    organisation_unit = models.ForeignKey(
        "organisations.OrganisationUnit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="households",
    )

    class Meta:
        ordering = ["household_name"]

    def __str__(self):
        return self.household_name


class Person(TimeStampedModel):
    """A person — can be a pregnant woman, child, or caregiver."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Demographics
    full_name = models.CharField(max_length=200)
    date_of_birth = models.DateField(null=True, blank=True)
    sex = models.CharField(max_length=10, choices=Sex.choices, default=Sex.UNKNOWN)
    national_id = models.CharField(max_length=50, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    alternate_phone = models.CharField(max_length=20, blank=True)

    # Address
    address = models.TextField(blank=True)
    community = models.CharField(max_length=200, blank=True)
    landmark = models.TextField(blank=True)

    # Language preference (spec §26)
    preferred_language = models.CharField(
        max_length=10, choices=Language.choices, default=Language.ENGLISH,
    )

    # Consent flags (spec §26)
    sensitive_content_consent = models.BooleanField(default=True)
    communication_opt_out = models.BooleanField(default=False)

    # Privacy & contact preferences (spec §26)
    # Care consent and model-training/research consent MUST be separate concepts.
    care_consent = models.BooleanField(default=True)
    model_training_consent = models.BooleanField(default=False)
    research_consent = models.BooleanField(default=False)
    research_waiver_status = models.CharField(max_length=30, blank=True)

    # Telephony contact preferences (spec §26)
    ivr_contact_consent = models.BooleanField(default=True)
    ussd_contact_consent = models.BooleanField(default=True)
    safe_calling_times = models.CharField(max_length=200, blank=True)
    shared_phone_status = models.CharField(max_length=30, blank=True)

    # Vital status
    deceased = models.BooleanField(default=False)
    deceased_verified = models.BooleanField(default=False)

    # Linkages
    household = models.ForeignKey(
        Household, on_delete=models.SET_NULL, null=True, blank=True, related_name="members"
    )
    organisation_unit = models.ForeignKey(
        "organisations.OrganisationUnit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="persons",
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.full_name

    @property
    def age_years(self) -> int | None:
        if not self.date_of_birth:
            return None
        from datetime import date
        today = date.today()
        born = self.date_of_birth
        return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


class CaregiverLink(TimeStampedModel):
    """Links a child to a primary caregiver (who is also a Person)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    child = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="caregiver_links")
    caregiver = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="dependents")
    relationship = models.CharField(max_length=50, blank=True)
    is_primary = models.BooleanField(default=True)

    class Meta:
        unique_together = [("child", "caregiver")]

    def __str__(self):
        return f"{self.caregiver.full_name} → {self.child.full_name}"


class PatientReconciliationQueue(TimeStampedModel):
    """
    Reconciliation queue for potential duplicate patient identities
    (spec §19.4). Patient identity conflicts are NEVER auto-merged —
    they are placed in this queue for manual review.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    person_a = models.ForeignKey(
        Person, on_delete=models.CASCADE, related_name="reconciliation_as_a",
    )
    person_b = models.ForeignKey(
        Person, on_delete=models.CASCADE, related_name="reconciliation_as_b",
    )
    reason = models.CharField(
        max_length=200, help_text="Why these records may be duplicates",
    )
    match_score = models.FloatField(
        default=0.0, help_text="Similarity score 0-1",
    )
    status = models.CharField(
        max_length=20,
        choices=[
            ("PENDING", "Pending"),
            ("RESOLVED_MERGE", "Resolved - Merged"),
            ("RESOLVED_KEEP_BOTH", "Resolved - Keep Both"),
            ("RESOLVED_REJECT", "Resolved - Rejected"),
        ],
        default="PENDING",
    )
    resolved_by = models.CharField(max_length=200, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-match_score", "-created_at"]

    def __str__(self):
        return f"Reconciliation: {self.person_a.full_name} ↔ {self.person_b.full_name} ({self.status})"
