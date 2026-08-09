"""
Audit service — structured audit event creation (spec §23).

Provides helper functions to create audit events for clinical actions
including rule evaluation, referral creation, and clinician overrides.
"""
from apps.audit.models import AuditEvent


def log_audit(
    actor: str,
    action: str,
    actor_role: str = "",
    entity_type: str = "",
    entity_id: str = "",
    patient_id=None,
    pregnancy_episode_id=None,
    referral_episode_id=None,
    facility_id=None,
    device_id: str = "",
    purpose: str = "DIRECT_CARE",
    metadata: dict = None,
) -> AuditEvent:
    """
    Create an append-only audit event.

    Args:
        actor: User ID or system identifier
        action: Action name (e.g. 'RULE_EVALUATION', 'REFERRAL_CREATED')
        actor_role: System role of the actor
        entity_type: Type of entity acted upon
        entity_id: ID of the entity acted upon
        patient_id: UUID of the patient if applicable
        pregnancy_episode_id: UUID of the pregnancy episode if applicable (spec §23)
        referral_episode_id: UUID of the referral episode if applicable (spec §23)
        facility_id: UUID of the facility if applicable
        device_id: Device identifier if applicable
        purpose: Purpose context (DIRECT_CARE, REFERRAL, SUPERVISION, AUDIT, ADMIN)
        metadata: Additional structured data

    Returns:
        The created AuditEvent instance.
    """
    return AuditEvent.objects.create(
        actor=actor,
        action=action,
        actor_role=actor_role,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else "",
        patient_id=patient_id or None,
        pregnancy_episode_id=pregnancy_episode_id or None,
        referral_episode_id=referral_episode_id or None,
        facility_id=facility_id or None,
        device_id=device_id,
        purpose=purpose,
        metadata=metadata or {},
    )


def log_rule_evaluation(
    actor: str,
    episode_type: str,
    episode_id,
    disposition: str,
    fired_rules: list,
    patient_id=None,
    actor_role: str = "",
    device_id: str = "",
):
    """Log a clinical rule evaluation event."""
    # Determine the episode id to record based on episode type.
    # Only populate the UUID fields if the episode_id is a valid UUID.
    pregnancy_episode_id = None
    referral_episode_id = None
    if episode_id:
        try:
            import uuid as _uuid
            _uuid.UUID(str(episode_id))
            if episode_type and "PREGNANCY" in episode_type.upper():
                pregnancy_episode_id = episode_id
            elif episode_type and "REFERRAL" in episode_type.upper():
                referral_episode_id = episode_id
        except (ValueError, TypeError):
            pass
    return log_audit(
        actor=actor,
        action="RULE_EVALUATION",
        actor_role=actor_role,
        entity_type=episode_type,
        entity_id=str(episode_id),
        patient_id=patient_id,
        pregnancy_episode_id=pregnancy_episode_id,
        referral_episode_id=referral_episode_id,
        device_id=device_id,
        purpose="DIRECT_CARE",
        metadata={
            "disposition": disposition,
            "fired_rules": fired_rules,
        },
    )


def log_referral_created(
    actor: str,
    referral_id,
    patient_id=None,
    urgency: str = "",
    referring_facility_id=None,
    actor_role: str = "",
    referral_episode_id=None,
):
    """Log a referral creation event."""
    # Only populate the referral_episode_id UUID field if the value is a valid UUID
    resolved_referral_episode_id = referral_episode_id
    if not resolved_referral_episode_id and referral_id:
        try:
            import uuid as _uuid
            _uuid.UUID(str(referral_id))
            resolved_referral_episode_id = referral_id
        except (ValueError, TypeError):
            pass
    return log_audit(
        actor=actor,
        action="REFERRAL_CREATED",
        actor_role=actor_role,
        entity_type="Referral",
        entity_id=str(referral_id),
        patient_id=patient_id,
        referral_episode_id=resolved_referral_episode_id,
        facility_id=referring_facility_id,
        purpose="REFERRAL",
        metadata={"urgency": urgency},
    )


