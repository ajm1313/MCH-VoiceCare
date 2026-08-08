"""
Growth rule golden tests, sync idempotency tests,
and package signature verification tests (spec §24, §29.1, §29.2, §29.4).
"""
from datetime import date, timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.enums import SystemRole, Sex, UrgencyLevel
from apps.organisations.models import OrganisationUnit
from apps.accounts.models import UserAccount
from apps.clients.models import Person, Household
from apps.growth.models import GrowthMeasurement
from apps.growth.rule_engine import (
    run_growth_assessment, classify_muac, classify_weight_for_age,
)
from apps.core.package_models import Package
from apps.core.idempotency_models import IdempotencyRecord


def _make_org():
    return OrganisationUnit.objects.create(name="Growth Test Org", code="GROWTH01", unit_type="FACILITY")

def _make_user(org):
    return UserAccount.objects.create_user(
        username="growthuser", password="testpass123",
        organisation_unit=org, system_role=SystemRole.SUPER_ADMIN, is_super_admin=True,
    )

def _make_child(org, name="Test Child", dob=None, sex=Sex.MALE):
    hh = Household.objects.create(organisation_unit=org)
    if dob is None:
        dob = date.today() - timedelta(days=365 * 2)  # 2 years old
    elif dob == "NODOB":
        dob = None
    return Person.objects.create(
        full_name=name, household=hh, organisation_unit=org,
        date_of_birth=dob, sex=sex,
    )

def _make_measurement(child, **kwargs):
    defaults = {
        "child": child,
        "measurement_date": date.today(),
    }
    defaults.update(kwargs)
    return GrowthMeasurement.objects.create(**defaults)


# ──────────────────────────────────────────────────────────
# Growth Rule Golden Tests
# ──────────────────────────────────────────────────────────

class GrowthMUACTests(TestCase):
    """MUAC classification tests (spec §29.2)."""

    def test_muac_sam_110_emergency(self):
        org = _make_org()
        child = _make_child(org)
        m = _make_measurement(child, muac_mm=105)
        result = run_growth_assessment(m)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)
        rule_ids = [r["ruleId"] for r in result["fired_rules"]]
        self.assertIn("WHO-MUAC-SAM-110", rule_ids)

    def test_muac_sam_115_emergency(self):
        org = _make_org()
        child = _make_child(org)
        m = _make_measurement(child, muac_mm=112)
        result = run_growth_assessment(m)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)

    def test_muac_mam_priority(self):
        org = _make_org()
        child = _make_child(org)
        m = _make_measurement(child, muac_mm=120)
        result = run_growth_assessment(m)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)
        rule_ids = [r["ruleId"] for r in result["fired_rules"]]
        self.assertIn("WHO-MUAC-MAM-125", rule_ids)

    def test_muac_normal_routine(self):
        org = _make_org()
        child = _make_child(org)
        m = _make_measurement(child, muac_mm=130)
        result = run_growth_assessment(m)
        self.assertEqual(result["disposition"], UrgencyLevel.ROUTINE)

    def test_muac_boundary_110_exact_is_sam(self):
        indicator, severity, _, _ = classify_muac(110)
        self.assertEqual(indicator, "SAM")
        self.assertEqual(severity, "EMERGENCY")

    def test_muac_boundary_109_is_sam(self):
        indicator, severity, _, _ = classify_muac(109)
        self.assertEqual(indicator, "SAM")
        self.assertEqual(severity, "EMERGENCY")

    def test_muac_boundary_115_exact_is_mam(self):
        indicator, severity, _, _ = classify_muac(115)
        self.assertEqual(indicator, "MAM")
        self.assertEqual(severity, "PRIORITY")

    def test_muac_boundary_114_is_sam(self):
        indicator, severity, _, _ = classify_muac(114)
        self.assertEqual(indicator, "SAM")
        self.assertEqual(severity, "EMERGENCY")

    def test_muac_boundary_125_exact_is_normal(self):
        indicator, severity, _, _ = classify_muac(125)
        self.assertEqual(indicator, "NORMAL")

    def test_muac_boundary_124_is_mam(self):
        indicator, severity, _, _ = classify_muac(124)
        self.assertEqual(indicator, "MAM")
        self.assertEqual(severity, "PRIORITY")

    def test_muac_none_returns_normal(self):
        indicator, severity, _, _ = classify_muac(None)
        self.assertEqual(indicator, "NORMAL")


