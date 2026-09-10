"""
Backend test suite for Acuspeak API.
Covers: public endpoints, auth guarding, and full authenticated flows
using a directly-injected Mongo session (bypassing Emergent OAuth).
"""
import os
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

# Load backend env for MONGO_URL / DB_NAME
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "test_database")
ORIGIN_URL = "https://lingua-franca-6.preview.emergentagent.com"

mongo = MongoClient(MONGO_URL)
db = mongo[DB_NAME]


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def seeded_user():
    """Insert a fake user + session directly, yield token + user_id, then cleanup."""
    user_id = f"user_TEST_{uuid.uuid4().hex[:8]}"
    email = f"TEST_{uuid.uuid4().hex[:8]}@example.com"
    session_token = f"tok_TEST_{uuid.uuid4().hex}"
    user_doc = {
        "user_id": user_id,
        "email": email,
        "name": "Test User",
        "picture": None,
        "english_level": "Beginner",
        "xp": 0,
        "coins": 50,
        "streak": 0,
        "last_active_date": None,
        "daily_goal_minutes": 15,
        "daily_goal_completed_minutes": 0,
        "is_premium": False,
        "premium_plan": None,
        "premium_until": None,
        "saved_words": [],
        "friends": [],
        "blocked": [],
        "achievements": [],
        "certificates": [],
        "created_at": datetime.now(timezone.utc),
    }
    db.users.insert_one(user_doc)
    db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
        "created_at": datetime.now(timezone.utc),
    })
    yield {"user_id": user_id, "token": session_token, "email": email}
    # Cleanup
    db.users.delete_one({"user_id": user_id})
    db.user_sessions.delete_one({"session_token": session_token})
    db.lesson_progress.delete_many({"user_id": user_id})
    db.daily_challenges.delete_many({"user_id": user_id})
    db.speaking_tests.delete_many({"user_id": user_id})
    db.calls.delete_many({"user_id": user_id})
    db.friend_requests.delete_many({"user_id": user_id})
    db.reports.delete_many({"user_id": user_id})
    db.payments.delete_many({"user_id": user_id})
    db.rooms.delete_many({"host_name": "Test User", "is_seed": False})


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _assert_no_mongo_id(obj):
    if isinstance(obj, dict):
        assert "_id" not in obj, f"_id leaked in dict keys: {list(obj.keys())}"
        for v in obj.values():
            _assert_no_mongo_id(v)
    elif isinstance(obj, list):
        for v in obj:
            _assert_no_mongo_id(v)


# ---------- health & public ----------
class TestPublic:
    def test_root(self, api):
        r = api.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        assert "Acuspeak" in r.json()["message"]

    def test_lesson_categories(self, api):
        r = api.get(f"{BASE_URL}/api/lessons/categories")
        assert r.status_code == 200
        data = r.json()
        assert "categories" in data and len(data["categories"]) >= 4
        _assert_no_mongo_id(data)

    def test_lessons_list_and_filter(self, api):
        r = api.get(f"{BASE_URL}/api/lessons")
        assert r.status_code == 200
        assert len(r.json()["lessons"]) > 0
        r2 = api.get(f"{BASE_URL}/api/lessons", params={"category_id": "daily"})
        assert r2.status_code == 200
        assert all(lsn["category_id"] == "daily" for lsn in r2.json()["lessons"])

    def test_lesson_detail(self, api):
        r = api.get(f"{BASE_URL}/api/lessons/daily-1")
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == "daily-1"
        assert isinstance(data.get("script"), list)
        assert len(data["script"]) > 0

        r2 = api.get(f"{BASE_URL}/api/lessons/daily-2")
        assert r2.status_code == 200
        data2 = r2.json()
        assert data2["id"] == "daily-2"
        assert isinstance(data2.get("script"), list)

    def test_lesson_not_found(self, api):
        r = api.get(f"{BASE_URL}/api/lessons/does-not-exist")
        assert r.status_code == 404

    def test_vocab_list(self, api):
        r = api.get(f"{BASE_URL}/api/vocab")
        assert r.status_code == 200
        assert len(r.json()["words"]) >= 10

    def test_word_of_the_day(self, api):
        r = api.get(f"{BASE_URL}/api/vocab/word-of-the-day")
        assert r.status_code == 200
        assert "word" in r.json() and "meaning" in r.json()

    def test_quiz(self, api):
        r = api.get(f"{BASE_URL}/api/quiz")
        assert r.status_code == 200
        assert len(r.json()["questions"]) >= 3

    def test_rooms_public(self, api):
        r = api.get(f"{BASE_URL}/api/rooms")
        assert r.status_code == 200
        rooms = r.json()["rooms"]
        assert len(rooms) >= 4
        _assert_no_mongo_id(r.json())

    def test_subscription_plans(self, api):
        r = api.get(f"{BASE_URL}/api/subscription/plans")
        assert r.status_code == 200
        plans = r.json()["plans"]
        assert "monthly" in plans and "quarterly" in plans


