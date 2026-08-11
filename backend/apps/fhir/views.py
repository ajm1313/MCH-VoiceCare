"""
FHIR R4 API endpoints (spec §8.3, §20.1).

Provides FHIR-compliant CRUD for core clinical resources:
- Patient (Person)
- Observation (PregnancyObservation, NewbornObservation, GrowthMeasurement)
- EpisodeOfCare (PregnancyEpisode, NewbornEpisode)
- Encounter (PregnancyAssessment, NewbornAssessment)
- ServiceRequest (Referral)
- Immunization (VaccineDose)
- Provenance (AuditEvent)
- Library (Package — RULE_BUNDLE)
- PlanDefinition (Package — RULE_BUNDLE)

Uses org-scoped access control and audit logging (spec §23).
"""
import uuid

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.clients.models import Person
from apps.core.permissions import filter_queryset_by_org
from apps.audit.services import log_audit
from apps.audit.models import AuditEvent

from .serializers import (
    person_to_patient,
    pregnancy_observation_to_fhir,
    newborn_observation_to_fhir,
    growth_measurement_to_fhir,
    pregnancy_episode_to_fhir,
    newborn_episode_to_fhir,
    pregnancy_assessment_to_encounter,
    newborn_assessment_to_encounter,
    referral_to_service_request,
    referral_to_task,
    vaccine_dose_to_immunization,
    audit_event_to_provenance,
    audit_event_to_fhir,
    package_to_library,
    package_to_plan_definition,
    organisation_to_fhir,
    organisation_to_location,
    assessment_to_questionnaire_response,
)


def _operation_outcome(severity, code, text, http_status=None):
    """Build a FHIR OperationOutcome response."""
    resp = {
        "resourceType": "OperationOutcome",
        "issue": [{"severity": severity, "code": code, "details": {"text": text}}],
    }
    return Response(resp, status=http_status or status.HTTP_400_BAD_REQUEST)


def _bundle(entries, bundle_type="searchset"):
    """Build a FHIR Bundle from a list of resource dicts."""
    return Response({
        "resourceType": "Bundle",
        "type": bundle_type,
        "total": len(entries),
        "entry": [{"resource": e} for e in entries],
    })


def _parse_uuid(pk):
    """Parse a UUID string, returning None if invalid."""
    try:
        return uuid.UUID(str(pk))
    except (ValueError, TypeError):
        return None


def _get_count(request, default=50, maximum=200):
    """Parse _count query param."""
    count = request.query_params.get("_count", str(default))
    try:
        return min(int(count), maximum)
    except ValueError:
        return default


# --- Patient ---

class FHIRPatientListView(APIView):
    """GET /fhir/R4/Patient — search/list patients."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = filter_queryset_by_org(Person.objects.all(), request.user)
        name = request.query_params.get("name")
        if name:
            qs = qs.filter(full_name__icontains=name)
        _id = request.query_params.get("_id")
        if _id:
            qs = qs.filter(id=_id)
        count = _get_count(request)

        patients = list(qs[:count])
        entries = [person_to_patient(p) for p in patients]

        log_audit(
            actor=request.user.username,
            action="FHIR_PATIENT_SEARCH",
            actor_role=request.user.system_role,
            purpose="DIRECT_CARE",
            metadata={"query": name or "", "result_count": len(entries)},
        )

        return _bundle(entries)


class FHIRPatientDetailView(APIView):
    """GET /fhir/R4/Patient/{id} — retrieve a single patient."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        uid = _parse_uuid(pk)
        if not uid:
            return _operation_outcome("error", "invalid", "Invalid UUID", status.HTTP_400_BAD_REQUEST)

        qs = filter_queryset_by_org(Person.objects.all(), request.user)
        person = qs.filter(id=uid).first()
        if not person:
            return _operation_outcome("error", "not-found", "Patient not found", status.HTTP_404_NOT_FOUND)

        log_audit(
            actor=request.user.username,
            action="FHIR_PATIENT_READ",
            actor_role=request.user.system_role,
            entity_type="Person",
            entity_id=str(person.id),
            patient_id=person.id,
            purpose="DIRECT_CARE",
        )

        return Response(person_to_patient(person))


# --- Observation ---

