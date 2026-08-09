"""
FHIR R4 resource serializers (spec §8.3, §20.1).

Converts Django models to FHIR R4-compliant JSON resources.
Each function returns a dict representing a single FHIR resource.
"""
from datetime import datetime
from decimal import Decimal


def _fhir_meta(obj):
    """Build a FHIR meta element from a TimeStampedModel."""
    return {
        "versionId": str(obj.updated_at.timestamp()) if hasattr(obj, "updated_at") and obj.updated_at else "1",
        "lastUpdated": obj.updated_at.isoformat() if hasattr(obj, "updated_at") and obj.updated_at else None,
    }


def _decimal_to_str(val):
    """Convert Decimal or None to string for FHIR valueDecimal."""
    if val is None:
        return None
    if isinstance(val, Decimal):
        return str(val)
    return str(val)


def _fhir_codeable_concept(code, system="http://snomed.info/sct", display=None):
    """Build a CodeableConcept."""
    coding = [{"system": system, "code": code}]
    if display:
        coding[0]["display"] = display
    return {"coding": coding, "text": display or code}


def _fhir_reference(resource_type, reference_id, display=None):
    """Build a Reference."""
    ref = {"reference": f"{resource_type}/{reference_id}"}
    if display:
        ref["display"] = display
    return ref


def _fhir_quantity(value, unit, system="http://unitsofmeasure.org", code=None):
    """Build a Quantity."""
    q = {"value": float(value), "unit": unit, "system": system}
    if code:
        q["code"] = code
    return q


# --- Patient ---

def person_to_patient(person):
    """Convert Person model to FHIR Patient resource (spec §8.3)."""
    return {
        "resourceType": "Patient",
        "id": str(person.id),
        "name": [{"family": person.full_name, "use": "official"}],
        "gender": person.sex.lower() if person.sex and person.sex != "UNKNOWN" else "unknown",
        "birthDate": person.date_of_birth.isoformat() if person.date_of_birth else None,
        "telecom": [
            {"system": "phone", "value": person.phone} if person.phone else None,
            {"system": "phone", "value": person.alternate_phone} if person.alternate_phone else None,
        ],
        "address": [{
            "text": person.address,
            "city": person.community,
        }] if person.address or person.community else [],
        "communication": [{
            "language": {
                "coding": [{"code": person.preferred_language.lower(), "system": "urn:ietf:bcp:47"}]
            }
        }] if person.preferred_language else [],
        "meta": _fhir_meta(person),
    }


# --- Observation ---

def pregnancy_observation_to_fhir(obs):
    """Convert PregnancyObservation to FHIR Observation resource (spec §8.3)."""
    components = []
    if obs.bp_systolic is not None:
        components.append({
            "code": _fhir_codeable_concept("8867-4", display="Diastolic blood pressure"),
            "valueQuantity": _fhir_quantity(obs.bp_systolic, "mmHg", code="mm[Hg]"),
        })
    if obs.bp_diastolic is not None:
        components.append({
            "code": _fhir_codeable_concept("8480-6", display="Systolic blood pressure"),
            "valueQuantity": _fhir_quantity(obs.bp_diastolic, "mmHg", code="mm[Hg]"),
        })
    if obs.temperature_c is not None:
        components.append({
            "code": _fhir_codeable_concept("8310-5", display="Body temperature"),
            "valueQuantity": _fhir_quantity(obs.temperature_c, "Cel", code="Cel"),
        })
    if obs.weight_kg is not None:
        components.append({
            "code": _fhir_codeable_concept("29463-7", display="Body weight"),
            "valueQuantity": _fhir_quantity(obs.weight_kg, "kg", code="kg"),
        })
    if obs.fundal_height_cm is not None:
        components.append({
            "code": _fhir_codeable_concept("11881-0", display="Fundal height"),
            "valueQuantity": _fhir_quantity(obs.fundal_height_cm, "cm", code="cm"),
        })
    if obs.fhr_bpm is not None:
        components.append({
            "code": _fhir_codeable_concept("55284-4", display="Fetal heart rate"),
            "valueQuantity": _fhir_quantity(obs.fhr_bpm, "/min", code="/min"),
        })

    return {
        "resourceType": "Observation",
        "id": str(obs.id),
        "status": "final",
        "category": [_fhir_codeable_concept("vital-signs", "http://terminology.hl7.org/CodeSystem/observation-category", "Vital Signs")],
        "code": _fhir_codeable_concept("vital-signs", "http://terminology.hl7.org/CodeSystem/observation-category", "Pregnancy vital signs"),
        "subject": _fhir_reference("Patient", obs.episode.woman_id),
        "encounter": _fhir_reference("Encounter", obs.episode_id),
        "effectiveDateTime": obs.recorded_at.isoformat() if obs.recorded_at else None,
        "component": components if components else None,
        "meta": _fhir_meta(obs),
    }


