"""
Patient identity reconciliation (spec §19.4).

Patient identity conflicts are NEVER auto-merged. When a potential duplicate
is detected (same name + date_of_birth + sex), the pair is placed in the
PatientReconciliationQueue for manual review by a clinician or administrator.
"""
from django.utils import timezone

from apps.clients.models import Person, PatientReconciliationQueue


def _name_similarity(a: str, b: str) -> float:
    """
    Simple similarity score between two names (0-1).
    Uses a normalised Levenshtein-style ratio via difflib.
    """
    import difflib
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()


def check_for_duplicates(person: Person) -> list[PatientReconciliationQueue]:
    """
    Compare a (newly created or synced) Person against existing persons by
    name + date_of_birth + sex. If a potential match is found, add it to the
    reconciliation queue instead of auto-merging (spec §19.4).

    Returns the list of reconciliation queue entries created (may be empty).
    """
    created_entries: list[PatientReconciliationQueue] = []

    # Build a queryset of candidate duplicates, excluding the person itself
    candidates = Person.objects.exclude(id=person.id)

    # Filter by exact date_of_birth and sex if available
    if person.date_of_birth:
        candidates = candidates.filter(date_of_birth=person.date_of_birth)
    if person.sex:
        candidates = candidates.filter(sex=person.sex)

    # Further filter by name similarity (case-insensitive exact match first,
    # then fuzzy match for near-duplicates)
    for candidate in candidates:
        name_score = _name_similarity(person.full_name, candidate.full_name)
        if name_score < 0.8:
            continue

        # Avoid creating duplicate queue entries for the same pair
        existing = PatientReconciliationQueue.objects.filter(
            person_a=person, person_b=candidate,
        ).first() or PatientReconciliationQueue.objects.filter(
            person_a=candidate, person_b=person,
        ).first()

        if existing:
            continue

        # Build a human-readable reason
        reason_parts = []
        if name_score >= 0.99:
            reason_parts.append("Identical name")
        else:
            reason_parts.append(f"Similar name (score={name_score:.2f})")
        if person.date_of_birth and candidate.date_of_birth == person.date_of_birth:
            reason_parts.append("same DOB")
        if person.sex and candidate.sex == person.sex:
            reason_parts.append("same sex")

        entry = PatientReconciliationQueue.objects.create(
            person_a=person,
            person_b=candidate,
            reason=", ".join(reason_parts),
            match_score=name_score,
            status="PENDING",
        )
        created_entries.append(entry)

    return created_entries


def resolve_reconciliation(
    queue_entry: PatientReconciliationQueue,
    resolution: str,
    resolved_by: str = "",
) -> None:
    """
    Resolve a reconciliation queue entry.

    resolution must be one of: RESOLVED_MERGE, RESOLVED_KEEP_BOTH, RESOLVED_REJECT.
    For RESOLVED_MERGE, person_b is merged into person_a (person_b's referrals
    and links are re-pointed to person_a, then person_b is deleted).
    """
    if resolution not in (
        "RESOLVED_MERGE", "RESOLVED_KEEP_BOTH", "RESOLVED_REJECT",
    ):
        raise ValueError(f"Invalid resolution: {resolution}")

    queue_entry.status = resolution
    queue_entry.resolved_by = resolved_by
    queue_entry.resolved_at = timezone.now()
    queue_entry.save(update_fields=["status", "resolved_by", "resolved_at", "updated_at"])

    if resolution == "RESOLVED_MERGE":
        # Re-point referrals from person_b to person_a
        from apps.referrals.models import Referral
        Referral.objects.filter(patient=queue_entry.person_b).update(
            patient=queue_entry.person_a,
        )
        # Re-point caregiver links
        from apps.clients.models import CaregiverLink
        CaregiverLink.objects.filter(child=queue_entry.person_b).update(
            child=queue_entry.person_a,
        )
        CaregiverLink.objects.filter(caregiver=queue_entry.person_b).update(
            caregiver=queue_entry.person_a,
        )
        # Delete the duplicate person
        queue_entry.person_b.delete()
