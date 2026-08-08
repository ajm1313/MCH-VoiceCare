"""
Management command to ensure the admin superuser has correct role fields.

When the database is created with an older schema and sync_schema adds the
system_role and is_super_admin columns, they get default values that don't
reflect the admin user's actual privileges. This command fixes that.

Usage:
    python manage.py ensure_admin_role
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

from apps.core.enums import SystemRole


class Command(BaseCommand):
    help = "Ensure superusers have SUPER_ADMIN role and is_super_admin=True."

    def handle(self, *args, **options):
        User = get_user_model()
        fixed = 0

        for user in User.objects.filter(is_superuser=True):
            changed = False
            if not user.is_super_admin:
                user.is_super_admin = True
                changed = True
            if hasattr(user, "system_role") and user.system_role != SystemRole.SUPER_ADMIN:
                user.system_role = SystemRole.SUPER_ADMIN
                changed = True

            if changed:
                user.save(update_fields=["is_super_admin", "system_role"])
                fixed += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  FIXED {user.username}: system_role=SUPER_ADMIN, is_super_admin=True"
                    )
                )
            else:
                self.stdout.write(f"  OK    {user.username}: already correct")

        self.stdout.write(
            self.style.SUCCESS(f"\nDone: {fixed} superusers fixed")
        )
