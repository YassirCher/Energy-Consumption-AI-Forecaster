from fastapi import FastAPI, HTTPException, BackgroundTasks, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
import mlflow.sklearn
import numpy as np
import pandas as pd
import json
import os
import sys
import sqlite3
import datetime
import time
import threading
import asyncio
import io
import csv

base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.append(base_dir)

from src.ml.drift_detector import DriftDetector
from src.ml.self_healing import SelfHealer
from src.api.auth import (
    LoginRequest, TokenResponse, authenticate_user, create_access_token,
    get_current_user, require_admin
)
from src.api.agents import orchestrator, chat_agent, anomaly_explainer, agent_registry
from src.api.graph_rag import get_graph, rebuild_graph
from src.api.shap_explainer import compute_shap_summary, compute_shap_local
from src.api.llm_service import get_active_model, get_fallback_model, get_cache_stats

app = FastAPI(title="EcoForecaster — AI-Powered Energy Platform", version="5.1.0")

cors_origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Profiling Middleware ──────────────────────────────────────────────────────

@app.middleware("http")
async def profiling_middleware(request: Request, call_next):
    """Log timing for all requests exceeding 100ms."""
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    if elapsed_ms > 100:
        print(f"[PERF] {request.method} {request.url.path} — {elapsed_ms:.0f}ms")
    response.headers["X-Response-Time"] = f"{elapsed_ms:.1f}ms"
    return response

# ─── Rate Limiter for AI endpoints ────────────────────────────────────────────

class SimpleRateLimiter:
    """Simple in-memory rate limiter for AI endpoints."""
    def __init__(self, min_interval_seconds: float = 3.0):
        self._last_request: dict[str, float] = {}
        self._lock = threading.Lock()
        self.min_interval = min_interval_seconds

    def allow(self, key: str = "global") -> bool:
        with self._lock:
            now = time.time()
            last = self._last_request.get(key, 0)
            if now - last < self.min_interval:
                return False
            self._last_request[key] = now
            return True

ai_rate_limiter = SimpleRateLimiter(min_interval_seconds=3.0)

# ─── Pydantic Schemas ──────────────────────────────────────────────────────────

class SingleInference(BaseModel):
    model_config = ConfigDict(extra="ignore")

    Global_intensity: float = Field(..., description="Intensity metric")
    Global_reactive_power: float = 0.0
    Voltage: float = 240.0
    Sub_metering_1: float = 0.0
    Sub_metering_2: float = 0.0
    Sub_metering_3: float = 0.0
    Global_active_power_lag1h: float = 0.0
    Global_active_power_lag24h: float = 0.0
    Global_intensity_lag1h: float = 0.0
    Global_intensity_lag24h: float = 0.0
    Sub_metering_3_lag1h: float = 0.0
    Sub_metering_3_lag24h: float = 0.0
    Sub_metering_2_lag1h: float = 0.0
    Sub_metering_2_lag24h: float = 0.0
    Sub_metering_1_lag1h: float = 0.0
    Sub_metering_1_lag24h: float = 0.0
    Global_reactive_power_lag1h: float = 0.0
    Global_reactive_power_lag24h: float = 0.0
    Voltage_lag1h: float = 240.0
    Voltage_lag24h: float = 240.0
    hour_sin: float = 0.0
    hour_cos: float = 1.0
    dow_sin: float = 0.0
    dow_cos: float = 1.0

class InferenceRequest(BaseModel):
    features: list[dict]

class SimulationRequest(BaseModel):
    baseline: dict = {}
    modified: dict = {}

# ─── Cache Layer ────────────────────────────────────────────────────────────────

class TTLCache:
    """Simple in-memory cache with TTL to avoid recomputing expensive operations."""
    def __init__(self):
        self._store = {}
        self._lock = threading.Lock()

    def get(self, key, ttl_seconds=60):
        with self._lock:
            if key in self._store:
                val, ts = self._store[key]
                if time.time() - ts < ttl_seconds:
                    return val
                del self._store[key]
        return None

    def set(self, key, value):
        with self._lock:
            self._store[key] = (value, time.time())

cache = TTLCache()

# ─── Prediction History Buffer ─────────────────────────────────────────────────

class PredictionHistory:
    """Thread-safe rolling buffer for recent predictions (for export)."""
    def __init__(self, max_size=500):
        self._buffer = []
        self._lock = threading.Lock()
        self.max_size = max_size

    def add(self, record):
        with self._lock:
            self._buffer.append(record)
            if len(self._buffer) > self.max_size:
                self._buffer = self._buffer[-self.max_size:]

    def get_all(self):
        with self._lock:
            return list(self._buffer)

prediction_history = PredictionHistory()

# ─── Anomaly Detector (Modular) ────────────────────────────────────────────────

class AnomalyDetector:
    """
    Hybrid anomaly detection: Isolation Forest + rolling z-score.
    Provides anomaly scores, reasons, and multiple detection signals.
    """
    def __init__(self, window_size=30, z_threshold=2.0, contamination=0.05):
        self.window_size = window_size
        self.z_threshold = z_threshold
        self.contamination = contamination
        self._history = []
        self._iforest = None
        self._iforest_fitted = False

    def _fit_iforest(self):
        if len(self._history) >= 50:
            try:
                from sklearn.ensemble import IsolationForest
                data = np.array(self._history[-200:]).reshape(-1, 1)
                self._iforest = IsolationForest(
                    n_estimators=100, contamination=self.contamination, random_state=42
                )
                self._iforest.fit(data)
                self._iforest_fitted = True
            except Exception:
                self._iforest_fitted = False

    def detect(self, value: float) -> dict:
        self._history.append(value)
        if len(self._history) > 300:
            self._history = self._history[-300:]

        window = self._history[-self.window_size:]
        result = {"is_anomaly": False, "z_score": 0.0, "anomaly_score": 0.0,
                  "method": "hybrid_iforest_zscore", "reason": ""}

        # Z-score detection
        if len(window) >= 5:
            mean = np.mean(window)
            std = np.std(window)
            if std > 1e-10:
                z = abs(value - mean) / std
                result["z_score"] = round(float(z), 3)
                if z > self.z_threshold:
                    direction = "above" if value > mean else "below"
                    result["reason"] = f"Value {direction} mean by {z:.1f}σ"

        # Isolation Forest detection (refit every 100 samples for performance)
        if len(self._history) >= 50:
            if not self._iforest_fitted or len(self._history) % 100 == 0:
                self._fit_iforest()
            if self._iforest_fitted and self._iforest is not None:
                score = self._iforest.score_samples(np.array([[value]]))[0]
                result["anomaly_score"] = round(float(-score), 3)
                is_outlier = self._iforest.predict(np.array([[value]]))[0] == -1
                if is_outlier and not result["reason"]:
                    result["reason"] = f"Isolation Forest outlier (score: {-score:.3f})"
                result["is_anomaly"] = bool(is_outlier or result["z_score"] > self.z_threshold)
            else:
                result["is_anomaly"] = bool(result["z_score"] > self.z_threshold)
        else:
            result["is_anomaly"] = bool(result["z_score"] > self.z_threshold)
            result["method"] = "zscore_warmup"

        return result

