"""
Database backup management command (spec §29.3).

Dumps the PostgreSQL database to a compressed SQL file and uploads it to
S3-compatible storage (via boto3 if configured). Retains the last 30 days
of backups. Logs completion to the audit trail.

Usage:
    python manage.py backup_db
    python manage.py backup_db --bucket my-backup-bucket
    python manage.py backup_db --retention-days 30

Cron schedule (add to crontab on the server):
    # Daily database backup at 02:00 UTC
    0 2 * * * cd /app && python manage.py backup_db >> /var/log/mch_backup.log 2>&1
"""
import gzip
import os
import subprocess
from datetime import datetime, timedelta
from io import BytesIO

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.audit.services import log_audit
from apps.core.config_models import SystemConfig


BACKUP_PREFIX = "db_backups/"
DEFAULT_RETENTION_DAYS = 30


class Command(BaseCommand):
    help = (
        "Dump the PostgreSQL database to a compressed SQL file and upload to "
        "S3-compatible storage. Retains the last N days of backups (spec §29.3)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--bucket",
            default="",
            help="S3 bucket name (overrides S3_BACKUP_BUCKET env var).",
        )
        parser.add_argument(
            "--retention-days",
            type=int,
            default=DEFAULT_RETENTION_DAYS,
            help="Number of days of backups to retain (default: 30).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Create the dump but do not upload or prune old backups.",
        )

    def handle(self, *args, **options):
        bucket = options["bucket"] or os.environ.get("S3_BACKUP_BUCKET", "")
        retention_days = options["retention_days"]
        dry_run = options["dry_run"]

        db_settings = settings.DATABASES["default"]
        db_engine = db_settings.get("ENGINE", "")
        db_name = db_settings.get("NAME", "")
        db_user = db_settings.get("USER", "")
        db_host = db_settings.get("HOST", "")
        db_port = db_settings.get("PORT", "")

        timestamp = timezone.now().strftime("%Y%m%d_%H%M%S")
        filename = f"mch_voicecare_{timestamp}.sql.gz"

        self.stdout.write(f"Starting database backup: {filename}")

        # ── Dump the database ──
        if "postgresql" in db_engine or "psycopg" in db_engine:
            dump_data = self._dump_postgres(
                db_name, db_user, db_host, db_port, db_settings.get("PASSWORD", ""),
            )
        elif "sqlite" in db_engine:
            dump_data = self._dump_sqlite(db_name)
        else:
            raise CommandError(f"Unsupported database engine for backup: {db_engine}")

        if dump_data is None:
            raise CommandError("Database dump failed — no data produced.")

        self.stdout.write(
            self.style.SUCCESS(f"Database dump created ({len(dump_data)} bytes)")
        )

        # ── Upload to storage ──
        remote_path = f"{BACKUP_PREFIX}{filename}"
        if not dry_run:
            uploaded_to = self._upload_backup(
                dump_data, remote_path, bucket,
            )
            self.stdout.write(
                self.style.SUCCESS(f"Backup uploaded to: {uploaded_to}")
            )

            # ── Prune old backups ──
            pruned = self._prune_old_backups(bucket, retention_days)
            if pruned:
                self.stdout.write(
                    self.style.SUCCESS(f"Pruned {pruned} old backup(s).")
                )
        else:
            self.stdout.write("Dry run — skipping upload and pruning.")

        # ── Log to audit trail ──
        log_audit(
            actor="system",
            action="DB_BACKUP_COMPLETED",
            actor_role="SYSTEM",
            entity_type="DatabaseBackup",
            entity_id=filename,
            purpose="ADMIN",
            metadata={
                "filename": filename,
                "size_bytes": len(dump_data),
                "bucket": bucket or "local",
                "retention_days": retention_days,
                "dry_run": dry_run,
            },
        )

        self.stdout.write(
            self.style.SUCCESS("Backup completed and logged to audit trail.")
        )

    def _dump_postgres(self, db_name, db_user, db_host, db_port, db_password):
        """Dump PostgreSQL database using pg_dump, return compressed bytes."""
        env = os.environ.copy()
        if db_password:
            env["PGPASSWORD"] = db_password

        cmd = ["pg_dump"]
        if db_host:
            cmd.extend(["--host", db_host])
        if db_port:
            cmd.extend(["--port", str(db_port)])
        if db_user:
            cmd.extend(["--username", db_user])
        if db_name:
            cmd.append(db_name)

        try:
            result = subprocess.run(
                cmd, capture_output=True, env=env, timeout=600,
            )
        except FileNotFoundError:
            self.stderr.write("pg_dump not found — falling back to Django dumpdata.")
            return self._dump_via_django()
        except subprocess.TimeoutExpired:
            raise CommandError("pg_dump timed out after 600 seconds.")

        if result.returncode != 0:
            self.stderr.write(
                f"pg_dump failed (exit {result.returncode}): "
                f"{result.stderr.decode('utf-8', errors='replace')}"
            )
            raise CommandError("pg_dump failed.")

        # Compress with gzip
        compressed = gzip.compress(result.stdout)
        return compressed

    def _dump_sqlite(self, db_name):
        """Dump SQLite database to compressed SQL bytes."""
        # In-memory or non-file SQLite → use Django dumpdata fallback
        if not db_name or ":memory:" in db_name or not os.path.exists(db_name):
            self.stderr.write(
                f"SQLite database file not accessible ({db_name}) — falling back to Django dumpdata."
            )
            return self._dump_via_django()

        try:
            result = subprocess.run(
                ["sqlite3", db_name, ".dump"],
                capture_output=True, timeout=600,
            )
        except FileNotFoundError:
            self.stderr.write("sqlite3 CLI not found — falling back to Django dumpdata.")
            return self._dump_via_django()
        except subprocess.TimeoutExpired:
            raise CommandError("sqlite3 dump timed out after 600 seconds.")

        if result.returncode != 0:
            raise CommandError(
                f"sqlite3 dump failed: {result.stderr.decode('utf-8', errors='replace')}"
            )

        return gzip.compress(result.stdout)

    def _dump_via_django(self):
        """Fallback: use Django's dumpdata to produce a JSON backup."""
        from django.core import serializers
        from django.apps import apps

        data = serializers.serialize(
            "json",
            [obj for model in apps.get_models() for obj in model.objects.all()],
        )
        return gzip.compress(data.encode("utf-8"))

    def _upload_backup(self, data, remote_path, bucket):
        """Upload backup to S3 (via boto3) or local storage."""
        if bucket:
            try:
                import boto3
            except ImportError:
                self.stderr.write(
                    "boto3 not installed — saving backup to local storage instead."
                )
                default_storage.save(remote_path, ContentFile(data))
                return f"local://{remote_path}"

            s3 = boto3.client("s3")
            s3.put_object(Bucket=bucket, Key=remote_path, Body=data)
            return f"s3://{bucket}/{remote_path}"
        else:
            # No bucket configured — save locally
            default_storage.save(remote_path, ContentFile(data))
            return f"local://{remote_path}"

    def _prune_old_backups(self, bucket, retention_days):
        """Delete backups older than retention_days. Returns count pruned."""
        cutoff = timezone.now() - timedelta(days=retention_days)
        pruned = 0

        if bucket:
            try:
                import boto3
            except ImportError:
                return 0

            s3 = boto3.client("s3")
            list_response = s3.list_objects_v2(
                Bucket=bucket, Prefix=BACKUP_PREFIX,
            )
            for obj in list_response.get("Contents", []):
                last_modified = obj.get("LastModified")
                if last_modified and last_modified.replace(tzinfo=timezone.utc) < cutoff:
                    s3.delete_object(Bucket=bucket, Key=obj["Key"])
                    pruned += 1
        else:
            # Local storage pruning
            try:
                dirs, files = default_storage.listdir(BACKUP_PREFIX.rstrip("/"))
            except (FileNotFoundError, OSError):
                return 0

            for fname in files:
                full_path = f"{BACKUP_PREFIX}{fname}"
                try:
                    modified = default_storage.get_modified_time(full_path)
                    if timezone.make_aware(modified) < cutoff:
                        default_storage.delete(full_path)
                        pruned += 1
                except (OSError, ValueError):
                    continue

        return pruned
