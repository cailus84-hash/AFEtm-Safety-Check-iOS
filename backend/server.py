from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import httpx
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# --- AFEtm authoritative upstream configuration ---
# The AFEtm technical spec (v3.1) mandates that "el servidor conserva los
# motores de cálculo como única fuente oficial". If UPSTREAM is configured,
# every classification decision is delegated to that server. Otherwise, we
# use a REFERENCE MIRROR that faithfully implements the documented formulas
# BUT whose classification thresholds are heuristic — clearly labelled as
# such via `_calc_source: "reference-mirror"` and a UI banner.
AUTHORITATIVE_UPSTREAM_URL = (os.environ.get('AUTHORITATIVE_UPSTREAM_URL') or '').rstrip('/')
AUTHORITATIVE_UPSTREAM_TOKEN = os.environ.get('AUTHORITATIVE_UPSTREAM_TOKEN') or ''

app = FastAPI(title="AFEtm Safety Check API")
api_router = APIRouter(prefix="/api")


# ---------- Models ----------
class Profile(BaseModel):
    device_id: str
    name: str
    age: int
    weight: float
    sport: str
    target_zone: Optional[str] = None  # None | "BLUE" | "GREEN"
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ProfileIn(BaseModel):
    device_id: str
    name: str
    age: int
    weight: float
    sport: str
    target_zone: Optional[str] = None


class FCPv(BaseModel):
    sleep: int = 0            # 0-2 (2 = poor)
    hydration: int = 0        # 0-2
    symptoms: int = 0         # 0-2
    recent_illness: int = 0   # 0-2
    subjective_load: int = 0  # 0-2


class AssessmentIn(BaseModel):
    device_id: str
    fcr: int                              # Resting HR
    age: int
    readings: Dict[str, int]              # { "0","30","60","90","120","180" -> bpm }
    fcpv: FCPv = Field(default_factory=FCPv)


class Assessment(BaseModel):
    id: str
    device_id: str
    fcr: int
    age: int
    readings: Dict[str, int]
    fcp_target: int
    hr_peak: int
    hrr: int
    recpct: float
    aurc: float
    tau: float
    pattern: str
    zone: str
    action: str
    fcpv: Dict[str, int]
    fcpv_total: int
    context_flag: bool
    created_at: str
    calc_source: str = "reference-mirror"  # "authoritative" | "reference-mirror"
    calc_notice: Optional[str] = None      # explanation shown to the user


# ---------- Calculation engine (REFERENCE MIRROR — see doc §14) ----------
# WARNING: This block implements the documented FORMULAS (FCP, HRR, RECpct,
# AURC, tau) faithfully but the zone THRESHOLDS and PATTERN heuristics below
# are NOT specified by the technical document verbatim — the document defers
# them to `afeRecoveryEngine.ts` (v2) which lives on the authoritative
# Express server. Whenever `AUTHORITATIVE_UPSTREAM_URL` + a valid token are
# provided, this block MUST be bypassed by the proxy path.
TIMES = [0, 60, 90, 120, 150, 180]

REFERENCE_NOTICE = (
    "Motor de cálculo local (REFERENCE MIRROR). Umbrales de zona y patrón "
    "no autoritativos. Configura AUTHORITATIVE_UPSTREAM_URL + TOKEN para "
    "delegar al servidor oficial (afeRecoveryEngine.ts)."
)


def calc_fcp(age: int) -> int:
    return round(0.80 * (220 - age))


def calc_assessment(fcr: int, age: int, readings: Dict[str, int], fcpv: Dict[str, int]) -> dict:
    for t in TIMES:
        if str(t) not in readings:
            raise HTTPException(400, f"Falta lectura en t={t}s")

    fcp_target = calc_fcp(age)
    hrs = [readings[str(t)] for t in TIMES]
    hr_peak = hrs[0]      # t=0 (immediately at end of effort)
    hr_60 = hrs[1]        # t=60s
    hr_180 = hrs[-1]      # t=180s

    hrr = hr_peak - hr_60
    span = max(hr_peak - fcr, 1)
    recpct = round((hr_peak - hr_180) / span * 100, 1)

    aurc = 0.0
    for i in range(len(TIMES) - 1):
        dt = TIMES[i + 1] - TIMES[i]
        aurc += (hrs[i] + hrs[i + 1]) / 2.0 * dt
    aurc = round(aurc, 1)

    # tau: time to decay to 63.2% of (peak - fcr)
    target_hr = hr_peak - 0.632 * (hr_peak - fcr)
    tau = 180.0
    for t, hr in zip(TIMES, hrs):
        if hr <= target_hr:
            tau = float(t)
            break

    # Pattern
    diffs = [hrs[i + 1] - hrs[i] for i in range(len(hrs) - 1)]
    oscillating = any(d > 4 for d in diffs)  # rise during recovery = noise/oscillation
    tail_delta = hrs[-3] - hrs[-1]
    plateau = tail_delta < 3 and recpct < 35

    if oscillating:
        pattern = "UNSTABLE"
    elif plateau:
        pattern = "FLATTENED"
    elif recpct >= 60:
        pattern = "RAPID"
    elif recpct >= 40:
        pattern = "NORMAL"
    else:
        pattern = "DELAYED"

    # Zone (AFE v2 simplified)
    if pattern in ("UNSTABLE", "FLATTENED") or recpct < 25:
        zone = "RED"
    elif recpct >= 65 and pattern == "RAPID":
        zone = "BLUE"
    elif recpct >= 40:
        zone = "GREEN"
    else:
        zone = "YELLOW"

    fcpv_total = int(sum(fcpv.values()))
    context_flag = fcpv_total >= 6  # bump caution flag only

    actions = {
        "BLUE": "Continuar con normalidad",
        "GREEN": "Continuar y mantener seguimiento",
        "YELLOW": "Observar y ajustar la carga",
        "RED": "Reevaluar antes de esfuerzos exigentes",
    }

    return {
        "fcp_target": fcp_target,
        "hr_peak": hr_peak,
        "hrr": hrr,
        "recpct": recpct,
        "aurc": aurc,
        "tau": tau,
        "pattern": pattern,
        "zone": zone,
        "action": actions[zone],
        "fcpv_total": fcpv_total,
        "context_flag": context_flag,
    }


