import json
from fastapi.testclient import TestClient
import sys
import os

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(base_dir)

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
    assert payload["model_version"] == "EnergyForecaster_LightGBM"


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
