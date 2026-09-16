import json
import mlflow.sklearn
import pandas as pd
from fastapi.testclient import TestClient
from sklearn.dummy import DummyRegressor
import sys
import os

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(base_dir)

import src.api.main as api_main
from src.api.main import app

client = TestClient(app)


def auth_headers(username="admin", password="admin123"):
    response = client.post("/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_health():
    response = client.get("/system/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "healthy"
    assert all(payload["models_loaded"].values())


def test_prediction_uses_bundled_models():
    response = client.post("/predict", json={"features": [{}]})
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["predictions"]) == 1
    assert payload["model_version"]
    assert payload["horizons_minutes"] == {
        "1_step": 1,
        "1h_horizon": 60,
        "24h_horizon": 1440,
    }
    assert set(payload["predictions"][0]).issuperset({"1_step", "1h_horizon", "24h_horizon"})


def test_production_metrics_use_causal_protocol():
    response = client.get("/metrics")
    assert response.status_code == 200
    metrics = response.json()
    assert metrics["Schema_Version"] == 2
    assert metrics["Evaluation_Protocol"] == "causal_v2"
    assert metrics["Legacy_Evaluation"] is False
    assert metrics["Quality_Gate"]["passed"] is True
    assert set(metrics["Horizons"]) == {"1_step", "1h", "24h"}


def test_metric_history_excludes_legacy_runs():
    response = client.get("/metrics/history")
    assert response.status_code == 200
    history = response.json()["history"]
    assert history
    assert all(item["evaluation_protocol"] == "causal_v2" for item in history)
    assert all(item["horizon_minutes"] == 1 for item in history)


def test_background_retrain_reloads_promoted_bundle(monkeypatch):
    class SuccessfulHealer:
        def trigger_retraining(self):
            return {"promoted": True, "quality_gate": {"passed": True}}

    calls = []
    monkeypatch.setattr(api_main, "SelfHealer", SuccessfulHealer)
    monkeypatch.setattr(api_main.model_mgr, "load_latest_production_model", lambda: calls.append("load") or True)
    api_main.cache.set("stale", "value")

    report = api_main.run_retrain_and_reload()

    assert report["promoted"] is True
    assert calls == ["load"]
    assert api_main.cache.get("stale") is None


def test_rollback_loads_the_previous_artifacts_and_changes_predictions(tmp_path, monkeypatch):
    backend_root = tmp_path / "backend"
    models_dir = backend_root / "models"
    models_dir.mkdir(parents=True)
    feature = pd.DataFrame({"x": [0.0, 1.0]})

    def create_bundle(version, constant):
        paths = {}
        for label in ("1_step", "1h", "24h"):
            path = backend_root / "model_artifacts" / "versions" / version / label
            model = DummyRegressor(strategy="constant", constant=constant).fit(feature, [constant, constant])
            mlflow.sklearn.save_model(model, str(path))
            paths[label] = str(path.relative_to(backend_root)).replace("\\", "/")
        return paths

    current_paths = create_bundle("current", 2.0)
    rollback_paths = create_bundle("previous", 1.0)

    def schema(version, paths, available=None):
        payload = {
            "schema_version": 2,
            "evaluation_protocol": "causal_v2",
            "artifact_version": version,
            "artifact_paths": paths,
            "required_features": ["x"],
            "best_model": f"model-{version}",
            "model_1h": f"model-{version}-1h",
            "model_24h": f"model-{version}-24h",
            "latest_r2": 0.5,
            "latest_rmse": 1.0,
            "horizons": {},
            "quality_gate": {"passed": True},
        }
        if available is not None:
            payload["available"] = available
        return payload

    (models_dir / "production_schema.json").write_text(
        json.dumps(schema("current", current_paths)), encoding="utf-8"
    )
    (models_dir / "rollback_schema.json").write_text(
        json.dumps(schema("previous", rollback_paths, available=True)), encoding="utf-8"
    )

    monkeypatch.setattr(api_main, "base_dir", str(backend_root))
    temporary_manager = api_main.ModelManager()
    monkeypatch.setattr(api_main, "model_mgr", temporary_manager)
    api_main.ensure_events_table()
    before = float(temporary_manager.model.predict(pd.DataFrame({"x": [0.0]}))[0])

    response = api_main.rollback_model(user={"username": "admin"})
    after = float(temporary_manager.model.predict(pd.DataFrame({"x": [0.0]}))[0])

    assert response["restored_model"] == "model-previous"
    assert before == 2.0
    assert after == 1.0
    active = json.loads((models_dir / "production_schema.json").read_text(encoding="utf-8"))
    assert active["artifact_version"] == "previous"


def test_login_success():
    response = client.post("/auth/login", json={"username": "admin", "password": "admin123"})
    assert response.status_code == 200
    assert "access_token" in response.json()


def test_login_fail():
    response = client.post("/auth/login", json={"username": "admin", "password": "wrong"})
    assert response.status_code == 401


def test_me_protected():
    response = client.get("/auth/me")
    assert response.status_code == 401


def test_admin_actions_require_authentication():
    assert client.post("/retrain").status_code == 401
    assert client.post("/models/rollback").status_code == 401


def test_viewer_cannot_run_admin_actions():
    response = client.post("/retrain", headers=auth_headers("viewer", "viewer123"))
    assert response.status_code == 403


def test_ai_endpoints_require_authentication():
    response = client.post("/ai/chat", json={"question": "system status"})
    assert response.status_code == 401
    assert client.get("/insights").status_code == 401


def test_ab_test():
    response = client.get("/models/ab-test")
    assert response.status_code == 200
    assert "models" in response.json()


if __name__ == "__main__":
    test_health()
    test_login_success()
    test_login_fail()
    test_me_protected()
    test_admin_actions_require_authentication()
    test_viewer_cannot_run_admin_actions()
    test_ai_endpoints_require_authentication()
    test_ab_test()
    print("All basic API tests passed!")
