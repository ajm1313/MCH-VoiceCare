"""
Management command to sync database schema with models.

Creates missing tables and adds missing columns to existing tables.
This is needed when the database was created with an older schema and
migrations were faked (marked as applied without actually running the SQL).

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
    help = "Create missing tables and add missing columns to sync DB schema with models."

    def handle(self, *args, **options):
        tables_created = 0
        columns_added = 0
        failed = 0

        with connection.cursor() as cursor:
            # Get all existing tables using Django's introspection (works
            # with both SQLite and PostgreSQL)
            existing_tables = set(connection.introspection.table_names())

            for model in apps.get_models():
                table_name = model._meta.db_table
                if not model._meta.managed:
                    continue

                if table_name not in existing_tables:
                    # Create the entire table using Django's schema editor
                    try:
                        with connection.schema_editor() as schema_editor:
                            schema_editor.create_model(model)
                        tables_created += 1
                        self.stdout.write(
                            self.style.SUCCESS(
                                f"  CREATED TABLE {table_name}"
                            )
                        )
                    except Exception as e:
                        failed += 1
                        self.stdout.write(
                            self.style.WARNING(
                                f"  FAIL  CREATE TABLE {table_name}: {e}"
                            )
                        )
                    continue

                # Table exists — check for missing columns
                col_description = connection.introspection.get_table_description(
                    cursor, table_name
                )
                existing_cols = {col.name for col in col_description}

                for field in model._meta.get_fields():
                    if not hasattr(field, "column") or not field.column:
                        continue
                    if field.many_to_many:
                        continue

                    col_name = field.column
                    if col_name in existing_cols:
                        continue

                    col_type = self._get_column_type(field)
                    if col_type is None:
                        continue

                    default_value = self._get_default_value(field)
                    default_clause = f" DEFAULT {default_value}" if default_value else ""

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
                        columns_added += 1
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
                f"\nDone: {tables_created} tables created, "
                f"{columns_added} columns added, {failed} failed"
            )
        )

        # Fix empty-string values in UUID FK columns (sync_schema may have
        # added them without proper NULL defaults)
        self._fix_empty_uuid_fks(cursor)

    def _fix_empty_uuid_fks(self, cursor):
        """Set empty string values in UUID columns to NULL."""
        fixed = 0
        cursor.execute(
            "SELECT table_name, column_name FROM information_schema.columns "
            "WHERE data_type = 'uuid' AND table_schema = 'public'"
        )
        uuid_cols = cursor.fetchall()

        for table_name, col_name in uuid_cols:
            try:
                cursor.execute(
                    f'UPDATE {table_name} SET {col_name} = NULL '
                    f"WHERE {col_name} = ''"
                )
                if cursor.rowcount > 0:
                    fixed += cursor.rowcount
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"  FIXED {table_name}.{col_name}: "
                            f"{cursor.rowcount} empty values -> NULL"
                        )
                    )
            except Exception:
                pass

        if fixed:
            self.stdout.write(
                self.style.SUCCESS(f"Fixed {fixed} empty UUID values total")
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
        """Get a SQL DEFAULT value for a field."""
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
            escaped = str(default).replace("'", "''")
            return f"'{escaped}'"

        if getattr(field, "auto_now_add", False) or getattr(field, "auto_now", False):
            return "now()"

        if not field.null:
            for field_class, default in IMPLICIT_DEFAULTS.items():
                if isinstance(field, field_class):
                    return default

        return None
