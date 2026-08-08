"""
Management command to sync database schema with models.

Adds missing columns to existing tables using ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
This is needed when the database was created with an older schema and migrations
were faked (marked as applied without actually running the SQL).

Usage:
    python manage.py sync_schema
"""
from django.core.management.base import BaseCommand
from django.db import connection, models
from django.apps import apps


# Map Django field types to PostgreSQL column types
FIELD_TYPE_MAP = {
    models.CharField: "varchar(%(max_length)s)",
    models.TextField: "text",
    models.BooleanField: "boolean",
    models.NullBooleanField: "boolean",
    models.IntegerField: "integer",
    models.BigIntegerField: "bigint",
    models.SmallIntegerField: "smallint",
    models.PositiveIntegerField: "integer",
    models.PositiveSmallIntegerField: "smallint",
    models.PositiveBigIntegerField: "bigint",
    models.FloatField: "double precision",
    models.DecimalField: "numeric(%(max_digits)s, %(decimal_places)s)",
    models.DateTimeField: "timestamp with time zone",
    models.DateField: "date",
    models.TimeField: "time",
    models.UUIDField: "uuid",
    models.JSONField: "jsonb",
    models.BinaryField: "bytea",
    models.EmailField: "varchar(254)",
    models.URLField: "varchar(200)",
    models.SlugField: "varchar(50)",
    models.DurationField: "interval",
    models.FilePathField: "varchar(100)",
}

# Default values for NOT NULL columns by field type (used when field has no
# explicit default and the table already has rows)
IMPLICIT_DEFAULTS = {
    models.CharField: "''",
    models.TextField: "''",
    models.BooleanField: "false",
    models.IntegerField: "0",
    models.BigIntegerField: "0",
    models.SmallIntegerField: "0",
    models.PositiveIntegerField: "0",
    models.PositiveSmallIntegerField: "0",
    models.PositiveBigIntegerField: "0",
    models.FloatField: "0",
    models.DecimalField: "0",
    models.EmailField: "''",
    models.URLField: "''",
    models.SlugField: "''",
    models.FilePathField: "''",
    models.DurationField: "'0'::interval",
}


class Command(BaseCommand):
    help = "Add missing columns to existing tables to sync DB schema with models."

    def handle(self, *args, **options):
        added = 0
        failed = 0
        skipped = 0

        with connection.cursor() as cursor:
            for model in apps.get_models():
                table_name = model._meta.db_table
                if not model._meta.managed:
                    continue

                # Get existing columns from the database
                try:
                    cursor.execute(
                        "SELECT column_name FROM information_schema.columns "
                        "WHERE table_name = %s",
                        [table_name],
                    )
                    existing_cols = {row[0] for row in cursor.fetchall()}
                except Exception:
                    skipped += 1
                    continue

                # Check each model field
                for field in model._meta.get_fields():
                    if not hasattr(field, "column") or not field.column:
                        continue
                    if field.many_to_many:
                        continue

                    col_name = field.column
                    if col_name in existing_cols:
                        continue

                    # Build column type
                    col_type = self._get_column_type(field)
                    if col_type is None:
                        continue

                    # Build DEFAULT clause — critical for NOT NULL columns on
                    # tables that already have rows
                    default_value = self._get_default_value(field)
                    default_clause = f" DEFAULT {default_value}" if default_value else ""

                    # Build NULL clause — use NULL for FK columns to avoid
                    # constraint issues, otherwise respect field.null
                    if field.null or isinstance(field, (models.ForeignKey, models.OneToOneField)):
                        null_clause = ""
                    else:
                        null_clause = " NOT NULL"

                    sql = (
                        f"ALTER TABLE {table_name} "
                        f"ADD COLUMN IF NOT EXISTS {col_name} {col_type}"
                        f"{default_clause}{null_clause}"
                    )

                    try:
                        cursor.execute(sql)
                        added += 1
                        self.stdout.write(
                            self.style.SUCCESS(
                                f"  ADDED {table_name}.{col_name} ({col_type})"
                            )
                        )
                    except Exception as e:
                        failed += 1
                        self.stdout.write(
                            self.style.WARNING(
                                f"  FAIL  {table_name}.{col_name}: {e}"
                            )
                        )

        self.stdout.write(
            self.style.SUCCESS(
                f"\nDone: {added} added, {failed} failed, {skipped} tables skipped"
            )
        )

    def _get_column_type(self, field):
        """Map a Django field to a PostgreSQL column type string."""
        for field_class, pg_type in FIELD_TYPE_MAP.items():
            if isinstance(field, field_class):
                params = {}
                if hasattr(field, "max_length") and field.max_length:
                    params["max_length"] = field.max_length
                if hasattr(field, "max_digits") and field.max_digits:
                    params["max_digits"] = field.max_digits
                if hasattr(field, "decimal_places") and field.decimal_places:
                    params["decimal_places"] = field.decimal_places
                return pg_type % params if params else pg_type

        if isinstance(field, (models.ForeignKey, models.OneToOneField)):
            return "uuid"

        return None

    def _get_default_value(self, field):
        """Get a SQL DEFAULT value for a field.

        Uses the field's explicit default if available, otherwise falls back
        to an implicit default based on the field type (needed for NOT NULL
        columns on tables with existing rows).
        """
        # Explicit default from the model definition
        if field.has_default():
            default = field.get_default()
            if default is None:
                return "NULL"
            if isinstance(default, bool):
                return "true" if default else "false"
            if isinstance(default, (int, float)):
                return str(default)
            if isinstance(default, str):
                escaped = default.replace("'", "''")
                return f"'{escaped}'"
            # UUID, date, datetime, etc.
            escaped = str(default).replace("'", "''")
            return f"'{escaped}'"

        # Auto-now timestamps — use current time
        if getattr(field, "auto_now_add", False) or getattr(field, "auto_now", False):
            return "now()"

        # Implicit defaults for NOT NULL fields
        if not field.null:
            for field_class, default in IMPLICIT_DEFAULTS.items():
                if isinstance(field, field_class):
                    return default

        return None
