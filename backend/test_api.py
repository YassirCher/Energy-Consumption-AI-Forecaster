import json
from fastapi.testclient import TestClient
import sys
import os

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(base_dir)

from src.api.main import app

client = TestClient(app)

def test_health():
    response = client.get("/system/health")
    assert response.status_code == 200
    assert "status" in response.json()

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

def test_ab_test():
    response = client.get("/models/ab-test")
    assert response.status_code == 200
    assert "models" in response.json()

if __name__ == "__main__":
    test_health()
    test_login_success()
    test_login_fail()
    test_me_protected()
    test_ab_test()
    print("All basic API tests passed!")