class FHIRObservationListView(APIView):
    """GET /fhir/R4/Observation — search observations (spec §8.3)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.pregnancy.models import PregnancyObservation
        from apps.newborn.models import NewbornObservation
        from apps.growth.models import GrowthMeasurement

        count = _get_count(request)
        patient_id = request.query_params.get("patient")
        category = request.query_params.get("category", "").lower()
        entries = []

        # Pregnancy observations
        if not category or category in ("vital-signs", "pregnancy"):
            qs = PregnancyObservation.objects.select_related("episode", "episode__woman")
            if patient_id:
                uid = _parse_uuid(patient_id)
                if uid:
                    qs = qs.filter(episode__woman_id=uid)
            for obs in qs[:count]:
                entries.append(pregnancy_observation_to_fhir(obs))

        # Newborn observations
        if not category or category in ("vital-signs", "newborn"):
            qs = NewbornObservation.objects.select_related("newborn", "newborn__child")
            if patient_id:
                uid = _parse_uuid(patient_id)
                if uid:
                    qs = qs.filter(newborn__child_id=uid)
            for obs in qs[:count]:
                entries.append(newborn_observation_to_fhir(obs))

        # Growth measurements
        if not category or category in ("vital-signs", "growth"):
            qs = GrowthMeasurement.objects.select_related("child")
            if patient_id:
                uid = _parse_uuid(patient_id)
                if uid:
                    qs = qs.filter(child_id=uid)
            for m in qs[:count]:
                entries.append(growth_measurement_to_fhir(m))

        log_audit(
            actor=request.user.username,
            action="FHIR_OBSERVATION_SEARCH",
            actor_role=request.user.system_role,
            purpose="DIRECT_CARE",
            metadata={"patient": patient_id or "", "category": category, "result_count": len(entries)},
        )

        return _bundle(entries)


class FHIRObservationDetailView(APIView):
    """GET /fhir/R4/Observation/{id} — retrieve a single observation."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from apps.pregnancy.models import PregnancyObservation
        from apps.newborn.models import NewbornObservation
        from apps.growth.models import GrowthMeasurement

        uid = _parse_uuid(pk)
        if not uid:
            return _operation_outcome("error", "invalid", "Invalid UUID", status.HTTP_400_BAD_REQUEST)

        # Try each observation type
        obs = PregnancyObservation.objects.filter(id=uid).select_related("episode", "episode__woman").first()
        if obs:
            return Response(pregnancy_observation_to_fhir(obs))

        obs = NewbornObservation.objects.filter(id=uid).select_related("newborn", "newborn__child").first()
        if obs:
            return Response(newborn_observation_to_fhir(obs))

        obs = GrowthMeasurement.objects.filter(id=uid).select_related("child").first()
        if obs:
            return Response(growth_measurement_to_fhir(obs))

        return _operation_outcome("error", "not-found", "Observation not found", status.HTTP_404_NOT_FOUND)


# --- EpisodeOfCare ---

class FHIREpisodeOfCareListView(APIView):
    """GET /fhir/R4/EpisodeOfCare — search episodes (spec §8.3)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.pregnancy.models import PregnancyEpisode
        from apps.newborn.models import NewbornEpisode

        count = _get_count(request)
        patient_id = request.query_params.get("patient")
        entries = []

        # Pregnancy episodes
        qs = PregnancyEpisode.objects.select_related("woman")
        if patient_id:
            uid = _parse_uuid(patient_id)
            if uid:
                qs = qs.filter(woman_id=uid)
        for ep in qs[:count]:
            entries.append(pregnancy_episode_to_fhir(ep))

        # Newborn episodes
        qs = NewbornEpisode.objects.select_related("child")
        if patient_id:
            uid = _parse_uuid(patient_id)
            if uid:
                qs = qs.filter(child_id=uid)
        for ep in qs[:count]:
            entries.append(newborn_episode_to_fhir(ep))

        log_audit(
            actor=request.user.username,
            action="FHIR_EPISODE_SEARCH",
            actor_role=request.user.system_role,
            purpose="DIRECT_CARE",
            metadata={"patient": patient_id or "", "result_count": len(entries)},
        )

        return _bundle(entries)


class FHIREpisodeOfCareDetailView(APIView):
    """GET /fhir/R4/EpisodeOfCare/{id} — retrieve a single episode."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from apps.pregnancy.models import PregnancyEpisode
        from apps.newborn.models import NewbornEpisode

        uid = _parse_uuid(pk)
        if not uid:
            return _operation_outcome("error", "invalid", "Invalid UUID", status.HTTP_400_BAD_REQUEST)

        ep = PregnancyEpisode.objects.filter(id=uid).select_related("woman").first()
        if ep:
            return Response(pregnancy_episode_to_fhir(ep))

        ep = NewbornEpisode.objects.filter(id=uid).select_related("child").first()
        if ep:
            return Response(newborn_episode_to_fhir(ep))

        return _operation_outcome("error", "not-found", "EpisodeOfCare not found", status.HTTP_404_NOT_FOUND)


