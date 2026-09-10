"""
Unit and integration tests for the MongoDB match_queue partner matching system.
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

# Load env before importing server
load_dotenv(backend_dir / ".env")

from server import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _create_test_user(user_name: str):
    user_id = f"user_TEST_{uuid.uuid4().hex[:8]}"
    email = f"TEST_{uuid.uuid4().hex[:8]}@example.com"
    token = f"tok_TEST_{uuid.uuid4().hex}"
    
    user_doc = {
        "user_id": user_id,
        "email": email,
        "name": user_name,
        "picture": "https://example.com/avatar.jpg",
        "english_level": "Intermediate",
        "gender": "male",
        "country": "Canada",
        "xp": 100,
        "streak": 2,
        "is_premium": False,
        "created_at": datetime.now(timezone.utc),
    }
    
    session_doc = {
        "session_token": token,
        "user_id": user_id,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
        "created_at": datetime.now(timezone.utc),
    }
    
    mongo = MongoClient(os.environ["MONGO_URL"])
    sync_db = mongo[os.environ.get("DB_NAME", "acuspeak")]
    sync_db.users.insert_one(user_doc)
    sync_db.user_sessions.insert_one(session_doc)
    
    return {"user_id": user_id, "token": token, "name": user_name, "sync_db": sync_db}


def _cleanup_test_user(user_data):
    sync_db = user_data["sync_db"]
    user_id = user_data["user_id"]
    token = user_data["token"]
    
    sync_db.users.delete_one({"user_id": user_id})
    sync_db.user_sessions.delete_one({"session_token": token})
    sync_db.match_queue.delete_many({"user_id": user_id})
    sync_db.match_queue.delete_many({"partner_id": user_id})


def test_single_user_join_queue(client):
    user = _create_test_user("Alice Queue")
    headers = {"Authorization": f"Bearer {user['token']}"}
    
    try:
        # Join match queue
        res = client.post("/api/match/join", json={"gender": "any"}, headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "searching"

        # Check status endpoint
        st_res = client.get("/api/match/status", headers=headers)
        assert st_res.status_code == 200
        st_data = st_res.json()
        assert st_data["status"] == "searching"
    finally:
        _cleanup_test_user(user)


def test_two_users_pair_instantly(client):
    user1 = _create_test_user("Bob Queue 1")
    user2 = _create_test_user("Carol Queue 2")
    headers1 = {"Authorization": f"Bearer {user1['token']}"}
    headers2 = {"Authorization": f"Bearer {user2['token']}"}

    try:
        # User 1 joins queue first
        r1 = client.post("/api/match/join", json={"gender": "any"}, headers=headers1)
        assert r1.status_code == 200
        assert r1.json()["status"] == "searching"

        # User 2 joins queue and should pair instantly with User 1
        r2 = client.post("/api/match/join", json={"gender": "any"}, headers=headers2)
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["status"] == "matched"
        assert d2["partner_id"] == user1["user_id"]
        assert "room_id" in d2

        room_id = d2["room_id"]

        # Check User 1 status via short polling endpoint
        st1 = client.get("/api/match/status", headers=headers1).json()
        assert st1["status"] == "matched"
        assert st1["room_id"] == room_id
        assert st1["partner"]["user_id"] == user2["user_id"]
        assert st1["partner"]["name"] == "Carol Queue 2"
        assert "zego_token" in st1 and len(st1["zego_token"]) > 0

        # Check User 2 status via short polling endpoint
        st2 = client.get("/api/match/status", headers=headers2).json()
        assert st2["status"] == "matched"
        assert st2["room_id"] == room_id
        assert st2["partner"]["user_id"] == user1["user_id"]
        assert st2["partner"]["name"] == "Bob Queue 1"
        assert "zego_token" in st2 and len(st2["zego_token"]) > 0
    finally:
        _cleanup_test_user(user1)
        _cleanup_test_user(user2)


def test_cancel_match_queue(client):
    user = _create_test_user("David Queue")
    headers = {"Authorization": f"Bearer {user['token']}"}

    try:
        # Join queue
        client.post("/api/match/join", json={"gender": "any"}, headers=headers)
        
        # Cancel search
        c_res = client.post("/api/match/cancel", headers=headers)
        assert c_res.status_code == 200
        assert c_res.json()["status"] == "cancelled"

        # Status check should return idle
        st_res = client.get("/api/match/status", headers=headers)
        assert st_res.status_code == 200
        assert st_res.json()["status"] == "idle"
    finally:
        _cleanup_test_user(user)


def test_auto_expire_stale_search(client):
    user = _create_test_user("Eve Queue")
    headers = {"Authorization": f"Bearer {user['token']}"}
    sync_db = user["sync_db"]

    try:
        # Insert a searching record that is 35 seconds old
        stale_time = datetime.now(timezone.utc) - timedelta(seconds=35)
        sync_db.match_queue.insert_one({
            "user_id": user["user_id"],
            "status": "searching",
            "partner_id": None,
            "room_id": None,
            "gender_pref": "any",
            "created_at": stale_time
        })

        # Query status endpoint -> should detect stale and expire
        st_res = client.get("/api/match/status", headers=headers)
        assert st_res.status_code == 200
        assert st_res.json()["status"] == "expired"
    finally:
        _cleanup_test_user(user)
