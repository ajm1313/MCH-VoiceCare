"""
Idempotency-Key decorator for DRF views (spec §13).

Usage:
    from apps.core.idempotency import idempotent

    @action(detail=False, methods=["post"])
    @idempotent
    def sync_push(self, request):
        ...
"""
import hashlib
import json
from functools import wraps
from rest_framework import status
from rest_framework.response import Response
from rest_framework.renderers import JSONRenderer

from apps.core.idempotency_models import IdempotencyRecord


def _hash_body(body_bytes):
    return hashlib.sha256(body_bytes).hexdigest()


def _serialize_response_data(response):
    """Serialize DRF Response.data to JSON string using DRF's JSONRenderer."""
    if not hasattr(response, "data") or response.data is None:
        return ""
    renderer = JSONRenderer()
    return renderer.render(response.data).decode("utf-8")


def idempotent(view_func):
    """
    Decorator that checks for an Idempotency-Key header.
    If the key was seen before, returns the cached response.
    Otherwise executes the view and stores the result.
    """
    @wraps(view_func)
    def wrapper(self, request, *args, **kwargs):
        key = request.headers.get("Idempotency-Key", "")
        if not key:
            return view_func(self, request, *args, **kwargs)

        body_hash = _hash_body(request.body) if request.body else ""

        existing = IdempotencyRecord.objects.filter(key=key).first()
        if existing:
            if existing.request_body_hash and existing.request_body_hash != body_hash:
                return Response(
                    {"detail": "Idempotency-Key reused with different body."},
                    status=status.HTTP_409_CONFLICT,
                )
            try:
                cached = json.loads(existing.response_body)
            except (json.JSONDecodeError, ValueError):
                cached = {"detail": "Cached response unavailable."}
            return Response(cached, status=existing.response_status)

        response = view_func(self, request, *args, **kwargs)

        try:
            response_body = _serialize_response_data(response)
        except Exception:
            response_body = ""

        IdempotencyRecord.objects.create(
            key=key,
            user=request.user if request.user.is_authenticated else None,
            request_method=request.method,
            request_path=request.path,
            request_body_hash=body_hash,
            response_status=response.status_code,
            response_body=response_body,
        )

        return response

    return wrapper