# --- Encounter (assessments) ---

class FHIREncounterListView(APIView):
    """GET /fhir/R4/Encounter — search encounters/assessments (spec §8.3)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.pregnancy.models import PregnancyAssessment
        from apps.newborn.models import NewbornAssessment

        count = _get_count(request)
        patient_id = request.query_params.get("patient")
        entries = []

        qs = PregnancyAssessment.objects.select_related("episode", "episode__woman")
        if patient_id:
            uid = _parse_uuid(patient_id)
            if uid:
                qs = qs.filter(episode__woman_id=uid)
        for a in qs[:count]:
            entries.append(pregnancy_assessment_to_encounter(a))

        qs = NewbornAssessment.objects.select_related("episode", "episode__child")
        if patient_id:
            uid = _parse_uuid(patient_id)
            if uid:
                qs = qs.filter(episode__child_id=uid)
        for a in qs[:count]:
            entries.append(newborn_assessment_to_encounter(a))

        log_audit(
            actor=request.user.username,
            action="FHIR_ENCOUNTER_SEARCH",
            actor_role=request.user.system_role,
            purpose="DIRECT_CARE",
            metadata={"patient": patient_id or "", "result_count": len(entries)},
        )

        return _bundle(entries)


class FHIREncounterDetailView(APIView):
    """GET /fhir/R4/Encounter/{id} — retrieve a single encounter."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from apps.pregnancy.models import PregnancyAssessment
        from apps.newborn.models import NewbornAssessment

        uid = _parse_uuid(pk)
        if not uid:
            return _operation_outcome("error", "invalid", "Invalid UUID", status.HTTP_400_BAD_REQUEST)

        a = PregnancyAssessment.objects.filter(id=uid).select_related("episode", "episode__woman").first()
        if a:
            return Response(pregnancy_assessment_to_encounter(a))

        a = NewbornAssessment.objects.filter(id=uid).select_related("episode", "episode__child").first()
        if a:
            return Response(newborn_assessment_to_encounter(a))

        return _operation_outcome("error", "not-found", "Encounter not found", status.HTTP_404_NOT_FOUND)


# --- ServiceRequest (Referrals) ---

class FHIRServiceRequestListView(APIView):
    """GET /fhir/R4/ServiceRequest — search referrals (spec §8.3, §18)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.referrals.models import Referral

        qs = Referral.objects.select_related("patient")
        patient_id = request.query_params.get("patient")
        if patient_id:
            uid = _parse_uuid(patient_id)
            if uid:
                qs = qs.filter(patient_id=uid)
        count = _get_count(request)

        referrals = list(qs[:count])
        entries = [referral_to_service_request(r) for r in referrals]

        log_audit(
            actor=request.user.username,
            action="FHIR_SERVICEREQUEST_SEARCH",
            actor_role=request.user.system_role,
            purpose="DIRECT_CARE",
            metadata={"patient": patient_id or "", "result_count": len(entries)},
        )

        return _bundle(entries)


class FHIRServiceRequestDetailView(APIView):
    """GET /fhir/R4/ServiceRequest/{id} — retrieve a single referral."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from apps.referrals.models import Referral

        uid = _parse_uuid(pk)
        if not uid:
            return _operation_outcome("error", "invalid", "Invalid UUID", status.HTTP_400_BAD_REQUEST)

        referral = Referral.objects.filter(id=uid).select_related("patient").first()
        if not referral:
            return _operation_outcome("error", "not-found", "ServiceRequest not found", status.HTTP_404_NOT_FOUND)

        return Response(referral_to_service_request(referral))


# --- Immunization ---