anomaly_detector = AnomalyDetector()

# ─── Model Manager ─────────────────────────────────────────────────────────────

class ModelManager:
    def __init__(self):
        self.mlflow_uri = f"sqlite:///{os.path.join(base_dir, 'mlruns.db')}"
        mlflow.set_tracking_uri(self.mlflow_uri)
        self.required_features = []
        self.metrics = {}

        self.model = None
        self.model_1h = None
        self.model_24h = None
        self.feature_importances = []

        self.p99_latency_ms = 0.0
        self.latency_buffer = []
        self.load_latest_production_model()

    def log_latency(self, latency):
        self.latency_buffer.append(latency)
        if len(self.latency_buffer) > 100:
            self.latency_buffer.pop(0)
        self.p99_latency_ms = float(np.percentile(self.latency_buffer, 99)) if self.latency_buffer else 0.0

    def extract_importances(self):
        try:
            regressor = self.model.named_steps.get('regressor', None)
            if regressor and hasattr(regressor, 'feature_importances_'):
                imp = regressor.feature_importances_
                imp = imp / imp.sum()
                res = [{"feature": f, "importance": float(imp[i])} for i, f in enumerate(self.required_features)]
                self.feature_importances = sorted(res, key=lambda x: x["importance"], reverse=True)
        except Exception as e:
            print(f"Feature importance extraction note: {e}")

    def load_latest_production_model(self, schema_file="production_schema.json"):
        schema_path = os.path.join(base_dir, "models", schema_file)
        if not os.path.exists(schema_path):
            return False

        with open(schema_path, "r") as f:
            cfg = json.load(f)

        self.required_features = cfg.get("required_features", [])
        self.metrics = {
            "R2": cfg.get("latest_r2"),
            "RMSE": cfg.get("latest_rmse"),
            "R2_1h": cfg.get("latest_r2_1h"),
            "R2_24h": cfg.get("latest_r2_24h"),
            "Active_Model": cfg.get("best_model"),
            "Data_Version": cfg.get("data_version", "Unknown")
        }

        bundled_root = os.path.join(base_dir, "model_artifacts")
        bundled_models = {
            "base": os.path.join(bundled_root, "base"),
            "1h": os.path.join(bundled_root, "1h"),
            "24h": os.path.join(bundled_root, "24h"),
        }

        try:
            if all(os.path.isfile(os.path.join(path, "MLmodel")) for path in bundled_models.values()):
                print("Loading bundled production models...")
                self.model = mlflow.sklearn.load_model(bundled_models["base"])
                self.model_1h = mlflow.sklearn.load_model(bundled_models["1h"])
                self.model_24h = mlflow.sklearn.load_model(bundled_models["24h"])
                self.extract_importances()
                print("All 3 bundled horizon models loaded successfully.")
                return True

            print("Loading production models from MLflow registry...")
            self.model = mlflow.sklearn.load_model(f"models:/{cfg.get('best_model')}/latest")
            self.model_1h = mlflow.sklearn.load_model(f"models:/{cfg.get('model_1h')}/latest")
            self.model_24h = mlflow.sklearn.load_model(f"models:/{cfg.get('model_24h')}/latest")
            self.extract_importances()
            print("All 3 horizon models loaded successfully.")
            return True
        except Exception as e:
            print(f"Model loading warning: {e}")
            return False

model_mgr = ModelManager()

# ─── System Events DB Helper ──────────────────────────────────────────────────

def ensure_events_table():
    """Ensure system_events table has the user column."""
    db_path = os.path.join(base_dir, 'events.db')
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute('''CREATE TABLE IF NOT EXISTS system_events 
                   (timestamp TEXT, type TEXT, description TEXT, active_model TEXT, transition TEXT, user TEXT DEFAULT 'system')''')
    # Add user column if missing (migration for existing tables)
    try:
        cur.execute("ALTER TABLE system_events ADD COLUMN user TEXT DEFAULT 'system'")
    except sqlite3.OperationalError:
        pass  # Column already exists
    conn.commit()
    conn.close()

ensure_events_table()

def log_system_event_with_user(event_type, description, model_name="None", transition="N/A", user="system"):
    """Log a system event with user attribution."""
    db_path = os.path.join(base_dir, 'events.db')
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("INSERT INTO system_events VALUES (?, ?, ?, ?, ?, ?)",
                (datetime.datetime.now().isoformat(), event_type, description, model_name, transition, user))
    conn.commit()
    conn.close()

# ─── Endpoints ──────────────────────────────────────────────────────────────────

@app.get("/system/health")
def healthcheck():
    status = "healthy" if model_mgr.model else "cold_start"
    r2 = model_mgr.metrics.get("R2", 0) or 0

    health_score = 0
    if status == "healthy":
        health_score = 100
        health_score -= min(10, model_mgr.p99_latency_ms / 10)
        health_score -= (1.0 - r2) * 50 if r2 > 0 else 50
        detector = DriftDetector()
        alerts = detector.get_latest_alerts()
        if alerts:
            recent = alerts[-5:]
            breach_count = sum(1 for a in recent if a.get("is_breach"))
            health_score -= breach_count * 4

    return {
        "status": status,
        "active_model": model_mgr.metrics.get("Active_Model", "None"),
        "latency_p99_ms": round(model_mgr.p99_latency_ms, 2),
        "health_score": max(0, min(100, round(health_score))),
        "models_loaded": {
            "base": model_mgr.model is not None,
            "1h": model_mgr.model_1h is not None,
            "24h": model_mgr.model_24h is not None
        }
    }


@app.get("/metrics")
def get_metrics():
    if not model_mgr.metrics:
        raise HTTPException(status_code=503, detail="No metrics available")
    return model_mgr.metrics


@app.get("/metrics/history")
def get_metrics_history():
    cached = cache.get("metrics_history", ttl_seconds=30)
    if cached:
        return cached

    try:
        from mlflow.tracking import MlflowClient
        client = MlflowClient(tracking_uri=model_mgr.mlflow_uri)
        experiment = client.get_experiment_by_name("Energy-Forecasting")
        if not experiment:
            return {"history": []}

        runs = client.search_runs(experiment.experiment_id, order_by=["start_time ASC"])
        history = []
        for r in runs:
            r2 = r.data.metrics.get("val_r2")
            if r2 is not None:
                history.append({
                    "timestamp": r.info.start_time,
                    "run_name": r.data.tags.get("mlflow.runName", "Run"),
                    "r2": r2,
                    "rmse": r.data.metrics.get("val_rmse", 0),
                    "mae": r.data.metrics.get("val_mae", 0)
                })
        result = {"history": history}
        cache.set("metrics_history", result)
        return result
    except Exception as e:
        return {"error": str(e), "history": []}


