"""Notification API serializers."""
from rest_framework import serializers
from apps.notifications.models import Notification, ActionRecord


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ActionRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActionRecord
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]
