"""AFEtm PENDING-MODE tests.

Verifies the STRICT bug fix: when the authoritative upstream is unavailable
(AUTHORITATIVE_UPSTREAM_TOKEN is empty), the backend MUST NOT generate a
local Blue/Green/Yellow/Red classification. Instead, it saves raw + math
and stamps calc_source='pending' with the Spanish notice.
"""
import os
import re
import uuid
import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values

# ---- BASE URL ----
_env = dotenv_values("/app/frontend/.env")
BASE_URL = (_env.get("EXPO_PUBLIC_BACKEND_URL") or os.environ["EXPO_PUBLIC_BACKEND_URL"]).rstrip("/")

PENDING_NOTICE = "Resultado pendiente de sincronización con el motor oficial AFEtm."


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def cleanup_ids():
    ids = []
    yield ids
    # teardown: try to delete created assessments
    for aid in ids:
        try:
            requests.delete(f"{BASE_URL}/api/assessments/{aid}", timeout=10)
        except Exception:
            pass


# ---------- 1. GET /api/ pending mode ----------
def test_root_reports_pending_mode(api):
    r = api.get(f"{BASE_URL}/api/", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["upstream_configured"] is False
    assert d["calc_source_default"] == "pending"
    assert d["pending_notice"] == PENDING_NOTICE


# ---------- 2. POST /assessments -> pending record ----------
def _sample_payload(device_id):
    return {
        "device_id": device_id,
        "fcr": 60,
        "age": 30,
        "readings": {"0": 180, "60": 165, "90": 150, "120": 135, "150": 125, "180": 120},
        "fcpv": {"sleep": 0, "hydration": 0, "symptoms": 0, "recent_illness": 0, "subjective_load": 0},
    }


def test_post_assessment_pending(api, cleanup_ids):
    dev = f"TEST_pending_{uuid.uuid4().hex[:8]}"
    r = api.post(f"{BASE_URL}/api/assessments", json=_sample_payload(dev), timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    cleanup_ids.append(d["id"])

    # Pending fields
    assert d["calc_source"] == "pending"
    assert d["zone"] is None
    assert d["pattern"] is None
    assert d["action"] is None
    assert d["context_flag"] is False
    assert d["calc_notice"] == PENDING_NOTICE

    # Raw preserved
    assert d["fcr"] == 60
    assert d["age"] == 30
    assert d["readings"]["0"] == 180
    assert d["readings"]["180"] == 120

    # Documented math computed
    assert d["fcp_target"] == 152  # round(0.80*(220-30)) = 152
    assert d["hr_peak"] == 180
    assert d["hrr"] == 15           # 180-165
    # recpct = (180-120)/(180-60) * 100 = 50
    assert d["recpct"] == 50.0
    assert isinstance(d["aurc"], (int, float)) and d["aurc"] > 0
    assert isinstance(d["tau"], (int, float))
    assert d["fcpv_total"] == 0
    assert "_id" not in d


# ---------- 3. GET /assessments/{id} on pending ----------
def test_get_pending_detail(api, cleanup_ids):
    dev = f"TEST_pending_{uuid.uuid4().hex[:8]}"
    r = api.post(f"{BASE_URL}/api/assessments", json=_sample_payload(dev), timeout=20)
    aid = r.json()["id"]
    cleanup_ids.append(aid)

    g = api.get(f"{BASE_URL}/api/assessments/{aid}", timeout=15)
    assert g.status_code == 200, g.text
    d = g.json()
    assert d["zone"] is None
    assert d["pattern"] is None
    assert d["action"] is None
    assert d["calc_source"] == "pending"
    assert d["calc_notice"] == PENDING_NOTICE
    assert "_id" not in d


# ---------- 4. Resync endpoint - still pending ----------
def test_resync_still_pending(api, cleanup_ids):
    dev = f"TEST_pending_{uuid.uuid4().hex[:8]}"
    r = api.post(f"{BASE_URL}/api/assessments", json=_sample_payload(dev), timeout=20)
    aid = r.json()["id"]
    cleanup_ids.append(aid)

    rs = api.post(f"{BASE_URL}/api/assessments/{aid}/resync", timeout=20)
    assert rs.status_code == 200, rs.text
    d = rs.json()
    # Upstream still unavailable → unchanged pending
    assert d["calc_source"] == "pending"
    assert d["zone"] is None
    assert d["pattern"] is None
    assert d["id"] == aid


# ---------- 5. Resync on missing ID -> 404 ----------
def test_resync_missing_id(api):
    r = api.post(f"{BASE_URL}/api/assessments/does-not-exist-xyz/resync", timeout=15)
    assert r.status_code == 404


# ---------- 6. Resync no-op on already-authoritative record ----------
def test_resync_noop_on_authoritative(api, cleanup_ids):
    """Directly seed an authoritative record and confirm resync returns it unchanged."""
    dev = f"TEST_authseed_{uuid.uuid4().hex[:8]}"
    # Create pending first via API
    r = api.post(f"{BASE_URL}/api/assessments", json=_sample_payload(dev), timeout=20)
    aid = r.json()["id"]
    cleanup_ids.append(aid)

    # Patch DB directly to mark it authoritative
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")
    mc = MongoClient(mongo_url)
    try:
        mc[db_name].assessments.update_one(
            {"id": aid},
            {"$set": {
                "calc_source": "authoritative",
                "calc_notice": None,
                "zone": "GREEN",
                "pattern": "NORMAL",
                "action": "Continuar",
                "context_flag": False,
            }},
        )
    finally:
        mc.close()

    rs = api.post(f"{BASE_URL}/api/assessments/{aid}/resync", timeout=20)
    assert rs.status_code == 200, rs.text
    d = rs.json()
    # No-op: still authoritative, unchanged
    assert d["calc_source"] == "authoritative"
    assert d["zone"] == "GREEN"
    assert d["pattern"] == "NORMAL"


# ---------- 7. Static audit: server.py must NOT contain old threshold logic ----------
def test_no_local_classification_thresholds_in_code():
    with open("/app/backend/server.py", "r", encoding="utf-8") as f:
        src = f.read()
    forbidden_patterns = [
        r"recpct\s*>=\s*65",
        r"recpct\s*>=\s*40",
        r"recpct\s*<\s*25",
        r"def\s+calc_assessment\b",
        # pattern string literals used to be decided locally
        r'"oscillating"',
        r'"plateau"',
    ]
    for pat in forbidden_patterns:
        assert re.search(pat, src) is None, f"FORBIDDEN classification logic still present: /{pat}/"

    # Positive assertions
    assert "calc_math_only" in src, "New calc_math_only function must exist"
    assert "Resultado pendiente de sincronización" in src, "Spanish pending notice must exist"


# ---------- 8. Legacy features still work: profile ----------
def test_profile_regression(api):
    dev = f"TEST_profile_{uuid.uuid4().hex[:8]}"
    payload = {"device_id": dev, "name": "T User", "age": 30, "weight": 70.0, "sport": "Running"}
    r = api.post(f"{BASE_URL}/api/profile", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["device_id"] == dev
    assert d["age"] == 30
    assert "_id" not in d

    g = api.get(f"{BASE_URL}/api/profile", params={"device_id": dev}, timeout=15)
    assert g.status_code == 200
    assert g.json()["name"] == "T User"


# ---------- 9. Delete assessment still works ----------
def test_delete_assessment(api):
    dev = f"TEST_del_{uuid.uuid4().hex[:8]}"
    r = api.post(f"{BASE_URL}/api/assessments", json=_sample_payload(dev), timeout=20)
    aid = r.json()["id"]
    d = api.delete(f"{BASE_URL}/api/assessments/{aid}", timeout=15)
    assert d.status_code == 200
    assert d.json()["deleted"] is True
    # confirm 404 after delete
    g = api.get(f"{BASE_URL}/api/assessments/{aid}", timeout=15)
    assert g.status_code == 404