@app.get("/metrics/performance-timeline")
def get_performance_timeline():
    """Returns R²/RMSE evolution over training runs for degradation monitoring."""
    cached = cache.get("perf_timeline", ttl_seconds=30)
    if cached:
        return cached

    try:
        from mlflow.tracking import MlflowClient
        client = MlflowClient(tracking_uri=model_mgr.mlflow_uri)
        experiment = client.get_experiment_by_name("Energy-Forecasting")
        if not experiment:
            return {"timeline": []}

        runs = client.search_runs(experiment.experiment_id, order_by=["start_time ASC"])
        timeline = []
        for r in runs:
            r2 = r.data.metrics.get("val_r2")
            rmse = r.data.metrics.get("val_rmse")
            if r2 is not None:
                run_name = r.data.tags.get("mlflow.runName", "Run")
                # Only include base model runs (not horizon-specific)
                if "1h" not in run_name and "24h" not in run_name:
                    timeline.append({
                        "timestamp": r.info.start_time,
                        "run_name": run_name,
                        "r2": round(r2, 6),
                        "rmse": round(rmse, 6) if rmse else None,
                        "mae": round(r.data.metrics.get("val_mae", 0), 6),
                        "model_type": next((arch for arch in ["Ridge", "LightGBM", "XGBoost"] if arch in run_name), "Unknown"),
                        "is_degraded": r2 < 0.98
                    })

        result = {"timeline": timeline}
        cache.set("perf_timeline", result)
        return result
    except Exception as e:
        return {"error": str(e), "timeline": []}


@app.get("/explain")
def get_explainability():
    if not model_mgr.feature_importances:
        return {"importances": [], "insight": "No interpretable model loaded."}

    top = model_mgr.feature_importances[0]
    top3 = model_mgr.feature_importances[:3]

    top3_text = ", ".join([f"{f['feature']} ({round(f['importance']*100, 1)}%)" for f in top3])

    return {
        "importances": model_mgr.feature_importances[:12],
        "insight": f"Top drivers: {top3_text}. {top['feature']} dominates predictions, contributing {round(top['importance']*100)}% of the total model variance.",
        "top_drivers": top3
    }


@app.get("/explain/history")
def get_feature_importance_history():
    """Returns feature importance snapshots across training runs for evolution tracking."""
    cached = cache.get("explain_history", ttl_seconds=60)
    if cached:
        return cached

    try:
        from mlflow.tracking import MlflowClient
        client = MlflowClient(tracking_uri=model_mgr.mlflow_uri)
        experiment = client.get_experiment_by_name("Energy-Forecasting")
        if not experiment:
            return {"snapshots": []}

        runs = client.search_runs(experiment.experiment_id, order_by=["start_time ASC"])
        snapshots = []

        for r in runs:
            run_name = r.data.tags.get("mlflow.runName", "Run")
            r2 = r.data.metrics.get("val_r2")
            if r2 is None or "1h" in run_name or "24h" in run_name:
                continue

            # Try to load feature importance artifact if stored
            importance_path = os.path.join(base_dir, "models", "importance_snapshots", f"{r.info.run_id}.json")
            if os.path.exists(importance_path):
                with open(importance_path, "r") as f:
                    importances = json.load(f)
            else:
                # Try to reconstruct from the model itself
                try:
                    model = mlflow.sklearn.load_model(f"runs:/{r.info.run_id}/model")
                    regressor = model.named_steps.get('regressor', None)
                    if regressor and hasattr(regressor, 'feature_importances_'):
                        imp = regressor.feature_importances_
                        imp = imp / imp.sum()
                        features = model_mgr.required_features
                        if len(features) == len(imp):
                            importances = [{"feature": features[i], "importance": float(imp[i])} for i in range(len(imp))]
                            importances.sort(key=lambda x: x["importance"], reverse=True)
                            # Cache for future use
                            os.makedirs(os.path.dirname(importance_path), exist_ok=True)
                            with open(importance_path, "w") as f:
                                json.dump(importances, f)
                        else:
                            continue
                    else:
                        continue
                except Exception:
                    continue

            model_type = next((arch for arch in ["Ridge", "LightGBM", "XGBoost"] if arch in run_name), "Unknown")
            snapshots.append({
                "run_id": r.info.run_id,
                "run_name": run_name,
                "timestamp": r.info.start_time,
                "model_type": model_type,
                "r2": round(r2, 6),
                "importances": importances[:12]
            })

        result = {"snapshots": snapshots}
        cache.set("explain_history", result)
        return result
    except Exception as e:
        return {"error": str(e), "snapshots": []}


@app.get("/data/stats")
def get_data_stats():
    cached = cache.get("data_stats", ttl_seconds=120)
    if cached:
        return cached

    pq_path = os.path.join(base_dir, "data", "processed.parquet")
    if not os.path.exists(pq_path):
        return {"error": "Missing parquet data"}

    import glob
    files = glob.glob(os.path.join(pq_path, "*.parquet"))
    if not files:
        return {"error": "Empty data directory"}

    try:
        df = pd.read_parquet(files[0])
        df_sample = df.sample(min(5000, len(df)), random_state=42)

        numeric_cols = df_sample.select_dtypes(include=[np.number]).columns.tolist()
        display_cols = numeric_cols[:12]

        distributions = {}
        for c in display_cols:
            col_data = df_sample[c].dropna()
            if len(col_data) > 0:
                counts, bins = np.histogram(col_data, bins=15)
                distributions[c] = {"counts": counts.tolist(), "bins": bins.tolist()}

        desc = df_sample[display_cols].describe().to_dict()
        descriptive = {}
        for col in display_cols:
            if col in desc:
                descriptive[col] = {k: round(v, 4) if isinstance(v, float) else v for k, v in desc[col].items()}

        corr_cols = display_cols[:8]
        corr_matrix = df_sample[corr_cols].corr().round(3).to_dict()

        total_rows = len(df)
        missing = {}
        for c in display_cols:
            miss_count = int(df[c].isna().sum()) if c in df.columns else 0
            missing[c] = {
                "count": miss_count,
                "percentage": round(miss_count / total_rows * 100, 2) if total_rows > 0 else 0
            }

        result = {
            "distributions": distributions,
            "descriptive": descriptive,
            "correlation": corr_matrix,
            "missing_values": missing,
            "total_rows": total_rows,
            "total_rows_sampled": len(df_sample),
            "features": df.columns.tolist(),
            "numeric_features": numeric_cols
        }
        cache.set("data_stats", result)
        return result

    except Exception as e:
        return {"error": str(e)}


@app.get("/alerts")
def get_alerts():
    detector = DriftDetector()
    alerts = detector.get_latest_alerts()

    for a in alerts:
        js = a.get("js_divergence", 0)
        a["severity"] = "CRITICAL" if a.get("is_breach") else ("WARNING" if js > 0.08 else "INFO")

    db_path = os.path.join(base_dir, 'events.db')
    system_alerts = []
    if os.path.exists(db_path):
        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute("SELECT * FROM system_events ORDER BY timestamp DESC LIMIT 20")
            for row in cur.fetchall():
                r = dict(row)
                ev_type = r.get("type", "")
                severity = "INFO"
                if "Drift" in ev_type or "Failed" in ev_type:
                    severity = "WARNING"
                if "Promoted" in ev_type or "Restored" in ev_type:
                    severity = "INFO"

                system_alerts.append({
                    "timestamp": r.get("timestamp"),
                    "type": "system_event",
                    "event_type": ev_type,
                    "description": r.get("description", ""),
                    "severity": severity,
                    "model": r.get("active_model"),
                    "transition": r.get("transition"),
                    "user": r.get("user", "system")
                })
            conn.close()
        except Exception:
            pass

    return {
        "drift_alerts": alerts,
        "system_alerts": system_alerts,
        "total_events": len(alerts) + len(system_alerts),
        "critical_count": sum(1 for a in alerts if a.get("severity") == "CRITICAL"),
        "warning_count": sum(1 for a in alerts if a.get("severity") == "WARNING")
    }