class FHIRImmunizationListView(APIView):
    """GET /fhir/R4/Immunization — search immunizations (spec §8.3)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.immunisation.models import VaccineDose

        qs = VaccineDose.objects.select_related("child_record", "child_record__child")
        patient_id = request.query_params.get("patient")
        if patient_id:
            uid = _parse_uuid(patient_id)
            if uid:
                qs = qs.filter(child_record__child_id=uid)
        count = _get_count(request)

        doses = list(qs[:count])
        entries = [vaccine_dose_to_immunization(d) for d in doses]

        log_audit(
            actor=request.user.username,
            action="FHIR_IMMUNIZATION_SEARCH",
            actor_role=request.user.system_role,
            purpose="DIRECT_CARE",
            metadata={"patient": patient_id or "", "result_count": len(entries)},
        )

        return _bundle(entries)


class FHIRImmunizationDetailView(APIView):
    """GET /fhir/R4/Immunization/{id} — retrieve a single immunization."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from apps.immunisation.models import VaccineDose

        uid = _parse_uuid(pk)
        if not uid:
            return _operation_outcome("error", "invalid", "Invalid UUID", status.HTTP_400_BAD_REQUEST)

        dose = VaccineDose.objects.filter(id=uid).select_related("child_record", "child_record__child").first()
        if not dose:
            return _operation_outcome("error", "not-found", "Immunization not found", status.HTTP_404_NOT_FOUND)

        return Response(vaccine_dose_to_immunization(dose))


# --- Provenance (AuditEvent) ---

class FHIRProvenanceListView(APIView):
    """GET /fhir/R4/Provenance — search provenance/audit events (spec §8.3, §23)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = AuditEvent.objects.all()
        entity_id = request.query_params.get("target")
        if entity_id:
            qs = qs.filter(entity_id=entity_id)
        count = _get_count(request, default=100)

        events = list(qs[:count])
        entries = [audit_event_to_provenance(e) for e in events]

        return _bundle(entries)


class FHIRProvenanceDetailView(APIView):
    """GET /fhir/R4/Provenance/{id} — retrieve a single provenance record."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        uid = _parse_uuid(pk)
        if not uid:
            return _operation_outcome("error", "invalid", "Invalid UUID", status.HTTP_400_BAD_REQUEST)

        event = AuditEvent.objects.filter(id=uid).first()
        if not event:
            return _operation_outcome("error", "not-found", "Provenance not found", status.HTTP_404_NOT_FOUND)

        return Response(audit_event_to_provenance(event))


# --- Task (Referral workflow state, spec §8.3, §18) ---

class FHIRTaskListView(APIView):
    """GET /fhir/R4/Task — search referral workflow tasks (spec §8.3, §18)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.referrals.models import Referral

        qs = Referral.objects.select_related("patient")
        patient_id = request.query_params.get("patient")
        if patient_id:
            uid = _parse_uuid(patient_id)
            if uid:
                qs = qs.filter(patient_id=uid)
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter.upper())
        count = _get_count(request)

        referrals = list(qs[:count])
        entries = [referral_to_task(r) for r in referrals]

        log_audit(
            actor=request.user.username,
            action="FHIR_TASK_SEARCH",
            actor_role=request.user.system_role,
            purpose="DIRECT_CARE",
            metadata={"patient": patient_id or "", "result_count": len(entries)},
        )

        return _bundle(entries)


class FHIRTaskDetailView(APIView):
    """GET /fhir/R4/Task/{id} — retrieve a single referral task."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from apps.referrals.models import Referral

        uid = _parse_uuid(pk)
        if not uid:
            return _operation_outcome("error", "invalid", "Invalid UUID", status.HTTP_400_BAD_REQUEST)

        referral = Referral.objects.filter(id=uid).select_related("patient").first()
        if not referral:
            return _operation_outcome("error", "not-found", "Task not found", status.HTTP_404_NOT_FOUND)

        return Response(referral_to_task(referral))


# --- AuditEvent (spec §8.3, §23) ---

