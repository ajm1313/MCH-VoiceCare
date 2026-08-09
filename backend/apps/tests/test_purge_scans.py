"""
Tests for purge_expired_scans management command (spec §25).

Verifies:
- Purge deletes eligible scans and sets purged_at
- LEGAL_RECORD mode skips purge entirely
- Dry run does not modify records
- Audit trail is logged
"""
from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from apps.audit.models import AuditEvent
from apps.core.config_models import SystemConfig
from apps.core.ocr_models import OCRJob


class PurgeExpiredScansTest(TestCase):
    """Tests for the purge_expired_scans management command."""

    def setUp(self):
        """Create test OCR jobs — some eligible, some not."""
        now = timezone.now()

        # Eligible: purge_eligible_at in the past, not yet purged
        self.eligible_job = OCRJob.objects.create(
            status="CONFIRMED",
            image_path="/tmp/test_scan_1.jpg",
            purge_eligible_at=now - timedelta(hours=2),
            purged_at=None,
        )

        # Eligible: purge_eligible_at exactly now
        self.eligible_job2 = OCRJob.objects.create(
            status="CONFIRMED",
            image_path="/tmp/test_scan_2.jpg",
            purge_eligible_at=now,
            purged_at=None,
        )

        # Not eligible: purge_eligible_at in the future
        self.future_job = OCRJob.objects.create(
            status="CONFIRMED",
            image_path="/tmp/test_scan_3.jpg",
            purge_eligible_at=now + timedelta(hours=24),
            purged_at=None,
        )

        # Not eligible: already purged
        self.purged_job = OCRJob.objects.create(
            status="EXPIRED",
            image_path="/tmp/test_scan_4.jpg",
            purge_eligible_at=now - timedelta(hours=48),
            purged_at=now - timedelta(hours=24),
        )

        # Not eligible: no purge_eligible_at set
        self.no_eligible_date_job = OCRJob.objects.create(
            status="PENDING",
            image_path="/tmp/test_scan_5.jpg",
            purge_eligible_at=None,
            purged_at=None,
        )

    def test_purge_deletes_eligible_scans(self):
        """Purge should set purged_at on eligible scans."""
        call_command("purge_expired_scans", stdout=StringIO(), stderr=StringIO())

        self.eligible_job.refresh_from_db()
        self.eligible_job2.refresh_from_db()
        self.future_job.refresh_from_db()
        self.purged_job.refresh_from_db()
        self.no_eligible_date_job.refresh_from_db()

        # Eligible jobs should be purged
        self.assertIsNotNone(self.eligible_job.purged_at)
        self.assertEqual(self.eligible_job.status, "EXPIRED")
        self.assertIsNotNone(self.eligible_job2.purged_at)
        self.assertEqual(self.eligible_job2.status, "EXPIRED")

        # Non-eligible jobs should NOT be purged
        self.assertIsNone(self.future_job.purged_at)
        self.assertEqual(self.future_job.status, "CONFIRMED")
        # Already purged job should remain unchanged
        self.assertIsNotNone(self.purged_job.purged_at)
        # No eligible date job should remain unchanged
        self.assertIsNone(self.no_eligible_date_job.purged_at)

    def test_purge_logs_audit_trail(self):
        """Purge should log to audit trail."""
        call_command("purge_expired_scans", stdout=StringIO(), stderr=StringIO())

        # Individual purge events
        purge_events = AuditEvent.objects.filter(action="SCAN_IMAGE_PURGED")
        self.assertEqual(purge_events.count(), 2)

        # Batch summary event
        batch_events = AuditEvent.objects.filter(action="SCAN_PURGE_BATCH_COMPLETED")
        self.assertEqual(batch_events.count(), 1)
        batch = batch_events.first()
        self.assertEqual(batch.metadata["purged"], 2)
        self.assertEqual(batch.metadata["total_eligible"], 2)

    def test_legal_record_mode_skips_purge(self):
        """LEGAL_RECORD retention mode should skip all purging."""
        config = SystemConfig.get_config()
        config.scan_retention_mode = "LEGAL_RECORD"
        config.save()

        call_command("purge_expired_scans", stdout=StringIO(), stderr=StringIO())

        # No jobs should be purged
        self.eligible_job.refresh_from_db()
        self.eligible_job2.refresh_from_db()
        self.assertIsNone(self.eligible_job.purged_at)
        self.assertEqual(self.eligible_job.status, "CONFIRMED")
        self.assertIsNone(self.eligible_job2.purged_at)
        self.assertEqual(self.eligible_job2.status, "CONFIRMED")

        # Audit trail should record the skip
        skip_events = AuditEvent.objects.filter(action="SCAN_PURGE_SKIPPED_LEGAL_RECORD")
        self.assertEqual(skip_events.count(), 1)
        skip_event = skip_events.first()
        self.assertEqual(skip_event.metadata["retention_mode"], "LEGAL_RECORD")

        # No purge events should exist
        purge_events = AuditEvent.objects.filter(action="SCAN_IMAGE_PURGED")
        self.assertEqual(purge_events.count(), 0)

    def test_dry_run_does_not_modify(self):
        """Dry run should not modify any records."""
        call_command("purge_expired_scans", "--dry-run", stdout=StringIO(), stderr=StringIO())

        self.eligible_job.refresh_from_db()
        self.eligible_job2.refresh_from_db()

        # No jobs should be purged in dry run
        self.assertIsNone(self.eligible_job.purged_at)
        self.assertEqual(self.eligible_job.status, "CONFIRMED")
        self.assertIsNone(self.eligible_job2.purged_at)
        self.assertEqual(self.eligible_job2.status, "CONFIRMED")

        # No purge audit events in dry run
        purge_events = AuditEvent.objects.filter(action="SCAN_IMAGE_PURGED")
        self.assertEqual(purge_events.count(), 0)

    def test_limit_restricts_purge_count(self):
        """--limit should restrict the number of scans purged."""
        call_command(
            "purge_expired_scans", "--limit", "1",
            stdout=StringIO(), stderr=StringIO(),
        )

        purge_events = AuditEvent.objects.filter(action="SCAN_IMAGE_PURGED")
        self.assertEqual(purge_events.count(), 1)

        batch_events = AuditEvent.objects.filter(action="SCAN_PURGE_BATCH_COMPLETED")
        batch = batch_events.first()
        self.assertEqual(batch.metadata["purged"], 1)
        self.assertEqual(batch.metadata["total_eligible"], 1)