@app.get("/system/events")
def get_events():
    db_path = os.path.join(base_dir, 'events.db')
    if not os.path.exists(db_path):
        return {"events": []}
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT * FROM system_events ORDER BY timestamp DESC LIMIT 50")
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return {"events": rows}
    except Exception:
        return {"events": []}


@app.get("/models/compare")
def compare_models():
    cached = cache.get("models_compare", ttl_seconds=60)
    if cached:
        return cached

    try:
        from mlflow.tracking import MlflowClient
        client = MlflowClient(tracking_uri=model_mgr.mlflow_uri)
        experiment = client.get_experiment_by_name("Energy-Forecasting")
        if not experiment:
            return {"models": [], "best_model": None}

        runs = client.search_runs(experiment.experiment_id, order_by=["start_time DESC"])

        model_map = {}
        for r in runs:
            run_name = r.data.tags.get("mlflow.runName", "")
            r2 = r.data.metrics.get("val_r2")
            rmse = r.data.metrics.get("val_rmse")
            mae = r.data.metrics.get("val_mae")

            if r2 is None:
                continue

            for arch in ["Ridge", "LightGBM", "XGBoost"]:
                if arch in run_name and "1h" not in run_name and "24h" not in run_name:
                    if arch not in model_map:
                        model_map[arch] = {
                            "name": arch,
                            "r2": round(r2, 6),
                            "rmse": round(rmse, 6) if rmse else None,
                            "mae": round(mae, 6) if mae else None,
                            "run_id": r.info.run_id,
                            "timestamp": r.info.start_time,
                            "status": "available"
                        }

        all_archs = ["Ridge", "LightGBM", "XGBoost"]
        models = []
        best_model = None
        best_r2 = -1

        for arch in all_archs:
            if arch in model_map:
                m = model_map[arch]
                models.append(m)
                if m["r2"] and m["r2"] > best_r2:
                    best_r2 = m["r2"]
                    best_model = arch
            else:
                models.append({
                    "name": arch,
                    "r2": None,
                    "rmse": None,
                    "mae": None,
                    "status": "not_trained",
                    "message": f"{arch} has not been trained yet. Trigger retraining to generate comparison data."
                })

        result = {"models": models, "best_model": best_model}
        cache.set("models_compare", result)
        return result

    except Exception as e:
        return {"models": [], "best_model": None, "error": str(e)}


@app.get("/insights")
def get_insights(_user: dict = Depends(get_current_user)):
    cached = cache.get("ai_insights", ttl_seconds=120)  # Increased from 30s — insights are expensive
    if cached:
        return cached

    # Build system data context for agents
    detector = DriftDetector()
    drift_alerts = detector.get_latest_alerts()

    system_data = {
        "metrics": model_mgr.metrics,
        "health": healthcheck(),
        "drift_alerts": drift_alerts,
        "feature_importances": model_mgr.feature_importances,
        "metrics_history": [],
    }

    # Rebuild knowledge graph
    schema_path = os.path.join(base_dir, "models", "production_schema.json")
    if os.path.exists(schema_path):
        with open(schema_path, "r") as f:
            prod_schema = json.load(f)
        rebuild_graph(prod_schema, drift_alerts, model_mgr.feature_importances)

    graph_context = get_graph().enrich_context("general")

    # Run multi-agent orchestrator with LLM
    try:
        llm_result = orchestrator.synthesize(system_data, graph_context)
        insights = llm_result.get("insights", [])
        # Ensure required fields
        for ins in insights:
            ins.setdefault("metric", 0)
            ins.setdefault("actionable", False)
            ins.setdefault("source", "llm_orchestrator")

        result = {
            "insights": insights,
            "generated_at": datetime.datetime.now().isoformat(),
            "generated_by": "llm_multi_agent",
            "agent_count": len(llm_result.get("agent_results", []))
        }
    except Exception as e:
        print(f"[Insights] LLM fallback triggered: {e}")
        # Fallback to rule-based insights
        insights = _generate_rule_based_insights(drift_alerts)
        result = {
            "insights": insights,
            "generated_at": datetime.datetime.now().isoformat(),
            "generated_by": "rule_based_fallback"
        }

    cache.set("ai_insights", result)
    return result


def _generate_rule_based_insights(drift_alerts):
    """Fallback rule-based insights when LLM is unavailable."""
    insights = []
    r2 = model_mgr.metrics.get("R2", 0)
    rmse = model_mgr.metrics.get("RMSE", 0)

    if r2 and r2 > 0:
        status = "Excellent" if r2 > 0.995 else ("Stable" if r2 > 0.98 else "Degrading")
        sev = "info" if r2 > 0.98 else "warning"
        insights.append({
            "type": "performance", "severity": sev,
            "title": f"Model Performance {status}",
            "message": f"R² = {r2:.4f}, RMSE = {rmse:.4f}.",
            "metric": round(r2, 4), "actionable": r2 < 0.98,
            "source": "rule_based"
        })

    if drift_alerts and len(drift_alerts) >= 3:
        recent_js = [a.get("js_divergence", 0) for a in drift_alerts[-10:]]
        avg = np.mean(recent_js)
        breaches = sum(1 for a in drift_alerts[-5:] if a.get("is_breach"))
        sev = "critical" if breaches >= 3 else ("warning" if avg > 0.1 else "info")
        insights.append({
            "type": "drift", "severity": sev,
            "title": "Drift Analysis",
            "message": f"Avg JS divergence: {avg:.4f}. Recent breaches: {breaches}/5.",
            "metric": round(avg, 4), "actionable": breaches >= 3,
            "source": "rule_based"
        })

    if model_mgr.feature_importances:
        top = model_mgr.feature_importances[0]
        insights.append({
            "type": "features", "severity": "info",
            "title": f"Top Driver: {top['feature']}",
            "message": f"Accounts for {top['importance']*100:.1f}% of variance.",
            "metric": round(top["importance"] * 100, 1), "actionable": False,
            "source": "rule_based"
        })

    if not insights:
        insights.append({
            "type": "system", "severity": "info", "title": "System Initializing",
            "message": "Collecting telemetry data.", "metric": 0, "actionable": False,
            "source": "rule_based"
        })
    return insights


@app.post("/retrain")
def trigger_manual_retrain(background_tasks: BackgroundTasks, user: dict = Depends(require_admin)):
    username = user["username"]
    healer = SelfHealer()
    background_tasks.add_task(healer.trigger_retraining)
    log_system_event_with_user("Manual Retrain", "Retraining pipeline initiated by operator.", 
                                model_mgr.metrics.get("Active_Model", "None"), "Evaluating", user=username)
    return {"status": "accepted", "message": "Retraining pipeline initiated in background."}