class FHIRAuditEventListView(APIView):
    """GET /fhir/R4/AuditEvent — search audit events (spec §8.3, §23)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = AuditEvent.objects.all()
        entity_id = request.query_params.get("entity")
        if entity_id:
            qs = qs.filter(entity_id=entity_id)
        action = request.query_params.get("action")
        if action:
            qs = qs.filter(action=action)
        patient_id = request.query_params.get("patient")
        if patient_id:
            uid = _parse_uuid(patient_id)
            if uid:
                qs = qs.filter(patient_id=uid)
        count = _get_count(request, default=100)

        events = list(qs[:count])
        entries = [audit_event_to_fhir(e) for e in events]

        return _bundle(entries)


class FHIRAuditEventDetailView(APIView):
    """GET /fhir/R4/AuditEvent/{id} — retrieve a single audit event."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        uid = _parse_uuid(pk)
        if not uid:
            return _operation_outcome("error", "invalid", "Invalid UUID", status.HTTP_400_BAD_REQUEST)

        event = AuditEvent.objects.filter(id=uid).first()
        if not event:
            return _operation_outcome("error", "not-found", "AuditEvent not found", status.HTTP_404_NOT_FOUND)

        return Response(audit_event_to_fhir(event))


# --- Library (Rule packages) ---

class FHIRLibraryListView(APIView):
    """GET /fhir/R4/Library — search rule bundle packages (spec §8.3, §24)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.core.package_models import Package

        qs = Package.objects.filter(package_type="RULE_BUNDLE")
        status_filter = request.query_params.get("status", "").lower()
        if status_filter == "active":
            qs = qs.filter(status="ACTIVE")
        elif status_filter == "draft":
            qs = qs.filter(status="STAGED")
        count = _get_count(request)

        pkgs = list(qs[:count])
        entries = [package_to_library(p) for p in pkgs]

        return _bundle(entries)


class FHIRLibraryDetailView(APIView):
    """GET /fhir/R4/Library/{id} — retrieve a single library."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from apps.core.package_models import Package

        uid = _parse_uuid(pk)
        if not uid:
            return _operation_outcome("error", "invalid", "Invalid UUID", status.HTTP_400_BAD_REQUEST)

        pkg = Package.objects.filter(id=uid, package_type="RULE_BUNDLE").first()
        if not pkg:
            return _operation_outcome("error", "not-found", "Library not found", status.HTTP_404_NOT_FOUND)

        return Response(package_to_library(pkg))


# --- PlanDefinition (Rule packages) ---

class FHIRPlanDefinitionListView(APIView):
    """GET /fhir/R4/PlanDefinition — search rule bundle plans (spec §8.3, §24)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.core.package_models import Package

        qs = Package.objects.filter(package_type="RULE_BUNDLE")
        status_filter = request.query_params.get("status", "").lower()
        if status_filter == "active":
            qs = qs.filter(status="ACTIVE")
        elif status_filter == "draft":
            qs = qs.filter(status="STAGED")
        count = _get_count(request)

        pkgs = list(qs[:count])
        entries = [package_to_plan_definition(p) for p in pkgs]

        return _bundle(entries)


class FHIRPlanDefinitionDetailView(APIView):
    """GET /fhir/R4/PlanDefinition/{id} — retrieve a single plan definition."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from apps.core.package_models import Package

        uid = _parse_uuid(pk)
        if not uid:
            return _operation_outcome("error", "invalid", "Invalid UUID", status.HTTP_400_BAD_REQUEST)

        pkg = Package.objects.filter(id=uid, package_type="RULE_BUNDLE").first()
        if not pkg:
            return _operation_outcome("error", "not-found", "PlanDefinition not found", status.HTTP_404_NOT_FOUND)

        return Response(package_to_plan_definition(pkg))


# --- Organization (OrganisationUnit, spec §8.3) ---

class FHIROrganizationListView(APIView):
    """GET /fhir/R4/Organization — search organisation units (spec §8.3)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.organisations.models import OrganisationUnit

        qs = OrganisationUnit.objects.all()
        name = request.query_params.get("name")
        if name:
            qs = qs.filter(name__icontains=name)
        unit_type = request.query_params.get("type", "").upper()
        if unit_type:
            qs = qs.filter(unit_type=unit_type)
        count = _get_count(request)

        orgs = list(qs[:count])
        entries = [organisation_to_fhir(o) for o in orgs]

        log_audit(
            actor=request.user.username,
            action="FHIR_ORGANIZATION_SEARCH",
            actor_role=request.user.system_role,
            purpose="DIRECT_CARE",
            metadata={"count": len(entries), "filters": {"name": name, "type": unit_type}},
        )

        return _bundle(entries)


class FHIROrganizationDetailView(APIView):
    """GET /fhir/R4/Organization/{id} — retrieve a single organisation."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from apps.organisations.models import OrganisationUnit

        uid = _parse_uuid(pk)
        if not uid:
            return _operation_outcome("error", "invalid", "Invalid UUID", status.HTTP_400_BAD_REQUEST)

        org = OrganisationUnit.objects.filter(id=uid).first()
        if not org:
            return _operation_outcome("error", "not-found", "Organization not found", status.HTTP_404_NOT_FOUND)

        log_audit(
            actor=request.user.username,
            action="FHIR_ORGANIZATION_READ",
            actor_role=request.user.system_role,
            purpose="DIRECT_CARE",
            entity_type="Organization",
            entity_id=str(org.id),
            metadata={"name": org.name, "unit_type": org.unit_type},
        )

        return Response(organisation_to_fhir(org))


