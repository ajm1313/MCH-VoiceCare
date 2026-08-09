"""
Management command to run the referral escalation check.

Usage:
    python manage.py run_escalation
"""
from django.core.management.base import BaseCommand

from apps.referrals.escalation import run_escalation_check


class Command(BaseCommand):
    help = "Run referral escalation check for overdue referrals"

    def handle(self, *args, **options):
        escalated = run_escalation_check()
        self.stdout.write(f"Escalated {len(escalated)} referrals")
        for e in escalated:
            self.stdout.write(
                f"  {e['referral_id']}: {e['action']} ({e['reason']})"
            )
