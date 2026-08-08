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
        # added them without proper NULL defaults). Use a fresh cursor
        # because schema_editor may have closed the previous one.
        self._fix_empty_uuid_fks()

        # Fix columns that have the wrong type in the database (e.g. a
        # varchar column created as uuid by a bad migration).
        self._fix_column_types()

        # Drop extra columns that exist in the DB but not in the model
        # (leftover from old schema versions). This prevents NOT NULL
        # constraint violations when inserting new rows.
        self._drop_extra_columns()

    def _drop_extra_columns(self):
        """Drop columns that exist in the DB but not in the model."""
        if connection.vendor != "postgresql":
            return

        dropped = 0
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT table_name, column_name FROM information_schema.columns "
                "WHERE table_schema = 'public'"
            )
            db_cols = {}
            for table_name, col_name in cursor.fetchall():
                db_cols.setdefault(table_name, set()).add(col_name)

        for model in apps.get_models():
            if not model._meta.managed:
                continue
            table_name = model._meta.db_table
            if table_name not in db_cols:
                continue

            model_cols = set()
            for field in model._meta.get_fields():
                if hasattr(field, "column") and field.column:
                    model_cols.add(field.column)

            extra_cols = db_cols[table_name] - model_cols
            for col_name in extra_cols:
                try:
                    with connection.cursor() as cursor:
                        cursor.execute(
                            f"ALTER TABLE {table_name} DROP COLUMN IF EXISTS {col_name}"
                        )
                        dropped += 1
                        self.stdout.write(
                            self.style.SUCCESS(
                                f"  DROPPED {table_name}.{col_name} (not in model)"
                            )
                        )
                except Exception as e:
                    self.stdout.write(
                        self.style.WARNING(
                            f"  FAIL  DROP {table_name}.{col_name}: {e}"
                        )
                    )

        if dropped:
            self.stdout.write(
                self.style.SUCCESS(f"Dropped {dropped} extra columns total")
            )

    def _fix_column_types(self):
        """Fix columns where the DB type doesn't match the model field type."""
        if connection.vendor != "postgresql":
            return

        fixed = 0
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT table_name, column_name, data_type, character_maximum_length "
                "FROM information_schema.columns "
                "WHERE table_schema = 'public'"
            )
            db_cols = {}
            for table_name, col_name, data_type, max_len in cursor.fetchall():
                db_cols[(table_name, col_name)] = (data_type, max_len)

        for model in apps.get_models():
            if not model._meta.managed:
                continue
            table_name = model._meta.db_table
            for field in model._meta.get_fields():
                if not hasattr(field, "column") or not field.column:
                    continue
                if field.many_to_many:
                    continue

                col_name = field.column
                key = (table_name, col_name)
                if key not in db_cols:
                    continue

                db_type, db_max_len = db_cols[key]
                expected_type = self._get_column_type(field)
                if expected_type is None:
                    continue

                # Normalize expected type for comparison
                expected_db_type = expected_type.split("(")[0].strip()
                if expected_db_type == "varchar":
                    expected_db_type = "character varying"
                elif expected_db_type == "timestamp with time zone":
                    expected_db_type = "timestamp with time zone"
                elif expected_db_type == "double precision":
                    expected_db_type = "double precision"
                elif expected_db_type == "bigint":
                    expected_db_type = "bigint"
                elif expected_db_type == "smallint":
                    expected_db_type = "smallint"
                elif expected_db_type == "integer":
                    expected_db_type = "integer"
                elif expected_db_type == "text":
                    expected_db_type = "text"
                elif expected_db_type == "boolean":
                    expected_db_type = "boolean"
                elif expected_db_type == "uuid":
                    expected_db_type = "uuid"
                elif expected_db_type == "jsonb":
                    expected_db_type = "jsonb"
                elif expected_db_type == "date":
                    expected_db_type = "date"
                elif expected_db_type == "numeric":
                    expected_db_type = "numeric"

                if db_type != expected_db_type:
                    # Fix the column type
                    try:
                        with connection.cursor() as cursor:
                            cast = ""
                            if expected_db_type == "character varying":
                                cast = f" USING {col_name}::text"
                            elif expected_db_type == "text":
                                cast = f" USING {col_name}::text"
                            elif expected_db_type == "uuid":
                                cast = f" USING {col_name}::uuid"
                            elif expected_db_type == "integer":
                                cast = f" USING {col_name}::integer"
                            elif expected_db_type == "boolean":
                                cast = f" USING {col_name}::boolean"
                            elif expected_db_type == "timestamp with time zone":
                                cast = f" USING {col_name}::timestamp with time zone"

                            sql = (
                                f"ALTER TABLE {table_name} "
                                f"ALTER COLUMN {col_name} TYPE {expected_type}"
                                f"{cast}"
                            )
                            cursor.execute(sql)
                            fixed += 1
                            self.stdout.write(
                                self.style.SUCCESS(
                                    f"  FIXED TYPE {table_name}.{col_name}: "
                                    f"{db_type} -> {expected_type}"
                                )
                            )
                    except Exception as e:
                        self.stdout.write(
                            self.style.WARNING(
                                f"  FAIL  FIX TYPE {table_name}.{col_name}: {e}"
                            )
                        )

        if fixed:
            self.stdout.write(
                self.style.SUCCESS(f"Fixed {fixed} column types total")
            )

    def _fix_empty_uuid_fks(self):
        """Set empty string values in UUID columns to NULL."""
        # Only applies to PostgreSQL
        if connection.vendor != "postgresql":
            return

        fixed = 0
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT table_name, column_name FROM information_schema.columns "
                "WHERE data_type = 'uuid' AND table_schema = 'public'"
            )
            uuid_cols = cursor.fetchall()

        for table_name, col_name in uuid_cols:
            try:
                with connection.cursor() as cursor:
                    cursor.execute(
                        f'UPDATE {table_name} SET {col_name} = NULL '
                        f"WHERE {col_name}::text = ''"
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
