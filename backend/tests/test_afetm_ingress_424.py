"""Ingress-safe upstream propagation tests (iteration 7 retest).

Verifies the fix applied in iteration 6:
  * Backend now raises HTTP 424 (Failed Dependency) instead of 502 for
    authoritative-upstream errors, so the Cloudflare/K8s ingress no longer
    rewrites the response body.
  * Frontend api.ts detects the envelope by `detail.code`, not by status.

Tests run against BOTH the internal localhost:8001 origin AND the public
preview ingress URL to catch any future rewrite regression.
"""

import os
import re
import subprocess
import time
from pathlib import Path

import pytest
import requests

LOCAL_URL = "http://localhost:8001"
PUBLIC_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or "https://safety-check-mvp.preview.emergentagent.com"
).rstrip("/")

ENV_FILE = Path("/app/backend/.env")
ORIGINAL_ENV = ENV_FILE.read_text()
REAL_URL = "https://pulso-activo--cailus84.replit.app"
REAL_TOKEN = "YI94rvQfypRZiRYvenUzdIMXYUKVCE0G7XyokF4c6Y_Xa6a2DHrBqhvXZRbysAmH"


def _restart_backend():
    subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=False)
    for _ in range(30):
        try:
            r = requests.get(f"{LOCAL_URL}/api/", timeout=3)
            if r.status_code == 200:
                return
        except Exception:
            pass
        time.sleep(1)


def _write_env(url_val: str, token_val: str):
    lines = []
    for line in ORIGINAL_ENV.splitlines():
        if line.startswith("AUTHORITATIVE_UPSTREAM_URL"):
            lines.append(f'AUTHORITATIVE_UPSTREAM_URL="{url_val}"')
        elif line.startswith("AUTHORITATIVE_UPSTREAM_TOKEN"):
            lines.append(f'AUTHORITATIVE_UPSTREAM_TOKEN="{token_val}"')
        else:
            lines.append(line)
    ENV_FILE.write_text("\n".join(lines) + "\n")
    _restart_backend()


@pytest.fixture(scope="module", autouse=True)
def restore_env_after_all():
    yield
    ENV_FILE.write_text(ORIGINAL_ENV)
    _restart_backend()


VALID_PAYLOAD = {
    "device_id": "TEST_ingress424_01",
    "fcr": 60,
    "age": 30,
    "readings": {"0": 180, "60": 165, "90": 150, "120": 135, "150": 125, "180": 120},
    "fcpv": {"sleep": 0, "hydration": 0, "symptoms": 0, "recent_illness": 0, "subjective_load": 0},
}


def _assert_upstream_error_envelope(
    r: requests.Response, expected_url_suffix: str, expect_no_save_phrase: bool = True
):
    assert r.status_code == 424, (
        f"Expected 424, got {r.status_code}. body={r.text[:400]}"
    )
    ct = r.headers.get("content-type", "")
    assert ct.startswith("application/json"), (
        f"Ingress may have rewritten body. Content-Type={ct!r} body[:200]={r.text[:200]!r}"
    )
    # Body must literally contain the code (grep-style guarantee).
    assert "AUTHORITATIVE_UPSTREAM_ERROR" in r.text, (
        f"Literal code missing from body: {r.text[:400]}"
    )
    body = r.json()
    detail = body["detail"]
    assert isinstance(detail, dict)
    assert detail["code"] == "AUTHORITATIVE_UPSTREAM_ERROR"
    assert detail["upstream_status"] == 401
    assert "Unauthorized" in detail["upstream_body"]
    assert detail["upstream_url"].endswith(expected_url_suffix)
    # Spanish user-facing message
    if expect_no_save_phrase:
        assert "NO se guardó" in detail["message"]
    else:
        assert "rechazó" in detail["message"]


# ---------- 1. POST /api/assessments over BOTH origins ----------

@pytest.mark.parametrize(
    "base_url,label",
    [(LOCAL_URL, "localhost"), (PUBLIC_URL, "public_ingress")],
)
class TestPostAssessments424:
    def test_returns_424_with_json_envelope(self, base_url, label):
        r = requests.post(
            f"{base_url}/api/assessments", json=VALID_PAYLOAD, timeout=30
        )
        _assert_upstream_error_envelope(r, "/api/assessments")

    def test_no_ghost_record_created(self, base_url, label):
        # Snapshot count via localhost (deterministic; same Mongo).
        pre = requests.get(
            f"{LOCAL_URL}/api/assessments",
            params={"device_id": VALID_PAYLOAD["device_id"]},
            timeout=10,
        )
        pre_count = len(pre.json()) if pre.status_code == 200 else 0

        r = requests.post(
            f"{base_url}/api/assessments", json=VALID_PAYLOAD, timeout=30
        )
        assert r.status_code == 424

        post = requests.get(
            f"{LOCAL_URL}/api/assessments",
            params={"device_id": VALID_PAYLOAD["device_id"]},
            timeout=10,
        )
        post_count = len(post.json()) if post.status_code == 200 else 0
        assert post_count == pre_count, (
            f"Ghost record leaked via {label}: pre={pre_count} post={post_count}"
        )


# ---------- 2. POST /api/assessments/{aid}/resync over BOTH origins ----------

