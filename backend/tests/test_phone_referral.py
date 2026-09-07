"""
Focused backend tests for the new phone-OTP and referral features.
Covers: /api/auth/phone/send-otp, /api/auth/phone/verify-otp,
/api/auth/phone/link, /api/referral, /api/referral/apply,
/api/subscription/checkout with referral discount,
Mongo collection invariants (phone_otps TTL, unique indexes, no _id leak),
and the existing /api/auth/session negative path.
"""
import os
import time
import uuid
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path
from pymongo import MongoClient

# Load backend .env for Mongo access
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "acuspeak")

mongo = MongoClient(MONGO_URL)
db = mongo[DB_NAME]


def _rand_phone():
    # US-style 10 digit with random suffix, prefixed by unique run marker
    return "+1555" + "".join([str((int(time.time() * 1000) + i) % 10) for i in range(6)]) + str(uuid.uuid4().int)[:2]


def _cleanup_phone(phone):
    p = "+" + "".join(c for c in phone if c.isdigit())
    user = db.users.find_one({"phone": p})
    if user:
        db.user_sessions.delete_many({"user_id": user["user_id"]})
        db.users.delete_one({"user_id": user["user_id"]})
    db.phone_otps.delete_many({"phone": p})


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ----------------- Phone OTP -----------------
class TestPhoneOtp:
    def test_send_otp_success_mock_mode(self, api_client):
        phone = _rand_phone()
        try:
            r = api_client.post(f"{API}/auth/phone/send-otp", json={"phone": phone})
            assert r.status_code == 200, r.text
            data = r.json()
            assert data.get("ok") is True
            assert data.get("phone", "").startswith("+")
            assert "debug_code" in data and len(data["debug_code"]) == 6
            assert "hint" in data
            # phone_otps record must exist
            rec = db.phone_otps.find_one({"phone": data["phone"]})
            assert rec is not None
            assert rec["code"] == data["debug_code"]
        finally:
            _cleanup_phone(phone)

    def test_send_otp_invalid_short_phone(self, api_client):
        r = api_client.post(f"{API}/auth/phone/send-otp", json={"phone": "12"})
        assert r.status_code == 400, r.text

    def test_verify_otp_without_send_returns_400(self, api_client):
        phone = _rand_phone()
        try:
            r = api_client.post(
                f"{API}/auth/phone/verify-otp",
                json={"phone": phone, "code": "123456"},
            )
            assert r.status_code == 400, r.text
        finally:
            _cleanup_phone(phone)

    def test_verify_otp_wrong_length_code(self, api_client):
        phone = _rand_phone()
        try:
            api_client.post(f"{API}/auth/phone/send-otp", json={"phone": phone})
            r = api_client.post(
                f"{API}/auth/phone/verify-otp",
                json={"phone": phone, "code": "123"},
            )
            assert r.status_code == 400
        finally:
            _cleanup_phone(phone)

    def test_verify_otp_success_and_user_shape(self, api_client):
        phone = _rand_phone()
        try:
            api_client.post(f"{API}/auth/phone/send-otp", json={"phone": phone})
            r = api_client.post(
                f"{API}/auth/phone/verify-otp",
                json={"phone": phone, "code": "999999", "name": "TEST Alice"},
            )
            assert r.status_code == 200, r.text
            data = r.json()
            assert "session_token" in data and data["session_token"]
            u = data["user"]
            assert u["phone"].startswith("+")
            assert u["referral_code"], "referral_code must be auto-generated"
            assert "_id" not in u
            # OTP record should be deleted after successful verify
            assert db.phone_otps.find_one({"phone": u["phone"]}) is None

            # /auth/me returns same user
            me = api_client.get(
                f"{API}/auth/me",
                headers={"Authorization": f"Bearer {data['session_token']}"},
            )
            assert me.status_code == 200
            me_user = me.json()
            assert me_user["user_id"] == u["user_id"]
            assert me_user["phone"] == u["phone"]
            assert "_id" not in me_user
        finally:
            _cleanup_phone(phone)

    def test_verify_otp_second_time_reuses_user(self, api_client):
        phone = _rand_phone()
        try:
            api_client.post(f"{API}/auth/phone/send-otp", json={"phone": phone})
            r1 = api_client.post(
                f"{API}/auth/phone/verify-otp",
                json={"phone": phone, "code": "111111"},
            )
            uid1 = r1.json()["user"]["user_id"]
            # second cycle
            api_client.post(f"{API}/auth/phone/send-otp", json={"phone": phone})
            r2 = api_client.post(
                f"{API}/auth/phone/verify-otp",
                json={"phone": phone, "code": "222222"},
            )
            assert r2.status_code == 200
            uid2 = r2.json()["user"]["user_id"]
            assert uid1 == uid2, "Repeat verify should reuse the same user"
        finally:
            _cleanup_phone(phone)