@app.post("/models/rollback")
def rollback_model(user: dict = Depends(require_admin)):
    username = user["username"]
    rollback_path = os.path.join(base_dir, "models", "rollback_schema.json")
    production_path = os.path.join(base_dir, "models", "production_schema.json")

    if not os.path.exists(rollback_path):
        raise HTTPException(status_code=404, detail="No rollback state available. No previous model configuration found.")

    try:
        if os.path.exists(production_path):
            with open(production_path, "r") as f:
                current = json.load(f)

        with open(rollback_path, "r") as f:
            rollback = json.load(f)

        with open(production_path, "w") as f:
            json.dump(rollback, f)

        with open(rollback_path, "w") as f:
            json.dump(current, f)

        model_mgr.load_latest_production_model()

        log_system_event_with_user(
            "Model Rollback",
            f"Rolled back to: {rollback.get('best_model', 'unknown')}",
            rollback.get("best_model", "None"),
            "Restored",
            user="admin"
        )

        cache.set("models_compare", None)

        return {"status": "success", "restored_model": rollback.get("best_model")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Rollback failed: {str(e)}")


@app.post("/predict")
def predict(request: InferenceRequest, background_tasks: BackgroundTasks):
    start_time = time.perf_counter()
    if not model_mgr.model:
        raise HTTPException(status_code=503, detail="No production model loaded.")

    df = pd.DataFrame(request.features)
    for col in model_mgr.required_features:
        if col not in df.columns:
            df[col] = 0.0

    try:
        current_preds = model_mgr.model.predict(df[model_mgr.required_features]).tolist()
        plus1h_preds = model_mgr.model_1h.predict(df[model_mgr.required_features]).tolist() if model_mgr.model_1h else current_preds
        plus24h_preds = model_mgr.model_24h.predict(df[model_mgr.required_features]).tolist() if model_mgr.model_24h else current_preds

        all_preds = current_preds + plus1h_preds + plus24h_preds
        conf_std = max(np.std(all_preds) * 0.15, 0.01)

        results = []
        for i in range(len(current_preds)):
            val = current_preds[i]
            anomaly = anomaly_detector.detect(val)

            record = {
                "1_step": round(val, 5),
                "1h_horizon": round(plus1h_preds[i], 5),
                "24h_horizon": round(plus24h_preds[i], 5),
                "conf_lower": round(val - conf_std, 5),
                "conf_upper": round(val + conf_std, 5),
                "anomaly": anomaly
            }
            results.append(record)

            # Store in prediction history for export
            prediction_history.add({
                "timestamp": datetime.datetime.now().isoformat(),
                "1_step": record["1_step"],
                "1h_horizon": record["1h_horizon"],
                "24h_horizon": record["24h_horizon"],
                "conf_lower": record["conf_lower"],
                "conf_upper": record["conf_upper"],
                "is_anomaly": anomaly["is_anomaly"],
                "z_score": anomaly["z_score"]
            })

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Inference error: {str(e)}")

    latency = (time.perf_counter() - start_time) * 1000
    model_mgr.log_latency(latency)

    return {
        "predictions": results,
        "model_version": model_mgr.metrics.get("Active_Model"),
        "latency_ms": round(latency, 2)
    }


# ─── SSE STREAMING ─────────────────────────────────────────────────────────────

@app.get("/stream/events")
async def stream_events(request: Request):
    """Server-Sent Events stream for real-time updates. 
    Optimized: 4s interval, cached drift detector."""

    # Reuse a single DriftDetector across ticks
    _sse_detector = DriftDetector()

    async def event_generator():
        tick = 0
        while True:
            if await request.is_disconnected():
                break
            tick += 1
            try:
                event_data = {}

                # Health snapshot
                health = healthcheck()
                event_data["health"] = health

                # Latest drift (every other tick to reduce I/O)
                if tick % 2 == 0:
                    alerts = _sse_detector.get_latest_alerts()
                    if alerts:
                        event_data["latest_drift"] = alerts[-1]

                # Quick prediction with simulated input
                if model_mgr.model:
                    hour = (tick * 0.15) % (2 * 3.14159)
                    features = [{
                        "Global_intensity": 4.5 + np.sin(hour) * 2 + np.random.random() * 0.3,
                        "Global_reactive_power": 0.1 + np.random.random() * 0.05,
                        "Voltage": 239 + np.random.random() * 3,
                        "Sub_metering_1": np.random.random() * 2,
                        "Sub_metering_2": 1 + np.random.random(),
                        "Sub_metering_3": 16 + np.random.random() * 3,
                        "Global_active_power_lag1h": 1.1 + np.sin(hour - 0.5) * 0.3,
                        "Global_active_power_lag24h": 1.05 + np.sin(hour - 1) * 0.2,
                        "Global_intensity_lag1h": 4.3 + np.sin(hour - 0.5),
                        "Global_intensity_lag24h": 4.2 + np.sin(hour - 1),
                        "Sub_metering_3_lag1h": 17, "Sub_metering_3_lag24h": 17,
                        "Sub_metering_2_lag1h": 1, "Sub_metering_2_lag24h": 1,
                        "Sub_metering_1_lag1h": 0, "Sub_metering_1_lag24h": 0,
                        "Global_reactive_power_lag1h": 0.1, "Global_reactive_power_lag24h": 0.1,
                        "Voltage_lag1h": 240, "Voltage_lag24h": 240,
                        "hour_sin": np.sin(hour), "hour_cos": np.cos(hour),
                        "dow_sin": 0.43, "dow_cos": 0.9
                    }]
                    df = pd.DataFrame(features)
                    for col in model_mgr.required_features:
                        if col not in df.columns:
                            df[col] = 0.0
                    pred = model_mgr.model.predict(df[model_mgr.required_features]).tolist()[0]
                    anomaly = anomaly_detector.detect(pred)
                    event_data["prediction"] = {
                        "value": round(pred, 5),
                        "anomaly": anomaly,
                        "tick": tick
                    }

                yield f"data: {json.dumps(event_data)}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

            await asyncio.sleep(4)  # Optimized from 2s to 4s

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


# ─── EXPORT ENDPOINTS ──────────────────────────────────────────────────────────

@app.get("/export/predictions")
def export_predictions():
    """Export recent prediction history as CSV."""
    records = prediction_history.get_all()
    if not records:
        raise HTTPException(status_code=404, detail="No prediction history available. Make some predictions first.")

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=records[0].keys())
    writer.writeheader()
    writer.writerows(records)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=predictions_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
    )


