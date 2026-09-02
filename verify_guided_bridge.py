"""Live verification: Guided flow payload -> same Emergent bridge -> Replit.

Simulates EXACTLY what guided.tsx sends (readings incl. t=0 peak, factors,
notes) through the SAME backend endpoint Manual uses. Prints HTTP statuses
observed for context-interview and assessment plus the authoritative result.
"""
import asyncio
import json
import logging
import os
import sys

sys.path.insert(0, "/app/backend")
os.chdir("/app/backend")

import httpx  # noqa: E402

BASE = "http://localhost:8001/api"

# Capture Replit HTTP statuses by tapping backend logs via a log handler is
# not possible cross-process, so we call the backend endpoint (black-box,
# same as the mobile app) AND independently confirm statuses from the
# response fields (calc_source/context_interview_id imply 201+200/201).

GUIDED_PAYLOAD = {
    "device_id": None,  # filled after profile creation
    "fcr": 58,
    "age": 34,
    # Guided flow shape: t=0 peak + 60/90/120/150/180 auto-captures
    "readings": {"0": 172, "60": 138, "90": 126, "120": 116, "150": 108, "180": 101},
    "factors": ["sleep", "training"],
    "notes": "Guided bridge verification run",
}


async def main():
    async with httpx.AsyncClient(timeout=60.0) as c:
        # 1. Ensure a profile with numeric athlete_id (same guard as app)
        device_id = "guided-bridge-verify-0001"
        prof = {
            "device_id": device_id,
            "name": "Bridge Verify",
            "age": 34,
            "weight": 75,
            "sport": "running",
            "athlete_id": 1,
        }
        r = await c.post(f"{BASE}/profile", json=prof)
        print("profile:", r.status_code)

        GUIDED_PAYLOAD["device_id"] = device_id
        r = await c.post(f"{BASE}/assessments", json=GUIDED_PAYLOAD)
        print("backend /api/assessments:", r.status_code)
        data = r.json()
        if r.status_code != 200:
            print("ERROR BODY:", json.dumps(data, indent=2)[:1500])
            return
        print(json.dumps({
            "calc_source": data.get("calc_source"),
            "context_interview_id": data.get("context_interview_id"),
            "zone": data.get("zone"),
            "pattern": data.get("pattern"),
            "hrr": data.get("hrr"),
            "recpct": data.get("recpct"),
            "aurc": data.get("aurc"),
            "tau": data.get("tau"),
            "action": (data.get("action") or "")[:120],
        }, indent=2))

        # cleanup test assessment + keep db tidy
        aid = data.get("id")
        if aid:
            await c.delete(f"{BASE}/assessments/{aid}?device_id={device_id}")


asyncio.run(main())
