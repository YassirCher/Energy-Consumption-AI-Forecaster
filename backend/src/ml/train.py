import argparse
import datetime
import glob
import json
import os
import shutil
import sqlite3
import sys
import uuid
from dataclasses import dataclass

import lightgbm as lgb
import mlflow
import mlflow.sklearn
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import PowerTransformer, RobustScaler


BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TARGET = "Global_active_power"
EVALUATION_PROTOCOL = "causal_v2"
HORIZONS = {"1_step": 1, "1h": 60, "24h": 1440}
R2_FLOORS = {"1_step": 0.93, "1h": 0.30, "24h": 0.20}
MIN_BASELINE_RMSE_IMPROVEMENT = 0.01

FEATURE_COLUMNS = [
    "Global_reactive_power",
    "Voltage",
    "Global_intensity",
    "Sub_metering_1",
    "Sub_metering_2",
    "Sub_metering_3",
    "hour_sin",
    "hour_cos",
    "dow_sin",
    "dow_cos",
    "Global_intensity_lag1h",
    "Global_intensity_lag24h",
    "Sub_metering_3_lag1h",
    "Sub_metering_3_lag24h",
    "Sub_metering_2_lag1h",
    "Sub_metering_2_lag24h",
    "Sub_metering_1_lag1h",
    "Sub_metering_1_lag24h",
    "Global_reactive_power_lag1h",
    "Global_reactive_power_lag24h",
    "Voltage_lag1h",
    "Voltage_lag24h",
    "Global_active_power_lag1h",
    "Global_active_power_lag24h",
]

FEATURE_OFFSETS_MINUTES = {
    column: (-1440 if column.endswith("lag24h") else -60 if column.endswith("lag1h") else 0)
    for column in FEATURE_COLUMNS
}


@dataclass
class HorizonDataset:
    label: str
    minutes: int
    X_train: pd.DataFrame
    y_train: np.ndarray
    X_val: pd.DataFrame
    y_val: np.ndarray
    baseline_val: np.ndarray
    X_test: pd.DataFrame
    y_test: np.ndarray
    baseline_test: np.ndarray
    split_timestamps: dict
    leakage_checks: dict


def _json_default(value):
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return float(value)
    if isinstance(value, (pd.Timestamp, datetime.datetime, datetime.date)):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def _atomic_write_json(path, payload):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    temp_path = f"{path}.tmp-{uuid.uuid4().hex}"
    with open(temp_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, default=_json_default)
    os.replace(temp_path, path)