def log_referral_state_change(
    actor: str,
    referral_id,
    from_status: str,
    to_status: str,
    actor_role: str = "",
    notes: str = "",
):
    """Log a referral state transition."""
    return log_audit(
        actor=actor,
        action="REFERRAL_STATE_CHANGE",
        actor_role=actor_role,
        entity_type="Referral",
        entity_id=str(referral_id),
        purpose="REFERRAL",
        metadata={
            "from_status": from_status,
            "to_status": to_status,
            "notes": notes,
        },
    )


def log_clinician_override(
    actor: str,
    episode_type: str,
    episode_id,
    prior_recommendation: str,
    resulting_action: str,
    reason: str,
    patient_id=None,
    actor_role: str = "",
):
    """Log a clinician override of a rule-based recommendation (spec §3.1)."""
    return log_audit(
        actor=actor,
        action="CLINICIAN_OVERRIDE",
        actor_role=actor_role,
        entity_type=episode_type,
        entity_id=str(episode_id),
        patient_id=patient_id,
        purpose="DIRECT_CARE",
        metadata={
            "prior_recommendation": prior_recommendation,
            "resulting_action": resulting_action,
            "reason": reason,
        },
    )


def log_patient_view(
    actor: str,
    patient_id,
    actor_role: str = "",
    facility_id=None,
    purpose: str = "DIRECT_CARE",
):
    """Log an identifiable patient record view (spec §21.3)."""
    return log_audit(
        actor=actor,
        action="PATIENT_VIEW",
        actor_role=actor_role,
        entity_type="Person",
        entity_id=str(patient_id),
        patient_id=patient_id,
        facility_id=facility_id,
        purpose=purpose,
    )


def log_ocr_extraction(
    actor: str,
    device_id: str,
    template_id: str,
    extracted_fields: dict,
    confidence_scores: dict,
    human_corrected: bool = False,
    actor_role: str = "",
    patient_id=None,
):
    """Log an OCR extraction event and any human correction (spec §23)."""
    return log_audit(
        actor=actor,
        action="OCR_EXTRACTION",
        actor_role=actor_role,
        entity_type="OCRDocument",
        entity_id=device_id,
        patient_id=patient_id,
        device_id=device_id,
        purpose="DIRECT_CARE",
        metadata={
            "template_id": template_id,
            "extracted_fields": extracted_fields,
            "confidence_scores": confidence_scores,
            "human_corrected": human_corrected,
        },
    )


def log_ml_inference(
    actor: str,
    model_version: str,
    model_mode: str,
    episode_type: str,
    episode_id,
    prediction: dict,
    display_state: str,
    actor_role: str = "",
    patient_id=None,
):
    """Log an ML inference execution and display state (spec §23)."""
    return log_audit(
        actor=actor,
        action="ML_INFERENCE",
        actor_role=actor_role,
        entity_type=episode_type,
        entity_id=str(episode_id),
        patient_id=patient_id,
        purpose="DIRECT_CARE",
        metadata={
            "model_version": model_version,
            "model_mode": model_mode,
            "prediction": prediction,
            "display_state": display_state,
        },
    )


def log_identifiable_export(
    actor: str,
    export_type: str,
    record_count: int,
    actor_role: str = "",
    facility_id=None,
    purpose: str = "AUDIT",
    metadata: dict = None,
):
    """Log an identifiable data export event (spec §23)."""
    return log_audit(
        actor=actor,
        action="IDENTIFIABLE_EXPORT",
        actor_role=actor_role,
        entity_type="Export",
        entity_id=export_type,
        facility_id=facility_id,
        purpose=purpose,
        metadata={
            "export_type": export_type,
            "record_count": record_count,
            **(metadata or {}),
        },
    )


def log_permission_change(
    actor: str,
    target_user: str,
    action_type: str,
    old_role: str,
    new_role: str,
    actor_role: str = "",
    facility_id=None,
):
    """Log a permission/role change event (spec §23)."""
    return log_audit(
        actor=actor,
        action="PERMISSION_CHANGE",
        actor_role=actor_role,
        entity_type="UserAccount",
        entity_id=target_user,
        facility_id=facility_id,
        purpose="ADMIN",
        metadata={
            "action_type": action_type,
            "old_role": old_role,
            "new_role": new_role,
        },
    )
