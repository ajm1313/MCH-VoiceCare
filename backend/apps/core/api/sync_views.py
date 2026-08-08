"""
Sync API endpoints for offline-first mobile app (spec §13).

POST /api/v1/sync/push/   — push a batch of created/updated records
GET  /api/v1/sync/pull/   — pull records modified since last_synced_at
"""
import json
from datetime import datetime

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.idempotency import idempotent
from apps.core.permissions import get_user_org_unit_ids

from apps.clients.models import Person, Household
from apps.pregnancy.models import PregnancyEpisode, PregnancyObservation
from apps.newborn.models import NewbornEpisode, NewbornObservation
from apps.immunisation.models import ChildImmunisationRecord, VaccineDose
from apps.growth.models import GrowthMeasurement
from apps.referrals.models import Referral

from apps.clients.api.serializers import PersonSerializer, HouseholdSerializer
from apps.pregnancy.api.serializers import (
    PregnancyEpisodeSerializer, PregnancyObservationSerializer,
)
from apps.newborn.api.serializers import (
    NewbornEpisodeSerializer, NewbornObservationSerializer,
)
from apps.immunisation.api.serializers import (
    ChildImmunisationRecordSerializer, VaccineDoseSerializer,
)
from apps.growth.api.serializers import GrowthMeasurementSerializer
from apps.referrals.api.serializers import ReferralSerializer


# Registry mapping entity type → (model, serializer, org_lookup)
SYNC_REGISTRY = {
    "persons": (Person, PersonSerializer, "organisation_unit"),
    "households": (Household, HouseholdSerializer, "organisation_unit"),
    "pregnancy_episodes": (PregnancyEpisode, PregnancyEpisodeSerializer, "woman__organisation_unit"),
    "pregnancy_observations": (PregnancyObservation, PregnancyObservationSerializer, "episode__woman__organisation_unit"),
    "newborn_episodes": (NewbornEpisode, NewbornEpisodeSerializer, ["child__organisation_unit", "mother__organisation_unit"]),
    "newborn_observations": (NewbornObservation, NewbornObservationSerializer, "newborn__child__organisation_unit"),
    "immunisation_records": (ChildImmunisationRecord, ChildImmunisationRecordSerializer, "child__organisation_unit"),
    "vaccine_doses": (VaccineDose, VaccineDoseSerializer, "child_record__child__organisation_unit"),
    "growth_measurements": (GrowthMeasurement, GrowthMeasurementSerializer, "child__organisation_unit"),
    "referrals": (Referral, ReferralSerializer, ["referring_facility", "destination_facility", "patient__organisation_unit"]),
}