# ---------- auth error handling ----------
class TestAuthGuard:
    def test_fake_session_id_returns_401(self, api):
        r = api.post(f"{BASE_URL}/api/auth/session", json={"session_id": "fake-not-real-xyz"})
        assert r.status_code == 401

    def test_me_without_token_401(self, api):
        r = api.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    @pytest.mark.parametrize("method,path,body", [
        ("GET", "/api/home", None),
        ("PUT", "/api/profile", {"name": "x"}),
        ("POST", "/api/xp", {"amount": 10, "reason": "t"}),
        ("POST", "/api/lessons/complete", {"lesson_id": "daily-1"}),
        ("GET", "/api/lessons/progress/all", None),
        ("POST", "/api/vocab/save", {"word_id": "w1"}),
        ("POST", "/api/vocab/unsave", {"word_id": "w1"}),
        ("GET", "/api/challenges", None),
        ("POST", "/api/challenges/c1/complete", None),
        ("POST", "/api/speaking-test", {"level": "beginner", "fluency": 80, "pronunciation": 80, "grammar": 80, "vocabulary": 80, "overall": 80}),
        ("GET", "/api/speaking-test/history", None),
        ("POST", "/api/match", None),
        ("POST", "/api/calls", {"partner_name": "x", "partner_avatar": "x", "duration_seconds": 60}),
        ("POST", "/api/friends/request", {"to_name": "x", "to_avatar": "x"}),
        ("GET", "/api/friends/requests", None),
        ("POST", "/api/reports", {"target_name": "x", "reason": "spam"}),
        ("POST", "/api/block", {"target_name": "x", "reason": "spam"}),
        ("POST", "/api/rooms", {"title": "t", "topic": "t"}),
        ("POST", "/api/rooms/join", {"room_id": "seed-1"}),
        ("GET", "/api/leaderboard", None),
        ("GET", "/api/achievements", None),
        ("POST", "/api/subscription/checkout", {"plan": "monthly", "origin_url": ORIGIN_URL}),
    ])
    def test_endpoint_requires_auth(self, api, method, path, body):
        r = api.request(method, f"{BASE_URL}{path}", json=body)
        assert r.status_code == 401, f"{method} {path} expected 401, got {r.status_code}"


