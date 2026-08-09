"""Referral API views."""
from django.utils import timezone

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.referrals.models import Referral, ReferralStateLog
from apps.referrals.api.serializers import ReferralSerializer, ReferralStateLogSerializer
from apps.referrals.state_machine import assert_valid_transition
from apps.referrals.rule_engine import apply_urgency_classification
from apps.core.mixins import RelatedOrgScopedViewSet
from apps.core.permissions import user_can_write
from apps.core.enums import ReferralStatus
from apps.audit.services import log_referral_state_change
from apps.notifications.services import create_referral_notification


class ReferralViewSet(RelatedOrgScopedViewSet, viewsets.ModelViewSet):
    queryset = Referral.objects.all().select_related("patient", "destination_facility")
    serializer_class = ReferralSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["status", "urgency", "patient", "referring_facility", "destination_facility"]
    org_lookup = ["referring_facility", "destination_facility", "patient__organisation_unit"]

    def perform_create(self, serializer):
        if not user_can_write(self.request.user):
            raise PermissionDenied("Read-only users cannot create records.")
        referral = serializer.save()
        apply_urgency_classification(referral)
        create_referral_notification(referral, "created")
        log_referral_state_change(
            actor=self.request.user.username,
            referral_id=referral.id,
            from_status="",
            to_status=referral.status,
            actor_role=self.request.user.system_role,
        )

    def _transition(self, request, referral, to_status, **extra_fields):
        """Execute a validated state transition with logging."""
        from_status = referral.status
        try:
            assert_valid_transition(from_status, to_status)
        except ValueError as e:
            return Response(
                {"detail": str(e)},
                status=status.HTTP_409_CONFLICT,
            )

        referral.status = to_status
        for field, value in extra_fields.items():
            setattr(referral, field, value)
        referral.version = (referral.version or 0) + 1
        referral.save(update_fields=["status"] + list(extra_fields.keys()) + ["version", "updated_at"])

        ReferralStateLog.objects.create(
            referral=referral,
            from_status=from_status,
            to_status=to_status,
            actor=request.user.username,
            notes=request.data.get("notes", ""),
        )

        log_referral_state_change(
            actor=request.user.username,
            referral_id=referral.id,
            from_status=from_status,
            to_status=to_status,
            actor_role=request.user.system_role,
            notes=request.data.get("notes", ""),
        )

        return Response(ReferralSerializer(referral).data)

    @action(detail=True, methods=["post"])
    def acknowledge(self, request, pk=None):
        """Acknowledge a referral — transitions to RECEIVING_FACILITY_NOTIFIED or ACCEPTED."""
        referral = self.get_object()
        to_status = request.data.get("to_status", ReferralStatus.RECEIVING_FACILITY_NOTIFIED)
        return self._transition(request, referral, to_status, acknowledged_at=timezone.now())

    @action(detail=True, methods=["post"])
    def transport(self, request, pk=None):
        """Request or activate transport — transitions to TRANSPORT_REQUESTED or IN_TRANSIT."""
        referral = self.get_object()
        to_status = request.data.get("to_status", ReferralStatus.TRANSPORT_REQUESTED)
        return self._transition(request, referral, to_status)

    @action(detail=True, methods=["post"])
    def arrival(self, request, pk=None):
        """Record patient arrival at receiving facility."""
        referral = self.get_object()
        return self._transition(request, referral, ReferralStatus.ARRIVED, arrived_at=timezone.now())

    @action(detail=True, methods=["post"])
    def disposition(self, request, pk=None):
        """Record disposition/outcome at receiving facility."""
        referral = self.get_object()
        disposition_text = request.data.get("disposition", "")
        return self._transition(
            request, referral, ReferralStatus.DISPOSITION_RECORDED,
            disposition=disposition_text,
        )

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        """Close the referral — only valid after disposition is recorded."""
        referral = self.get_object()
        return self._transition(request, referral, ReferralStatus.CLOSED, closed_at=timezone.now())

    @action(detail=True, methods=["post"])
    def decline(self, request, pk=None):
        """Decline a referral — transitions to DECLINED."""
        referral = self.get_object()
        return self._transition(request, referral, ReferralStatus.DECLINED)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Cancel a referral — transitions to CANCELLED_BY_CLINICIAN."""
        referral = self.get_object()
        return self._transition(request, referral, ReferralStatus.CANCELLED_BY_CLINICIAN)

    @action(detail=True, permission_classes=[IsAuthenticated])
    def qr(self, request, pk=None):
        """
        GET /api/v1/referrals/{id}/qr/

        Return the QR referral slip payload (spec §20.2, §18.2).
        Contains referral ID, short code, patient summary, urgency,
        facility info, and QR token for scanning at receiving facility.
        """
        referral = self.get_object()

        if not referral.qr_token:
            from apps.referrals.rule_engine import classify_referral_urgency
            result = classify_referral_urgency(referral)
            referral.qr_token = result["qr_token"]
            referral.short_code = result["short_code"]
            referral.save(update_fields=["qr_token", "short_code", "updated_at"])

        patient = referral.patient
        return Response({
            "qr_token": referral.qr_token,
            "short_code": referral.short_code,
            "referral_id": str(referral.id),
            "urgency": referral.urgency,
            "status": referral.status,
            "patient": {
                "full_name": patient.full_name,
                "age_years": getattr(patient, "age_years", None),
                "sex": getattr(patient, "sex", ""),
            },
            "referral_reason": referral.referral_reason,
            "pre_referral_care": referral.pre_referral_care,
            "referring_facility": {
                "id": str(referral.referring_facility.id) if referral.referring_facility else None,
                "name": referral.referring_facility.name if referral.referring_facility else "",
            },
            "destination_facility": {
                "id": str(referral.destination_facility.id) if referral.destination_facility else None,
                "name": referral.destination_facility.name if referral.destination_facility else "",
            },
            "created_at": referral.created_at.isoformat(),
        })


class ReferralStateLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ReferralStateLog.objects.all().select_related("referral")
    serializer_class = ReferralStateLogSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["referral"]