@app.get("/export/alerts")
def export_alerts():
    """Export all drift alerts and system events as CSV."""
    detector = DriftDetector()
    alerts = detector.get_latest_alerts()

    # Also get system events
    db_path = os.path.join(base_dir, 'events.db')
    sys_events = []
    if os.path.exists(db_path):
        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute("SELECT * FROM system_events ORDER BY timestamp DESC")
            sys_events = [dict(r) for r in cur.fetchall()]
            conn.close()
        except Exception:
            pass

    output = io.StringIO()

    # Write drift alerts section
    writer = csv.writer(output)
    writer.writerow(["=== DRIFT ALERTS ==="])
    if alerts:
        drift_keys = ["timestamp", "js_divergence", "threshold", "is_breach", "consecutive", "drift_detected"]
        writer.writerow(drift_keys)
        for a in alerts:
            writer.writerow([a.get(k, "") for k in drift_keys])

    writer.writerow([])
    writer.writerow(["=== SYSTEM EVENTS ==="])
    if sys_events:
        sys_keys = ["timestamp", "type", "description", "active_model", "transition", "user"]
        writer.writerow(sys_keys)
        for ev in sys_events:
            writer.writerow([ev.get(k, "") for k in sys_keys])

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=alerts_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
    )


@app.get("/export/metrics")
def export_metrics():
    """Export metrics history as CSV."""
    history_data = get_metrics_history()
    history = history_data.get("history", [])

    if not history:
        raise HTTPException(status_code=404, detail="No metrics history available.")

    output = io.StringIO()
    keys = ["timestamp", "run_name", "r2", "rmse", "mae"]
    writer = csv.DictWriter(output, fieldnames=keys, extrasaction='ignore')
    writer.writeheader()
    writer.writerows(history)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=metrics_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
    )


# ─── REPORT GENERATION ─────────────────────────────────────────────────────────

@app.get("/report/generate")
def generate_report():
    """Generate a structured business report with all system metrics."""
    report = {
        "title": "EcoForecaster — System Performance Report",
        "generated_at": datetime.datetime.now().isoformat(),
        "sections": {}
    }

    # Executive Summary
    health = healthcheck()
    report["sections"]["executive_summary"] = {
        "health_score": health["health_score"],
        "system_status": health["status"],
        "active_model": health["active_model"],
        "latency_p99_ms": health["latency_p99_ms"]
    }

    # Model Performance
    report["sections"]["model_performance"] = {
        "current_metrics": model_mgr.metrics,
        "feature_importances": model_mgr.feature_importances[:10] if model_mgr.feature_importances else []
    }

    # Metrics history
    hist = get_metrics_history()
    report["sections"]["training_history"] = {
        "total_runs": len(hist.get("history", [])),
        "runs": hist.get("history", [])[-10:]  # Last 10 runs
    }

    # Drift Status
    detector = DriftDetector()
    alerts = detector.get_latest_alerts()
    recent_alerts = alerts[-20:] if alerts else []
    breach_count = sum(1 for a in recent_alerts if a.get("is_breach"))
    avg_js = np.mean([a.get("js_divergence", 0) for a in recent_alerts]) if recent_alerts else 0

    report["sections"]["drift_status"] = {
        "total_observations": len(alerts),
        "recent_breaches": breach_count,
        "average_js_divergence": round(float(avg_js), 4),
        "threshold": 0.15,
        "recent_alerts": recent_alerts[-5:]
    }

    # Recent Events
    events_data = get_events()
    report["sections"]["recent_events"] = {
        "total_events": len(events_data.get("events", [])),
        "events": events_data.get("events", [])[:10]
    }

    # Insights
    insights = get_insights()
    report["sections"]["ai_insights"] = insights.get("insights", [])

    # Prediction Stats
    preds = prediction_history.get_all()
    if preds:
        vals = [p["1_step"] for p in preds]
        report["sections"]["prediction_summary"] = {
            "total_predictions": len(preds),
            "avg_prediction": round(np.mean(vals), 4),
            "std_prediction": round(np.std(vals), 4),
            "anomaly_count": sum(1 for p in preds if p.get("is_anomaly")),
            "time_range": {"start": preds[0]["timestamp"], "end": preds[-1]["timestamp"]}
        }
    else:
        report["sections"]["prediction_summary"] = {"total_predictions": 0}

    return report


# ─── SCENARIO SIMULATION ──────────────────────────────────────────────────────

