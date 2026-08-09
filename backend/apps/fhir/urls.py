"""FHIR R4 API URLs (spec §8.3, §20.1)."""
from django.urls import path
from .views import (
    FHIRCapabilityStatementView,
    FHIRPatientListView,
    FHIRPatientDetailView,
    FHIRObservationListView,
    FHIRObservationDetailView,
    FHIREpisodeOfCareListView,
    FHIREpisodeOfCareDetailView,
    FHIREncounterListView,
    FHIREncounterDetailView,
    FHIRServiceRequestListView,
    FHIRServiceRequestDetailView,
    FHIRImmunizationListView,
    FHIRImmunizationDetailView,
    FHIRProvenanceListView,
    FHIRProvenanceDetailView,
    FHIRTaskListView,
    FHIRTaskDetailView,
    FHIRAuditEventListView,
    FHIRAuditEventDetailView,
    FHIRLibraryListView,
    FHIRLibraryDetailView,
    FHIRPlanDefinitionListView,
    FHIRPlanDefinitionDetailView,
)

urlpatterns = [
    path("metadata", FHIRCapabilityStatementView.as_view(), name="fhir-metadata"),
    # Patient
    path("Patient", FHIRPatientListView.as_view(), name="fhir-patient-list"),
    path("Patient/<str:pk>", FHIRPatientDetailView.as_view(), name="fhir-patient-detail"),
    # Observation
    path("Observation", FHIRObservationListView.as_view(), name="fhir-observation-list"),
    path("Observation/<str:pk>", FHIRObservationDetailView.as_view(), name="fhir-observation-detail"),
    # EpisodeOfCare
    path("EpisodeOfCare", FHIREpisodeOfCareListView.as_view(), name="fhir-episode-list"),
    path("EpisodeOfCare/<str:pk>", FHIREpisodeOfCareDetailView.as_view(), name="fhir-episode-detail"),
    # Encounter
    path("Encounter", FHIREncounterListView.as_view(), name="fhir-encounter-list"),
    path("Encounter/<str:pk>", FHIREncounterDetailView.as_view(), name="fhir-encounter-detail"),
    # ServiceRequest
    path("ServiceRequest", FHIRServiceRequestListView.as_view(), name="fhir-servicerequest-list"),
    path("ServiceRequest/<str:pk>", FHIRServiceRequestDetailView.as_view(), name="fhir-servicerequest-detail"),
    # Immunization
    path("Immunization", FHIRImmunizationListView.as_view(), name="fhir-immunization-list"),
    path("Immunization/<str:pk>", FHIRImmunizationDetailView.as_view(), name="fhir-immunization-detail"),
    # Provenance
    path("Provenance", FHIRProvenanceListView.as_view(), name="fhir-provenance-list"),
    path("Provenance/<str:pk>", FHIRProvenanceDetailView.as_view(), name="fhir-provenance-detail"),
    # Task (referral workflow state, spec §8.3, §18)
    path("Task", FHIRTaskListView.as_view(), name="fhir-task-list"),
    path("Task/<str:pk>", FHIRTaskDetailView.as_view(), name="fhir-task-detail"),
    # AuditEvent (spec §8.3, §23)
    path("AuditEvent", FHIRAuditEventListView.as_view(), name="fhir-auditevent-list"),
    path("AuditEvent/<str:pk>", FHIRAuditEventDetailView.as_view(), name="fhir-auditevent-detail"),
    # Library
    path("Library", FHIRLibraryListView.as_view(), name="fhir-library-list"),
    path("Library/<str:pk>", FHIRLibraryDetailView.as_view(), name="fhir-library-detail"),
    # PlanDefinition
    path("PlanDefinition", FHIRPlanDefinitionListView.as_view(), name="fhir-plandefinition-list"),
    path("PlanDefinition/<str:pk>", FHIRPlanDefinitionDetailView.as_view(), name="fhir-plandefinition-detail"),
]