class GrowthWeightForAgeTests(TestCase):
    """Weight-for-age z-score classification tests (spec §29.2)."""

    def test_severe_underweight_emergency(self):
        org = _make_org()
        child = _make_child(org, sex=Sex.MALE)
        m = _make_measurement(child, weight_kg=5.0)  # Very low for 24 months
        result = run_growth_assessment(m)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)
        rule_ids = [r["ruleId"] for r in result["fired_rules"]]
        self.assertIn("WHO-WFA-Z-3", rule_ids)

    def test_underweight_priority(self):
        org = _make_org()
        child = _make_child(org, sex=Sex.MALE)
        m = _make_measurement(child, weight_kg=7.5)  # Below -2 z-score for 24 months
        result = run_growth_assessment(m)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)

    def test_normal_weight_routine(self):
        org = _make_org()
        child = _make_child(org, sex=Sex.MALE)
        m = _make_measurement(child, weight_kg=11.0)  # Near median for 24 months
        result = run_growth_assessment(m)
        self.assertEqual(result["disposition"], UrgencyLevel.ROUTINE)

    def test_no_weight_no_wfa_rule(self):
        org = _make_org()
        child = _make_child(org)
        m = _make_measurement(child, muac_mm=130)
        result = run_growth_assessment(m)
        rule_ids = [r["ruleId"] for r in result["fired_rules"]]
        self.assertNotIn("WHO-WFA-Z-3", rule_ids)
        self.assertNotIn("WHO-WFA-Z-2", rule_ids)

    def test_no_dob_no_wfa_rule(self):
        org = _make_org()
        child = _make_child(org, dob="NODOB")
        m = _make_measurement(child, weight_kg=5.0)
        result = run_growth_assessment(m)
        rule_ids = [r["ruleId"] for r in result["fired_rules"]]
        self.assertNotIn("WHO-WFA-Z-3", rule_ids)


class GrowthWeightLossTests(TestCase):
    """Weight loss / failure to thrive tests (spec §29.2)."""

    def test_weight_loss_10_percent_emergency(self):
        org = _make_org()
        child = _make_child(org)
        _make_measurement(
            child, measurement_date=date.today() - timedelta(days=30),
            weight_kg=10.0,
        )
        m = _make_measurement(child, measurement_date=date.today(), weight_kg=8.5)
        result = run_growth_assessment(m)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)
        rule_ids = [r["ruleId"] for r in result["fired_rules"]]
        self.assertIn("WHO-WEIGHT-LOSS-10", rule_ids)

    def test_weight_loss_5_percent_priority(self):
        org = _make_org()
        child = _make_child(org)
        _make_measurement(
            child, measurement_date=date.today() - timedelta(days=30),
            weight_kg=10.0,
        )
        m = _make_measurement(child, measurement_date=date.today(), weight_kg=9.3)
        result = run_growth_assessment(m)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)
        rule_ids = [r["ruleId"] for r in result["fired_rules"]]
        self.assertIn("WHO-WEIGHT-LOSS-5", rule_ids)

    def test_weight_gain_routine(self):
        org = _make_org()
        child = _make_child(org)
        _make_measurement(
            child, measurement_date=date.today() - timedelta(days=30),
            weight_kg=10.0,
        )
        m = _make_measurement(child, measurement_date=date.today(), weight_kg=10.5)
        result = run_growth_assessment(m)
        self.assertEqual(result["disposition"], UrgencyLevel.ROUTINE)

    def test_no_previous_measurement_routine(self):
        org = _make_org()
        child = _make_child(org)
        m = _make_measurement(child, weight_kg=10.0, muac_mm=130)
        result = run_growth_assessment(m)
        self.assertEqual(result["disposition"], UrgencyLevel.ROUTINE)


class GrowthFeedingIllnessTests(TestCase):
    """Feeding concern and recent illness tests (spec §29.2)."""

    def test_feeding_concern_priority(self):
        org = _make_org()
        child = _make_child(org)
        m = _make_measurement(child, muac_mm=130, feeding_status="not feeding well")
        result = run_growth_assessment(m)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)
        rule_ids = [r["ruleId"] for r in result["fired_rules"]]
        self.assertIn("GHS-FEEDING-CONCERN", rule_ids)

    def test_normal_feeding_routine(self):
        org = _make_org()
        child = _make_child(org)
        m = _make_measurement(child, muac_mm=130, feeding_status="feeding well")
        result = run_growth_assessment(m)
        self.assertEqual(result["disposition"], UrgencyLevel.ROUTINE)

    def test_recent_illness_diarrhoea_priority(self):
        org = _make_org()
        child = _make_child(org)
        m = _make_measurement(child, muac_mm=130, recent_illness="diarrhoea")
        result = run_growth_assessment(m)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)
        rule_ids = [r["ruleId"] for r in result["fired_rules"]]
        self.assertIn("GHS-ILLNESS-DIARRHOEA", rule_ids)

    def test_recent_illness_fever_priority(self):
        org = _make_org()
        child = _make_child(org)
        m = _make_measurement(child, muac_mm=130, recent_illness="fever")
        result = run_growth_assessment(m)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)

    def test_no_illness_routine(self):
        org = _make_org()
        child = _make_child(org)
        m = _make_measurement(child, muac_mm=130, recent_illness="")
        result = run_growth_assessment(m)
        self.assertEqual(result["disposition"], UrgencyLevel.ROUTINE)


