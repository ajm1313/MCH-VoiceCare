"""
Tests for the Prometheus metrics endpoint (spec §27.1).

Verifies that:
- /metrics endpoint returns Prometheus text format
- All required technical metrics are present (sync, telephony, packages, devices)
- All required clinical safety metrics are present (alerts, referrals, overrides)
- Metrics include proper # HELP and # TYPE annotations
- Endpoint is protected by authentication (token or session)
- No patient identifiers are exposed in metrics
- Region-labeled metrics are present
"""
from django.test import TestCase, RequestFactory, override_settings
from django.contrib.auth import get_user_model

from apps.organisations.models import OrganisationUnit
from apps.accounts.models import UserAccount
from apps.core.enums import SystemRole
from apps.core.api.prometheus_views import _collect_metrics, _format_metric

User = get_user_model()


class PrometheusMetricFormatTest(TestCase):
    """Tests for the Prometheus metric formatting helper."""

    def test_format_metric_without_labels(self):
        """Metric without labels should be formatted correctly."""
        result = _format_metric("test_metric", 42, help_text="Test metric")
        self.assertIn("# HELP test_metric Test metric", result)
        self.assertIn("# TYPE test_metric gauge", result)
        self.assertIn("test_metric 42", result)

    def test_format_metric_with_labels(self):
        """Metric with labels should include label values."""
        result = _format_metric(
            "test_metric", 10, labels={"region": "Northern"}
        )
        self.assertIn('test_metric{region="Northern"} 10', result)

    def test_format_metric_counter_type(self):
        """Counter metric type should be rendered correctly."""
        result = _format_metric("events_total", 5, metric_type="counter")
        self.assertIn("# TYPE events_total counter", result)


class PrometheusMetricsCollectionTest(TestCase):
    """Tests for the _collect_metrics function."""

    def setUp(self):
        self.org = OrganisationUnit.objects.create(
            name="Test Facility", code="PROM001", unit_type="FACILITY",
        )

    def test_collect_metrics_returns_text(self):
        """_collect_metrics should return a non-empty string."""
        metrics = _collect_metrics()
        self.assertIsInstance(metrics, str)
        self.assertTrue(len(metrics) > 0)

    def test_collect_metrics_includes_technical_metrics(self):
        """Metrics should include all technical monitoring metrics (§27.1)."""
        metrics = _collect_metrics()
        # Sync metrics
        self.assertIn("mch_sync_success_total", metrics)
        self.assertIn("mch_sync_failure_total", metrics)
        self.assertIn("mch_sync_success_rate", metrics)
        # Telephony
        self.assertIn("mch_telephony_failures_total", metrics)
        # Packages
        self.assertIn("mch_packages_active", metrics)
        self.assertIn("mch_packages_staged", metrics)
        self.assertIn("mch_packages_revoked", metrics)
        # Devices
        self.assertIn("mch_active_devices", metrics)
        self.assertIn("mch_device_last_sync_avg_hours", metrics)
        # Capabilities
        self.assertIn("mch_expired_capability_verifications", metrics)

    def test_collect_metrics_includes_clinical_safety_metrics(self):
        """Metrics should include all clinical safety monitoring metrics (§27.2)."""
        metrics = _collect_metrics()
        # Alerts
        self.assertIn("mch_emergency_alerts_24h", metrics)
        self.assertIn("mch_open_alerts", metrics)
        # Overrides
        self.assertIn("mch_clinician_overrides_7d", metrics)
        # Referrals
        self.assertIn("mch_open_referrals", metrics)
        self.assertIn("mch_emergency_referrals_open", metrics)
        self.assertIn("mch_accepted_referrals", metrics)
        self.assertIn("mch_referral_ack_delay_avg_minutes", metrics)
        # Transport
        self.assertIn("mch_transport_active", metrics)
        self.assertIn("mch_arrivals_24h", metrics)
        self.assertIn("mch_time_to_care_avg_hours", metrics)
        # False negatives
        self.assertIn("mch_false_negatives_7d", metrics)

    def test_collect_metrics_includes_help_and_type(self):
        """Each metric should have # HELP and # TYPE annotations."""
        metrics = _collect_metrics()
        self.assertIn("# HELP", metrics)
        self.assertIn("# TYPE", metrics)

    def test_collect_metrics_includes_system_info(self):
        """Metrics should include system info (ML mode, version)."""
        metrics = _collect_metrics()
        self.assertIn("mch_info", metrics)

    def test_collect_metrics_no_patient_identifiers(self):
        """Metrics MUST NOT contain patient identifiers (spec §27.2)."""
        metrics = _collect_metrics()
        # Should not contain any UUID-like patterns that could be patient IDs
        import re
        uuid_pattern = re.compile(
            r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
            re.IGNORECASE
        )
        # Filter out the mch_info line which may contain version but not UUIDs
        # The metrics should not contain patient UUIDs
        matches = uuid_pattern.findall(metrics)
        # mch_info might have a version label but not a UUID
        self.assertEqual(len(matches), 0,
                         f"Metrics contain potential UUIDs: {matches}")

    def test_collect_metrics_includes_region_labels(self):
        """Metrics should include region-labeled referral counts."""
        # Create a region org
        region = OrganisationUnit.objects.create(
            name="Test Region", code="REG001", unit_type="REGION",
        )
        metrics = _collect_metrics()
        self.assertIn("mch_referrals_by_region", metrics)


