"""Backend tests for AFEtm authoritative-upstream proxy behavior.

Verifies:
 - GET /api/ exposes upstream_configured / calc_source_default / reference_notice
 - With TOKEN empty (current .env) -> upstream_configured=False and every new
   assessment gets calc_source='reference-mirror' with the REFERENCE_NOTICE
   populated in calc_notice.
 - calc_source / calc_notice fields appear in POST, GET-list, GET-detail
 - Legacy raw docs inserted directly in Mongo (no calc_source field) still
   deserialize with calc_source='reference-mirror' via Pydantic default.
 - When we temporarily set an invalid token in .env and restart backend, the
   upstream returns 401 and backend gracefully falls back to reference-mirror.
"""
import os
import time
import uuid
import subprocess
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://safety-check-mvp.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"
DEV = f"TEST_proxy_{uuid.uuid4().hex[:8]}"
ENV_PATH = "/app/backend/.env"

REF_NOTICE_FRAGMENT = "REFERENCE MIRROR"


def _readings(vals):
    return {str(t): v for t, v in zip([0, 60, 90, 120, 150, 180], vals)}


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    yield sess
    try:
        r = sess.get(f"{API}/assessments", params={"device_id": DEV})
        if r.ok:
            for a in r.json():
                sess.delete(f"{API}/assessments/{a['id']}")
    except Exception:
        pass


# ---------- Root endpoint proxy metadata ----------
def test_root_exposes_proxy_metadata(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    d = r.json()
    for k in ("upstream_configured", "calc_source_default", "reference_notice"):
        assert k in d, f"root missing key: {k}"
    # In current .env, token is empty -> upstream MUST NOT be considered configured
    assert d["upstream_configured"] is False
    assert d["calc_source_default"] == "reference-mirror"
    assert isinstance(d["reference_notice"], str) and REF_NOTICE_FRAGMENT in d["reference_notice"]


# ---------- POST /assessments -> reference-mirror when unconfigured ----------
def test_post_assessment_falls_back_when_token_empty(s):
    payload = {
        "device_id": DEV, "fcr": 60, "age": 30,
        "readings": _readings([180, 165, 150, 135, 120, 100]),
        "fcpv": {"sleep": 0, "hydration": 0, "symptoms": 0, "recent_illness": 0, "subjective_load": 0},
    }
    r = s.post(f"{API}/assessments", json=payload)
    assert r.status_code == 200, r.text
    d = r.json()
    # Proxy fields
    assert d["calc_source"] == "reference-mirror"
    assert isinstance(d["calc_notice"], str) and REF_NOTICE_FRAGMENT in d["calc_notice"]
    # Reference math still correct (regression)
    assert d["fcp_target"] == 152
    assert d["hr_peak"] == 180
    assert d["hrr"] == 15  # 180 - 165
    assert abs(d["recpct"] - 66.7) < 0.2
    assert d["pattern"] == "RAPID"
    assert d["zone"] == "BLUE"
    assert "_id" not in d


# ---------- List + Detail expose calc_source/calc_notice ----------
def test_list_and_detail_expose_calc_fields(s):
    r = s.get(f"{API}/assessments", params={"device_id": DEV})
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 1
    for it in items:
        assert it.get("calc_source") in ("reference-mirror", "authoritative")
        assert "calc_notice" in it  # may be None only when authoritative
        assert "_id" not in it
    aid = items[0]["id"]
    r2 = s.get(f"{API}/assessments/{aid}")
    assert r2.status_code == 200
    d = r2.json()
    assert d["calc_source"] == "reference-mirror"
    assert isinstance(d["calc_notice"], str) and REF_NOTICE_FRAGMENT in d["calc_notice"]
    assert "_id" not in d


# ---------- Legacy Mongo doc without calc_source should default gracefully ----------
def test_legacy_doc_defaults_to_reference_mirror(s):
    """Insert a legacy-shaped assessment directly and ensure GET returns
    calc_source='reference-mirror' via Pydantic default."""
    try:
        from pymongo import MongoClient
    except ImportError:
        pytest.skip("pymongo not available for direct DB insert")
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")
    cli = MongoClient(mongo_url)
    legacy_id = f"TEST_legacy_{uuid.uuid4().hex[:8]}"
    legacy = {
        "id": legacy_id, "device_id": DEV, "fcr": 60, "age": 30,
        "readings": _readings([180, 165, 150, 135, 120, 100]),
        "fcp_target": 152, "hr_peak": 180, "hrr": 15, "recpct": 66.7,
        "aurc": 26475.0, "tau": 180.0, "pattern": "RAPID", "zone": "BLUE",
        "action": "Continuar con normalidad",
        "fcpv": {"sleep": 0, "hydration": 0, "symptoms": 0, "recent_illness": 0, "subjective_load": 0},
        "fcpv_total": 0, "context_flag": False,
        "created_at": "2024-01-01T00:00:00+00:00",
        # NOTE: no calc_source, no calc_notice
    }
    cli[db_name].assessments.insert_one(legacy)
    try:
        r = s.get(f"{API}/assessments/{legacy_id}")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["calc_source"] == "reference-mirror"  # Pydantic default
        # calc_notice legacy default -> None (Optional field)
        assert "calc_notice" in d
        assert "_id" not in d
    finally:
        cli[db_name].assessments.delete_one({"id": legacy_id})
        cli.close()


# ---------- Reference-mirror engine regression (edge cases) ----------
def test_reference_mirror_regression_red_zone(s):
    payload = {
        "device_id": DEV, "fcr": 60, "age": 30,
        "readings": _readings([180, 178, 176, 174, 172, 170]),
        "fcpv": {"sleep": 0, "hydration": 0, "symptoms": 0, "recent_illness": 0, "subjective_load": 0},
    }
    r = s.post(f"{API}/assessments", json=payload)
    assert r.status_code == 200
    d = r.json()
    assert d["calc_source"] == "reference-mirror"
    assert d["recpct"] < 25
    assert d["zone"] == "RED"


# ---------- Invalid token upstream 401 -> graceful fallback ----------
@pytest.fixture(scope="module")
def _invalid_token_env():
    """Temporarily patch .env to point at real upstream with an INVALID token.
    Restart the backend, run tests, then restore original .env."""
    with open(ENV_PATH, "r") as f:
        original = f.read()
    patched_lines = []
    for line in original.splitlines():
        if line.startswith("AUTHORITATIVE_UPSTREAM_TOKEN"):
            patched_lines.append('AUTHORITATIVE_UPSTREAM_TOKEN="test-invalid-token"')
        else:
            patched_lines.append(line)
    patched = "\n".join(patched_lines) + "\n"
    try:
        with open(ENV_PATH, "w") as f:
            f.write(patched)
        subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=False, capture_output=True)
        # Wait for backend to come back
        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                r = requests.get(f"{API}/", timeout=3)
                if r.ok and r.json().get("upstream_configured") is True:
                    break
            except Exception:
                pass
            time.sleep(1)
        yield
    finally:
        with open(ENV_PATH, "w") as f:
            f.write(original)
        subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=False, capture_output=True)
        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                r = requests.get(f"{API}/", timeout=3)
                if r.ok:
                    break
            except Exception:
                pass
            time.sleep(1)