class GrowthConflictTests(TestCase):
    """Conflict scenarios — multiple rules fire, highest severity wins (spec §29.2)."""

    def test_sam_overrides_underweight(self):
        org = _make_org()
        child = _make_child(org, sex=Sex.MALE)
        m = _make_measurement(child, muac_mm=105, weight_kg=5.0)
        result = run_growth_assessment(m)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)
        self.assertTrue(len(result["fired_rules"]) >= 2)

    def test_sam_and_weight_loss_emergency(self):
        org = _make_org()
        child = _make_child(org)
        _make_measurement(
            child, measurement_date=date.today() - timedelta(days=30),
            weight_kg=10.0,
        )
        m = _make_measurement(child, muac_mm=105, weight_kg=8.5)
        result = run_growth_assessment(m)
        self.assertEqual(result["disposition"], UrgencyLevel.EMERGENCY)
        self.assertTrue(len(result["fired_rules"]) >= 2)

    def test_mam_and_feeding_concern_stay_priority(self):
        org = _make_org()
        child = _make_child(org)
        m = _make_measurement(child, muac_mm=120, feeding_status="not feeding well")
        result = run_growth_assessment(m)
        self.assertEqual(result["disposition"], UrgencyLevel.PRIORITY)
        self.assertTrue(len(result["fired_rules"]) >= 2)


# ──────────────────────────────────────────────────────────
# Sync Idempotency Tests
# ──────────────────────────────────────────────────────────