# ---------- Routes ----------
@api_router.get("/")
async def root():
    upstream_configured = bool(AUTHORITATIVE_UPSTREAM_URL and AUTHORITATIVE_UPSTREAM_TOKEN)
    return {
        "service": "AFEtm Safety Check",
        "status": "ok",
        "upstream_configured": upstream_configured,
        "calc_source_default": "authoritative" if upstream_configured else "reference-mirror",
        "reference_notice": REFERENCE_NOTICE if not upstream_configured else None,
    }


@api_router.post("/profile", response_model=Profile)
async def upsert_profile(p: ProfileIn):
    doc = p.model_dump()
    doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.profiles.update_one(
        {"device_id": p.device_id},
        {"$set": doc},
        upsert=True,
    )
    return Profile(**doc)


@api_router.get("/profile", response_model=Optional[Profile])
async def get_profile(device_id: str = Query(...)):
    doc = await db.profiles.find_one({"device_id": device_id}, {"_id": 0})
    return doc


async def _try_upstream_compute(a: "AssessmentIn") -> Optional[dict]:
    """Delegate calculation to the authoritative upstream server.

    Returns a dict with the derived fields (fcp_target, hr_peak, hrr,
    recpct, aurc, tau, pattern, zone, action, fcpv_total, context_flag)
    on success, or None on any auth/network/parse failure so the caller
    can gracefully fall back to the reference mirror.
    """
    if not AUTHORITATIVE_UPSTREAM_URL or not AUTHORITATIVE_UPSTREAM_TOKEN:
        return None
    url = f"{AUTHORITATIVE_UPSTREAM_URL}/api/assessments"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {AUTHORITATIVE_UPSTREAM_TOKEN}",
    }
    payload = {
        "fcr": a.fcr,
        "age": a.age,
        "readings": a.readings,
        "fcpv": a.fcpv.model_dump(),
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.post(url, headers=headers, json=payload)
        if r.status_code >= 400:
            logging.warning("Upstream returned %s: %s", r.status_code, r.text[:200])
            return None
        data = r.json()
        # Accept several field shapes: keep what we can identify.
        derived = {
            "fcp_target": data.get("fcp_target") or data.get("fcp"),
            "hr_peak": data.get("hr_peak") or a.readings.get("0"),
            "hrr": data.get("hrr"),
            "recpct": data.get("recpct"),
            "aurc": data.get("aurc"),
            "tau": data.get("tau"),
            "pattern": data.get("pattern"),
            "zone": data.get("zone"),
            "action": data.get("action") or "",
            "fcpv_total": data.get("fcpv_total")
                or int(sum(a.fcpv.model_dump().values())),
            "context_flag": data.get("context_flag", False),
        }
        # Reject if any critical field is missing.
        for k in ("fcp_target", "hrr", "recpct", "pattern", "zone"):
            if derived.get(k) in (None, ""):
                logging.warning("Upstream response missing '%s' — falling back", k)
                return None
        return derived
    except Exception as e:
        logging.warning("Upstream call failed: %s", e)
        return None


@api_router.post("/assessments", response_model=Assessment)
async def create_assessment(a: AssessmentIn):
    upstream = await _try_upstream_compute(a)
    if upstream is not None:
        derived = upstream
        calc_source = "authoritative"
        calc_notice = None
    else:
        derived = calc_assessment(a.fcr, a.age, a.readings, a.fcpv.model_dump())
        calc_source = "reference-mirror"
        calc_notice = REFERENCE_NOTICE
    now = datetime.now(timezone.utc).isoformat()
    aid = str(uuid.uuid4())
    doc = {
        "id": aid,
        "device_id": a.device_id,
        "fcr": a.fcr,
        "age": a.age,
        "readings": a.readings,
        "fcpv": a.fcpv.model_dump(),
        "created_at": now,
        "calc_source": calc_source,
        "calc_notice": calc_notice,
        **derived,
    }
    await db.assessments.insert_one(doc.copy())
    doc.pop("_id", None)
    return Assessment(**doc)


@api_router.get("/assessments", response_model=List[Assessment])
async def list_assessments(device_id: str = Query(...), limit: int = 100):
    cursor = db.assessments.find({"device_id": device_id}, {"_id": 0}).sort("created_at", -1).limit(limit)
    items = await cursor.to_list(length=limit)
    return [Assessment(**it) for it in items]


@api_router.get("/assessments/{aid}", response_model=Assessment)
async def get_assessment(aid: str):
    doc = await db.assessments.find_one({"id": aid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Evaluación no encontrada")
    return Assessment(**doc)


@api_router.delete("/assessments/{aid}")
async def delete_assessment(aid: str):
    res = await db.assessments.delete_one({"id": aid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Evaluación no encontrada")
    return {"deleted": True}


# ---------- App wiring ----------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
