"""Offline HTTP regression tests. Never read .env or contact MongoDB/Replit.

Run: python -m unittest discover -s backend/tests -p test_assessment_submission.py -v
"""
import importlib.util
import json
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import httpx


spec = importlib.util.spec_from_file_location("submission_server", Path(__file__).parents[1] / "server.py")
server = importlib.util.module_from_spec(spec)
with patch.dict(os.environ, {"MONGO_URL": "mongodb://unused.invalid", "DB_NAME": "offline"}), \
     patch("dotenv.load_dotenv"), patch("dotenv.dotenv_values", return_value={}), \
     patch("motor.motor_asyncio.AsyncIOMotorClient"):
    spec.loader.exec_module(server)


def mobile_payload():
    return dict(device_id="test-device", age=40, fcr=60,
                readings={"0": 150, "60": 125, "90": 115, "120": 105, "150": 95, "180": 85},
                fcpv={k: 0 for k in server.FCPv.model_fields}, factors=["none"],
                safety_confirmed=True, safety_confirmed_at="2026-09-10T12:00:00Z",
                ble_device_name="Polar Verity Sense")


class SubmissionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = MagicMock()
        self.db.profiles.find_one = AsyncMock(return_value=dict(
            device_id="test-device", name="Test Athlete", age=40, athlete_id=123,
            terms_accepted_at="2026-09-10T12:00:00Z", terms_version=server.TERMS_VERSION))
        self.db.assessments.insert_one = AsyncMock()
        self.db.assessments.update_one = AsyncMock()
        self.db.diagnostics.insert_one = AsyncMock()
        self.calls = []
        self.context = {"id": "interview-1"}
        # Opaque fixture values from the upstream: no local classification logic.
        self.result = {"hrr180": 65, "recPct180": 72.2, "zone": "GREEN", "pattern": "NORMAL"}
        self.status = 201
        self.context_status = 201
        self.context_raw = None
        self.result_raw = None
        real_client = httpx.AsyncClient

        def respond(request):
            self.calls.append((request.url.path, json.loads(request.content)))
            context = request.url.path.endswith("context-interviews")
            raw = self.context_raw if context else self.result_raw
            status = self.context_status if context else self.status
            return (httpx.Response(status, content=raw) if raw is not None else
                    httpx.Response(status, json=self.context if context else self.result))

        self.http = real_client(transport=httpx.ASGITransport(app=server.app, raise_app_exceptions=False),
                                base_url="http://mobile.invalid")
        patches = [patch.object(server, "db", self.db),
                   patch.object(server, "AUTHORITATIVE_UPSTREAM_URL", "https://replit.invalid"),
                   patch.object(server, "AUTHORITATIVE_UPSTREAM_TOKEN", "offline-token"),
                   patch.object(server, "_load_subscription", AsyncMock(return_value=SimpleNamespace(status="trial"))),
                   patch.object(server.httpx, "AsyncClient", side_effect=lambda **kw: real_client(
                       transport=httpx.MockTransport(respond), **kw))]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.addAsyncCleanup(self.http.aclose)

    async def submit(self, payload=None):
        return await self.http.post("/api/assessments", json=payload or mobile_payload())

    async def assert_rejected(self, payload=None, status=424):
        response = await self.submit(payload)
        self.assertEqual(response.status_code, status, response.text)
        self.db.assessments.insert_one.assert_not_awaited()
        self.assertNotIn('"zone":', response.text)
        return response

    async def test_valid_sensor_payload_and_replit_mapping_unchanged(self):
        response = await self.submit()
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual((data["zone"], data["hrr"], data["recpct"]), ("GREEN", 65, 72.2))
        self.assertEqual(data["readings"], mobile_payload()["readings"])
        self.assertEqual(data["calc_source"], "authoritative")
        self.assertEqual(self.calls[0], ("/api/context-interviews", {
            "athleteId": 123, "athleteName": "Test Athlete", "factors": ["none"]}))
        forwarded = self.calls[1][1].copy()
        self.assertTrue(forwarded.pop("safetyConfirmedAt"))
        # Replit contract (2026-09-10): the assessment payload MUST carry
        # the official athleteId and link the logged contextual interview.
        self.assertEqual(forwarded, dict(age=40, restingHr=60, maxHr=150,
            hr60s=125, hr90s=115, hr120s=105, hr150s=95, hr3m=85,
            safetyConfirmed=True, fcpv=mobile_payload()["fcpv"],
            athleteId=123, contextInterviewId="interview-1"))
        self.db.assessments.insert_one.assert_awaited_once()

    async def test_manual_payload_still_works(self):
        payload = mobile_payload()
        payload.pop("ble_device_name")
        self.assertEqual((await self.submit(payload)).status_code, 200)

    async def test_guided_omitted_fcpv_uses_existing_defaults(self):
        payload = mobile_payload()
        del payload["fcpv"]
        self.assertEqual((await self.submit(payload)).status_code, 200)
        self.assertEqual(self.calls[1][1]["fcpv"], mobile_payload()["fcpv"])

    async def test_context_upstream_failure_stops_assessment(self):
        self.context_status = 500
        self.context = {"message": "Internal server error"}
        response = await self.assert_rejected()
        self.assertEqual(response.json()["detail"]["stage"], "context-interview")
        self.assertEqual(len(self.calls), 1)

    async def test_non_object_context_response(self):
        self.context = ["unexpected"]
        await self.assert_rejected()
        self.assertEqual(len(self.calls), 1)

    async def test_invalid_json_context_response(self):
        self.context_raw = "not JSON"
        await self.assert_rejected()
        self.assertEqual(len(self.calls), 1)

    async def test_non_object_assessment_response(self):
        self.result = ["unexpected"]
        await self.assert_rejected()

    async def test_null_assessment_response(self):
        self.result = None
        await self.assert_rejected()

    async def test_invalid_numeric_response(self):
        self.result["hrr180"] = "invalid"
        await self.assert_rejected()

    async def test_nonfinite_response(self):
        self.result["recPct180"] = "NaN"
        await self.assert_rejected()

    async def test_invalid_optional_response_field(self):
        self.result["targetHr"] = {"unexpected": 1}
        await self.assert_rejected()

    async def test_zero_authoritative_values_are_preserved(self):
        self.result.update(hrr180=0, recPct180=0)
        response = await self.submit()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual((response.json()["hrr"], response.json()["recpct"]), (0, 0))

    async def test_upstream_500_is_controlled(self):
        self.status = 500
        self.result = {"message": "Internal server error"}
        response = await self.assert_rejected()
        self.assertEqual(response.json()["detail"]["upstream_status"], 500)

    async def test_missing_checkpoint(self):
        for t in ("0", "60", "90", "120", "150", "180"):
            with self.subTest(t=t):
                payload = mobile_payload()
                del payload["readings"][t]
                await self.assert_rejected(payload, 400)
        self.assertEqual(self.calls, [])

    async def test_zero_hr(self):
        for invalid in (0, -1, True, 85.5, "missing"):
            with self.subTest(invalid=invalid):
                payload = mobile_payload()
                payload["readings"]["180"] = invalid
                await self.assert_rejected(payload, 422)
        self.assertEqual(self.calls, [])

    async def test_null_hr(self):
        payload = mobile_payload()
        payload["readings"]["180"] = None
        await self.assert_rejected(payload, 422)

    async def test_invalid_resting_hr(self):
        payload = mobile_payload()
        payload["fcr"] = 0
        await self.assert_rejected(payload, 422)

    async def test_invalid_stored_profile_age(self):
        self.db.profiles.find_one.return_value["age"] = "invalid"
        await self.assert_rejected(status=400)
        self.assertEqual(self.calls, [])

    async def test_missing_athlete_id(self):
        for invalid in (None, True, 1.5, float("inf"), "invalid"):
            with self.subTest(invalid=invalid):
                self.db.profiles.find_one.return_value["athlete_id"] = invalid
                await self.assert_rejected(status=400)
        self.assertEqual(self.calls, [])

    async def test_missing_athlete_name(self):
        self.db.profiles.find_one.return_value["name"] = " "
        await self.assert_rejected(status=400)
        self.assertEqual(self.calls, [])

    async def test_missing_contextual_factors(self):
        payload = mobile_payload()
        payload["factors"] = []
        await self.assert_rejected(payload, 400)
        self.assertEqual(self.calls, [])

    async def pending_record(self):
        response = await self.submit()
        self.assertEqual(response.status_code, 200)
        record = response.json()
        record.update(calc_source="pending", zone=None, pattern=None)
        self.db.assessments.find_one = AsyncMock(return_value=record)
        self.calls.clear()
        return record

    async def test_resync_null_optional_metrics_preserves_saved_values(self):
        record = await self.pending_record()
        response = await self.http.post(f'/api/assessments/{record["id"]}/resync?device_id=test-device')
        self.assertEqual(response.status_code, 200, response.text)
        for key in ("fcp_target", "aurc", "tau"):
            self.assertEqual(response.json()[key], record[key])
        self.db.assessments.update_one.assert_awaited_once()

    async def test_resync_invalid_old_measurement_is_controlled(self):
        record = await self.pending_record()
        record["readings"]["180"] = 0
        response = await self.http.post(f'/api/assessments/{record["id"]}/resync?device_id=test-device')
        self.assertEqual(response.status_code, 400, response.text)
        self.db.assessments.update_one.assert_not_awaited()
        self.assertEqual(self.calls, [])


if __name__ == "__main__":
    unittest.main()
