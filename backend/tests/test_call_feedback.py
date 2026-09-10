"""
Unit and integration tests for Real-time Call Termination & Post-Call Rating/Feedback endpoints.
"""
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Add project venv site-packages & backend directory to sys.path if not already present
project_root = Path(__file__).resolve().parents[2]
venv_site_packages = project_root / "venv" / "Lib" / "site-packages"
backend_dir = project_root / "backend"

if venv_site_packages.exists() and str(venv_site_packages) not in sys.path:
    sys.path.insert(0, str(venv_site_packages))
if backend_dir.exists() and str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import pytest
from dotenv import load_dotenv
from fastapi.testclient import TestClient
from pymongo import MongoClient

load_dotenv(backend_dir / ".env")

from server import app

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c

def _create_test_user(user_name: str):
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "acuspeak")
    mongo_client = MongoClient(mongo_url)
    db = mongo_client[db_name]

    user_id = f"user_TEST_{uuid.uuid4().hex[:8]}"
    email = f"TEST_{uuid.uuid4().hex[:8]}@example.com"
    token = f"tok_TEST_{uuid.uuid4().hex}"
    
    user_doc = {
        "user_id": user_id,
        "email": email,
        "name": user_name,
        "picture": "https://example.com/avatar.jpg",
        "english_level": "Intermediate",
        "xp": 50,
        "created_at": datetime.now(timezone.utc),
    }
    
    session_doc = {
        "session_token": token,
        "user_id": user_id,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
        "created_at": datetime.now(timezone.utc),
    }
    
    db.users.insert_one(user_doc)
    db.user_sessions.insert_one(session_doc)
    
    return user_id, token

def test_call_termination_and_status(client):
    user_id, token = _create_test_user("CallerUser")
    headers = {"Authorization": f"Bearer {token}"}
    room_id = f"room_test_{uuid.uuid4().hex[:8]}"

    # Initial status check should be active
    res_status = client.get(f"/api/call/status/{room_id}", headers=headers)
    assert res_status.status_code == 200
    assert res_status.json()["status"] == "active"

    # End call session
    res_end = client.post("/api/call/end", json={"room_id": room_id}, headers=headers)
    assert res_end.status_code == 200
    data_end = res_end.json()
    assert data_end["ok"] is True
    assert data_end["status"] == "ended"

    # Status check after termination should return ended
    res_status_after = client.get(f"/api/call/status/{room_id}", headers=headers)
    assert res_status_after.status_code == 200
    assert res_status_after.json()["status"] == "ended"

def test_call_feedback_submission(client):
    rater_id, rater_token = _create_test_user("RaterUser")
    target_id, _ = _create_test_user("RatedUser")
    headers = {"Authorization": f"Bearer {rater_token}"}
    room_id = f"room_fb_{uuid.uuid4().hex[:8]}"

    # Test invalid rating (0 stars)
    res_invalid_low = client.post(
        "/api/call/feedback",
        json={"room_id": room_id, "target_user_id": target_id, "rating": 0, "comment": "Too bad"},
        headers=headers
    )
    assert res_invalid_low.status_code == 422 or res_invalid_low.status_code == 400

    # Test invalid rating (6 stars)
    res_invalid_high = client.post(
        "/api/call/feedback",
        json={"room_id": room_id, "target_user_id": target_id, "rating": 6},
        headers=headers
    )
    assert res_invalid_high.status_code == 422 or res_invalid_high.status_code == 400

    # Test valid rating (5 stars with optional comment)
    res_valid = client.post(
        "/api/call/feedback",
        json={"room_id": room_id, "target_user_id": target_id, "rating": 5, "comment": "Great practice partner!"},
        headers=headers
    )
    assert res_valid.status_code == 200
    data_valid = res_valid.json()
    assert data_valid["ok"] is True
    assert "feedback_id" in data_valid
