"""Client API views."""
from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.clients.models import Person, Household, CaregiverLink, PatientReconciliationQueue
from apps.clients.api.serializers import (
    PersonSerializer, HouseholdSerializer, CaregiverLinkSerializer,
    PatientReconciliationQueueSerializer,
)
from apps.clients.reconciliation import resolve_reconciliation
from apps.core.mixins import OrgScopedViewSet
from apps.audit.services import log_audit


class PersonViewSet(OrgScopedViewSet, viewsets.ModelViewSet):
    queryset = Person.objects.all().select_related("household", "organisation_unit")
    serializer_class = PersonSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["sex", "household", "organisation_unit"]
    search_fields = ["full_name", "phone", "national_id"]
    org_field = "organisation_unit"

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        log_audit(
            actor=request.user.username,
            action="PATIENT_OPEN",
            actor_role=request.user.system_role,
            entity_type="Person",
            entity_id=str(instance.id),
            patient_id=instance.id,
            purpose="DIRECT_CARE",
        )
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    @action(detail=False)
    def search(self, request):
        q = request.query_params.get("q", "")
        if not q:
            return Response([])
        qs = self.get_queryset().filter(full_name__icontains=q)[:20]
        serializer = self.get_serializer(qs, many=True)

        log_audit(
            actor=request.user.username,
            action="PATIENT_SEARCH",
            actor_role=request.user.system_role,
            purpose="DIRECT_CARE",
            metadata={"query": q, "result_count": len(serializer.data)},
        )

        return Response(serializer.data)

    @action(detail=True, methods=["get", "patch"])
    def consent_preferences(self, request, pk=None):
        """
        GET /api/v1/clients/persons/{id}/consent_preferences/
        PATCH /api/v1/clients/persons/{id}/consent_preferences/

        Manage consent and contact preferences (spec §26):
        - IVR/DTMF/USSD contact opt-in/out
        - preferred language
        - safe calling times
        - shared-phone status
        - secondary use / model-training consent (separate from care consent)
        """
        person = self.get_object()

        if request.method == "GET":
            return Response({
                "preferred_language": person.preferred_language,
                "sensitive_content_consent": person.sensitive_content_consent,
                "communication_opt_out": person.communication_opt_out,
                "phone": person.phone,
                "alternate_phone": person.alternate_phone,
            })

        # PATCH — update preferences
        data = request.data
        changed = []

        if "preferred_language" in data:
            person.preferred_language = data["preferred_language"]
            changed.append("preferred_language")
        if "sensitive_content_consent" in data:
            person.sensitive_content_consent = data["sensitive_content_consent"]
            changed.append("sensitive_content_consent")
        if "communication_opt_out" in data:
            person.communication_opt_out = data["communication_opt_out"]
            changed.append("communication_opt_out")
        if "phone" in data:
            person.phone = data["phone"]
            changed.append("phone")
        if "alternate_phone" in data:
            person.alternate_phone = data["alternate_phone"]
            changed.append("alternate_phone")

        person.save(update_fields=changed + ["updated_at"])

        log_audit(
            actor=request.user.username,
            action="CONSENT_PREFERENCE_UPDATED",
            actor_role=request.user.system_role,
            entity_type="Person",
            entity_id=str(person.id),
            patient_id=person.id,
            purpose="ADMIN",
            metadata={"changed_fields": changed},
        )

        return Response({
            "preferred_language": person.preferred_language,
            "sensitive_content_consent": person.sensitive_content_consent,
            "communication_opt_out": person.communication_opt_out,
            "phone": person.phone,
            "alternate_phone": person.alternate_phone,
        }, status=status.HTTP_200_OK)


class HouseholdViewSet(OrgScopedViewSet, viewsets.ModelViewSet):
    queryset = Household.objects.all().select_related("organisation_unit")
    serializer_class = HouseholdSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["organisation_unit"]
    org_field = "organisation_unit"


class CaregiverLinkViewSet(viewsets.ModelViewSet):
    queryset = CaregiverLink.objects.all().select_related("child", "caregiver")
    serializer_class = CaregiverLinkSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["child", "caregiver", "is_primary"]


class PatientReconciliationQueueViewSet(viewsets.ReadOnlyModelViewSet):
    """
    View and resolve patient identity reconciliation queue items (spec §19.4).

    GET    /api/v1/clients/reconciliation-queue/       — list pending items
    GET    /api/v1/clients/reconciliation-queue/{id}/   — retrieve a single item
    POST   /api/v1/clients/reconciliation-queue/{id}/resolve/ — resolve an item
    """
    queryset = PatientReconciliationQueue.objects.all().select_related(
        "person_a", "person_b",
    )
    serializer_class = PatientReconciliationQueueSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["status"]

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated])
    def resolve(self, request, pk=None):
        """
        Resolve a reconciliation queue entry.

        Request body:
            resolution: "RESOLVED_MERGE" | "RESOLVED_KEEP_BOTH" | "RESOLVED_REJECT"
        """
        queue_entry = self.get_object()
        resolution = request.data.get("resolution", "")

        if resolution not in (
            "RESOLVED_MERGE", "RESOLVED_KEEP_BOTH", "RESOLVED_REJECT",
        ):
            return Response(
                {"detail": "resolution must be one of: RESOLVED_MERGE, "
                           "RESOLVED_KEEP_BOTH, RESOLVED_REJECT"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        resolved_by = request.user.username
        resolve_reconciliation(queue_entry, resolution, resolved_by)

        log_audit(
            actor=resolved_by,
            action="RECONCILIATION_RESOLVED",
            actor_role=request.user.system_role,
            entity_type="PatientReconciliationQueue",
            entity_id=str(queue_entry.id),
            purpose="ADMIN",
            metadata={"resolution": resolution},
        )

        queue_entry.refresh_from_db()
        return Response(PatientReconciliationQueueSerializer(queue_entry).data)