# ---------- full authenticated flow ----------
class TestAuthenticatedFlow:
    def test_me(self, api, seeded_user):
        r = api.get(f"{BASE_URL}/api/auth/me", headers=_auth(seeded_user["token"]))
        assert r.status_code == 200
        j = r.json()
        assert j["user_id"] == seeded_user["user_id"]
        assert j["email"] == seeded_user["email"]

    def test_home(self, api, seeded_user):
        r = api.get(f"{BASE_URL}/api/home", headers=_auth(seeded_user["token"]))
        assert r.status_code == 200
        j = r.json()
        for k in ["welcome_name", "quote", "daily_goal_minutes", "categories", "challenges", "word_of_the_day", "continue_lesson"]:
            assert k in j, f"missing key: {k}"
        assert isinstance(j["categories"], list) and len(j["categories"]) >= 4
        assert isinstance(j["challenges"], list) and len(j["challenges"]) >= 1
        _assert_no_mongo_id(j)

    def test_xp_adds(self, api, seeded_user):
        before = api.get(f"{BASE_URL}/api/auth/me", headers=_auth(seeded_user["token"])).json()["xp"]
        r = api.post(f"{BASE_URL}/api/xp", headers=_auth(seeded_user["token"]),
                     json={"amount": 40, "reason": "test", "minutes": 2})
        assert r.status_code == 200
        assert r.json()["xp"] == before + 40

    def test_lesson_complete_grants_xp_and_progress(self, api, seeded_user):
        h = _auth(seeded_user["token"])
        before_xp = api.get(f"{BASE_URL}/api/auth/me", headers=h).json()["xp"]
        r = api.post(f"{BASE_URL}/api/lessons/complete", headers=h, json={"lesson_id": "daily-1"})
        assert r.status_code == 200
        j = r.json()
        assert j["xp_earned"] > 0
        assert j["user"]["xp"] >= before_xp + j["xp_earned"]
        prog = api.get(f"{BASE_URL}/api/lessons/progress/all", headers=h)
        assert prog.status_code == 200
        assert "daily-1" in prog.json()["completed_ids"]

    def test_vocab_save_and_unsave(self, api, seeded_user):
        h = _auth(seeded_user["token"])
        xp_before = api.get(f"{BASE_URL}/api/auth/me", headers=h).json()["xp"]
        r = api.post(f"{BASE_URL}/api/vocab/save", headers=h, json={"word_id": "w1"})
        assert r.status_code == 200
        assert "w1" in r.json()["saved_words"]
        assert r.json()["xp"] == xp_before + 2
        r2 = api.post(f"{BASE_URL}/api/vocab/unsave", headers=h, json={"word_id": "w1"})
        assert r2.status_code == 200
        assert "w1" not in r2.json()["saved_words"]

    def test_challenge_complete_prevents_double(self, api, seeded_user):
        h = _auth(seeded_user["token"])
        # Ensure clean slate for today
        from datetime import date
        db.daily_challenges.delete_many({"user_id": seeded_user["user_id"]})
        r = api.post(f"{BASE_URL}/api/challenges/c3/complete", headers=h)
        assert r.status_code == 200
        assert r.json()["xp_earned"] > 0
        r2 = api.post(f"{BASE_URL}/api/challenges/c3/complete", headers=h)
        assert r2.status_code == 400
        ch = api.get(f"{BASE_URL}/api/challenges", headers=h)
        assert ch.status_code == 200
        assert "c3" in ch.json()["completed"]

    def test_speaking_test_certificate(self, api, seeded_user):
        h = _auth(seeded_user["token"])
        payload = {"level": "intermediate", "fluency": 85, "pronunciation": 82,
                   "grammar": 88, "vocabulary": 84, "overall": 85}
        r = api.post(f"{BASE_URL}/api/speaking-test", headers=h, json=payload)
        assert r.status_code == 200
        certs = r.json()["certificates"]
        assert any(c["score"] == 85 for c in certs)
        hist = api.get(f"{BASE_URL}/api/speaking-test/history", headers=h)
        assert hist.status_code == 200
        assert len(hist.json()["results"]) >= 1

    def test_match_returns_partner(self, api, seeded_user):
        r = api.post(f"{BASE_URL}/api/match", headers=_auth(seeded_user["token"]))
        assert r.status_code == 200
        p = r.json()["partner"]
        assert "name" in p and "avatar" in p

    def test_call_log_persists(self, api, seeded_user):
        h = _auth(seeded_user["token"])
        r = api.post(f"{BASE_URL}/api/calls", headers=h, json={
            "partner_name": "Aisha", "partner_avatar": "x", "duration_seconds": 180
        })
        assert r.status_code == 200
        hist = api.get(f"{BASE_URL}/api/calls", headers=h)
        assert hist.status_code == 200
        assert any(c["partner_name"] == "Aisha" for c in hist.json()["calls"])

    def test_friend_request(self, api, seeded_user):
        h = _auth(seeded_user["token"])
        r = api.post(f"{BASE_URL}/api/friends/request", headers=h, json={"to_name": "Bob", "to_avatar": "x"})
        assert r.status_code == 200
        lst = api.get(f"{BASE_URL}/api/friends/requests", headers=h)
        assert lst.status_code == 200
        assert any(x["to_name"] == "Bob" for x in lst.json()["requests"])

    def test_report_and_block(self, api, seeded_user):
        h = _auth(seeded_user["token"])
        r = api.post(f"{BASE_URL}/api/reports", headers=h, json={"target_name": "SpamGuy", "reason": "abuse"})
        assert r.status_code == 200
        r2 = api.post(f"{BASE_URL}/api/block", headers=h, json={"target_name": "SpamGuy", "reason": "abuse"})
        assert r2.status_code == 200
        me = api.get(f"{BASE_URL}/api/auth/me", headers=h).json()
        assert "SpamGuy" in me["blocked"]

    def test_room_create_and_join(self, api, seeded_user):
        h = _auth(seeded_user["token"])
        r = api.post(f"{BASE_URL}/api/rooms", headers=h, json={"title": "TEST Room", "topic": "Daily", "is_private": False})
        assert r.status_code == 200
        room = r.json()
        assert room["participant_count"] == 1
        # Join a seed room and verify count incremented
        before = next(x for x in api.get(f"{BASE_URL}/api/rooms").json()["rooms"] if x["room_id"] == "seed-1")
        rj = api.post(f"{BASE_URL}/api/rooms/join", headers=h, json={"room_id": "seed-1"})
        assert rj.status_code == 200
        after = next(x for x in api.get(f"{BASE_URL}/api/rooms").json()["rooms"] if x["room_id"] == "seed-1")
        assert after["participant_count"] == before["participant_count"] + 1

    def test_room_leave_host_and_listener(self, api, seeded_user):
        h = _auth(seeded_user["token"])
        # Create a room
        cr = api.post(f"{BASE_URL}/api/rooms", headers=h, json={"title": "Test Leave Room", "topic": "Test", "is_private": False}).json()
        rid = cr["room_id"]

        # Host leaves room -> room ends for everyone
        l_res = api.post(f"{BASE_URL}/api/rooms/{rid}/leave", headers=h).json()
        assert l_res["ok"] is True
        assert l_res["ended"] is True

        # Room details should show inactive
        g_res = api.get(f"{BASE_URL}/api/rooms/{rid}").json()
        assert g_res["room"]["status"] == "inactive"

    def test_remove_participant_by_host(self, api, seeded_user):
        h = _auth(seeded_user["token"])
        cr = api.post(f"{BASE_URL}/api/rooms", headers=h, json={"title": "Test Remove Room", "topic": "Test", "is_private": False}).json()
        rid = cr["room_id"]

        # Attempt to remove non-existent listener by host
        rem = api.post(f"{BASE_URL}/api/rooms/{rid}/remove-participant", headers=h, json={"user_id": "dummy_listener_999"})
        assert rem.status_code == 200
        assert rem.json()["ok"] is True

    def test_leaderboard(self, api, seeded_user):
        r = api.get(f"{BASE_URL}/api/leaderboard", headers=_auth(seeded_user["token"]))
        assert r.status_code == 200
        j = r.json()
        assert j["me_user_id"] == seeded_user["user_id"]
        assert isinstance(j["leaderboard"], list) and len(j["leaderboard"]) > 0
        _assert_no_mongo_id(j)

    def test_achievements(self, api, seeded_user):
        r = api.get(f"{BASE_URL}/api/achievements", headers=_auth(seeded_user["token"]))
        assert r.status_code == 200
        items = r.json()["achievements"]
        assert all("unlocked" in a for a in items)

    def test_subscription_checkout(self, api, seeded_user):
        r = api.post(f"{BASE_URL}/api/subscription/checkout",
                     headers=_auth(seeded_user["token"]),
                     json={"plan": "monthly", "origin_url": ORIGIN_URL})
        assert r.status_code == 200, r.text
        j = r.json()
        assert "url" in j and j["url"].startswith("http")
        assert "session_id" in j
        # Persisted?
        row = db.payments.find_one({"session_id": j["session_id"]})
        assert row is not None

    def test_subscription_checkout_invalid_plan(self, api, seeded_user):
        r = api.post(f"{BASE_URL}/api/subscription/checkout",
                     headers=_auth(seeded_user["token"]),
                     json={"plan": "bogus", "origin_url": ORIGIN_URL})
        assert r.status_code == 400


# ---------- indexes ----------
class TestIndexes:
    def test_ttl_index_exists(self):
        idxs = db.user_sessions.index_information()
        found = any(v.get("expireAfterSeconds") == 0 for v in idxs.values())
        assert found, f"TTL index missing on user_sessions.expires_at: {idxs}"
