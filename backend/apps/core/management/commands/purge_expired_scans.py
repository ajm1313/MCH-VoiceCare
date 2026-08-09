"""
Purge expired OCR scan images management command (spec §25).

Finds OCRJob records where is_purge_eligible is True and purged_at is None,
deletes associated image files from storage, sets purged_at timestamp, and
logs the purge to the audit trail.

Respects scan_retention_mode from SystemConfig — skips ALL purging if the
mode is LEGAL_RECORD (images must follow the approved GHS/PRAAD schedule).

Usage:
    python manage.py purge_expired_scans
    python manage.py purge_expired_scans --dry-run
    python manage.py purge_expired_scans --limit 100

Cron schedule (add to crontab on the server):
    # Purge expired scan images daily at 03:00 UTC
    0 3 * * * cd /app && python manage.py purge_expired_scans >> /var/log/mch_purge.log 2>&1
"""
import os

from django.conf import settings
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.audit.services import log_audit
from apps.core.config_models import SystemConfig
from apps.core.ocr_models import OCRJob


class Command(BaseCommand):
    help = (
        "Purge expired OCR scan images that are eligible for purging (spec §25). "
        "Respects scan_retention_mode — skips if LEGAL_RECORD."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List eligible scans without deleting images or setting purged_at.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help="Maximum number of scans to purge (0 = no limit).",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        limit = options["limit"]

        # Clear cache to avoid stale config in test environments
        from django.core.cache import cache
        cache.clear()

        # ── Check retention mode ──
        config = SystemConfig.get_config()
        retention_mode = config.scan_retention_mode

        if retention_mode == "LEGAL_RECORD":
            self.stdout.write(
                self.style.WARNING(
                    "scan_retention_mode is LEGAL_RECORD — skipping purge. "
                    "Images must follow the approved GHS/PRAAD retention schedule."
                )
            )
            log_audit(
                actor="system",
                action="SCAN_PURGE_SKIPPED_LEGAL_RECORD",
                actor_role="SYSTEM",
                entity_type="SystemConfig",
                entity_id="scan_retention_mode",
                purpose="ADMIN",
                metadata={
                    "retention_mode": retention_mode,
                    "reason": "LEGAL_RECORD mode — purge not permitted",
                },
            )
            return

        # ── Find eligible scans ──
        eligible_qs = OCRJob.objects.filter(
            purged_at__isnull=True,
            purge_eligible_at__isnull=False,
            purge_eligible_at__lte=timezone.now(),
        )

        # Exclude already-purged (redundant with filter but explicit)
        eligible_jobs = [job for job in eligible_qs if job.is_purge_eligible]

        if limit > 0:
            eligible_jobs = eligible_jobs[:limit]

        count = len(eligible_jobs)

        if count == 0:
            self.stdout.write("No eligible scans to purge.")
            return

        self.stdout.write(f"Found {count} eligible scan(s) for purging.")

        if dry_run:
            for job in eligible_jobs:
                self.stdout.write(
                    f"  [DRY RUN] Would purge OCRJob {job.id} "
                    f"(status={job.status}, image_path={job.image_path})"
                )
            self.stdout.write(
                self.style.SUCCESS(f"Dry run complete — {count} scan(s) would be purged.")
            )
            return

        # ── Purge each scan ──
        purged_count = 0
        errors = []

        for job in eligible_jobs:
            self.stdout.write(f"  Processing OCRJob {job.id}...")
            try:
                # Delete the image file from storage
                if job.image_path:
                    self.stdout.write(f"    Deleting image: {job.image_path}")
                    self._delete_image(job.image_path)
                    self.stdout.write(f"    Image deleted (or skipped)")

                # Set purged_at timestamp
                self.stdout.write(f"    Setting purged_at...")
                job.purged_at = timezone.now()
                job.status = "EXPIRED"
                job.save(update_fields=["purged_at", "status"])
                self.stdout.write(f"    Save OK")

                # Log individual purge to audit trail
                log_audit(
                    actor="system",
                    action="SCAN_IMAGE_PURGED",
                    actor_role="SYSTEM",
                    entity_type="OCRJob",
                    entity_id=str(job.id),
                    patient_id=job.patient_id,
                    purpose="ADMIN",
                    metadata={
                        "image_path": job.image_path,
                        "retention_mode": retention_mode,
                        "purge_eligible_at": job.purge_eligible_at.isoformat()
                            if job.purge_eligible_at else None,
                    },
                )

                purged_count += 1
            except Exception as exc:
                errors.append({"job_id": str(job.id), "error": str(exc)})
                self.stderr.write(
                    self.style.ERROR(f"Failed to purge OCRJob {job.id}: {exc}")
                )

        # ── Summary ──
        self.stdout.write(
            self.style.SUCCESS(
                f"Purge complete — {purged_count}/{count} scan(s) purged."
            )
        )

        if errors:
            self.stderr.write(
                self.style.WARNING(f"{len(errors)} error(s) occurred during purge.")
            )

        # Log batch summary to audit trail
        log_audit(
            actor="system",
            action="SCAN_PURGE_BATCH_COMPLETED",
            actor_role="SYSTEM",
            entity_type="OCRJob",
            entity_id="batch",
            purpose="ADMIN",
            metadata={
                "total_eligible": count,
                "purged": purged_count,
                "errors": len(errors),
                "retention_mode": retention_mode,
                "error_details": errors[:10],  # cap detail size
            },
        )

    def _delete_image(self, image_path):
        """Delete an image file from storage, handling both absolute and relative paths."""
        if not image_path:
            return

        # If the path is under MEDIA_ROOT, use default_storage
        media_root = str(getattr(settings, "MEDIA_ROOT", ""))
        if media_root and image_path.startswith(media_root):
            relative = os.path.relpath(image_path, media_root)
            try:
                if default_storage.exists(relative):
                    default_storage.delete(relative)
            except Exception:
                pass  # File may already be gone or inaccessible
            return

        # Try as an absolute file path (outside MEDIA_ROOT)
        if os.path.isabs(image_path):
            if os.path.exists(image_path):
                try:
                    os.remove(image_path)
                except (OSError, PermissionError):
                    pass  # Cannot delete — but still mark as purged
            return

        # Try as a relative path in default storage
        try:
            if default_storage.exists(image_path):
                default_storage.delete(image_path)
        except Exception:
            pass  # Path outside storage base — ignore
