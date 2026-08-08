"""
MFA API endpoints (spec §22).

POST /api/v1/accounts/mfa/setup      — generate TOTP secret + recovery codes
POST /api/v1/accounts/mfa/verify     — verify TOTP code and enable MFA
POST /api/v1/accounts/mfa/disable    — disable MFA
GET  /api/v1/accounts/mfa/status     — check MFA status
POST /api/v1/accounts/mfa/recovery   — verify a recovery code
"""
import base64

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.mfa_models import (
    MFAFactor, is_privileged_role, user_has_mfa_enabled, mfa_required_for_user,
)
from apps.audit.services import log_audit


class MFASetupView(APIView):
    """
    POST /api/v1/accounts/mfa/setup — generate TOTP secret (spec §22).

    Returns the secret and a QR code URI for authenticator apps.
    Recovery codes are also generated and returned once.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # Check if user already has an enabled MFA factor
        if user_has_mfa_enabled(request.user):
            return Response({"error": "MFA is already enabled. Disable it first to re-setup."},
                          status=status.HTTP_400_BAD_REQUEST)

        # Generate new secret and recovery codes
        secret = MFAFactor.generate_secret()
        recovery_codes = MFAFactor.generate_recovery_codes()

        # Create the MFA factor (not yet enabled)
        factor = MFAFactor.objects.create(
            user=request.user,
            secret=secret,
            enabled=False,
        )
        factor.set_recovery_codes(recovery_codes)

        # Build otpauth URI for QR code
        issuer = "MCH-VoiceCare"
        label = f"{issuer}:{request.user.username}"
        otpauth_uri = (
            f"otpauth://totp/{label}?secret={secret}&issuer={issuer}"
            f"&algorithm=SHA1&digits=6&period=30"
        )

        log_audit(
            actor=request.user.username,
            action="MFA_SETUP_INITIATED",
            actor_role=request.user.system_role,
            purpose="ACCOUNT_SECURITY",
            metadata={"factorId": str(factor.id)},
        )

        return Response({
            "factorId": str(factor.id),
            "secret": secret,
            "otpauthUri": otpauth_uri,
            "recoveryCodes": recovery_codes,  # Only shown once
            "message": "Scan the QR code in your authenticator app, then verify with /mfa/verify",
        })


class MFAVerifyView(APIView):
    """
    POST /api/v1/accounts/mfa/verify — verify TOTP code and enable MFA (spec §22).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        code = request.data.get("code", "")
        factor_id = request.data.get("factorId", "")

        factor = MFAFactor.objects.filter(id=factor_id, user=request.user, enabled=False).first()
        if not factor:
            return Response({"error": "MFA factor not found or already enabled"},
                          status=status.HTTP_404_NOT_FOUND)

        if factor.verify_totp(code):
            factor.enable()
            log_audit(
                actor=request.user.username,
                action="MFA_ENABLED",
                actor_role=request.user.system_role,
                purpose="ACCOUNT_SECURITY",
                metadata={"factorId": str(factor.id)},
            )
            return Response({"status": "enabled", "message": "MFA has been enabled successfully."})
        else:
            return Response({"error": "Invalid TOTP code"},
                          status=status.HTTP_400_BAD_REQUEST)


class MFADisableView(APIView):
    """POST /api/v1/accounts/mfa/disable — disable MFA (spec §22)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        code = request.data.get("code", "")
        password = request.data.get("password", "")

        # Require either TOTP code or password to disable
        if not code and not password:
            return Response({"error": "Provide TOTP code or password to disable MFA"},
                          status=status.HTTP_400_BAD_REQUEST)

        factor = request.user.mfa_factors.filter(enabled=True).first()
        if not factor:
            return Response({"error": "MFA is not enabled"},
                          status=status.HTTP_400_BAD_REQUEST)

        verified = False
        if code and factor.verify_totp(code):
            verified = True
        elif password and request.user.check_password(password):
            verified = True

        if verified:
            factor.disable()
            log_audit(
                actor=request.user.username,
                action="MFA_DISABLED",
                actor_role=request.user.system_role,
                purpose="ACCOUNT_SECURITY",
            )
            return Response({"status": "disabled"})
        else:
            return Response({"error": "Verification failed"},
                          status=status.HTTP_400_BAD_REQUEST)


class MFAStatusView(APIView):
    """GET /api/v1/accounts/mfa/status — check MFA status (spec §22)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        enabled = user_has_mfa_enabled(request.user)
        required = mfa_required_for_user(request.user)

        return Response({
            "enabled": enabled,
            "required": required,
            "isPrivilegedRole": is_privileged_role(request.user.system_role),
            "message": "MFA is required for your role but not yet enabled." if required else None,
        })


class MFARecoveryView(APIView):
    """POST /api/v1/accounts/mfa/recovery — verify a recovery code (spec §22)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        code = request.data.get("recoveryCode", "")

        factor = request.user.mfa_factors.filter(enabled=True).first()
        if not factor:
            return Response({"error": "MFA is not enabled"},
                          status=status.HTTP_400_BAD_REQUEST)

        if factor.verify_recovery_code(code):
            log_audit(
                actor=request.user.username,
                action="MFA_RECOVERY_CODE_USED",
                actor_role=request.user.system_role,
                purpose="ACCOUNT_SECURITY",
            )
            return Response({"status": "verified", "message": "Recovery code accepted."})
        else:
            return Response({"error": "Invalid recovery code"},
                          status=status.HTTP_400_BAD_REQUEST)