def newborn_observation_to_fhir(obs):
    """Convert NewbornObservation to FHIR Observation resource (spec §8.3)."""
    components = []
    if obs.temperature_c is not None:
        components.append({
            "code": _fhir_codeable_concept("8310-5", display="Body temperature"),
            "valueQuantity": _fhir_quantity(obs.temperature_c, "Cel", code="Cel"),
        })
    if obs.respiratory_rate_min is not None:
        components.append({
            "code": _fhir_codeable_concept("9279-1", display="Respiratory rate"),
            "valueQuantity": _fhir_quantity(obs.respiratory_rate_min, "/min", code="/min"),
        })
    if obs.current_weight_g is not None:
        components.append({
            "code": _fhir_codeable_concept("29463-7", display="Body weight"),
            "valueQuantity": _fhir_quantity(obs.current_weight_g, "g", code="g"),
        })
    if obs.bilirubin_value is not None:
        components.append({
            "code": _fhir_codeable_concept("42719-7", display="Bilirubin"),
            "valueQuantity": _fhir_quantity(obs.bilirubin_value, "mg/dL", code="mg/dL"),
        })

    return {
        "resourceType": "Observation",
        "id": str(obs.id),
        "status": "final",
        "category": [_fhir_codeable_concept("vital-signs", "http://terminology.hl7.org/CodeSystem/observation-category", "Vital Signs")],
        "code": _fhir_codeable_concept("vital-signs", "http://terminology.hl7.org/CodeSystem/observation-category", "Newborn vital signs"),
        "subject": _fhir_reference("Patient", obs.newborn.child_id),
        "encounter": _fhir_reference("Encounter", obs.newborn_id),
        "effectiveDateTime": obs.recorded_at.isoformat() if obs.recorded_at else None,
        "component": components if components else None,
        "meta": _fhir_meta(obs),
    }


def growth_measurement_to_fhir(measurement):
    """Convert GrowthMeasurement to FHIR Observation resource (spec §8.3)."""
    components = []
    if measurement.weight_kg is not None:
        components.append({
            "code": _fhir_codeable_concept("29463-7", display="Body weight"),
            "valueQuantity": _fhir_quantity(measurement.weight_kg, "kg", code="kg"),
        })
    if measurement.height_cm is not None:
        components.append({
            "code": _fhir_codeable_concept("8302-2", display="Body height"),
            "valueQuantity": _fhir_quantity(measurement.height_cm, "cm", code="cm"),
        })
    if measurement.length_cm is not None:
        components.append({
            "code": _fhir_codeable_concept("8306-5", display="Body height --lying"),
            "valueQuantity": _fhir_quantity(measurement.length_cm, "cm", code="cm"),
        })
    if measurement.muac_mm is not None:
        components.append({
            "code": _fhir_codeable_concept("56072-9", display="Mid-upper arm circumference"),
            "valueQuantity": _fhir_quantity(measurement.muac_mm, "mm", code="mm"),
        })

    return {
        "resourceType": "Observation",
        "id": str(measurement.id),
        "status": "final",
        "category": [_fhir_codeable_concept("vital-signs", "http://terminology.hl7.org/CodeSystem/observation-category", "Vital Signs")],
        "code": _fhir_codeable_concept("growth-monitoring", "http://terminology.hl7.org/CodeSystem/observation-category", "Growth measurement"),
        "subject": _fhir_reference("Patient", measurement.child_id),
        "effectiveDateTime": measurement.measurement_date.isoformat() if measurement.measurement_date else None,
        "component": components if components else None,
        "meta": _fhir_meta(measurement),
    }


# --- EpisodeOfCare ---

