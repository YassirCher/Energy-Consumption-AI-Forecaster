import os
import pandas as pd
import numpy as np
import mlflow
import mlflow.sklearn
import mlflow.lightgbm
import mlflow.xgboost
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import RobustScaler, PowerTransformer
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import lightgbm as lgb
import xgboost as xgb
import glob
import json
import sqlite3
import datetime

base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def log_system_event(event_type, description, model_name="None", transition="N/A"):
    db_path = os.path.join(base_dir, 'events.db')
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute('''CREATE TABLE IF NOT EXISTS system_events 
                   (timestamp TEXT, type TEXT, description TEXT, active_model TEXT, transition TEXT)''')
    cur.execute("INSERT INTO system_events VALUES (?, ?, ?, ?, ?)", 
                (datetime.datetime.now().isoformat(), event_type, description, model_name, transition))
    conn.commit()
    conn.close()

def load_data():
    parquet_dir = os.path.join(base_dir, "data", "processed.parquet")
    if not os.path.exists(parquet_dir):
        raise FileNotFoundError(f"Parquet directory not found at {parquet_dir}.")
    
    parquet_files = glob.glob(os.path.join(parquet_dir, "*.parquet"))
    df = pd.concat([pd.read_parquet(p) for p in parquet_files])
    df = df.sort_values(by="datetime").set_index("datetime")
    return df