class PrometheusEndpointTest(TestCase):
    """Tests for the /metrics HTTP endpoint."""

    def setUp(self):
        self.factory = RequestFactory()
        self.org = OrganisationUnit.objects.create(
            name="Test Facility", code="PROM002", unit_type="FACILITY",
        )
        self.admin_user = UserAccount.objects.create_user(
            username="admin", password="testpass123",
            organisation_unit=self.org, system_role=SystemRole.SUPER_ADMIN,
            is_staff=True, is_super_admin=True,
        )

    def test_metrics_endpoint_requires_auth(self):
        """Unauthenticated request should return 403."""
        from django.test import Client
        client = Client()
        resp = client.get("/metrics")
        self.assertEqual(resp.status_code, 403)

    @override_settings(MONITORING_TOKEN="test-token-123")
    def test_metrics_endpoint_with_valid_token(self):
        """Request with valid monitoring token should return 200."""
        from django.test import Client
        client = Client()
        resp = client.get(
            "/metrics",
            HTTP_AUTHORIZATION="Bearer test-token-123",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn("text/plain", resp["Content-Type"])
        self.assertIn(b"mch_sync_success_total", resp.content)

    @override_settings(MONITORING_TOKEN="test-token-123")
    def test_metrics_endpoint_with_invalid_token(self):
        """Request with invalid monitoring token should return 403."""
        from django.test import Client
        client = Client()
        resp = client.get(
            "/metrics",
            HTTP_AUTHORIZATION="Bearer wrong-token",
        )
        self.assertEqual(resp.status_code, 403)

    @override_settings(MONITORING_TOKEN="test-token-123")
    def test_metrics_endpoint_no_token(self):
        """Request without token when token is configured should return 403."""
        from django.test import Client
        client = Client()
        resp = client.get("/metrics")
        self.assertEqual(resp.status_code, 403)

    def test_metrics_endpoint_with_admin_session(self):
        """Admin session auth should work when no token is configured."""
        from django.test import Client
        client = Client()
        client.login(username="admin", password="testpass123")
        resp = client.get("/metrics")
        self.assertEqual(resp.status_code, 200)
        self.assertIn(b"mch_", resp.content)

    @override_settings(MONITORING_TOKEN="test-token-123")
    def test_metrics_endpoint_api_path(self):
        """The /api/v1/monitoring/metrics path should also work."""
        from django.test import Client
        client = Client()
        resp = client.get(
            "/api/v1/monitoring/metrics",
            HTTP_AUTHORIZATION="Bearer test-token-123",
        )
        self.assertEqual(resp.status_code, 200)

    def test_metrics_content_type(self):
        """Response should have Prometheus content type."""
        from django.test import Client
        client = Client()
        client.login(username="admin", password="testpass123")
        resp = client.get("/metrics")
        self.assertIn("text/plain", resp["Content-Type"])
        self.assertIn("version=0.0.4", resp["Content-Type"])