class TestResync424:
    @pytest.fixture(scope="class")
    def pending_aid(self):
        """Seed a pending record by temporarily emptying the token."""
        _write_env(REAL_URL, "")
        payload = {**VALID_PAYLOAD, "device_id": "TEST_resync424_seed"}
        r = requests.post(f"{LOCAL_URL}/api/assessments", json=payload, timeout=15)
        assert r.status_code == 200, r.text[:200]
        aid = r.json()["id"]
        # Restore real (rejected) token
        _write_env(REAL_URL, REAL_TOKEN)
        yield aid
        # Cleanup
        requests.delete(f"{LOCAL_URL}/api/assessments/{aid}", timeout=10)

    @pytest.mark.parametrize(
        "base_url,label",
        [(LOCAL_URL, "localhost"), (PUBLIC_URL, "public_ingress")],
    )
    def test_resync_returns_424_and_does_not_mutate(self, base_url, label, pending_aid):
        aid = pending_aid
        before = requests.get(f"{LOCAL_URL}/api/assessments/{aid}", timeout=10).json()

        r = requests.post(
            f"{base_url}/api/assessments/{aid}/resync", timeout=30
        )
        _assert_upstream_error_envelope(r, "/api/assessments", expect_no_save_phrase=False)

        after = requests.get(f"{LOCAL_URL}/api/assessments/{aid}", timeout=10).json()
        assert after["calc_source"] == before["calc_source"] == "pending"
        assert after["zone"] is None and before["zone"] is None
        assert after["pattern"] is None and before["pattern"] is None
        assert after["calc_notice"] == before["calc_notice"]


# ---------- 3. Root endpoint sanity ----------

class TestRootConfigured:
    @pytest.mark.parametrize("base_url", [LOCAL_URL, PUBLIC_URL])
    def test_root_upstream_configured_true(self, base_url):
        r = requests.get(f"{base_url}/api/", timeout=10)
        assert r.status_code == 200
        j = r.json()
        assert j["upstream_configured"] is True
        assert j["calc_source_default"] == "authoritative"


# ---------- 4. Unconfigured (empty token) → 200 pending ----------

class TestUnconfiguredPending:
    def test_pending_when_token_empty(self):
        _write_env(REAL_URL, "")
        try:
            root = requests.get(f"{LOCAL_URL}/api/", timeout=10).json()
            assert root["upstream_configured"] is False
            assert root["calc_source_default"] == "pending"

            payload = {**VALID_PAYLOAD, "device_id": "TEST_unconf424_01"}
            r = requests.post(f"{LOCAL_URL}/api/assessments", json=payload, timeout=15)
            assert r.status_code == 200, r.text[:300]
            j = r.json()
            assert j["calc_source"] == "pending"
            assert j["zone"] is None
            assert j["pattern"] is None
            assert j["action"] is None
            assert "pendiente" in (j["calc_notice"] or "").lower()

            requests.delete(f"{LOCAL_URL}/api/assessments/{j['id']}", timeout=10)
        finally:
            _write_env(REAL_URL, REAL_TOKEN)


# ---------- 5. Network failure → 200 pending with "Sin red" suffix ----------

class TestNetworkFailurePending:
    def test_pending_when_url_unreachable(self):
        _write_env("https://invalid.example.invalid", REAL_TOKEN)
        try:
            payload = {**VALID_PAYLOAD, "device_id": "TEST_netfail424_01"}
            r = requests.post(
                f"{LOCAL_URL}/api/assessments", json=payload, timeout=45
            )
            assert r.status_code == 200, r.text[:300]
            j = r.json()
            assert j["calc_source"] == "pending"
            assert "Sin red al servidor autoritativo" in (j.get("calc_notice") or "")

            requests.delete(f"{LOCAL_URL}/api/assessments/{j['id']}", timeout=10)
        finally:
            _write_env(REAL_URL, REAL_TOKEN)


# ---------- 6. Static audit: no local classification, code-based client gate ----------

class TestStaticAudit:
    def test_server_py_uses_424_not_502(self):
        src = Path("/app/backend/server.py").read_text()
        # Two 424 raises (create + resync) with AUTHORITATIVE_UPSTREAM_ERROR
        assert src.count("status_code=424") >= 2, (
            "Expected two HTTPException(status_code=424, ...) sites"
        )
        # No local zone thresholds
        forbidden = [
            r"recpct\s*>=\s*65",
            r"recpct\s*>=\s*40",
            r"recpct\s*<\s*25",
            r'zone\s*=\s*"BLUE"',
            r'zone\s*=\s*"GREEN"',
            r'zone\s*=\s*"YELLOW"',
            r'zone\s*=\s*"RED"',
            r'"oscillating"',
            r'"plateau"',
            r"def\s+calc_assessment",
        ]
        for pat in forbidden:
            assert not re.search(pat, src), f"Forbidden pattern: {pat}"

    def test_api_ts_uses_code_based_gate(self):
        """api.ts must detect UpstreamError by `detail.code`, not by status."""
        src = Path("/app/frontend/src/lib/api.ts").read_text()
        assert "UpstreamError" in src
        assert "AUTHORITATIVE_UPSTREAM_ERROR" in src
        # The gate must not be hard-coded to res.status===502
        # (should either be status-agnostic or accept multiple codes).
        assert "detail.code === 'AUTHORITATIVE_UPSTREAM_ERROR'" in src \
            or 'detail.code === "AUTHORITATIVE_UPSTREAM_ERROR"' in src, (
                "api.ts must detect AUTHORITATIVE_UPSTREAM_ERROR via detail.code"
            )
        # Guard: ensure req() no longer requires res.status === 502.
        assert "res.status === 502" not in src, (
            "api.ts still gates on res.status === 502; must be code-based"
        )