# --- Location (OrganisationUnit with geographic coords, spec §8.3) ---

class FHIRLocationListView(APIView):
    """GET /fhir/R4/Location — search facility locations (spec §8.3)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.organisations.models import OrganisationUnit

        qs = OrganisationUnit.objects.all()
        name = request.query_params.get("name")
        if name:
            qs = qs.filter(name__icontains=name)
        count = _get_count(request)

        orgs = list(qs[:count])
        entries = [organisation_to_location(o) for o in orgs]

        log_audit(
            actor=request.user.username,
            action="FHIR_LOCATION_SEARCH",
            actor_role=request.user.system_role,
            purpose="DIRECT_CARE",
            metadata={"count": len(entries)},
        )

        return _bundle(entries)


class FHIRLocationDetailView(APIView):
    """GET /fhir/R4/Location/{id} — retrieve a single location."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from apps.organisations.models import OrganisationUnit

        uid = _parse_uuid(pk)
        if not uid:
            return _operation_outcome("error", "invalid", "Invalid UUID", status.HTTP_400_BAD_REQUEST)

        org = OrganisationUnit.objects.filter(id=uid).first()
        if not org:
            return _operation_outcome("error", "not-found", "Location not found", status.HTTP_404_NOT_FOUND)

        log_audit(
            actor=request.user.username,
            action="FHIR_LOCATION_READ",
            actor_role=request.user.system_role,
            purpose="DIRECT_CARE",
            entity_type="Location",
            entity_id=str(org.id),
            metadata={"name": org.name},
        )

        return Response(organisation_to_location(org))


# --- QuestionnaireResponse (clinical assessments, spec §8.3) ---

class FHIRQuestionnaireResponseListView(APIView):
    """GET /fhir/R4/QuestionnaireResponse — search clinical assessments (spec §8.3)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.pregnancy.models import PregnancyAssessment
        from apps.newborn.models import NewbornAssessment

        patient_id = request.query_params.get("patient")
        count = _get_count(request)

        entries = []

        # Pregnancy assessments
        preg_qs = PregnancyAssessment.objects.all()
        if patient_id:
            try:
                pid = uuid.UUID(str(patient_id))
                preg_qs = preg_qs.filter(episode__woman_id=pid)
            except (ValueError, TypeError):
                pass
        for a in preg_qs[:count]:
            entries.append(assessment_to_questionnaire_response(a))

        # Newborn assessments (if we haven't filled the count)
        remaining = count - len(entries)
        if remaining > 0:
            nb_qs = NewbornAssessment.objects.all()
            if patient_id:
                try:
                    pid = uuid.UUID(str(patient_id))
                    nb_qs = nb_qs.filter(episode__child_id=pid)
                except (ValueError, TypeError):
                    pass
            for a in nb_qs[:remaining]:
                entries.append(assessment_to_questionnaire_response(a))

        log_audit(
            actor=request.user.username,
            action="FHIR_QUESTIONNAIRE_RESPONSE_SEARCH",
            actor_role=request.user.system_role,
            purpose="DIRECT_CARE",
            metadata={"count": len(entries), "patient_filter": patient_id or ""},
        )

        return _bundle(entries)


class FHIRQuestionnaireResponseDetailView(APIView):
    """GET /fhir/R4/QuestionnaireResponse/{id} — retrieve a single assessment."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from apps.pregnancy.models import PregnancyAssessment
        from apps.newborn.models import NewbornAssessment

        uid = _parse_uuid(pk)
        if not uid:
            return _operation_outcome("error", "invalid", "Invalid UUID", status.HTTP_400_BAD_REQUEST)

        # Try pregnancy assessment first, then newborn
        assessment = PregnancyAssessment.objects.filter(id=uid).first()
        if not assessment:
            assessment = NewbornAssessment.objects.filter(id=uid).first()
        if not assessment:
            return _operation_outcome("error", "not-found", "QuestionnaireResponse not found", status.HTTP_404_NOT_FOUND)

        log_audit(
            actor=request.user.username,
            action="FHIR_QUESTIONNAIRE_RESPONSE_READ",
            actor_role=request.user.system_role,
            purpose="DIRECT_CARE",
            entity_type="QuestionnaireResponse",
            entity_id=str(assessment.id),
        )

        return Response(assessment_to_questionnaire_response(assessment))


