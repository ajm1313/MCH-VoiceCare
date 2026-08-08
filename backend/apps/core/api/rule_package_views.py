"""
Rule and model package endpoints (spec §20.2).

- GET /api/v1/packages/rules/latest — active rule bundle metadata
- GET /api/v1/packages/models/latest — active ML model metadata
"""
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.config_models import SystemConfig
from apps.core.package_models import Package


class RulePackageLatestView(APIView):
    """Return the active rule bundle metadata."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        config = SystemConfig.get_config()
        active_version = config.active_rule_bundle_version

        # Try to get from Package model for richer metadata
        pkg = Package.objects.filter(
            package_type="CLINICAL_RULES", status="ACTIVE"
        ).first()

        return Response({
            "bundleId": active_version,
            "version": active_version,
            "status": "ACTIVE",
            "sha256": pkg.sha256 if pkg else "",
            "signature": pkg.signature if pkg else "",
            "signingKeyId": pkg.signing_key_id if pkg else "",
            "minimumAppVersion": pkg.minimum_app_version if pkg else "",
            "payload": pkg.payload if pkg else {},
            "ruleSets": [
                {
                    "name": "pregnancy",
                    "ruleSetVersion": "ghs-smp-2016-v1",
                    "sourceTitle": "Ghana Health Service Safe Motherhood Protocol",
                    "sourceVersion": "2016",
                },
                {
                    "name": "newborn",
                    "ruleSetVersion": "who-newborn-2017-v1",
                    "sourceTitle": "WHO Pocket Book of Hospital Care for Newborns",
                    "sourceVersion": "2017",
                },
                {
                    "name": "growth",
                    "ruleSetVersion": "who-growth-2006-v1",
                    "sourceTitle": "WHO Child Growth Standards",
                    "sourceVersion": "2006",
                },
                {
                    "name": "immunisation",
                    "ruleSetVersion": "ghana-epi-v1",
                    "sourceTitle": "Ghana EPI Immunisation Schedule",
                    "sourceVersion": "v1",
                },
                {
                    "name": "referral",
                    "ruleSetVersion": "ghs-referral-v1",
                    "sourceTitle": "GHS Referral Urgency Classification",
                    "sourceVersion": "v1",
                },
            ],
            "clinicalMlMode": config.clinical_ml_mode,
        })


class ModelPackageLatestView(APIView):
    """Return the active clinical ML model metadata (spec §20.2)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        config = SystemConfig.get_config()

        # Try to get active ML model package
        pkg = Package.objects.filter(
            package_type="CLINICAL_ML_MODEL", status="ACTIVE"
        ).first()

        # Also check engagement model
        eng_pkg = Package.objects.filter(
            package_type="ENGAGEMENT_MODEL", status="ACTIVE"
        ).first()

        return Response({
            "clinicalMlMode": config.clinical_ml_mode,
            "clinicalMlModel": {
                "packageId": pkg.package_id if pkg else "",
                "version": pkg.version if pkg else "",
                "sha256": pkg.sha256 if pkg else "",
                "minimumAppVersion": pkg.minimum_app_version if pkg else "",
                "status": "ACTIVE" if pkg else "NOT_AVAILABLE",
            } if pkg else None,
            "engagementModel": {
                "packageId": eng_pkg.package_id if eng_pkg else "",
                "version": eng_pkg.version if eng_pkg else "",
                "sha256": eng_pkg.sha256 if eng_pkg else "",
                "status": "ACTIVE" if eng_pkg else "NOT_AVAILABLE",
            } if eng_pkg else None,
            "engagementModelEnabled": config.engagement_model_enabled,
            "ocrEnabled": config.ocr_enabled,
        })