@app.post("/simulate")
def simulate_prediction(request: SimulationRequest):
    """Run prediction comparison between baseline and modified feature inputs."""
    if not model_mgr.model:
        raise HTTPException(status_code=503, detail="No production model loaded.")

    # Default baseline features
    defaults = {
        "Global_intensity": 4.5,
        "Global_reactive_power": 0.1,
        "Voltage": 240.0,
        "Sub_metering_1": 0.0,
        "Sub_metering_2": 1.0,
        "Sub_metering_3": 17.0,
        "Global_active_power_lag1h": 1.1,
        "Global_active_power_lag24h": 1.05,
        "Global_intensity_lag1h": 4.3,
        "Global_intensity_lag24h": 4.2,
        "Sub_metering_3_lag1h": 17, "Sub_metering_3_lag24h": 17,
        "Sub_metering_2_lag1h": 1, "Sub_metering_2_lag24h": 1,
        "Sub_metering_1_lag1h": 0, "Sub_metering_1_lag24h": 0,
        "Global_reactive_power_lag1h": 0.1, "Global_reactive_power_lag24h": 0.1,
        "Voltage_lag1h": 240, "Voltage_lag24h": 240,
        "hour_sin": 0.0, "hour_cos": 1.0,
        "dow_sin": 0.43, "dow_cos": 0.9
    }

    baseline_features = {**defaults, **request.baseline}
    modified_features = {**defaults, **request.baseline, **request.modified}

    try:
        df_baseline = pd.DataFrame([baseline_features])
        df_modified = pd.DataFrame([modified_features])

        for col in model_mgr.required_features:
            if col not in df_baseline.columns:
                df_baseline[col] = 0.0
            if col not in df_modified.columns:
                df_modified[col] = 0.0

        pred_baseline = model_mgr.model.predict(df_baseline[model_mgr.required_features])[0]
        pred_modified = model_mgr.model.predict(df_modified[model_mgr.required_features])[0]

        # Also compute horizon predictions
        pred_baseline_1h = model_mgr.model_1h.predict(df_baseline[model_mgr.required_features])[0] if model_mgr.model_1h else pred_baseline
        pred_modified_1h = model_mgr.model_1h.predict(df_modified[model_mgr.required_features])[0] if model_mgr.model_1h else pred_modified
        pred_baseline_24h = model_mgr.model_24h.predict(df_baseline[model_mgr.required_features])[0] if model_mgr.model_24h else pred_baseline
        pred_modified_24h = model_mgr.model_24h.predict(df_modified[model_mgr.required_features])[0] if model_mgr.model_24h else pred_modified

        delta = float(pred_modified - pred_baseline)
        pct_change = (delta / abs(pred_baseline) * 100) if abs(pred_baseline) > 1e-10 else 0.0

        return {
            "baseline": {
                "1_step": round(float(pred_baseline), 5),
                "1h_horizon": round(float(pred_baseline_1h), 5),
                "24h_horizon": round(float(pred_baseline_24h), 5),
                "features": baseline_features
            },
            "simulated": {
                "1_step": round(float(pred_modified), 5),
                "1h_horizon": round(float(pred_modified_1h), 5),
                "24h_horizon": round(float(pred_modified_24h), 5),
                "features": modified_features
            },
            "delta": {
                "1_step": round(delta, 5),
                "percentage": round(pct_change, 2),
                "direction": "increase" if delta > 0 else ("decrease" if delta < 0 else "unchanged")
            },
            "modified_fields": list(request.modified.keys())
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Simulation error: {str(e)}")


# ─── FEATURE DEFAULTS FOR SIMULATOR ───────────────────────────────────────────

@app.get("/simulate/defaults")
def get_simulation_defaults():
    """Return default feature values and ranges for the scenario simulator UI."""
    feature_config = [
        {"name": "Global_intensity", "label": "Global Intensity", "default": 4.5, "min": 0, "max": 20, "step": 0.1, "unit": "A", "primary": True},
        {"name": "Global_reactive_power", "label": "Reactive Power", "default": 0.1, "min": 0, "max": 2, "step": 0.01, "unit": "kW", "primary": True},
        {"name": "Voltage", "label": "Voltage", "default": 240.0, "min": 220, "max": 260, "step": 0.5, "unit": "V", "primary": True},
        {"name": "Sub_metering_1", "label": "Sub Metering 1", "default": 0.0, "min": 0, "max": 50, "step": 0.5, "unit": "Wh", "primary": True},
        {"name": "Sub_metering_2", "label": "Sub Metering 2", "default": 1.0, "min": 0, "max": 50, "step": 0.5, "unit": "Wh", "primary": True},
        {"name": "Sub_metering_3", "label": "Sub Metering 3", "default": 17.0, "min": 0, "max": 50, "step": 0.5, "unit": "Wh", "primary": True},
        {"name": "Global_active_power_lag1h", "label": "Active Power Lag 1h", "default": 1.1, "min": 0, "max": 10, "step": 0.1, "unit": "kW", "primary": False},
        {"name": "Global_active_power_lag24h", "label": "Active Power Lag 24h", "default": 1.05, "min": 0, "max": 10, "step": 0.1, "unit": "kW", "primary": False},
        {"name": "Global_intensity_lag1h", "label": "Intensity Lag 1h", "default": 4.3, "min": 0, "max": 20, "step": 0.1, "unit": "A", "primary": False},
        {"name": "Global_intensity_lag24h", "label": "Intensity Lag 24h", "default": 4.2, "min": 0, "max": 20, "step": 0.1, "unit": "A", "primary": False},
    ]
    return {"features": feature_config, "model": model_mgr.metrics.get("Active_Model", "None")}


# ─── AUTH ENDPOINTS ────────────────────────────────────────────────────────────

@app.post("/auth/login")
def login(req: LoginRequest):
    user = authenticate_user(req.username, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_access_token({"sub": user["username"], "role": user["role"]})
    log_system_event_with_user("User Login", f"User '{user['username']}' logged in.", user=user["username"])
    return {"access_token": token, "token_type": "bearer", "user": user}


@app.get("/auth/me")
def get_me(user: dict = Depends(get_current_user)):
    return user


# ─── AI CHAT ENDPOINT ─────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    question: str

@app.post("/ai/chat")
def ai_chat(req: ChatRequest, _user: dict = Depends(get_current_user)):
    # Rate limit AI requests
    if not ai_rate_limiter.allow("chat"):
        return {
            "question": req.question,
            "answer": "Please wait a moment before sending another message.",
            "source": "rate_limiter",
            "agents_used": [],
            "modules_used": [],
            "duration_ms": 0,
        }

    detector = DriftDetector()
    drift_alerts = detector.get_latest_alerts()
    breaches = sum(1 for a in drift_alerts[-5:] if a.get("is_breach"))
    system_data = {
        "metrics": model_mgr.metrics,
        "health": healthcheck(),
        "feature_importances": model_mgr.feature_importances,
        "drift_summary": {
            "total_alerts": len(drift_alerts),
            "recent_breaches": breaches,
            "latest_js": drift_alerts[-1].get("js_divergence") if drift_alerts else None
        }
    }
    graph_context = get_graph().enrich_context("general")
    try:
        return chat_agent.answer(req.question, system_data, graph_context)
    except Exception as e:
        return {
            "question": req.question,
            "answer": f"I encountered an error processing your question. Please try again. ({str(e)[:80]})",
            "source": "error_handler",
            "agents_used": ["ChatAgent"],
            "modules_used": [],
            "duration_ms": 0,
        }


# ─── ANOMALY EXPLANATION ───────────────────────────────────────────────────────

class AnomalyExplainRequest(BaseModel):
    value: float = 0.0
    anomaly_score: float = 0.0
    z_score: float = 0.0
    method: str = "hybrid"
    timestamp: str = ""

@app.post("/ai/explain-anomaly")
def explain_anomaly(req: AnomalyExplainRequest, _user: dict = Depends(get_current_user)):
    system_data = {"metrics": model_mgr.metrics, "health": healthcheck()}
    graph_context = get_graph().enrich_context("drift")
    return anomaly_explainer.explain(req.model_dump(), system_data, graph_context)


# ─── SHAP ENDPOINTS ───────────────────────────────────────────────────────────

@app.get("/explain/shap/summary")
def get_shap_summary():
    if not model_mgr.model:
        raise HTTPException(status_code=503, detail="No production model loaded")
    return compute_shap_summary(model_mgr.model, model_mgr.required_features)


@app.post("/explain/shap/local")
def get_shap_local(features: dict):
    if not model_mgr.model:
        raise HTTPException(status_code=503, detail="No production model loaded")
    return compute_shap_local(model_mgr.model, model_mgr.required_features, features)


# ─── A/B TESTING ──────────────────────────────────────────────────────────────

@app.get("/models/ab-test")
def ab_test_models():
    """Compare available models head-to-head for A/B testing."""
    cached = cache.get("ab_test", ttl_seconds=60)
    if cached:
        return cached

    try:
        from mlflow.tracking import MlflowClient
        client = MlflowClient(tracking_uri=model_mgr.mlflow_uri)
        experiment = client.get_experiment_by_name("Energy-Forecasting")
        if not experiment:
            return {"models": [], "comparison": None}

        runs = client.search_runs(experiment.experiment_id, order_by=["start_time DESC"])
        model_map = {}
        for r in runs:
            run_name = r.data.tags.get("mlflow.runName", "")
            r2 = r.data.metrics.get("val_r2")
            rmse = r.data.metrics.get("val_rmse")
            mae = r.data.metrics.get("val_mae")
            if r2 is None:
                continue
            for arch in ["Ridge", "LightGBM", "XGBoost"]:
                if arch in run_name and "1h" not in run_name and "24h" not in run_name:
                    if arch not in model_map:
                        model_map[arch] = {"name": arch, "r2": round(r2, 6),
                            "rmse": round(rmse, 6) if rmse else None,
                            "mae": round(mae, 6) if mae else None}

        models = list(model_map.values())
        models.sort(key=lambda x: x.get("r2", 0), reverse=True)

        comparison = None
        if len(models) >= 2:
            a, b = models[0], models[1]
            comparison = {
                "model_a": a, "model_b": b,
                "r2_diff": round(a["r2"] - b["r2"], 6) if a["r2"] and b["r2"] else None,
                "rmse_diff": round(a["rmse"] - b["rmse"], 6) if a.get("rmse") and b.get("rmse") else None,
                "winner": a["name"],
                "advantage_pct": round((a["r2"] - b["r2"]) / max(b["r2"], 0.001) * 100, 3) if a["r2"] and b["r2"] else 0
            }

        result = {"models": models, "comparison": comparison, "active_model": model_mgr.metrics.get("Active_Model")}
        cache.set("ab_test", result)
        return result
    except Exception as e:
        return {"models": [], "comparison": None, "error": str(e)}


# ─── GRAPH RAG ENDPOINT ───────────────────────────────────────────────────────

@app.get("/graph")
def get_knowledge_graph():
    graph = get_graph()
    if not graph._built:
        schema_path = os.path.join(base_dir, "models", "production_schema.json")
        if os.path.exists(schema_path):
            with open(schema_path, "r") as f:
                prod_schema = json.load(f)
            detector = DriftDetector()
            rebuild_graph(prod_schema, detector.get_latest_alerts(), model_mgr.feature_importances)
    return graph.to_dict()


# ─── AGENTS OBSERVABILITY ENDPOINTS ───────────────────────────────────────────

@app.get("/ai/agents/status")
def get_agents_status(_user: dict = Depends(get_current_user)):
    """Return live status of all agents for the observability page."""
    return {
        "agents": agent_registry.get_all_statuses(),
        "timestamp": datetime.datetime.now().isoformat(),
    }


@app.post("/ai/agents/run/{agent_name}")
def trigger_agent_run(agent_name: str, _user: dict = Depends(get_current_user)):
    """Manually trigger a specific agent for testing/debugging."""
    # Build system data
    detector = DriftDetector()
    drift_alerts = detector.get_latest_alerts()
    system_data = {
        "metrics": model_mgr.metrics,
        "health": healthcheck(),
        "drift_alerts": drift_alerts,
        "feature_importances": model_mgr.feature_importances,
        "metrics_history": [],
    }

    # Find and run the requested agent
    agent_map = {
        "Drift Analyst Agent": orchestrator.agents[0] if len(orchestrator.agents) > 0 else None,
        "Performance Analyst Agent": orchestrator.agents[1] if len(orchestrator.agents) > 1 else None,
        "Feature Importance Agent": orchestrator.agents[2] if len(orchestrator.agents) > 2 else None,
        "System Health Agent": orchestrator.agents[3] if len(orchestrator.agents) > 3 else None,
        "Orchestrator": None,  # Special case
    }

    if agent_name == "Orchestrator":
        # Run full orchestration
        schema_path = os.path.join(base_dir, "models", "production_schema.json")
        graph_context = ""
        if os.path.exists(schema_path):
            with open(schema_path, "r") as f:
                prod_schema = json.load(f)
            rebuild_graph(prod_schema, drift_alerts, model_mgr.feature_importances)
            graph_context = get_graph().enrich_context("general")
        try:
            result = orchestrator.synthesize(system_data, graph_context)
            return {"status": "success", "agent": agent_name, "result": result}
        except Exception as e:
            return {"status": "error", "agent": agent_name, "error": str(e)}

    agent = agent_map.get(agent_name)
    if agent is None:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")

    try:
        result = agent.analyze(system_data)
        return {"status": "success", "agent": agent_name, "result": result}
    except Exception as e:
        return {"status": "error", "agent": agent_name, "error": str(e)}


# ─── AI SYSTEM / MCP TRACE ENDPOINTS ─────────────────────────────────────────

@app.get("/ai/system/info")
def get_ai_system_info(_user: dict = Depends(get_current_user)):
    """Return full AI system module registry and configuration."""
    return {
        "platform": "EcoForecaster",
        "version": "5.1.0",
        "llm": {
            "provider": "Groq",
            "primary_model": get_active_model(),
            "fallback_model": get_fallback_model(),
            "cache_stats": get_cache_stats(),
        },
        "modules": [
            {
                "name": "prediction",
                "description": "Multi-horizon energy consumption forecasting",
                "status": "active" if model_mgr.model else "inactive",
                "tools": ["/predict", "/simulate", "/stream/events"],
            },
            {
                "name": "drift_detection",
                "description": "Jensen-Shannon divergence drift monitoring",
                "status": "active",
                "tools": ["/alerts", "/stream/events"],
            },
            {
                "name": "explainability",
                "description": "Feature importance and model interpretability",
                "status": "active" if model_mgr.feature_importances else "inactive",
                "tools": ["/explain", "/explain/history"],
            },
            {
                "name": "shap",
                "description": "SHAP-based model explanation (TreeExplainer/KernelExplainer)",
                "status": "active" if model_mgr.model else "inactive",
                "tools": ["/explain/shap/summary", "/explain/shap/local"],
            },
            {
                "name": "anomaly_detection",
                "description": "Hybrid Isolation Forest + Z-score anomaly detection",
                "status": "active",
                "tools": ["anomaly_detector.detect()"],
            },
            {
                "name": "graph_rag",
                "description": "Knowledge graph for context-enriched LLM reasoning",
                "status": "active" if get_graph()._built else "building",
                "tools": ["/graph", "enrich_context()"],
            },
            {
                "name": "llm",
                "description": "Large Language Model inference via Groq API",
                "status": "active",
                "tools": ["/ai/chat", "/ai/explain-anomaly", "/insights"],
            },
            {
                "name": "multi_agent",
                "description": "Multi-agent orchestration system with 4 specialist agents",
                "status": "active",
                "tools": ["/ai/agents/status", "/ai/agents/run", "/insights"],
            },
        ],
        "agents": agent_registry.get_all_statuses(),
        "timestamp": datetime.datetime.now().isoformat(),
    }


@app.get("/ai/system/traces")
def get_system_traces(limit: int = 20, _user: dict = Depends(get_current_user)):
    """Return recent AI request execution traces."""
    traces = agent_registry.get_traces(limit)
    return {
        "traces": traces,
        "total": len(traces),
        "timestamp": datetime.datetime.now().isoformat(),
    }


# Serve the production frontend from the same origin as the API. This keeps
# browser API and SSE requests portable across local, preview, and Azure URLs.
frontend_dir = os.environ.get(
    "FRONTEND_DIST_DIR",
    os.path.abspath(os.path.join(base_dir, "..", "frontend_dist")),
)
frontend_assets_dir = os.path.join(frontend_dir, "assets")

if os.path.isdir(frontend_assets_dir):
    app.mount("/assets", StaticFiles(directory=frontend_assets_dir), name="frontend-assets")

    @app.get("/", include_in_schema=False)
    def serve_frontend_index():
        return FileResponse(os.path.join(frontend_dir, "index.html"))

    @app.get("/{path:path}", include_in_schema=False)
    def serve_frontend_path(path: str):
        requested_path = os.path.abspath(os.path.join(frontend_dir, path))
        if os.path.commonpath([frontend_dir, requested_path]) == frontend_dir and os.path.isfile(requested_path):
            return FileResponse(requested_path)
        return FileResponse(os.path.join(frontend_dir, "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8000")),
        reload=os.environ.get("UVICORN_RELOAD", "false").lower() == "true",
    )