def log_system_event(event_type, description, model_name="None", transition="N/A"):
    db_path = os.path.join(BASE_DIR, "events.db")
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute(
        """CREATE TABLE IF NOT EXISTS system_events
           (timestamp TEXT, type TEXT, description TEXT, active_model TEXT,
            transition TEXT, user TEXT DEFAULT 'system')"""
    )
    try:
        cur.execute("ALTER TABLE system_events ADD COLUMN user TEXT DEFAULT 'system'")
    except sqlite3.OperationalError:
        pass
    cur.execute(
        """INSERT INTO system_events
           (timestamp, type, description, active_model, transition, user)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (
            datetime.datetime.now(datetime.timezone.utc).isoformat(),
            event_type,
            description,
            model_name,
            transition,
            "system",
        ),
    )
    conn.commit()
    conn.close()


def load_data(parquet_path=None):
    parquet_path = parquet_path or os.path.join(BASE_DIR, "data", "processed.parquet")
    if os.path.isdir(parquet_path):
        parquet_files = sorted(glob.glob(os.path.join(parquet_path, "*.parquet")))
    elif os.path.isfile(parquet_path):
        parquet_files = [parquet_path]
    else:
        parquet_files = []
    if not parquet_files:
        raise FileNotFoundError(f"No parquet files found at {parquet_path}.")

    df = pd.concat([pd.read_parquet(path) for path in parquet_files], ignore_index=True)
    required = {"datetime", TARGET, *FEATURE_COLUMNS}
    missing = sorted(required.difference(df.columns))
    if missing:
        raise ValueError(f"Processed dataset is missing columns: {missing}")

    df["datetime"] = pd.to_datetime(df["datetime"], errors="raise")
    df = df.sort_values("datetime").drop_duplicates("datetime", keep="last").set_index("datetime")
    if not df.index.is_monotonic_increasing or not df.index.is_unique:
        raise ValueError("Datetime index must be sorted and unique.")
    if len(df) < 20_000:
        raise ValueError("Dataset is too small for the configured temporal partitions.")
    gaps = df.index.to_series().diff().dropna()
    if not gaps.eq(pd.Timedelta(minutes=1)).all():
        raise ValueError("Processed dataset must have an exact one-minute grid.")
    return df


def build_horizon_dataset(df, label, minutes, train_fraction=0.8, val_fraction=0.9):
    if label not in HORIZONS or HORIZONS[label] != minutes:
        raise ValueError(f"Unsupported horizon: {label}={minutes}")
    if not 0 < train_fraction < val_fraction < 1:
        raise ValueError("Expected 0 < train_fraction < val_fraction < 1.")

    n_rows = len(df)
    train_cut = df.index[int(n_rows * train_fraction)]
    val_cut = df.index[int(n_rows * val_fraction)]
    origin_time = pd.Series(df.index, index=df.index)
    target_time = origin_time + pd.Timedelta(minutes=minutes)
    y_future = df[TARGET].shift(-minutes)
    X = df[FEATURE_COLUMNS]

    # Baselines use the target observed at forecast origin. Requiring it here
    # ensures candidate and baseline metrics are evaluated on identical rows.
    valid = X.notna().all(axis=1) & y_future.notna() & df[TARGET].notna()
    train_mask = valid & (origin_time < train_cut) & (target_time < train_cut)
    val_mask = valid & (origin_time >= train_cut) & (origin_time < val_cut) & (target_time < val_cut)
    test_mask = valid & (origin_time >= val_cut) & (target_time <= df.index.max())

    masks = {"train": train_mask, "validation": val_mask, "test": test_mask}
    if any(int(mask.sum()) == 0 for mask in masks.values()):
        raise ValueError(f"Horizon {label} produced an empty temporal partition.")

    split_timestamps = {
        "train_origin_start": origin_time[train_mask].min(),
        "train_origin_end": origin_time[train_mask].max(),
        "train_target_end": target_time[train_mask].max(),
        "validation_origin_start": origin_time[val_mask].min(),
        "validation_origin_end": origin_time[val_mask].max(),
        "validation_target_end": target_time[val_mask].max(),
        "test_origin_start": origin_time[test_mask].min(),
        "test_origin_end": origin_time[test_mask].max(),
        "test_target_end": target_time[test_mask].max(),
        "train_rows": int(train_mask.sum()),
        "validation_rows": int(val_mask.sum()),
        "test_rows": int(test_mask.sum()),
    }

    expected_target = df[TARGET].reindex(target_time[valid].to_numpy()).to_numpy()
    actual_target = y_future[valid].to_numpy()
    target_alignment = bool(np.allclose(expected_target, actual_target, equal_nan=True))
    leakage_checks = {
        "positive_forecast_horizon": minutes > 0,
        "features_available_at_origin": max(FEATURE_OFFSETS_MINUTES.values()) <= 0,
        "exact_target_timestamp_alignment": target_alignment,
        "train_targets_precede_validation_origins": bool(
            target_time[train_mask].max() < origin_time[val_mask].min()
        ),
        "validation_targets_precede_test_origins": bool(
            target_time[val_mask].max() < origin_time[test_mask].min()
        ),
    }

    return HorizonDataset(
        label=label,
        minutes=minutes,
        X_train=X.loc[train_mask].copy(),
        y_train=y_future.loc[train_mask].to_numpy(),
        X_val=X.loc[val_mask].copy(),
        y_val=y_future.loc[val_mask].to_numpy(),
        baseline_val=df.loc[val_mask, TARGET].to_numpy(),
        X_test=X.loc[test_mask].copy(),
        y_test=y_future.loc[test_mask].to_numpy(),
        baseline_test=df.loc[test_mask, TARGET].to_numpy(),
        split_timestamps=split_timestamps,
        leakage_checks=leakage_checks,
    )


def build_preprocessor():
    skewed = [
        column
        for column in FEATURE_COLUMNS
        if column.startswith("Global_intensity")
        or column.startswith("Sub_metering_1")
        or column.startswith("Sub_metering_2")
    ]
    robust = [column for column in FEATURE_COLUMNS if column not in skewed]
    return ColumnTransformer(
        transformers=[
            ("power", PowerTransformer(method="yeo-johnson"), skewed),
            ("robust", RobustScaler(), robust),
        ],
        remainder="drop",
        verbose_feature_names_out=False,
    )


def model_templates():
    return {
        "Ridge": Ridge(alpha=1.0),
        "LightGBM": lgb.LGBMRegressor(
            n_estimators=150, learning_rate=0.05, random_state=42, n_jobs=-1, verbosity=-1
        ),
        "XGBoost": xgb.XGBRegressor(
            n_estimators=150, learning_rate=0.05, random_state=42, n_jobs=-1
        ),
    }


def regression_metrics(y_true, predictions):
    return {
        "rmse": float(np.sqrt(mean_squared_error(y_true, predictions))),
        "mae": float(mean_absolute_error(y_true, predictions)),
        "r2": float(r2_score(y_true, predictions)),
    }


def assess_quality_gate(label, test_metrics, baseline_metrics, leakage_checks):
    improvement = 1.0 - (test_metrics["rmse"] / baseline_metrics["rmse"])
    leakage_passed = all(leakage_checks.values())
    return {
        "passed": bool(
            leakage_passed
            and test_metrics["r2"] >= R2_FLOORS[label]
            and improvement >= MIN_BASELINE_RMSE_IMPROVEMENT
        ),
        "leakage_checks_passed": leakage_passed,
        "r2_floor": R2_FLOORS[label],
        "r2_floor_passed": bool(test_metrics["r2"] >= R2_FLOORS[label]),
        "minimum_baseline_rmse_improvement": MIN_BASELINE_RMSE_IMPROVEMENT,
        "baseline_rmse_improvement": float(improvement),
        "baseline_improvement_passed": bool(improvement >= MIN_BASELINE_RMSE_IMPROVEMENT),
    }


def _set_common_mlflow_tags(dataset, model_name, candidate=False):
    mlflow.set_tags(
        {
            "evaluation_protocol": EVALUATION_PROTOCOL,
            "horizon": dataset.label,
            "horizon_minutes": str(dataset.minutes),
            "model_type": model_name,
            "candidate": str(candidate).lower(),
            "feature_availability": "forecast_origin_or_earlier",
            "split_policy": "chronological_80_10_10_horizon_purged",
        }
    )
    for check, passed in dataset.leakage_checks.items():
        mlflow.set_tag(f"leakage_check.{check}", str(passed).lower())
    for name, value in dataset.split_timestamps.items():
        mlflow.set_tag(f"split.{name}", str(value))


def _metric_sort_key(candidate):
    metrics = candidate["validation"]
    return metrics["rmse"], -metrics["r2"], metrics["mae"]


def _artifact_schema(version, data_start, data_end, selected, report):
    horizons = {label: result["report"] for label, result in selected.items()}
    one_minute = horizons["1_step"]
    one_hour = horizons["1h"]
    one_day = horizons["24h"]
    artifact_paths = {
        label: f"model_artifacts/versions/{version}/{label}" for label in HORIZONS
    }
    return {
        "schema_version": 2,
        "evaluation_protocol": EVALUATION_PROTOCOL,
        "artifact_version": version,
        "artifact_paths": artifact_paths,
        "best_model": one_minute["model_name"],
        "model_1h": one_hour["model_name"],
        "model_24h": one_day["model_name"],
        "latest_r2": one_minute["test"]["r2"],
        "latest_rmse": one_minute["test"]["rmse"],
        "latest_mae": one_minute["test"]["mae"],
        "latest_r2_1h": one_hour["test"]["r2"],
        "latest_r2_24h": one_day["test"]["r2"],
        "required_features": FEATURE_COLUMNS,
        "feature_contract": {
            "as_of": "forecast_origin_or_earlier",
            "frequency_minutes": 1,
            "offsets_minutes": FEATURE_OFFSETS_MINUTES,
        },
        "horizons": horizons,
        "quality_gate": report["quality_gate"],
        "data_version": f"Window[{data_start}_{data_end}]",
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


def _promote_selected_models(version, data_start, data_end, selected, report):
    artifacts_root = os.path.join(BASE_DIR, "model_artifacts")
    versions_root = os.path.join(artifacts_root, "versions")
    staging_root = os.path.join(artifacts_root, ".staging", version)
    final_root = os.path.join(versions_root, version)
    if os.path.exists(staging_root):
        shutil.rmtree(staging_root)
    os.makedirs(staging_root, exist_ok=True)

    try:
        for label, result in selected.items():
            model_path = os.path.join(staging_root, label)
            mlflow.sklearn.save_model(result["pipeline"], model_path)
            reloaded = mlflow.sklearn.load_model(model_path)
            smoke_prediction = reloaded.predict(result["sample"])
            if len(smoke_prediction) != 1 or not np.isfinite(smoke_prediction[0]):
                raise ValueError(f"Artifact smoke test failed for {label}.")

        os.makedirs(versions_root, exist_ok=True)
        os.replace(staging_root, final_root)

        production_path = os.path.join(BASE_DIR, "models", "production_schema.json")
        rollback_path = os.path.join(BASE_DIR, "models", "rollback_schema.json")
        legacy_path = os.path.join(BASE_DIR, "models", "legacy_schema_v1.json")
        current = None
        if os.path.exists(production_path):
            with open(production_path, "r", encoding="utf-8") as handle:
                current = json.load(handle)

        if current and current.get("schema_version") == 2:
            rollback = dict(current)
            rollback["available"] = True
            _atomic_write_json(rollback_path, rollback)
        else:
            if current:
                _atomic_write_json(legacy_path, current)
            _atomic_write_json(
                rollback_path,
                {
                    "schema_version": 2,
                    "available": False,
                    "reason": "No previous leakage-free production bundle is available.",
                },
            )

        schema = _artifact_schema(version, data_start, data_end, selected, report)
        _atomic_write_json(production_path, schema)
        return schema
    except Exception:
        if os.path.exists(staging_root):
            shutil.rmtree(staging_root)
        raise


def train_and_log(run_name="Leakage-Free-Training", promote=False, dataframe=None):
    mlflow.set_tracking_uri(f"sqlite:///{os.path.join(BASE_DIR, 'mlruns.db')}")
    mlflow.set_experiment("Energy-Forecasting")

    df = dataframe.copy() if dataframe is not None else load_data()
    data_start = str(df.index.min())
    data_end = str(df.index.max())
    version = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    log_system_event(
        "Retraining Triggered",
        f"Protocol {EVALUATION_PROTOCOL}; data {data_start} through {data_end}",
        transition="Evaluating",
    )

    selected = {}
    horizon_reports = {}
    for label, minutes in HORIZONS.items():
        dataset = build_horizon_dataset(df, label, minutes)
        baseline_validation = regression_metrics(dataset.y_val, dataset.baseline_val)
        baseline_test = regression_metrics(dataset.y_test, dataset.baseline_test)
        candidates = []

        for model_name, estimator in model_templates().items():
            pipeline = Pipeline(
                steps=[
                    ("preprocessor", clone(build_preprocessor())),
                    ("regressor", clone(estimator)),
                ]
            )
            pipeline.fit(dataset.X_train, dataset.y_train)
            validation = regression_metrics(dataset.y_val, pipeline.predict(dataset.X_val))
            with mlflow.start_run(run_name=f"{run_name}-{label}-{model_name}") as run:
                _set_common_mlflow_tags(dataset, model_name, candidate=True)
                mlflow.log_metrics({f"val_{key}": value for key, value in validation.items()})
                mlflow.log_metrics(
                    {f"baseline_val_{key}": value for key, value in baseline_validation.items()}
                )
                run_id = run.info.run_id
            candidates.append(
                {
                    "model_type": model_name,
                    "pipeline": pipeline,
                    "validation": validation,
                    "candidate_run_id": run_id,
                }
            )

        winner = min(candidates, key=_metric_sort_key)
        test = regression_metrics(dataset.y_test, winner["pipeline"].predict(dataset.X_test))
        gate = assess_quality_gate(label, test, baseline_test, dataset.leakage_checks)
        improvement = gate["baseline_rmse_improvement"]
        registered_name = f"EnergyForecaster_{winner['model_type']}_{label}"
        with mlflow.start_run(run_name=f"{run_name}-{label}-Selected-{winner['model_type']}") as run:
            _set_common_mlflow_tags(dataset, winner["model_type"], candidate=False)
            mlflow.set_tag("selected", "true")
            mlflow.set_tag("quality_gate_passed", str(gate["passed"]).lower())
            mlflow.set_tag("candidate_run_id", winner["candidate_run_id"])
            mlflow.log_metrics({f"val_{key}": value for key, value in winner["validation"].items()})
            mlflow.log_metrics({f"test_{key}": value for key, value in test.items()})
            mlflow.log_metrics({f"baseline_test_{key}": value for key, value in baseline_test.items()})
            mlflow.log_metric("baseline_test_rmse_improvement", improvement)
            mlflow.sklearn.log_model(winner["pipeline"], name="model")
            selected_run_id = run.info.run_id

        horizon_report = {
            "minutes": minutes,
            "model_name": registered_name,
            "model_type": winner["model_type"],
            "selected_run_id": selected_run_id,
            "validation": winner["validation"],
            "test": test,
            "baseline_validation": baseline_validation,
            "baseline_test": baseline_test,
            "split_timestamps": dataset.split_timestamps,
            "leakage_checks": dataset.leakage_checks,
            "gate": gate,
        }
        horizon_reports[label] = horizon_report
        selected[label] = {
            "pipeline": winner["pipeline"],
            "sample": dataset.X_test.iloc[[0]],
            "report": horizon_report,
        }

    passed = all(item["gate"]["passed"] for item in horizon_reports.values())
    report = {
        "evaluation_protocol": EVALUATION_PROTOCOL,
        "artifact_version": version,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "dataset": {"start": data_start, "end": data_end, "rows": len(df)},
        "feature_contract": {
            "required_features": FEATURE_COLUMNS,
            "offsets_minutes": FEATURE_OFFSETS_MINUTES,
            "as_of": "forecast_origin_or_earlier",
        },
        "horizons": horizon_reports,
        "quality_gate": {
            "passed": passed,
            "r2_floors": R2_FLOORS,
            "minimum_baseline_rmse_improvement": MIN_BASELINE_RMSE_IMPROVEMENT,
        },
        "promoted": False,
    }

    if promote and passed:
        schema = _promote_selected_models(version, data_start, data_end, selected, report)
        report["promoted"] = True
        report["production_schema_version"] = schema["schema_version"]
        log_system_event(
            "Model Promoted",
            f"Leakage-free multi-horizon bundle {version} promoted.",
            schema["best_model"],
            "Production",
        )
    elif promote:
        log_system_event(
            "Promotion Failed",
            f"Bundle {version} failed leakage or metric gates; production unchanged.",
            transition="Archived",
        )

    report_path = os.path.join(BASE_DIR, "models", "validation_report.json")
    _atomic_write_json(report_path, report)
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description="Train leakage-free energy forecasts.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--evaluate-only", action="store_true", help="Evaluate and write a report only (default).")
    mode.add_argument("--promote", action="store_true", help="Promote only when every quality gate passes.")
    args = parser.parse_args(argv)
    report = train_and_log(promote=args.promote)
    print(json.dumps(report, indent=2, default=_json_default))
    return 0 if report["quality_gate"]["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
