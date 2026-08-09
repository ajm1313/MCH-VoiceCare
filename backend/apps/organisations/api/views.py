"""Organisation API views."""
from django.utils import timezone

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema

from apps.organisations.models import OrganisationUnit, FacilityCapability
from apps.organisations.api.serializers import (
    OrganisationUnitSerializer, FacilityCapabilitySerializer,
)
from apps.core.enums import OrganisationUnitType
from apps.core.permissions import user_can_manage_users
from apps.audit.services import log_audit


@extend_schema(tags=["organisations"])
class OrganisationUnitViewSet(viewsets.ModelViewSet):
    queryset = OrganisationUnit.objects.all().select_related("parent")
    serializer_class = OrganisationUnitSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["unit_type", "parent", "status"]
    search_fields = ["name", "code"]

    @action(detail=False, permission_classes=[IsAuthenticated])
    def regions(self, request):
        qs = self.get_queryset().filter(
            unit_type=OrganisationUnitType.REGION, status="ACTIVE"
        )
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, permission_classes=[IsAuthenticated])
    def districts(self, request):
        qs = self.get_queryset().filter(
            unit_type=OrganisationUnitType.DISTRICT, status="ACTIVE"
        )
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, permission_classes=[IsAuthenticated])
    def subdistricts(self, request):
        qs = self.get_queryset().filter(
            unit_type=OrganisationUnitType.SUBDISTRICT, status="ACTIVE"
        )
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, permission_classes=[IsAuthenticated])
    def facilities(self, request):
        qs = self.get_queryset().filter(
            unit_type=OrganisationUnitType.FACILITY, status="ACTIVE"
        )
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"], permission_classes=[IsAuthenticated])
    def referral_options(self, request, pk=None):
        """
        Return referral options for a given facility (spec §20.2, §18.1).
        Includes primary/backup destinations and capability flags.
        Flags expired capability verifications.
        """
        facility = self.get_object()
        now = timezone.now()

        try:
            cap = facility.capabilities.get()
        except FacilityCapability.DoesNotExist:
            return Response({
                "facility": {"id": str(facility.id), "name": facility.name},
                "capabilities": None,
                "primary_destination": None,
                "backup_destination": None,
                "capability_verified": False,
                "warning": "No capability record found for this facility.",
            })

        primary = cap.primary_referral_destination
        backup = cap.backup_referral_destination

        # Check for expired verification
        expired = cap.verification_expires_at and cap.verification_expires_at < now

        result = {
            "facility": {
                "id": str(facility.id),
                "name": facility.name,
            },
            "capabilities": {
                "maternity_triage_24_7": cap.maternity_triage_24_7,
                "bemonc": cap.bemonc,
                "cemonc": cap.cemonc,
                "theatre": cap.theatre,
                "blood": cap.blood,
                "specialist_obstetrics": cap.specialist_obstetrics,
                "newborn_support": cap.newborn_support,
            },
            "primary_destination": {
                "id": str(primary.id),
                "name": primary.name,
                "path": primary.path,
            } if primary else None,
            "backup_destination": {
                "id": str(backup.id),
                "name": backup.name,
                "path": backup.path,
            } if backup else None,
            "capability_verified": not expired,
            "verified_at": cap.verified_at.isoformat() if cap.verified_at else None,
            "verification_expires_at": cap.verification_expires_at.isoformat() if cap.verification_expires_at else None,
        }

        if expired:
            result["warning"] = (
                "Facility capability verification has expired. "
                "Do not silently trust referral routing — verify before use."
            )

        return Response(result)

    @action(detail=False, permission_classes=[IsAuthenticated])
    def expired_capabilities(self, request):
        """
        GET /api/v1/organisations/units/expired_capabilities/

        Return facilities with expired capability verifications (spec §32).
        Operational queue for administrators to re-verify stale capability data.
        """
        now = timezone.now()
        expired = FacilityCapability.objects.filter(
            verification_expires_at__lt=now
        ).select_related("facility")

        results = []
        for cap in expired:
            results.append({
                "facility_id": str(cap.facility.id),
                "facility_name": cap.facility.name,
                "facility_path": cap.facility.path,
                "verified_at": cap.verified_at.isoformat() if cap.verified_at else None,
                "verification_expires_at": cap.verification_expires_at.isoformat() if cap.verification_expires_at else None,
                "days_expired": (now - cap.verification_expires_at).days if cap.verification_expires_at else None,
                "has_primary_destination": cap.primary_referral_destination is not None,
                "has_backup_destination": cap.backup_referral_destination is not None,
            })

        return Response({
            "total": len(results),
            "expired": results,
        })

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated])
    def reverify_capabilities(self, request, pk=None):
        """
        POST /api/v1/organisations/units/{id}/reverify_capabilities/

        Re-verify facility capabilities — resets verification timestamp and
        sets new expiry date (spec §32). Only admin users can re-verify.
        """
        if not user_can_manage_users(request.user):
            return Response(
                {"detail": "Only administrators can re-verify capabilities."},
                status=status.HTTP_403_FORBIDDEN,
            )

        facility = self.get_object()
        try:
            cap = facility.capabilities.get()
        except FacilityCapability.DoesNotExist:
            return Response(
                {"detail": "No capability record found for this facility."},
                status=status.HTTP_404_NOT_FOUND,
            )

        now = timezone.now()
        expiry_months = request.data.get("expiry_months", 3)
        from datetime import timedelta
        cap.verified_at = now
        cap.verification_expires_at = now + timedelta(days=expiry_months * 30)
        cap.save(update_fields=["verified_at", "verification_expires_at", "updated_at"])

        log_audit(
            actor=request.user.username,
            action="CAPABILITY_REVERIFIED",
            actor_role=request.user.system_role,
            entity_type="FacilityCapability",
            entity_id=str(cap.id),
            facility_id=facility.id,
            purpose="ADMIN",
            metadata={
                "facility": facility.name,
                "expiry_months": expiry_months,
            },
        )

        return Response({
            "facility": {"id": str(facility.id), "name": facility.name},
            "verified_at": cap.verified_at.isoformat(),
            "verification_expires_at": cap.verification_expires_at.isoformat(),
            "reverified": True,
        })


@extend_schema(tags=["organisations"])
class FacilityCapabilityViewSet(viewsets.ModelViewSet):
    queryset = FacilityCapability.objects.all().select_related("facility")
    serializer_class = FacilityCapabilitySerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["facility"]