def pregnancy_episode_to_fhir(episode):
    """Convert PregnancyEpisode to FHIR EpisodeOfCare (spec §8.3)."""
    status_map = {
        "ACTIVE": "active",
        "CLOSED": "finished",
        "TRANSFERRED": "finished",
    }
    return {
        "resourceType": "EpisodeOfCare",
        "id": str(episode.id),
        "status": status_map.get(episode.status, "active"),
        "type": [_fhir_codeable_concept("pregnancy-episode", "http://terminology.hl7.org/CodeSystem/v3-ActCode", "Pregnancy episode")],
        "patient": _fhir_reference("Patient", episode.woman_id, display=episode.woman.full_name),
        "careManager": {"display": episode.assigned_worker} if episode.assigned_worker else None,
        "period": {
            "start": episode.created_at.isoformat() if episode.created_at else None,
            "end": episode.closed_at.isoformat() if episode.closed_at else None,
        },
        "meta": _fhir_meta(episode),
    }


def newborn_episode_to_fhir(episode):
    """Convert NewbornEpisode to FHIR EpisodeOfCare (spec §8.3)."""
    status_map = {
        "ACTIVE": "active",
        "CLOSED": "finished",
        "TRANSFERRED": "finished",
    }
    return {
        "resourceType": "EpisodeOfCare",
        "id": str(episode.id),
        "status": status_map.get(episode.status, "active"),
        "type": [_fhir_codeable_concept("newborn-episode", "http://terminology.hl7.org/CodeSystem/v3-ActCode", "Newborn care episode")],
        "patient": _fhir_reference("Patient", episode.child_id, display=episode.child.full_name),
        "careManager": {"display": episode.assigned_worker} if episode.assigned_worker else None,
        "period": {
            "start": episode.created_at.isoformat() if episode.created_at else None,
            "end": episode.closed_at.isoformat() if episode.closed_at else None,
        },
        "meta": _fhir_meta(episode),
    }


# --- Encounter (maps to observations/assessments) ---

def pregnancy_assessment_to_encounter(assessment):
    """Convert PregnancyAssessment to FHIR Encounter (spec §8.3)."""
    return {
        "resourceType": "Encounter",
        "id": str(assessment.id),
        "status": "finished",
        "class": {"code": "AMB", "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode", "display": "ambulatory"},
        "type": [_fhir_codeable_concept("clinical-assessment", display="Clinical assessment")],
        "subject": _fhir_reference("Patient", assessment.episode.woman_id),
        "episodeOfCare": [_fhir_reference("EpisodeOfCare", assessment.episode_id)],
        "period": {
            "start": assessment.assessed_at.isoformat() if assessment.assessed_at else None,
            "end": assessment.assessed_at.isoformat() if assessment.assessed_at else None,
        },
        "meta": _fhir_meta(assessment),
    }


def newborn_assessment_to_encounter(assessment):
    """Convert NewbornAssessment to FHIR Encounter (spec §8.3)."""
    return {
        "resourceType": "Encounter",
        "id": str(assessment.id),
        "status": "finished",
        "class": {"code": "AMB", "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode", "display": "ambulatory"},
        "type": [_fhir_codeable_concept("clinical-assessment", display="Clinical assessment")],
        "subject": _fhir_reference("Patient", assessment.episode.child_id),
        "episodeOfCare": [_fhir_reference("EpisodeOfCare", assessment.episode_id)],
        "period": {
            "start": assessment.assessed_at.isoformat() if assessment.assessed_at else None,
            "end": assessment.assessed_at.isoformat() if assessment.assessed_at else None,
        },
        "meta": _fhir_meta(assessment),
    }


# --- ServiceRequest (maps to Referral) ---

