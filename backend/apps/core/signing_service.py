"""
Package signature verification service (spec §4.2, §24).

Verifies Ed25519 signatures on clinical rule bundles, ML model packages,
and configuration packages. Uses the `cryptography` library for Ed25519.

The Android/app client MUST verify bundle signature and hashes before
activation (spec §4.2). This service provides the server-side verification
used during package activation, and the mobile app replicates the same
verification locally using the public keys distributed via the bootstrap API.
"""
import base64
import hashlib
import json

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from apps.core.signing_models import SigningKey


def compute_sha256(payload: bytes | str) -> str:
    """Compute the SHA-256 hex digest of a payload."""
    if isinstance(payload, str):
        payload = payload.encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def canonicalize_payload(payload: dict | list) -> bytes:
    """
    Canonical JSON serialization for signature verification.

    Uses sorted keys and no extra whitespace so that the same logical
    payload always produces the same bytes on both server and client.
    """
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")


def verify_package_signature(
    payload: dict | list,
    signature_base64: str,
    signing_key_id: str,
    expected_sha256: str | None = None,
) -> bool:
    """
    Verify an Ed25519 signature on a package payload (spec §4.2).

    Args:
        payload: The package payload (dict or list) that was signed.
        signature_base64: Base64-encoded Ed25519 signature.
        signing_key_id: The key_id of the signing key to use.
        expected_sha256: If provided, also verify the payload SHA-256 matches.

    Returns:
        True if the signature (and hash, if provided) is valid.
        False if the key is not found, revoked, or the signature is invalid.
    """
    key = SigningKey.get_active_key(signing_key_id)
    if not key:
        return False

    try:
        public_key_bytes = base64.b64decode(key.public_key_base64)
        signature_bytes = base64.b64decode(signature_base64)
        ed25519_pub = Ed25519PublicKey.from_public_bytes(public_key_bytes)
        canonical = canonicalize_payload(payload)
        ed25519_pub.verify(signature_bytes, canonical)
    except (InvalidSignature, ValueError, Exception):
        return False

    # Also verify SHA-256 if an expected hash is provided
    if expected_sha256:
        actual_hash = compute_sha256(canonical)
        if actual_hash != expected_sha256.lower():
            return False

    return True


def get_verification_public_keys() -> list[dict]:
    """
    Return all active signing keys for distribution to mobile clients.

    The mobile app uses these to verify downloaded packages locally.
    """
    keys = SigningKey.objects.filter(status="ACTIVE")
    return [
        {
            "keyId": k.key_id,
            "algorithm": k.algorithm,
            "publicKeyBase64": k.public_key_base64,
        }
        for k in keys
    ]
