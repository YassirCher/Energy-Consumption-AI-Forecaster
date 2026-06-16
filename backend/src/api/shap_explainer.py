"""
SHAP Explainability Service — EcoForecaster v5.1
Computes SHAP values for global and local model explanations.
Optimized: larger cache TTL, reduced sample size, profiling.
"""

import os
import json
import time
import numpy as np
import pandas as pd
import threading

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ─── SHAP Cache ────────────────────────────────────────────────────────────────

class ShapCache:
    """Thread-safe cache for SHAP computations (expensive to recompute)."""
    def __init__(self):
        self._summary = None
        self._summary_ts = 0
        self._lock = threading.Lock()
        self.TTL = 600  # 10 minutes (optimized from 5 min)

    def get_summary(self):
        with self._lock:
            if self._summary and (time.time() - self._summary_ts) < self.TTL:
                return self._summary
        return None

    def set_summary(self, data):
        with self._lock:
            self._summary = data
            self._summary_ts = time.time()

_cache = ShapCache()


def compute_shap_summary(model_pipeline, feature_names: list, data_path: str = None) -> dict:
    """
    Compute global SHAP summary for the production model.
    Returns feature-level SHAP importance values.
    """
    cached = _cache.get_summary()
    if cached:
        print("[SHAP] Returning cached summary")
        return cached

    t0 = time.perf_counter()
    try:
        import shap

        regressor = model_pipeline.named_steps.get('regressor', None)
        preprocessor = model_pipeline.named_steps.get('preprocessor', None)

        if regressor is None:
            return {"error": "No regressor found in pipeline"}

        # Load a sample of data for SHAP background
        pq_path = os.path.join(_BASE_DIR, "data", "processed.parquet")
        if data_path:
            pq_path = data_path

        import glob
        files = glob.glob(os.path.join(pq_path, "*.parquet"))
        if not files:
            return {"error": "No data files found"}

        df = pd.read_parquet(files[0])
        # Use a small sample for SHAP background (reduced from 200 for performance)
        sample_size = min(100, len(df))
        df_sample = df.sample(sample_size, random_state=42)

        # Ensure feature columns
        for col in feature_names:
            if col not in df_sample.columns:
                df_sample[col] = 0.0

        X_sample = df_sample[feature_names]

        # Transform through preprocessor
        if preprocessor:
            X_transformed = preprocessor.transform(X_sample)
        else:
            X_transformed = X_sample.values

        # Choose appropriate explainer
        model_type = type(regressor).__name__
        if model_type in ('LGBMRegressor', 'XGBRegressor'):
            explainer = shap.TreeExplainer(regressor)
            shap_values = explainer.shap_values(X_transformed)
        else:
            # Fallback for linear models — use a small background
            bg_size = min(50, len(X_transformed))
            explainer = shap.KernelExplainer(regressor.predict, X_transformed[:bg_size])
            shap_values = explainer.shap_values(X_transformed[:100])

        # Compute mean absolute SHAP values per feature
        mean_abs_shap = np.abs(shap_values).mean(axis=0)

        # Map back to feature names
        # After preprocessing, column names may differ
        if len(mean_abs_shap) == len(feature_names):
            shap_importance = [
                {"feature": feature_names[i], "mean_abs_shap": float(mean_abs_shap[i])}
                for i in range(len(feature_names))
            ]
        else:
            # If dimensions don't match (due to preprocessing), use indices
            shap_importance = [
                {"feature": feature_names[i] if i < len(feature_names) else f"feature_{i}",
                 "mean_abs_shap": float(mean_abs_shap[i])}
                for i in range(len(mean_abs_shap))
            ]

        shap_importance.sort(key=lambda x: x["mean_abs_shap"], reverse=True)

        # Compute summary statistics
        total_shap = sum(s["mean_abs_shap"] for s in shap_importance)
        for s in shap_importance:
            s["percentage"] = round(s["mean_abs_shap"] / total_shap * 100, 2) if total_shap > 0 else 0

        result = {
            "shap_importance": shap_importance[:15],
            "model_type": model_type,
            "sample_size": sample_size,
            "total_features": len(feature_names),
            "method": "TreeExplainer" if model_type in ('LGBMRegressor', 'XGBRegressor') else "KernelExplainer"
        }

        _cache.set_summary(result)
        elapsed = (time.perf_counter() - t0) * 1000
        print(f"[SHAP] Summary computed in {elapsed:.0f}ms (sample={sample_size}, features={len(feature_names)})")
        return result

    except ImportError:
        return {"error": "SHAP library not installed"}
    except Exception as e:
        elapsed = (time.perf_counter() - t0) * 1000
        print(f"[SHAP] Computation failed after {elapsed:.0f}ms: {e}")
        return {"error": f"SHAP computation failed: {str(e)}"}


