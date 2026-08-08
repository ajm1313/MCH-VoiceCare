"""
Idempotency-Key model for offline-first deduplication (spec §13).

When the mobile app pushes a batch, each record includes an Idempotency-Key
(UUID). The server stores the key + response so a retry returns the same
result without creating duplicates.
"""
import uuid
from django.db import models
from apps.core.models import TimeStampedModel


class IdempotencyRecord(TimeStampedModel):
    """Stores request + response keyed by Idempotency-Key."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key = models.CharField(max_length=100, unique=True, db_index=True)
    user = models.ForeignKey(
        "accounts.UserAccount",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="idempotency_records",
    )
    request_method = models.CharField(max_length=10)
    request_path = models.CharField(max_length=255)
    request_body_hash = models.CharField(max_length=64, blank=True)
    response_status = models.IntegerField()
    response_body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["key"]),
            models.Index(fields=["user", "key"]),
        ]

    def __str__(self):
        return f"Idempotency({self.key}) → {self.response_status}"
