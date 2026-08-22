"""Backend tests for AFEtm Safety Check API"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://safety-check-mvp.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DEV = f"TEST_dev_{uuid.uuid4().hex[:8]}"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    yield sess
    # cleanup assessments created
    try:
        r = sess.get(f"{API}/assessments", params={"device_id": DEV})
        if r.ok:
            for a in r.json():
                sess.delete(f"{API}/assessments/{a['id']}")
    except Exception:
        pass


# -- Health --
def test_health(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    d = r.json()
    assert d.get("status") == "ok"
    assert "_id" not in d


# -- Profile --
def test_profile_get_null_when_missing(s):
    r = s.get(f"{API}/profile", params={"device_id": DEV})
    assert r.status_code == 200
    assert r.json() is None


def test_profile_upsert_and_get(s):
    payload = {"device_id": DEV, "name": "TEST_Runner", "age": 30, "weight": 70.5, "sport": "running"}
    r = s.post(f"{API}/profile", json=payload)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["name"] == "TEST_Runner"
    assert d["age"] == 30
    assert "_id" not in d
    # update
    payload["age"] = 31
    r2 = s.post(f"{API}/profile", json=payload)
    assert r2.status_code == 200
    assert r2.json()["age"] == 31
    # get
    r3 = s.get(f"{API}/profile", params={"device_id": DEV})
    assert r3.status_code == 200
    got = r3.json()
    assert got["age"] == 31
    assert "_id" not in got


# -- Assessment computations --
def _readings(vals):
    return {str(t): v for t, v in zip([0, 30, 60, 90, 120, 180], vals)}


def test_assessment_missing_reading_returns_400(s):
    payload = {
        "device_id": DEV,
        "fcr": 60,
        "age": 30,
        "readings": {"0": 180, "30": 160, "60": 140, "90": 120, "120": 110},
        "fcpv": {"sleep": 0, "hydration": 0, "symptoms": 0, "recent_illness": 0, "subjective_load": 0},
    }
    r = s.post(f"{API}/assessments", json=payload)
    assert r.status_code == 400


def test_assessment_fcp_formula(s):
    # age=30 -> round(0.8*(220-30)) = round(152) = 152
    payload = {
        "device_id": DEV, "fcr": 60, "age": 30,
        "readings": _readings([180, 165, 150, 135, 120, 100]),
        "fcpv": {"sleep": 0, "hydration": 0, "symptoms": 0, "recent_illness": 0, "subjective_load": 0},
    }
    r = s.post(f"{API}/assessments", json=payload)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["fcp_target"] == 152
    assert d["hr_peak"] == 180
    assert d["hrr"] == 180 - 150  # peak - hr_60
    # recpct = (180-100)/(180-60)*100 = 66.7 -> BLUE if RAPID
    assert abs(d["recpct"] - 66.7) < 0.2
    assert d["pattern"] == "RAPID"
    assert d["zone"] == "BLUE"
    assert "_id" not in d


def test_assessment_red_zone_slow(s):
    # very slow recovery -> recpct low, DELAYED, but recpct<25 -> RED
    payload = {
        "device_id": DEV, "fcr": 60, "age": 30,
        "readings": _readings([180, 178, 176, 174, 172, 170]),
        "fcpv": {"sleep": 0, "hydration": 0, "symptoms": 0, "recent_illness": 0, "subjective_load": 0},
    }
    r = s.post(f"{API}/assessments", json=payload)
    assert r.status_code == 200
    d = r.json()
    # recpct = 10/120*100 = 8.3 -> RED
    assert d["recpct"] < 25
    # tail_delta = hrs[-3]-hrs[-1] = 174-170 = 4 (not <3), so plateau=False
    # oscillating: no diffs>4, all -2. so DELAYED but recpct<25 -> RED
    assert d["zone"] == "RED"


def test_assessment_flattened_pattern(s):
    # plateau: tail_delta < 3 and recpct < 35
    # readings: peak 180, drops then flat: 180,170,165,162,161,160  -> tail_delta=162-160=2 <3
    payload = {
        "device_id": DEV, "fcr": 60, "age": 30,
        "readings": _readings([180, 170, 165, 162, 161, 160]),
        "fcpv": {"sleep": 0, "hydration": 0, "symptoms": 0, "recent_illness": 0, "subjective_load": 0},
    }
    r = s.post(f"{API}/assessments", json=payload)
    assert r.status_code == 200
    d = r.json()
    # recpct = (180-160)/(180-60)*100 = 16.7
    assert d["recpct"] < 35
    assert d["pattern"] == "FLATTENED"
    assert d["zone"] == "RED"


def test_assessment_unstable_pattern(s):
    # oscillating: some diff > 4 (HR goes UP during recovery)
    payload = {
        "device_id": DEV, "fcr": 60, "age": 30,
        "readings": _readings([180, 160, 170, 140, 130, 110]),
        "fcpv": {"sleep": 0, "hydration": 0, "symptoms": 0, "recent_illness": 0, "subjective_load": 0},
    }
    r = s.post(f"{API}/assessments", json=payload)
    assert r.status_code == 200
    d = r.json()
    assert d["pattern"] == "UNSTABLE"
    assert d["zone"] == "RED"


def test_assessment_context_flag(s):
    payload = {
        "device_id": DEV, "fcr": 60, "age": 30,
        "readings": _readings([180, 165, 150, 135, 120, 100]),
        "fcpv": {"sleep": 2, "hydration": 2, "symptoms": 2, "recent_illness": 0, "subjective_load": 0},
    }
    r = s.post(f"{API}/assessments", json=payload)
    assert r.status_code == 200
    d = r.json()
    assert d["fcpv_total"] == 6
    assert d["context_flag"] is True


# -- List / detail / delete --
def test_list_sorted_desc_and_filter_by_device(s):
    r = s.get(f"{API}/assessments", params={"device_id": DEV})
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 2
    # sorted desc
    times = [it["created_at"] for it in items]
    assert times == sorted(times, reverse=True)
    for it in items:
        assert it["device_id"] == DEV
        assert "_id" not in it
    # other device -> empty
    r2 = s.get(f"{API}/assessments", params={"device_id": "TEST_nonexistent_xyz"})
    assert r2.status_code == 200
    assert r2.json() == []


def test_get_missing_assessment_returns_404(s):
    r = s.get(f"{API}/assessments/nonexistent-id-xyz")
    assert r.status_code == 404


def test_delete_assessment_and_verify_gone(s):
    payload = {
        "device_id": DEV, "fcr": 60, "age": 30,
        "readings": _readings([180, 165, 150, 135, 120, 100]),
        "fcpv": {"sleep": 0, "hydration": 0, "symptoms": 0, "recent_illness": 0, "subjective_load": 0},
    }
    aid = s.post(f"{API}/assessments", json=payload).json()["id"]
    r = s.delete(f"{API}/assessments/{aid}")
    assert r.status_code == 200
    assert r.json().get("deleted") is True
    r2 = s.get(f"{API}/assessments/{aid}")
    assert r2.status_code == 404
    r3 = s.delete(f"{API}/assessments/{aid}")
    assert r3.status_code == 404
