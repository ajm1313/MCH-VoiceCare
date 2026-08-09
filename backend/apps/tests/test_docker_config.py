"""
Tests for Docker Compose configuration (spec §29).

Verifies that the docker-compose.yml is valid and contains the expected
services for local development.
"""
import os
import pathlib
import unittest


class DockerComposeConfigTest(unittest.TestCase):
    """Tests for docker-compose.yml configuration."""

    PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[3]
    COMPOSE_FILE = PROJECT_ROOT / "docker-compose.yml"

    def setUp(self):
        try:
            import yaml  # type: ignore
        except ImportError:
            self.skipTest("PyYAML not installed — skipping Docker config tests")
        self.yaml = yaml

    def test_compose_file_exists(self):
        """docker-compose.yml should exist at project root."""
        self.assertTrue(self.COMPOSE_FILE.exists(), "docker-compose.yml not found")

    def test_compose_file_is_valid_yaml(self):
        """docker-compose.yml should be valid YAML."""
        with open(self.COMPOSE_FILE) as f:
            config = self.yaml.safe_load(f)
        self.assertIsInstance(config, dict)

    def test_compose_has_db_service(self):
        """docker-compose.yml should define a PostgreSQL db service."""
        with open(self.COMPOSE_FILE) as f:
            config = self.yaml.safe_load(f)
        services = config.get("services", {})
        self.assertIn("db", services)
        self.assertIn("postgres", services["db"]["image"])

    def test_compose_has_redis_service(self):
        """docker-compose.yml should define a Redis service."""
        with open(self.COMPOSE_FILE) as f:
            config = self.yaml.safe_load(f)
        services = config.get("services", {})
        self.assertIn("redis", services)
        self.assertIn("redis", services["redis"]["image"])

    def test_compose_has_backend_service(self):
        """docker-compose.yml should define a backend service."""
        with open(self.COMPOSE_FILE) as f:
            config = self.yaml.safe_load(f)
        services = config.get("services", {})
        self.assertIn("backend", services)

    def test_backend_depends_on_db(self):
        """Backend service should depend on db with health check."""
        with open(self.COMPOSE_FILE) as f:
            config = self.yaml.safe_load(f)
        backend = config["services"]["backend"]
        depends = backend.get("depends_on", {})
        self.assertIn("db", depends)
        self.assertEqual(depends["db"]["condition"], "service_healthy")

    def test_backend_exposes_port_8000(self):
        """Backend should expose port 8000."""
        with open(self.COMPOSE_FILE) as f:
            config = self.yaml.safe_load(f)
        backend = config["services"]["backend"]
        ports = backend.get("ports", [])
        self.assertTrue(any("8000" in str(p) for p in ports))

    def test_db_has_healthcheck(self):
        """DB service should have a healthcheck."""
        with open(self.COMPOSE_FILE) as f:
            config = self.yaml.safe_load(f)
        db = config["services"]["db"]
        self.assertIn("healthcheck", db)

    def test_db_has_persistent_volume(self):
        """DB should use a persistent volume."""
        with open(self.COMPOSE_FILE) as f:
            config = self.yaml.safe_load(f)
        db = config["services"]["db"]
        volumes = db.get("volumes", [])
        self.assertTrue(any("pgdata" in str(v) for v in volumes))

    def test_backend_has_database_url_env(self):
        """Backend should have DATABASE_URL pointing to the db service."""
        with open(self.COMPOSE_FILE) as f:
            config = self.yaml.safe_load(f)
        backend = config["services"]["backend"]
        env = backend.get("environment", {})
        db_url = env.get("DATABASE_URL", "")
        self.assertIn("db:5432", db_url)

    def test_dockerfile_dev_exists(self):
        """backend/Dockerfile.dev should exist."""
        dockerfile = self.PROJECT_ROOT / "backend" / "Dockerfile.dev"
        self.assertTrue(dockerfile.exists(), "Dockerfile.dev not found")

    def test_env_example_exists(self):
        """.env.example should exist at project root."""
        env_example = self.PROJECT_ROOT / ".env.example"
        self.assertTrue(env_example.exists(), ".env.example not found")

    def test_dockerignore_exists(self):
        """.dockerignore should exist at project root."""
        dockerignore = self.PROJECT_ROOT / ".dockerignore"
        self.assertTrue(dockerignore.exists(), ".dockerignore not found")