class SyncViewSet(viewsets.ViewSet):
    """Sync endpoints for offline-first mobile app."""
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["post"])
    @idempotent
    def push(self, request):
        """
        Push a batch of records from the mobile app.
        Body: { "records": { "persons": [...], "pregnancy_episodes": [...], ... } }
        Returns: { "results": { "persons": [{"id": "...", "status": "created|updated|error", "error": "..."}], ... } }
        """
        records = request.data.get("records", {})
        results = {}

        for entity_type, items in records.items():
            if entity_type not in SYNC_REGISTRY:
                results[entity_type] = [{"error": f"Unknown entity type: {entity_type}"}]
                continue

            model, serializer_class, _ = SYNC_REGISTRY[entity_type]
            entity_results = []

            for item in items:
                item_id = item.get("id")
                try:
                    if item_id:
                        obj = model.objects.filter(id=item_id).first()
                        if obj:
                            serializer = serializer_class(obj, data=item, partial=True)
                        else:
                            serializer = serializer_class(data=item)
                    else:
                        serializer = serializer_class(data=item)

                    if serializer.is_valid():
                        serializer.save()
                        entity_results.append({
                            "id": serializer.instance.id,
                            "status": "updated" if item_id and model.objects.filter(id=item_id).exists() else "created",
                        })
                    else:
                        entity_results.append({
                            "id": item_id,
                            "status": "error",
                            "errors": serializer.errors,
                        })
                except Exception as e:
                    entity_results.append({
                        "id": item_id,
                        "status": "error",
                        "error": str(e),
                    })

            results[entity_type] = entity_results

        return Response({"results": results}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"])
    def pull(self, request):
        """
        Pull records modified since last_synced_at.
        Query params: ?since=2025-01-01T00:00:00Z&entities=persons,pregnancy_episodes
        Returns: { "synced_at": "...", "records": { "persons": [...], ... } }
        """
        since_str = request.query_params.get("since")
        entities_param = request.query_params.get("entities", "")

        try:
            since = datetime.fromisoformat(since_str.replace("Z", "+00:00")) if since_str else None
        except (ValueError, AttributeError):
            since = None

        if entities_param:
            requested = set(entities_param.split(","))
        else:
            requested = set(SYNC_REGISTRY.keys())

        user = request.user
        unit_ids = get_user_org_unit_ids(user)
        from django.db.models import Q

        records_out = {}
        for entity_type in requested:
            if entity_type not in SYNC_REGISTRY:
                continue

            model, serializer_class, org_lookup = SYNC_REGISTRY[entity_type]
            qs = model.objects.all()

            if since:
                qs = qs.filter(updated_at__gt=since)

            # Apply org scope
            if unit_ids is not None:
                if not unit_ids:
                    records_out[entity_type] = []
                    continue
                lookups = org_lookup if isinstance(org_lookup, list) else [org_lookup]
                q_obj = Q()
                for lookup in lookups:
                    q_obj |= Q(**{f"{lookup}_id__in": unit_ids})
                qs = qs.filter(q_obj)

            serializer = serializer_class(qs[:500], many=True)
            records_out[entity_type] = serializer.data

        from django.utils import timezone
        return Response({
            "synced_at": timezone.now().isoformat(),
            "records": records_out,
        })

    @action(detail=False, methods=["post"])
    @idempotent
    def batch(self, request):
        """
        Batch sync — POST /api/v1/sync/batch (spec §20.3).

        Body: {
            "deviceId": "string",
            "lastServerCursor": "optional-string",
            "events": [
                {"eventId": "uuid", "resourceType": "Observation", "resource": {}}
            ]
        }
        Response: {
            "acceptedEventIds": [],
            "rejectedEvents": [{"eventId": "...", "code": "...", "message": "..."}],
            "serverChanges": [],
            "nextServerCursor": "string"
        }
        """
        events = request.data.get("events", [])
        accepted = []
        rejected = []

        # Map resourceType to sync registry entity types
        resource_map = {
            "Person": "persons",
            "Household": "households",
            "PregnancyEpisode": "pregnancy_episodes",
            "Observation": "pregnancy_observations",
            "NewbornEpisode": "newborn_episodes",
            "NewbornObservation": "newborn_observations",
            "ImmunisationRecord": "immunisation_records",
            "VaccineDose": "vaccine_doses",
            "GrowthMeasurement": "growth_measurements",
            "Referral": "referrals",
        }

        for event in events:
            event_id = event.get("eventId")
            resource_type = event.get("resourceType")
            resource = event.get("resource", {})

            entity_type = resource_map.get(resource_type)
            if not entity_type:
                rejected.append({
                    "eventId": event_id,
                    "code": "VALIDATION_ERROR",
                    "message": f"Unknown resourceType: {resource_type}",
                })
                continue

            if entity_type not in SYNC_REGISTRY:
                rejected.append({
                    "eventId": event_id,
                    "code": "VALIDATION_ERROR",
                    "message": f"Unsupported entity: {entity_type}",
                })
                continue

            model, serializer_class, _ = SYNC_REGISTRY[entity_type]

            try:
                item_id = resource.get("id")
                if item_id:
                    obj = model.objects.filter(id=item_id).first()
                    if obj:
                        serializer = serializer_class(obj, data=resource, partial=True)
                    else:
                        serializer = serializer_class(data=resource)
                else:
                    serializer = serializer_class(data=resource)

                if serializer.is_valid():
                    serializer.save()
                    accepted.append(event_id)
                else:
                    rejected.append({
                        "eventId": event_id,
                        "code": "VALIDATION_ERROR",
                        "message": str(serializer.errors),
                    })
            except Exception as e:
                rejected.append({
                    "eventId": event_id,
                    "code": "CONFLICT",
                    "message": str(e),
                })

        # Pull server changes since lastServerCursor
        last_cursor = request.data.get("lastServerCursor")
        server_changes = []
        if last_cursor:
            try:
                since = datetime.fromisoformat(last_cursor.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                since = None
        else:
            since = None

        if since:
            user = request.user
            unit_ids = get_user_org_unit_ids(user)
            from django.db.models import Q

            for entity_type, (model, serializer_class, org_lookup) in SYNC_REGISTRY.items():
                qs = model.objects.filter(updated_at__gt=since)
                if unit_ids is not None:
                    if not unit_ids:
                        continue
                    lookups = org_lookup if isinstance(org_lookup, list) else [org_lookup]
                    q_obj = Q()
                    for lookup in lookups:
                        q_obj |= Q(**{f"{lookup}_id__in": unit_ids})
                    qs = qs.filter(q_obj)
                for obj in qs[:200]:
                    server_changes.append({
                        "resourceType": entity_type,
                        "resource": serializer_class(obj).data,
                    })

        from django.utils import timezone
        return Response({
            "acceptedEventIds": accepted,
            "rejectedEvents": rejected,
            "serverChanges": server_changes,
            "nextServerCursor": timezone.now().isoformat(),
        }, status=status.HTTP_200_OK)
