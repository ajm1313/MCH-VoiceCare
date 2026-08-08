"""
CatBoost training pipeline (spec §13, Phase 4 deliverable).

This script trains a CatBoost severe-maternal-outcome risk model using
pseudonymized data exported from the clinical database.

Required comparators (spec §13.5):
  - Elastic-net logistic regression (mandatory transparent baseline)
  - EBM (Explainable Boosting Machine)
  - XGBoost or LightGBM

The training pipeline MUST:
  1. Use pseudonymized data only (spec §10.6)
  2. Validate against the feature contract (spec §13.1)
  3. Compare against the elastic-net baseline (spec §13.5)
  4. Run golden tests (spec §29.2)
  5. Sign and version the model package (spec §6.3)

Usage:
  python manage.py train_catboost --data /path/to/pseudonymized.csv --output /path/to/model.cbm

This is a management command stub — the actual training logic requires
catboost, scikit-learn, and interpret packages to be installed.
"""
import os
import json
import hashlib
from datetime import datetime

from django.core.management.base import BaseCommand, CommandError

from ml.features.contracts import get_feature_names, validate_features


class Command(BaseCommand):
    help = "Train a CatBoost severe-maternal-outcome risk model (spec §13, Phase 4)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--data",
            type=str,
            required=True,
            help="Path to pseudonymized training data CSV",
        )
        parser.add_argument(
            "--output",
            type=str,
            default="ml/models/catboost_pregnancy.cbm",
            help="Output path for the trained model",
        )
        parser.add_argument(
            "--module",
            type=str,
            default="pregnancy",
            help="Clinical module (pregnancy, newborn)",
        )
        parser.add_argument(
            "--version",
            type=str,
            default=f"v{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
            help="Model version label",
        )
        parser.add_argument(
            "--compare-baseline",
            action="store_true",
            help="Also train elastic-net baseline comparator (spec §13.5)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Validate data and features without training",
        )

    def handle(self, *args, **options):
        data_path = options["data"]
        output_path = options["output"]
        module = options["module"]
        version = options["version"]
        compare_baseline = options["compare_baseline"]
        dry_run = options["dry_run"]

        if not os.path.exists(data_path):
            raise CommandError(f"Data file not found: {data_path}")

        self.stdout.write(self.style.SUCCESS(f"Training CatBoost model for module: {module}"))
        self.stdout.write(f"  Data: {data_path}")
        self.stdout.write(f"  Output: {output_path}")
        self.stdout.write(f"  Version: {version}")

        # Step 1: Validate feature contract (spec §13.1)
        feature_names = get_feature_names(module)
        self.stdout.write(f"  Features ({len(feature_names)}): {', '.join(feature_names)}")

        # Step 2: Load and validate data
        self.stdout.write("Loading data...")
        rows = self._load_data(data_path)
        self.stdout.write(f"  Loaded {len(rows)} rows")

        # Validate features in each row
        errors_count = 0
        for i, row in enumerate(rows):
            errors = validate_features(row, module)
            if errors:
                errors_count += 1
                if errors_count <= 5:
                    self.stdout.write(self.style.WARNING(f"  Row {i}: {errors}"))

        if errors_count > 0:
            self.stdout.write(self.style.WARNING(f"  {errors_count} rows had validation errors"))
        else:
            self.stdout.write(self.style.SUCCESS("  All rows passed feature validation"))

        if dry_run:
            self.stdout.write(self.style.SUCCESS("Dry run complete — no model trained."))
            return

        # Step 3: Train CatBoost model
        try:
            import numpy as np
            from catboost import CatBoostClassifier, Pool
        except ImportError:
            raise CommandError(
                "catboost and numpy are required for training. Install with: pip install catboost numpy"
            )

        self.stdout.write("Training CatBoost model...")
        X, y = self._prepare_data(rows, feature_names)

        model = CatBoostClassifier(
            iterations=500,
            learning_rate=0.05,
            depth=6,
            loss_function="Logloss",
            eval_metric="AUC",
            random_seed=42,
            verbose=100,
        )

        train_pool = Pool(X, y, feature_names=feature_names)
        model.fit(train_pool)

        # Step 4: Train elastic-net baseline comparator (spec §13.5)
        if compare_baseline:
            self.stdout.write("Training elastic-net baseline comparator (spec §13.5)...")
            try:
                from sklearn.linear_model import LogisticRegression
                from sklearn.preprocessing import StandardScaler

                scaler = StandardScaler()
                X_scaled = scaler.fit_transform(X)
                baseline = LogisticRegression(
                    penalty="elasticnet",
                    solver="saga",
                    l1_ratio=0.5,
                    C=1.0,
                    random_state=42,
                    max_iter=1000,
                )
                baseline.fit(X_scaled, y)
                self.stdout.write(self.style.SUCCESS("  Elastic-net baseline trained"))
            except ImportError:
                self.stdout.write(self.style.WARNING(
                    "  scikit-learn not installed — skipping baseline comparator"
                ))

        # Step 5: Save model
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        model.save_model(output_path)
        self.stdout.write(self.style.SUCCESS(f"Model saved to: {output_path}"))

        # Step 6: Compute model hash for signing (spec §6.3)
        with open(output_path, "rb") as f:
            model_bytes = f.read()
        model_hash = hashlib.sha256(model_bytes).hexdigest()
        self.stdout.write(f"  Model SHA-256: {model_hash}")

        # Step 7: Write model manifest
        manifest = {
            "modelName": "CatBoostClinicalRisk",
            "modelVersion": version,
            "modelType": "CatBoostClassifier",
            "module": module,
            "features": feature_names,
            "trainedAt": datetime.utcnow().isoformat() + "Z",
            "modelHash": model_hash,
            "rowCount": len(rows),
            "validationStatus": "PENDING",
            "calibrationStatus": "UNCALIBRATED",
            "comparators": ["elastic_net"] if compare_baseline else [],
        }

        manifest_path = output_path + ".manifest.json"
        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=2)
        self.stdout.write(self.style.SUCCESS(f"Manifest saved to: {manifest_path}"))

        self.stdout.write(self.style.SUCCESS(
            "\nTraining complete. Next steps:\n"
            "  1. Run golden tests (spec §29.2)\n"
            "  2. Validate against comparators (spec §13.5)\n"
            "  3. Calibrate the model (spec §13.4)\n"
            "  4. Sign the model package (spec §6.3)\n"
            "  5. Deploy in SILENT mode for prospective evaluation (spec §3.2)\n"
            "  6. Only enable ASSISTED mode after governance approval (spec §3.2)"
        ))

    def _load_data(self, path: str) -> list:
        """Load CSV data into a list of dicts."""
        import csv
        with open(path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            return list(reader)

    def _prepare_data(self, rows: list, feature_names: list):
        """Prepare data for CatBoost training."""
        import numpy as np
        X = []
        y = []
        for row in rows:
            features = []
            for name in feature_names:
                val = row.get(name)
                if val is None or val == "":
                    features.append(0.0)
                else:
                    try:
                        features.append(float(val))
                    except (ValueError, TypeError):
                        features.append(0.0)
            X.append(features)
            # Target: "outcome_severe_maternal" column (1 = severe, 0 = not severe)
            y.append(int(row.get("outcome_severe_maternal", 0)))

        return np.array(X), np.array(y)
