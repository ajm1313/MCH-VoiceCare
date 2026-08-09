"""Notification API views."""
from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema

from apps.notifications.models import Notification, ActionRecord
from apps.notifications.api.serializers import NotificationSerializer, ActionRecordSerializer
from apps.core.enums import NotificationStatus, UrgencyLevel
from apps.core.mixins import ReadOnlyUnlessWriterMixin
from apps.audit.services import log_audit


@extend_schema(tags=["notifications"])
class NotificationViewSet(ReadOnlyUnlessWriterMixin, viewsets.ModelViewSet):
    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["status", "notification_class", "urgency"]

    @action(detail=True, methods=["post"])
    def acknowledge(self, request, pk=None):
        """Mark a notification as acknowledged."""
        notification = self.get_object()
        if notification.status != NotificationStatus.OPEN:
            return Response(
                {"detail": "Only open notifications can be acknowledged."},
                status=status.HTTP_409_CONFLICT,
            )
        notification.status = NotificationStatus.ACKNOWLEDGED
        notification.save(update_fields=["status", "updated_at"])

        ActionRecord.objects.create(
            notification=notification,
            action_type="ACKNOWLEDGED",
            recorded_by=request.user.username,
            notes=request.data.get("notes", ""),
        )

        log_audit(
            actor=request.user.username,
            action="NOTIFICATION_ACKNOWLEDGED",
            actor_role=request.user.system_role,
            entity_type="Notification",
            entity_id=str(notification.id),
            purpose="DIRECT_CARE",
        )

        return Response(NotificationSerializer(notification).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        """Mark a notification as resolved."""
        notification = self.get_object()
        if notification.status == NotificationStatus.ACTED:
            return Response(
                {"detail": "Notification already resolved."},
                status=status.HTTP_409_CONFLICT,
            )
        notification.status = NotificationStatus.ACTED
        notification.save(update_fields=["status", "updated_at"])

        ActionRecord.objects.create(
            notification=notification,
            action_type="RESOLVED",
            recorded_by=request.user.username,
            notes=request.data.get("notes", ""),
        )

        log_audit(
            actor=request.user.username,
            action="NOTIFICATION_RESOLVED",
            actor_role=request.user.system_role,
            entity_type="Notification",
            entity_id=str(notification.id),
            purpose="DIRECT_CARE",
        )

        return Response(NotificationSerializer(notification).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def escalate(self, request, pk=None):
        """Escalate a notification to higher urgency."""
        notification = self.get_object()
        new_urgency = request.data.get("urgency", UrgencyLevel.EMERGENCY)
        notification.urgency = new_urgency
        notification.save(update_fields=["urgency", "updated_at"])

        ActionRecord.objects.create(
            notification=notification,
            action_type="ESCALATED",
            recorded_by=request.user.username,
            notes=request.data.get("notes", f"Escalated to {new_urgency}"),
        )

        log_audit(
            actor=request.user.username,
            action="NOTIFICATION_ESCALATED",
            actor_role=request.user.system_role,
            entity_type="Notification",
            entity_id=str(notification.id),
            purpose="DIRECT_CARE",
            metadata={"new_urgency": new_urgency},
        )

        return Response(NotificationSerializer(notification).data, status=status.HTTP_200_OK)


@extend_schema(tags=["notifications"])
class ActionRecordViewSet(viewsets.ModelViewSet):
    queryset = ActionRecord.objects.all()
    serializer_class = ActionRecordSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["notification"]