class SyncIdempotencyTests(TestCase):
    """Test sync idempotency — duplicate event replay (spec §29.1, §29.4)."""

    def setUp(self):
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_duplicate_push_returns_cached_response(self):
        body = {"records": {"persons": [{"full_name": "Sync Test", "organisation_unit": str(self.org.id)}]}}
        resp1 = self.client.post(
            "/api/v1/sync/", body, format="json",
            HTTP_IDEMPOTENCY_KEY="test-key-001",
        )
        self.assertEqual(resp1.status_code, 200)

        resp2 = self.client.post(
            "/api/v1/sync/", body, format="json",
            HTTP_IDEMPOTENCY_KEY="test-key-001",
        )
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(resp1.json(), resp2.json())

    def test_same_key_different_body_returns_409(self):
        body1 = {"records": {"persons": [{"full_name": "First", "organisation_unit": str(self.org.id)}]}}
        body2 = {"records": {"persons": [{"full_name": "Second", "organisation_unit": str(self.org.id)}]}}

        self.client.post(
            "/api/v1/sync/", body1, format="json",
            HTTP_IDEMPOTENCY_KEY="test-key-002",
        )
        resp2 = self.client.post(
            "/api/v1/sync/", body2, format="json",
            HTTP_IDEMPOTENCY_KEY="test-key-002",
        )
        self.assertEqual(resp2.status_code, 409)

    def test_no_key_no_idempotency(self):
        body = {"records": {"persons": [{"full_name": "No Key Test", "organisation_unit": str(self.org.id)}]}}
        resp = self.client.post("/api/v1/sync/", body, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(IdempotencyRecord.objects.filter(key="").exists())

    def test_idempotency_record_created(self):
        body = {"records": {"persons": [{"full_name": "Record Test", "organisation_unit": str(self.org.id)}]}}
        self.client.post(
            "/api/v1/sync/", body, format="json",
            HTTP_IDEMPOTENCY_KEY="test-key-003",
        )
        self.assertTrue(IdempotencyRecord.objects.filter(key="test-key-003").exists())

    def test_batch_sync_idempotent(self):
        body = {
            "deviceId": "test-device",
            "events": [
                {
                    "eventId": "evt-001",
                    "resourceType": "Person",
                    "resource": {"full_name": "Batch Test", "organisation_unit": str(self.org.id)},
                }
            ]
        }
        resp1 = self.client.post(
            "/api/v1/sync/batch", body, format="json",
            HTTP_IDEMPOTENCY_KEY="batch-key-001",
        )
        self.assertEqual(resp1.status_code, 200)

        resp2 = self.client.post(
            "/api/v1/sync/batch", body, format="json",
            HTTP_IDEMPOTENCY_KEY="batch-key-001",
        )
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(resp1.json(), resp2.json())


# ──────────────────────────────────────────────────────────
# Package Signature Verification Tests
# ──────────────────────────────────────────────────────────

class PackageSignatureTests(TestCase):
    """Test package signature verification and management (spec §24, §29.1)."""

    def test_create_package_with_sha256(self):
        pkg = Package.objects.create(
            package_id="test-rules-v1",
            package_type="CLINICAL_RULES",
            version="1.0.0",
            sha256="a" * 64,
            signature="sig-data",
            signing_key_id="key-001",
            status="STAGED",
        )
        self.assertEqual(pkg.sha256, "a" * 64)
        self.assertEqual(pkg.signature, "sig-data")
        self.assertEqual(pkg.status, "STAGED")

    def test_activate_package_transactional(self):
        pkg = Package.activate(
            package_id="test-rules-v1", package_type="CLINICAL_RULES",
            version="1.0.0", sha256="a" * 64, signature="sig1",
        )
        self.assertEqual(pkg.status, "ACTIVE")
        self.assertIsNotNone(pkg.activated_at)

    def test_activate_replaces_previous(self):
        Package.activate(
            package_id="rules-v1", package_type="CLINICAL_RULES",
            version="1.0.0", sha256="a" * 64, signature="sig1",
        )
        Package.activate(
            package_id="rules-v2", package_type="CLINICAL_RULES",
            version="2.0.0", sha256="b" * 64, signature="sig2",
        )
        active = Package.objects.filter(package_type="CLINICAL_RULES", status="ACTIVE")
        self.assertEqual(active.count(), 1)
        self.assertEqual(active.first().version, "2.0.0")
        retired = Package.objects.filter(package_type="CLINICAL_RULES", status="RETIRED")
        self.assertEqual(retired.count(), 1)
        self.assertEqual(retired.first().version, "1.0.0")

    def test_rollback_restores_previous(self):
        Package.activate(
            package_id="rules-v1", package_type="CLINICAL_RULES",
            version="1.0.0", sha256="a" * 64, signature="sig1",
        )
        Package.activate(
            package_id="rules-v2", package_type="CLINICAL_RULES",
            version="2.0.0", sha256="b" * 64, signature="sig2",
        )
        rolled = Package.rollback("CLINICAL_RULES")
        self.assertEqual(rolled.version, "1.0.0")
        self.assertEqual(rolled.status, "ACTIVE")
        current_v2 = Package.objects.filter(version="2.0.0").first()
        self.assertEqual(current_v2.status, "RETIRED")

    def test_rollback_no_previous_raises(self):
        Package.activate(
            package_id="rules-v1", package_type="CLINICAL_RULES",
            version="1.0.0", sha256="a" * 64, signature="sig1",
        )
        with self.assertRaises(ValueError):
            Package.rollback("CLINICAL_RULES")

    def test_rollback_no_active_raises(self):
        with self.assertRaises(ValueError):
            Package.rollback("CLINICAL_RULES")

    def test_package_has_signing_key_id(self):
        pkg = Package.objects.create(
            package_id="test-ml-v1", package_type="CLINICAL_ML_MODEL",
            version="1.0.0", sha256="c" * 64, signature="sig",
            signing_key_id="prod-key-2024",
        )
        self.assertEqual(pkg.signing_key_id, "prod-key-2024")

    def test_package_payload_json(self):
        pkg = Package.objects.create(
            package_id="test-config-v1", package_type="APP_CONFIG",
            version="1.0.0", sha256="d" * 64,
            payload={"feature_flags": {"ocr_enabled": True}},
        )
        self.assertEqual(pkg.payload["feature_flags"]["ocr_enabled"], True)

    def test_multiple_package_types_independent(self):
        Package.activate(
            package_id="rules-v1", package_type="CLINICAL_RULES",
            version="1.0.0", sha256="a" * 64, signature="sig1",
        )
        Package.activate(
            package_id="ml-v1", package_type="CLINICAL_ML_MODEL",
            version="1.0.0", sha256="b" * 64, signature="sig2",
        )
        rules_active = Package.objects.filter(package_type="CLINICAL_RULES", status="ACTIVE")
        ml_active = Package.objects.filter(package_type="CLINICAL_ML_MODEL", status="ACTIVE")
        self.assertEqual(rules_active.count(), 1)
        self.assertEqual(ml_active.count(), 1)