def referral_to_service_request(referral):
    """Convert Referral to FHIR ServiceRequest (spec §8.3, §18)."""
    status_map = {
        "DRAFT": "draft",
        "REQUESTED": "active",
        "RECEIVING_FACILITY_NOTIFIED": "active",
        "ACCEPTED": "active",
        "TRANSPORT_REQUESTED": "active",
        "IN_TRANSIT": "active",
        "ARRIVED": "active",
        "DISPOSITION_RECORDED": "completed",
        "CLOSED": "completed",
        "DECLINED": "revoked",
        "NO_ACK_ESCALATED": "entered-in-error",
        "TRANSPORT_UNAVAILABLE": "entered-in-error",
    }
    priority_map = {
        "EMERGENCY": "stat",
        "PRIORITY": "urgent",
        "ROUTINE": "routine",
        "ABSTAIN": "routine",
    }
    return {
        "resourceType": "ServiceRequest",
        "id": str(referral.id),
        "status": status_map.get(referral.status, "active"),
        "intent": "order",
        "priority": priority_map.get(referral.urgency, "routine"),
        "subject": _fhir_reference("Patient", referral.patient_id, display=referral.patient.full_name),
        "code": _fhir_codeable_concept("referral", "http://terminology.hl7.org/CodeSystem/v3-ActCode", "Referral"),
        "reasonCode": [_fhir_codeable_concept("referral-reason", display=referral.referral_reason)] if referral.referral_reason else None,
        "requester": {"display": referral.created_by} if referral.created_by else None,
        "performer": [_fhir_reference("Organization", referral.destination_facility_id)] if referral.destination_facility_id else None,
        "meta": _fhir_meta(referral),
    }


# --- Immunization ---

def vaccine_dose_to_immunization(dose):
    """Convert VaccineDose to FHIR Immunization resource (spec §8.3)."""
    child = dose.child_record.child
    return {
        "resourceType": "Immunization",
        "id": str(dose.id),
        "status": "completed",
        "vaccineCode": _fhir_codeable_concept(dose.vaccine_code, display=dose.vaccine_name),
        "patient": _fhir_reference("Patient", child.id, display=child.full_name),
        "occurrenceDateTime": dose.administration_date.isoformat() if dose.administration_date else None,
        "lotNumber": dose.batch_lot or None,
        "performer": [{"actor": {"display": dose.administered_by}}] if dose.administered_by else None,
        "doseQuantity": {"value": dose.dose_number, "unit": "dose"} if dose.dose_number else None,
        "meta": _fhir_meta(dose),
    }


# --- Provenance (maps to AuditEvent) ---

def audit_event_to_provenance(event):
    """Convert AuditEvent to FHIR Provenance resource (spec §8.3, §23)."""
    target = []
    if event.entity_type and event.entity_id:
        target.append({"reference": f"{event.entity_type}/{event.entity_id}"})

    return {
        "resourceType": "Provenance",
        "id": str(event.id),
        "target": target,
        "recorded": event.occurred_at.isoformat() if event.occurred_at else None,
        "agent": [{
            "type": {
                "coding": [{"system": "http://terminology.hl7.org/CodeSystem/provenance-participant-type", "code": "author"}]
            },
            "who": {"display": event.actor},
            "role": [{"text": event.actor_role}] if event.actor_role else None,
        }],
        "activity": _fhir_codeable_concept(event.action, display=event.action) if event.action else None,
        "meta": _fhir_meta(event),
    }


# --- Library (maps to Package of type RULE_BUNDLE) ---

def package_to_library(pkg):
    """Convert a RULE_BUNDLE Package to FHIR Library resource (spec §8.3, §24)."""
    return {
        "resourceType": "Library",
        "id": str(pkg.id),
        "name": pkg.package_id,
        "version": pkg.version,
        "status": "active" if pkg.status == "ACTIVE" else "draft",
        "type": _fhir_codeable_concept("logic-library", "http://terminology.hl7.org/CodeSystem/library-type", "Logic Library"),
        "title": f"{pkg.package_type} {pkg.version}",
        "url": f"urn:mchvc:library:{pkg.package_id}:{pkg.version}",
        "meta": _fhir_meta(pkg),
    }


# --- PlanDefinition (maps to Package of type RULE_BUNDLE) ---

def package_to_plan_definition(pkg):
    """Convert a RULE_BUNDLE Package to FHIR PlanDefinition (spec §8.3, §24)."""
    return {
        "resourceType": "PlanDefinition",
        "id": str(pkg.id),
        "name": pkg.package_id,
        "version": pkg.version,
        "status": "active" if pkg.status == "ACTIVE" else "draft",
        "title": f"{pkg.package_type} {pkg.version}",
        "url": f"urn:mchvc:plandefinition:{pkg.package_id}:{pkg.version}",
        "library": [f"urn:mchvc:library:{pkg.package_id}:{pkg.version}"],
        "meta": _fhir_meta(pkg),
    }


