"""
Database restore management command (spec §29.3).

Downloads the latest backup from S3-compatible storage and restores the
PostgreSQL database. Requires the --confirm flag to prevent accidental
execution.

Usage:
    python manage.py restore_db --confirm
    python manage.py restore_db --confirm --bucket my-backup-bucket
    python manage.py restore_db --confirm --file db_backups/specific_backup.sql.gz
"""
import gzip
import os
import subprocess
import tempfile

from django.conf import settings
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.audit.services import log_audit
from apps.core.management.commands.backup_db import BACKUP_PREFIX


class Command(BaseCommand):
    help = (
        "Download the latest backup from S3 and restore the PostgreSQL database. "
        "Requires --confirm to prevent accidental execution (spec §29.3)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--confirm",
            action="store_true",
            help="Required flag to confirm the restore operation.",
        )
        parser.add_argument(
            "--bucket",
            default="",
            help="S3 bucket name (overrides S3_BACKUP_BUCKET env var).",
        )
        parser.add_argument(
            "--file",
            default="",
            help="Specific backup file path to restore (instead of latest).",
        )

    def handle(self, *args, **options):
        if not options["confirm"]:
            raise CommandError(
                "Database restore requires --confirm flag to prevent accidental execution. "
                "Run: python manage.py restore_db --confirm"
            )

        bucket = options["bucket"] or os.environ.get("S3_BACKUP_BUCKET", "")
        specific_file = options["file"]

        db_settings = settings.DATABASES["default"]
        db_engine = db_settings.get("ENGINE", "")
        db_name = db_settings.get("NAME", "")
        db_user = db_settings.get("USER", "")
        db_host = db_settings.get("HOST", "")
        db_port = db_settings.get("PORT", "")
        db_password = db_settings.get("PASSWORD", "")

        # ── Find and download the backup ──
        if specific_file:
            remote_path = specific_file
        else:
            remote_path = self._find_latest_backup(bucket)

        if not remote_path:
            raise CommandError("No backup file found to restore.")

        self.stdout.write(f"Downloading backup: {remote_path}")
        backup_data = self._download_backup(remote_path, bucket)

        # Decompress
        if remote_path.endswith(".gz"):
            sql_data = gzip.decompress(backup_data)
        else:
            sql_data = backup_data

        self.stdout.write(
            self.style.SUCCESS(
                f"Backup downloaded ({len(sql_data)} bytes uncompressed)"
            )
        )

        # ── Restore the database ──
        if "postgresql" in db_engine or "psycopg" in db_engine:
            self._restore_postgres(
                sql_data, db_name, db_user, db_host, db_port, db_password,
            )
        elif "sqlite" in db_engine:
            self._restore_sqlite(sql_data, db_name)
        else:
            raise CommandError(f"Unsupported database engine for restore: {db_engine}")

        # ── Log to audit trail ──
        log_audit(
            actor="system",
            action="DB_RESTORE_COMPLETED",
            actor_role="SYSTEM",
            entity_type="DatabaseRestore",
            entity_id=os.path.basename(remote_path),
            purpose="ADMIN",
            metadata={
                "source_file": remote_path,
                "size_bytes": len(sql_data),
                "bucket": bucket or "local",
            },
        )

        self.stdout.write(
            self.style.SUCCESS("Database restore completed and logged to audit trail.")
        )

    def _find_latest_backup(self, bucket):
        """Find the most recent backup file in storage."""
        if bucket:
            try:
                import boto3
            except ImportError:
                raise CommandError("boto3 not installed — cannot list S3 backups.")

            s3 = boto3.client("s3")
            list_response = s3.list_objects_v2(
                Bucket=bucket, Prefix=BACKUP_PREFIX,
            )
            objects = list_response.get("Contents", [])
            if not objects:
                return None
            # Sort by last modified descending
            objects.sort(key=lambda o: o.get("LastModified"), reverse=True)
            return objects[0]["Key"]
        else:
            # Local storage
            try:
                dirs, files = default_storage.listdir(BACKUP_PREFIX.rstrip("/"))
            except (FileNotFoundError, OSError):
                return None

            if not files:
                return None

            # Sort by name descending (filenames include timestamps)
            files.sort(reverse=True)
            return f"{BACKUP_PREFIX}{files[0]}"

    def _download_backup(self, remote_path, bucket):
        """Download backup from S3 or local storage."""
        if bucket:
            try:
                import boto3
            except ImportError:
                raise CommandError("boto3 not installed — cannot download from S3.")

            s3 = boto3.client("s3")
            response = s3.get_object(Bucket=bucket, Key=remote_path)
            return response["Body"].read()
        else:
            return default_storage.open(remote_path, "rb").read()

    def _restore_postgres(self, sql_data, db_name, db_user, db_host, db_port, db_password):
        """Restore PostgreSQL database from SQL dump."""
        env = os.environ.copy()
        if db_password:
            env["PGPASSWORD"] = db_password

        cmd = ["psql"]
        if db_host:
            cmd.extend(["--host", db_host])
        if db_port:
            cmd.extend(["--port", str(db_port)])
        if db_user:
            cmd.extend(["--username", db_user])
        if db_name:
            cmd.append("--dbname")
            cmd.append(db_name)
        cmd.append("--quiet")
        cmd.append("--no-psqlrc")

        try:
            result = subprocess.run(
                cmd, input=sql_data, capture_output=True, env=env, timeout=900,
            )
        except FileNotFoundError:
            raise CommandError("psql not found — cannot restore PostgreSQL database.")
        except subprocess.TimeoutExpired:
            raise CommandError("psql restore timed out after 900 seconds.")

        if result.returncode != 0:
            stderr = result.stderr.decode("utf-8", errors="replace")
            raise CommandError(f"psql restore failed: {stderr}")

    def _restore_sqlite(self, sql_data, db_name):
        """Restore SQLite database from SQL dump."""
        if not db_name:
            raise CommandError("SQLite database path not configured.")

        # Write SQL to a temp file and pipe to sqlite3
        with tempfile.NamedTemporaryFile(suffix=".sql", delete=False) as f:
            f.write(sql_data)
            temp_path = f.name

        try:
            result = subprocess.run(
                ["sqlite3", db_name, f".read {temp_path}"],
                capture_output=True, timeout=900,
            )
        except FileNotFoundError:
            raise CommandError("sqlite3 CLI not found — cannot restore database.")
        except subprocess.TimeoutExpired:
            raise CommandError("sqlite3 restore timed out after 900 seconds.")
        finally:
            os.unlink(temp_path)

        if result.returncode != 0:
            stderr = result.stderr.decode("utf-8", errors="replace")
            raise CommandError(f"sqlite3 restore failed: {stderr}")
