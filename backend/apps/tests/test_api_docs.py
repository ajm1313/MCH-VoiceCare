"""
Tests for OpenAPI schema generation via drf-spectacular (spec §29).

Verifies:
- Schema endpoint returns 200 and valid OpenAPI 3 YAML
- Swagger UI endpoint returns 200 HTML
- ReDoc endpoint returns 200 HTML
- Schema contains expected tags and paths
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient


class OpenAPISchemaTest(TestCase):
    """Tests for the OpenAPI schema endpoints."""

    def setUp(self):
        self.client = APIClient()

    def test_schema_endpoint_returns_yaml(self):
        """GET /api/schema/ should return OpenAPI YAML."""
        resp = self.client.get("/api/schema/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("application/vnd.oai.openapi", resp["Content-Type"])
        # Should be valid YAML containing OpenAPI version
        content = resp.content.decode("utf-8")
        self.assertIn("openapi:", content)
        self.assertIn("MCH VoiceCare API", content)

    def test_swagger_ui_endpoint(self):
        """GET /api/schema/swagger/ should return HTML Swagger UI."""
        resp = self.client.get("/api/schema/swagger/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("text/html", resp["Content-Type"])
        content = resp.content.decode("utf-8")
        self.assertIn("swagger", content.lower())

    def test_redoc_endpoint(self):
        """GET /api/schema/redoc/ should return HTML ReDoc."""
        resp = self.client.get("/api/schema/redoc/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("text/html", resp["Content-Type"])
        content = resp.content.decode("utf-8")
        self.assertIn("redoc", content.lower())

    def test_schema_contains_api_paths(self):
        """Schema should contain key API paths."""
        resp = self.client.get("/api/schema/")
        content = resp.content.decode("utf-8")
        # Core API paths should appear
        self.assertIn("/api/v1/accounts/", content)
        self.assertIn("/api/v1/clients/", content)
        self.assertIn("/api/v1/referrals/", content)
        self.assertIn("/api/v1/pregnancy/", content)

    def test_schema_contains_tags(self):
        """Schema should contain organized tags."""
        resp = self.client.get("/api/schema/")
        content = resp.content.decode("utf-8")
        self.assertIn("auth", content)
        self.assertIn("referrals", content)
        self.assertIn("pregnancy", content)

    def test_schema_contains_security_schemes(self):
        """Schema should define JWT security scheme."""
        resp = self.client.get("/api/schema/")
        content = resp.content.decode("utf-8")
        # drf-spectacular names the JWT scheme
        self.assertIn("jwtAuth", content)

    def test_schema_version(self):
        """Schema should report version 1.0.0."""
        resp = self.client.get("/api/schema/")
        content = resp.content.decode("utf-8")
        self.assertIn("1.0.0", content)

    def test_schema_reverse_url(self):
        """reverse('schema') should resolve to /api/schema/."""
        url = reverse("schema")
        self.assertEqual(url, "/api/schema/")

    def test_swagger_reverse_url(self):
        """reverse('swagger-ui') should resolve correctly."""
        url = reverse("swagger-ui")
        self.assertEqual(url, "/api/schema/swagger/")

    def test_redoc_reverse_url(self):
        """reverse('redoc') should resolve correctly."""
        url = reverse("redoc")
        self.assertEqual(url, "/api/schema/redoc/")