def compute_shap_local(model_pipeline, feature_names: list, input_features: dict) -> dict:
    """
    Compute per-prediction SHAP explanation.
    Shows how each feature contributed to a specific prediction.
    """
    try:
        import shap

        regressor = model_pipeline.named_steps.get('regressor', None)
        preprocessor = model_pipeline.named_steps.get('preprocessor', None)

        if regressor is None:
            return {"error": "No regressor found in pipeline"}

        # Prepare input
        df_input = pd.DataFrame([input_features])
        for col in feature_names:
            if col not in df_input.columns:
                df_input[col] = 0.0

        X_input = df_input[feature_names]

        # Transform
        if preprocessor:
            X_transformed = preprocessor.transform(X_input)
        else:
            X_transformed = X_input.values

        # Load background data
        pq_path = os.path.join(_BASE_DIR, "data", "processed.parquet")
        import glob
        files = glob.glob(os.path.join(pq_path, "*.parquet"))
        if not files:
            return {"error": "No data files found"}

        df_bg = pd.read_parquet(files[0]).sample(min(50, 500), random_state=42)
        for col in feature_names:
            if col not in df_bg.columns:
                df_bg[col] = 0.0
        X_bg = df_bg[feature_names]

        if preprocessor:
            X_bg_transformed = preprocessor.transform(X_bg)
        else:
            X_bg_transformed = X_bg.values

        model_type = type(regressor).__name__
        if model_type in ('LGBMRegressor', 'XGBRegressor'):
            explainer = shap.TreeExplainer(regressor)
            shap_values = explainer.shap_values(X_transformed)
            base_value = float(explainer.expected_value) if np.isscalar(explainer.expected_value) else float(explainer.expected_value[0])
        else:
            bg_size = min(50, len(X_bg_transformed))
            explainer = shap.KernelExplainer(regressor.predict, X_bg_transformed[:bg_size])
            shap_values = explainer.shap_values(X_transformed)
            base_value = float(explainer.expected_value) if np.isscalar(explainer.expected_value) else float(explainer.expected_value[0])

        # Get prediction
        prediction = float(model_pipeline.predict(X_input)[0])

        # Map SHAP values to features
        sv = shap_values[0] if len(shap_values.shape) > 1 else shap_values
        contributions = []
        for i in range(min(len(sv), len(feature_names))):
            contributions.append({
                "feature": feature_names[i],
                "shap_value": float(sv[i]),
                "feature_value": float(X_input.iloc[0, i]) if i < X_input.shape[1] else 0,
                "direction": "positive" if sv[i] > 0 else "negative"
            })

        contributions.sort(key=lambda x: abs(x["shap_value"]), reverse=True)

        return {
            "prediction": prediction,
            "base_value": base_value,
            "contributions": contributions[:12],
            "model_type": model_type,
            "total_shap_effect": float(np.sum(sv))
        }

    except ImportError:
        return {"error": "SHAP library not installed"}
    except Exception as e:
        return {"error": f"SHAP local computation failed: {str(e)}"}
