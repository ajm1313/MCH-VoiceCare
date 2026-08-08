"""
Management command to create or update a staff user with a given password.

Usage:
    python manage.py create_user --username Cynthia --password Cynthia@2026 --full-name "Cynthia" --role FACILITY_CLINICAL_USER
    python manage.py create_user --username admin2 --password Secret123 --full-name "Admin Two" --role SUPER_ADMIN --super-admin
"""
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model

from apps.core.enums import SystemRole


class Command(BaseCommand):
    help = "Create or update a user with the given credentials and role."

    def add_arguments(self, parser):
        parser.add_argument("--username", required=True, help="Username")
        parser.add_argument("--password", required=True, help="Password")
        parser.add_argument("--full-name", default="", help="Full name")
        parser.add_argument("--email", default="", help="Email")
        parser.add_argument("--mobile", default="", help="Mobile number")
        parser.add_argument(
            "--role",
            default="FACILITY_CLINICAL_USER",
            choices=[r[0] for r in SystemRole.choices],
            help="System role",
        )
        parser.add_argument(
            "--super-admin",
            action="store_true",
            help="Set is_super_admin=True",
        )
        parser.add_argument(
            "--superuser",
            action="store_true",
            help="Set is_superuser=True (Django superuser)",
        )

    def handle(self, *args, **options):
        User = get_user_model()
        username = options["username"]
        password = options["password"]
        full_name = options["full_name"]
        email = options["email"]
        mobile = options["mobile"]
        role = options["role"]
        is_super_admin = options["super_admin"]
        is_superuser = options["superuser"]

        try:
            user = User.objects.get(username=username)
            user.set_password(password)
            user.full_name = full_name or user.full_name
            user.system_role = role
            user.is_super_admin = is_super_admin
            user.is_superuser = is_superuser
            if email:
                user.email = email
            if mobile:
                user.mobile_number = mobile
            user.save()
            self.stdout.write(
                self.style.SUCCESS(f"Updated user '{username}' (password reset).")
            )
        except User.DoesNotExist:
            user = User.objects.create_user(
                username=username,
                password=password,
                full_name=full_name,
                email=email or "",
                mobile_number=mobile,
                system_role=role,
                is_super_admin=is_super_admin,
                is_superuser=is_superuser,
            )
            self.stdout.write(
                self.style.SUCCESS(f"Created user '{username}' with role {role}.")
            )