def test_invalid_token_gracefully_falls_back(s, _invalid_token_env):
    # Confirm root reports upstream_configured=True (both URL+TOKEN non-empty)
    root = s.get(f"{API}/").json()
    assert root["upstream_configured"] is True
    assert root["calc_source_default"] == "authoritative"

    payload = {
        "device_id": DEV, "fcr": 60, "age": 30,
        "readings": _readings([180, 165, 150, 135, 120, 100]),
        "fcpv": {"sleep": 0, "hydration": 0, "symptoms": 0, "recent_illness": 0, "subjective_load": 0},
    }
    r = s.post(f"{API}/assessments", json=payload)
    assert r.status_code == 200, r.text
    d = r.json()
    # Upstream returns 401 -> backend must fall back
    assert d["calc_source"] == "reference-mirror", (
        f"Expected fallback but got {d.get('calc_source')}; upstream likely accepted invalid token"
    )
    assert isinstance(d["calc_notice"], str) and REF_NOTICE_FRAGMENT in d["calc_notice"]
    # Math still correct
    assert d["fcp_target"] == 152
    assert d["zone"] == "BLUE"
    assert "_id" not in d


# NOTE: post-teardown sanity check that .env is restored is done externally
# (curl to /api/ after this module finishes). It cannot live in the same
# module because module-scope fixture teardown runs AFTER the last test in
# the module. See iteration report for the manual verification result.