# --- CapabilityStatement ---

class FHIRCapabilityStatementView(APIView):
    """GET /fhir/R4/metadata — FHIR CapabilityStatement (spec §20.1)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        resources = [
            {"type": "Patient", "interaction": [{"code": "read"}, {"code": "search-type"}],
             "searchParam": [{"name": "name", "type": "string"}, {"name": "_id", "type": "token"}, {"name": "_count", "type": "number"}]},
            {"type": "Observation", "interaction": [{"code": "read"}, {"code": "search-type"}],
             "searchParam": [{"name": "patient", "type": "reference"}, {"name": "category", "type": "token"}, {"name": "_count", "type": "number"}]},
            {"type": "EpisodeOfCare", "interaction": [{"code": "read"}, {"code": "search-type"}],
             "searchParam": [{"name": "patient", "type": "reference"}, {"name": "_count", "type": "number"}]},
            {"type": "Encounter", "interaction": [{"code": "read"}, {"code": "search-type"}],
             "searchParam": [{"name": "patient", "type": "reference"}, {"name": "_count", "type": "number"}]},
            {"type": "ServiceRequest", "interaction": [{"code": "read"}, {"code": "search-type"}],
             "searchParam": [{"name": "patient", "type": "reference"}, {"name": "_count", "type": "number"}]},
            {"type": "Immunization", "interaction": [{"code": "read"}, {"code": "search-type"}],
             "searchParam": [{"name": "patient", "type": "reference"}, {"name": "_count", "type": "number"}]},
            {"type": "Provenance", "interaction": [{"code": "read"}, {"code": "search-type"}],
             "searchParam": [{"name": "target", "type": "token"}, {"name": "_count", "type": "number"}]},
            {"type": "Task", "interaction": [{"code": "read"}, {"code": "search-type"}],
             "searchParam": [{"name": "patient", "type": "reference"}, {"name": "status", "type": "token"}, {"name": "_count", "type": "number"}]},
            {"type": "AuditEvent", "interaction": [{"code": "read"}, {"code": "search-type"}],
             "searchParam": [{"name": "entity", "type": "token"}, {"name": "action", "type": "token"}, {"name": "patient", "type": "reference"}, {"name": "_count", "type": "number"}]},
            {"type": "Library", "interaction": [{"code": "read"}, {"code": "search-type"}],
             "searchParam": [{"name": "status", "type": "token"}, {"name": "_count", "type": "number"}]},
            {"type": "PlanDefinition", "interaction": [{"code": "read"}, {"code": "search-type"}],
             "searchParam": [{"name": "status", "type": "token"}, {"name": "_count", "type": "number"}]},
            {"type": "Organization", "interaction": [{"code": "read"}, {"code": "search-type"}],
             "searchParam": [{"name": "name", "type": "string"}, {"name": "type", "type": "token"}, {"name": "_count", "type": "number"}]},
            {"type": "Location", "interaction": [{"code": "read"}, {"code": "search-type"}],
             "searchParam": [{"name": "name", "type": "string"}, {"name": "_count", "type": "number"}]},
            {"type": "QuestionnaireResponse", "interaction": [{"code": "read"}, {"code": "search-type"}],
             "searchParam": [{"name": "patient", "type": "reference"}, {"name": "_count", "type": "number"}]},
        ]
        return Response({
            "resourceType": "CapabilityStatement",
            "status": "active",
            "date": "2025-01-01",
            "kind": "instance",
            "fhirVersion": "4.0.1",
            "format": ["json"],
            "rest": [{"mode": "server", "resource": resources}],
        })