# ----------------- Referral on signup -----------------
class TestReferralSignup:
    def test_signup_via_referral_code(self, api_client):
        phoneA = _rand_phone()
        phoneB = _rand_phone()
        try:
            # userA
            api_client.post(f"{API}/auth/phone/send-otp", json={"phone": phoneA})
            rA = api_client.post(
                f"{API}/auth/phone/verify-otp",
                json={"phone": phoneA, "code": "123456", "name": "TEST Alpha"},
            )
            userA = rA.json()["user"]
            codeA = userA["referral_code"]
            assert codeA

            # userB signs up using userA's code
            api_client.post(f"{API}/auth/phone/send-otp", json={"phone": phoneB})
            rB = api_client.post(
                f"{API}/auth/phone/verify-otp",
                json={
                    "phone": phoneB,
                    "code": "654321",
                    "name": "TEST Beta",
                    "referral_code": codeA,
                },
            )
            assert rB.status_code == 200, rB.text
            userB = rB.json()["user"]
            assert userB["referred_by"] == userA["user_id"]
            assert userB["referral_discount_active"] is True

            # Refresh userA state
            tokenA = rA.json()["session_token"]
            meA = api_client.get(
                f"{API}/auth/me",
                headers={"Authorization": f"Bearer {tokenA}"},
            ).json()
            assert meA["referral_count"] >= 1
            assert meA["referral_discount_active"] is True
        finally:
            _cleanup_phone(phoneA)
            _cleanup_phone(phoneB)


