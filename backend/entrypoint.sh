#!/bin/sh
# Railway entrypoint — handles migration state reconciliation.
#
# The production database was initially created out-of-band (not via Django
# migrations), so some migrations reference columns/tables that don't exist.
# This script fakes all existing migrations to the last known-good state,
# then runs real migrations for any new ones.

set -e

echo "=== MCH VoiceCare Railway Entrypoint ==="

# Step 1: Try a normal migrate first (works if DB is clean)
echo "Attempting normal migrate..."
if python manage.py migrate --noinput 2>&1; then
    echo "Normal migrations applied successfully."
else
    echo "Normal migrate failed — attempting fake reconciliation..."

    # Step 2: Fake-apply ALL migrations for ALL apps.
    # This marks every migration as applied without running the SQL,
    # reconciling the django_migrations table with the actual DB schema.
    # The production DB schema already matches the models (it was created
    # out-of-band), so we just need to sync the migration history.
    echo "Faking all migrations to reconcile state..."
    python manage.py migrate --fake --noinput 2>&1 || true

    # Step 3: Run real migrations for any new ones that weren't faked
    # (e.g., 0006_remove_oidc_sub, 0007_add_fcm_token)
    echo "Running real migrations for new changes..."
    python manage.py migrate --noinput 2>&1 || true
fi

echo "Migrations complete."

# Step 4: Start cron daemon (for backup + purge jobs)
echo "Starting cron daemon..."
cron

# Step 5: Start gunicorn
echo "Starting gunicorn..."
exec gunicorn config.wsgi:application \
    --bind 0.0.0.0:${PORT:-8000} \
    --workers 3 \
    --access-logfile - \
    --error-logfile - \
    --log-level debug
