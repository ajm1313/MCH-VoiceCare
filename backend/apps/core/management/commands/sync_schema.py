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
}


class Command(BaseCommand):
    help = "Add missing columns to existing tables to sync DB schema with models."

    def handle(self, *args, **options):
        added = 0
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
                    self.stdout.write(f"  SKIP {table_name} (table not found)")
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
                        self.stdout.write(
                            f"  SKIP {table_name}.{col_name} (unsupported type: {type(field).__name__})"
                        )
                        continue

                    # Build ALTER TABLE statement
                    null_clause = "" if field.null else " NOT NULL"
                    default_clause = ""
                    if field.has_default():
                        default = field.get_default()
                        if default is not None:
                            if isinstance(default, bool):
                                default_clause = f" DEFAULT {'true' if default else 'false'}"
                            elif isinstance(default, (int, float)):
                                default_clause = f" DEFAULT {default}"
                            elif isinstance(default, str):
                                escaped = default.replace("'", "''")
                                default_clause = f" DEFAULT '{escaped}'"
                        elif field.null:
                            default_clause = " DEFAULT NULL"

                    sql = (
                        f"ALTER TABLE {table_name} "
                        f"ADD COLUMN IF NOT EXISTS {col_name} {col_type}"
                        f"{default_clause}{null_clause}"
                    )

                    try:
                        cursor.execute(sql)
                        added += 1
                        self.stdout.write(
                            self.style.SUCCESS(f"  ADDED {table_name}.{col_name} ({col_type})")
                        )
                    except Exception as e:
                        self.stdout.write(
                            self.style.WARNING(f"  FAIL  {table_name}.{col_name}: {e}")
                        )

        self.stdout.write(
            self.style.SUCCESS(f"\nDone: {added} columns added, {skipped} tables skipped")
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

        # ForeignKey → UUID (since all our PKs are UUIDs)
        if isinstance(field, models.ForeignKey):
            return "uuid"

        # OneToOneField → UUID
        if isinstance(field, models.OneToOneField):
            return "uuid"

        return None