# ----------------- Referral endpoints -----------------
class TestReferralEndpoints:
    def _login(self, api_client, name="TEST R"):
        phone = _rand_phone()
        api_client.post(f"{API}/auth/phone/send-otp", json={"phone": phone})
        r = api_client.post(
            f"{API}/auth/phone/verify-otp",
            json={"phone": phone, "code": "112233", "name": name},
        )
        d = r.json()
        return phone, d["session_token"], d["user"]

    def test_get_referral(self, api_client):
        phone, token, user = self._login(api_client)
        try:
            r = api_client.get(
                f"{API}/referral", headers={"Authorization": f"Bearer {token}"}
            )
            assert r.status_code == 200
            data = r.json()
            for k in ("referral_code", "referral_count", "referral_discount_active", "share_message"):
                assert k in data
            assert data["referral_code"] in data["share_message"]
        finally:
            _cleanup_phone(phone)

    def test_apply_referral_valid_then_duplicate(self, api_client):
        pA, tA, uA = self._login(api_client, "TEST Owner")
        pB, tB, uB = self._login(api_client, "TEST User")
        try:
            r = api_client.post(
                f"{API}/referral/apply",
                json={"referral_code": uA["referral_code"]},
                headers={"Authorization": f"Bearer {tB}"},
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["referred_by"] == uA["user_id"]
            assert body["referral_discount_active"] is True

            # duplicate apply
            r2 = api_client.post(
                f"{API}/referral/apply",
                json={"referral_code": uA["referral_code"]},
                headers={"Authorization": f"Bearer {tB}"},
            )
            assert r2.status_code == 400
        finally:
            _cleanup_phone(pA)
            _cleanup_phone(pB)

    def test_apply_referral_invalid_code(self, api_client):
        phone, token, _u = self._login(api_client)
        try:
            r = api_client.post(
                f"{API}/referral/apply",
                json={"referral_code": "NOPE-XXXX"},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert r.status_code == 404
        finally:
            _cleanup_phone(phone)

    def test_apply_referral_self_code(self, api_client):
        phone, token, user = self._login(api_client)
        try:
            r = api_client.post(
                f"{API}/referral/apply",
                json={"referral_code": user["referral_code"]},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert r.status_code == 400
        finally:
            _cleanup_phone(phone)


# ----------------- Link phone -----------------
class TestLinkPhone:
    def _login(self, api_client, name="TEST L"):
        phone = _rand_phone()
        api_client.post(f"{API}/auth/phone/send-otp", json={"phone": phone})
        r = api_client.post(
            f"{API}/auth/phone/verify-otp",
            json={"phone": phone, "code": "445566", "name": name},
        )
        d = r.json()
        return phone, d["session_token"], d["user"]

    def test_link_phone_success(self, api_client):
        # Simulate a "Google user" by using a phone-authed session; link a NEW phone
        base_phone, token, user = self._login(api_client, "TEST GAuth")
        new_phone = _rand_phone()
        try:
            api_client.post(f"{API}/auth/phone/send-otp", json={"phone": new_phone})
            r = api_client.post(
                f"{API}/auth/phone/link",
                json={"phone": new_phone, "code": "778899"},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["phone"] == "+" + "".join(c for c in new_phone if c.isdigit())
            assert "_id" not in body
        finally:
            _cleanup_phone(base_phone)
            _cleanup_phone(new_phone)

    def test_link_phone_conflict_409(self, api_client):
        # Create userA with phoneA; then userB tries to link phoneA -> 409
        pA, tA, uA = self._login(api_client, "TEST A")
        pB, tB, uB = self._login(api_client, "TEST B")
        try:
            api_client.post(f"{API}/auth/phone/send-otp", json={"phone": pA})
            r = api_client.post(
                f"{API}/auth/phone/link",
                json={"phone": pA, "code": "112244"},
                headers={"Authorization": f"Bearer {tB}"},
            )
            assert r.status_code == 409, r.text
        finally:
            _cleanup_phone(pA)
            _cleanup_phone(pB)

    def test_link_phone_wrong_length_code(self, api_client):
        phone, token, _u = self._login(api_client)
        new_phone = _rand_phone()
        try:
            api_client.post(f"{API}/auth/phone/send-otp", json={"phone": new_phone})
            r = api_client.post(
                f"{API}/auth/phone/link",
                json={"phone": new_phone, "code": "12"},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert r.status_code == 400
        finally:
            _cleanup_phone(phone)
            _cleanup_phone(new_phone)


# ----------------- Checkout with referral discount -----------------
class TestCheckoutReferralDiscount:
    def _login_with_discount(self, api_client):
        # userA (owner) + userB (referred). Return userB's token & user.
        pA = _rand_phone()
        pB = _rand_phone()
        api_client.post(f"{API}/auth/phone/send-otp", json={"phone": pA})
        rA = api_client.post(
            f"{API}/auth/phone/verify-otp",
            json={"phone": pA, "code": "121212", "name": "TEST CA"},
        )
        codeA = rA.json()["user"]["referral_code"]

        api_client.post(f"{API}/auth/phone/send-otp", json={"phone": pB})
        rB = api_client.post(
            f"{API}/auth/phone/verify-otp",
            json={
                "phone": pB,
                "code": "343434",
                "name": "TEST CB",
                "referral_code": codeA,
            },
        )
        return pA, pB, rB.json()["session_token"], rB.json()["user"]

    def _login_no_discount(self, api_client):
        phone = _rand_phone()
        api_client.post(f"{API}/auth/phone/send-otp", json={"phone": phone})
        r = api_client.post(
            f"{API}/auth/phone/verify-otp",
            json={"phone": phone, "code": "565656", "name": "TEST NoDisc"},
        )
        return phone, r.json()["session_token"], r.json()["user"]

    @pytest.mark.parametrize("plan,base,discounted", [
        ("monthly", 9.99, 7.99),
        ("quarterly", 14.99, 11.99),
    ])
    def test_checkout_with_discount(self, api_client, plan, base, discounted):
        pA, pB, token, user = self._login_with_discount(api_client)
        try:
            r = api_client.post(
                f"{API}/subscription/checkout",
                json={"plan": plan, "origin_url": BASE_URL},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["referral_discount"] is True
            assert abs(body["amount"] - discounted) < 1e-6, f"expected {discounted}, got {body['amount']}"
            # payments doc
            pay = db.payments.find_one({"session_id": body["session_id"]})
            assert pay is not None
            assert pay["referral_discount"] is True
            assert abs(pay["base_amount"] - base) < 1e-6
            assert pay.get("referred_by")  # was referred
        finally:
            _cleanup_phone(pA)
            _cleanup_phone(pB)

    def test_checkout_without_discount(self, api_client):
        phone, token, user = self._login_no_discount(api_client)
        try:
            r = api_client.post(
                f"{API}/subscription/checkout",
                json={"plan": "monthly", "origin_url": BASE_URL},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["referral_discount"] is False
            assert abs(body["amount"] - 9.99) < 1e-6
        finally:
            _cleanup_phone(phone)


# ----------------- Mongo invariants / existing endpoints -----------------
class TestMongoInvariants:
    def test_phone_otps_ttl_index_exists(self):
        idx = db.phone_otps.index_information()
        # find an index on expires_at with expireAfterSeconds set
        found = False
        for _name, spec in idx.items():
            keys = dict(spec.get("key", []))
            if "expires_at" in keys and "expireAfterSeconds" in spec:
                found = True
                break
        assert found, f"TTL index on phone_otps.expires_at missing. Indexes: {idx}"

    def test_users_unique_indexes(self):
        idx = db.users.index_information()
        has_phone_unique = any(
            "phone" in dict(v.get("key", [])) and v.get("unique") for v in idx.values()
        )
        has_ref_unique = any(
            "referral_code" in dict(v.get("key", [])) and v.get("unique") for v in idx.values()
        )
        assert has_phone_unique, f"users.phone unique index missing: {idx}"
        assert has_ref_unique, f"users.referral_code unique index missing: {idx}"


class TestGoogleAuthSessionNegative:
    def test_fake_session_id_returns_401(self, api_client):
        r = api_client.post(
            f"{API}/auth/session",
            json={"session_id": f"fake_{uuid.uuid4().hex}"},
        )
        assert r.status_code == 401, r.text