def train_and_log(run_name="Self-Healing-Training"):
    mlflow.set_tracking_uri(f"sqlite:///{os.path.join(base_dir, 'mlruns.db')}")
    mlflow.set_experiment("Energy-Forecasting")
    
    print("Loading datasets and expanding multi-horizon targets natively...")
    df = load_data()
    
    target = 'Global_active_power'
    
    # ----------------------------------------------------
    # TRUE MULTI-HORIZON: Shift Targets (+1H, +24H)
    # ----------------------------------------------------
    print("Pre-computing multi-horizon shift arrays...")
    df['target_plus_1h'] = df[target].shift(-60)
    df['target_plus_24h'] = df[target].shift(-1440)
    
    # Drop rows at the absolute end where the future target doesn't exist
    df.dropna(subset=['target_plus_1h', 'target_plus_24h'], inplace=True)
    
    data_start = str(df.index.min())
    data_end = str(df.index.max())
    dataset_version_hash = f"Window[{data_start}_{data_end}]"
    
    feature_cols = [c for c in df.columns if c not in [target, 'target_plus_1h', 'target_plus_24h']]
    
    skewed_cols = [c for c in ["Global_intensity", "Sub_metering_1", "Sub_metering_2"] if c in feature_cols]
    robust_cols = [c for c in feature_cols if c not in skewed_cols]
    
    preprocessor = ColumnTransformer(
        transformers=[
            ('power', PowerTransformer(method='yeo-johnson'), skewed_cols),
            ('robust', RobustScaler(), robust_cols)
        ], remainder='passthrough'
    )
    
    n = len(df)
    train_end = int(n * 0.8)
    val_end = int(n * 0.9)
    
    X_train, y_train = df[feature_cols].iloc[:train_end], df[target].iloc[:train_end].values
    X_val, y_val = df[feature_cols].iloc[train_end:val_end], df[target].iloc[train_end:val_end].values
    
    # Horizon Targets
    y_train_1h = df['target_plus_1h'].iloc[:train_end].values
    y_val_1h = df['target_plus_1h'].iloc[train_end:val_end].values
    y_train_24h = df['target_plus_24h'].iloc[:train_end].values
    y_val_24h = df['target_plus_24h'].iloc[train_end:val_end].values
    
    models = {
        'Ridge': Ridge(alpha=1.0),
        'LightGBM': lgb.LGBMRegressor(n_estimators=150, learning_rate=0.05, random_state=42),
        'XGBoost': xgb.XGBRegressor(n_estimators=150, learning_rate=0.05, random_state=42, n_jobs=-1)
    }
    
    schema_path = os.path.join(base_dir, "models", "production_schema.json")
    best_historical_r2 = -float('inf')
    previous_model_name = "None"
    
    if os.path.exists(schema_path):
        with open(schema_path, "r") as f:
            cfg = json.load(f)
            best_historical_r2 = cfg.get("latest_r2", -float('inf'))
            previous_model_name = cfg.get("best_model", "None")
    
    best_candidate_r2 = -float('inf')
    best_candidate_name = None
    best_candidate_rmse = 0
    best_pipeline = None
    
    log_system_event("Retraining Triggered", f"Multi-Horizon Data version: {dataset_version_hash}", previous_model_name, "Evaluating")

    for name, model in models.items():
        with mlflow.start_run(run_name=f"{run_name}-1-step-{name}") as run:
            print(f"Training 1-step target {name}...")
            
            pipeline = Pipeline(steps=[('preprocessor', preprocessor), ('regressor', model)])
            pipeline.fit(X_train, y_train)
            preds = pipeline.predict(X_val)
            
            rmse, mae, r2 = np.sqrt(mean_squared_error(y_val, preds)), mean_absolute_error(y_val, preds), r2_score(y_val, preds)
            
            mlflow.set_tag("data_start", data_start)
            mlflow.set_tag("data_end", data_end)
            mlflow.set_tag("dataset_hash", dataset_version_hash)
            mlflow.log_metric("val_rmse", rmse)
            mlflow.log_metric("val_mae", mae)
            mlflow.log_metric("val_r2", r2)
            
            mlflow.sklearn.log_model(pipeline, artifact_path="model", registered_model_name=f"EnergyForecaster_{name}")
            
            if r2 > best_candidate_r2:
                best_candidate_r2 = r2
                best_candidate_name = name
                best_candidate_rmse = rmse
                best_pipeline = pipeline

    # ----------------------------------------------------
    # TRAIN HORIZONS natively using the Best Discovered Baseline logic (Usually LightGBM/XGBoost)
    # ----------------------------------------------------
    print(f"Horizon Extension: Pushing 1h and 24h targets directly into {best_candidate_name} architecture...")
    
    # 1 Hour Horizon Model
    pipe_1h = Pipeline(steps=[('preprocessor', preprocessor), ('regressor', models[best_candidate_name])])
    pipe_1h.fit(X_train, y_train_1h)
    preds_1h = pipe_1h.predict(X_val)
    r2_1h = r2_score(y_val_1h, preds_1h)
    
    with mlflow.start_run(run_name=f"{run_name}-plus1h-{best_candidate_name}") as run:
        mlflow.log_metric("val_r2_1h", r2_1h)
        mlflow.sklearn.log_model(pipe_1h, artifact_path="model", registered_model_name=f"EnergyForecaster_{best_candidate_name}_1h")

    # 24 Hour Horizon Model
    pipe_24h = Pipeline(steps=[('preprocessor', preprocessor), ('regressor', models[best_candidate_name])])
    pipe_24h.fit(X_train, y_train_24h)
    preds_24h = pipe_24h.predict(X_val)
    r2_24h = r2_score(y_val_24h, preds_24h)
    
    with mlflow.start_run(run_name=f"{run_name}-plus24h-{best_candidate_name}") as run:
        mlflow.log_metric("val_r2_24h", r2_24h)
        mlflow.sklearn.log_model(pipe_24h, artifact_path="model", registered_model_name=f"EnergyForecaster_{best_candidate_name}_24h")


    if best_candidate_r2 > best_historical_r2:
        print(f"Multi-Horizon Promotion Triggered: {best_candidate_name} (R2={best_candidate_r2:.4f})")
        
        if os.path.exists(schema_path):
            with open(schema_path, "r") as f:
                old_cfg = json.load(f)
            with open(os.path.join(base_dir, "models", "rollback_schema.json"), "w") as f:
                json.dump(old_cfg, f)

        # Deploy 3 Models explicitly mapping them together
        os.makedirs(os.path.join(base_dir, "models"), exist_ok=True)
        with open(schema_path, "w") as f:
            json.dump({
                "best_model": f"EnergyForecaster_{best_candidate_name}",
                "model_1h": f"EnergyForecaster_{best_candidate_name}_1h",
                "model_24h": f"EnergyForecaster_{best_candidate_name}_24h",
                "latest_r2": best_candidate_r2,
                "latest_rmse": best_candidate_rmse,
                "latest_r2_1h": r2_1h,
                "latest_r2_24h": r2_24h,
                "required_features": feature_cols,
                "data_version": dataset_version_hash
            }, f)
            
        log_system_event("Model Promoted", f"Multi-Horizon Framework promoted. Architecture {best_candidate_name} locked globally.", best_candidate_name, "Production")
    else:
        print(f"Promotion Failed: New {best_candidate_name} did not beat old.")
        log_system_event("Promotion Failed", f"Candidate {best_candidate_name} failed to override historical boundaries.", previous_model_name, "Archived")

if __name__ == "__main__":
    train_and_log()