# --- Task (maps to Referral workflow state, spec §8.3, §18) ---

def referral_to_task(referral):
    """Convert a Referral to FHIR Task resource (spec §8.3, §18).

    The Task resource tracks the workflow state of a referral, complementing
    the ServiceRequest which represents the referral order itself.
    """
    status_map = {
        "DRAFT": "draft",
        "REQUESTED": "requested",
        "RECEIVING_FACILITY_NOTIFIED": "in-progress",
        "ACCEPTED": "in-progress",
        "TRANSPORT_REQUESTED": "in-progress",
        "IN_TRANSIT": "in-progress",
        "ARRIVED": "in-progress",
        "DISPOSITION_RECORDED": "completed",
        "CLOSED": "completed",
        "DECLINED": "rejected",
        "NO_ACK_ESCALATED": "failed",
        "TRANSPORT_UNAVAILABLE": "failed",
    }
    intent_map = {
        "DRAFT": "draft",
    }
    priority_map = {
        "EMERGENCY": "stat",
        "PRIORITY": "urgent",
        "ROUTINE": "routine",
        "ABSTAIN": "routine",
    }
    return {
        "resourceType": "Task",
        "id": str(referral.id),
        "status": status_map.get(referral.status, "requested"),
        "intent": intent_map.get(referral.status, "order"),
        "priority": priority_map.get(referral.urgency, "routine"),
        "subject": _fhir_reference("Patient", referral.patient_id, display=referral.patient.full_name),
        "basedOn": [_fhir_reference("ServiceRequest", referral.id)],
        "code": _fhir_codeable_concept("referral-task", "http://terminology.hl7.org/CodeSystem/v3-ActCode", "Referral workflow task"),
        "description": referral.referral_reason or None,
        "requester": {"display": referral.created_by} if referral.created_by else None,
        "owner": _fhir_reference("Organization", referral.destination_facility_id) if referral.destination_facility_id else None,
        "meta": _fhir_meta(referral),
    }


# --- AuditEvent (maps to AuditEvent model, spec §8.3, §23) ---

def audit_event_to_fhir(event):
    """Convert an AuditEvent to FHIR AuditEvent resource (spec §8.3, §23)."""
    # Map internal action to FHIR audit event type codes
    action_code_map = {
        "CREATE": "C",
        "READ": "R",
        "UPDATE": "U",
        "DELETE": "D",
        "EXECUTE": "E",
    }
    # Derive a single-letter FHIR action code from the action name
    action_upper = (event.action or "").upper()
    if action_upper.startswith("CREATE") or "CREATED" in action_upper:
        fhir_action = "C"
    elif action_upper.startswith("READ") or "VIEW" in action_upper or "SEARCH" in action_upper:
        fhir_action = "R"
    elif action_upper.startswith("UPDATE") or "CHANGE" in action_upper or "OVERRIDE" in action_upper or "CORRECT" in action_upper:
        fhir_action = "U"
    elif action_upper.startswith("DELETE") or "REJECT" in action_upper:
        fhir_action = "D"
    else:
        fhir_action = "E"

    # Build the entity list
    entities = []
    if event.entity_type and event.entity_id:
        entities.append({
            "what": {"reference": f"{event.entity_type}/{event.entity_id}"},
            "type": {
                "code": event.entity_type,
                "system": "urn:mchvc:entity-types",
            },
        })
    if event.patient_id:
        entities.append({
            "what": {"reference": f"Patient/{event.patient_id}"},
            "type": {
                "code": "1",
                "system": "http://hl7.org/fhir/resource-types",
                "display": "Patient",
            },
        })

    agent = {
        "who": {"display": event.actor},
        "requestor": True,
    }
    if event.actor_role:
        agent["role"] = [{"text": event.actor_role}]
    if event.device_id:
        agent["location"] = {"display": event.device_id}

    return {
        "resourceType": "AuditEvent",
        "id": str(event.id),
        "type": {
            "code": fhir_action,
            "system": "http://hl7.org/fhir/audit-event-type",
            "display": event.action,
        },
        "action": fhir_action,
        "recorded": event.occurred_at.isoformat() if event.occurred_at else None,
        "agent": [agent],
        "source": {
            "observer": {"display": "MCH VoiceCare"},
        },
        "entity": entities if entities else None,
        "meta": _fhir_meta(event),
    }
