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
# every classification decision is delegated to that server. Otherwise the
# assessment is stored with `calc_source: "pending"` and the client shows
# "Resultado pendiente de sincronización con el motor oficial AFEtm." — we
# never generate a local Blue/Green/Yellow/Red zone.
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
    pattern: Optional[str] = None      # None while pending upstream sync
    zone: Optional[str] = None         # None while pending upstream sync
    action: Optional[str] = None       # None while pending upstream sync
    fcpv: Dict[str, int]
    fcpv_total: int
    context_flag: bool = False         # Only meaningful when authoritative
    created_at: str
    calc_source: str = "pending"       # "authoritative" | "pending"
    calc_notice: Optional[str] = None  # explanation shown to the user


# ---------- Documented math only (NO classification) ----------
# Per user directive & AFEtm v3.1 §14, the mobile backend must NOT keep an
# independent production classification scale. We compute ONLY the documented
# mathematical quantities (FCP, HRR, RECpct, AURC, τ, FCPv total). Zone,
# pattern and action are ALWAYS supplied by the authoritative upstream
# server. When the upstream is unavailable we save the raw measurements and
# return a "pending" result — never a locally-invented Blue/Green/Yellow/Red.
TIMES = [0, 60, 90, 120, 150, 180]

PENDING_NOTICE = "Resultado pendiente de sincronización con el motor oficial AFEtm."


def calc_fcp(age: int) -> int:
    return round(0.80 * (220 - age))


def calc_math_only(fcr: int, age: int, readings: Dict[str, int], fcpv: Dict[str, int]) -> dict:
    """Compute ONLY documented mathematical quantities. No classification.

    All classification (zone, pattern, action) MUST come from the
    authoritative upstream. This function is safe to run locally because
    every quantity here is defined verbatim in the technical document.
    """
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

    # tau: first time the HR decays to (peak − 63.2% of peak−fcr) — standard
    # biophysical definition present in doc Tabla 2. 180.0 if never reached.
    target_hr = hr_peak - 0.632 * (hr_peak - fcr)
    tau = 180.0
    for t, hr in zip(TIMES, hrs):
        if hr <= target_hr:
            tau = float(t)
            break

    fcpv_total = int(sum(fcpv.values()))

    return {
        "fcp_target": fcp_target,
        "hr_peak": hr_peak,
        "hrr": hrr,
        "recpct": recpct,
        "aurc": aurc,
        "tau": tau,
        "fcpv_total": fcpv_total,
    }


# ---------- Routes ----------
@api_router.get("/")
async def root():
    upstream_configured = bool(AUTHORITATIVE_UPSTREAM_URL and AUTHORITATIVE_UPSTREAM_TOKEN)
    return {
        "service": "AFEtm Safety Check",
        "status": "ok",
        "upstream_configured": upstream_configured,
        "calc_source_default": "authoritative" if upstream_configured else "pending",
        "pending_notice": PENDING_NOTICE if not upstream_configured else None,
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
    """Create a new assessment.

    Rule: classification (zone / pattern / action) MUST come from the
    authoritative upstream. If the upstream is unavailable, we save the
    raw measurements + documented math (FCP, HRR, RECpct, AURC, τ, FCPv)
    and mark the record as `calc_source: "pending"`. We NEVER generate a
    Blue/Green/Yellow/Red result locally.
    """
    math = calc_math_only(a.fcr, a.age, a.readings, a.fcpv.model_dump())
    upstream = await _try_upstream_compute(a)
    if upstream is not None:
        # Trust the upstream fully — overwrite math with its authoritative
        # values (fcp_target, hrr, recpct, aurc, tau, hr_peak, fcpv_total).
        derived = {**math, **{k: v for k, v in upstream.items() if v is not None}}
        derived.setdefault("context_flag", upstream.get("context_flag", False))
        calc_source = "authoritative"
        calc_notice = None
    else:
        # PENDING: raw + math only, no zone/pattern/action.
        derived = {
            **math,
            "pattern": None,
            "zone": None,
            "action": None,
            "context_flag": False,
        }
        calc_source = "pending"
        calc_notice = PENDING_NOTICE
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


@api_router.post("/assessments/{aid}/resync", response_model=Assessment)
async def resync_assessment(aid: str):
    """Retry authoritative classification for a pending assessment.

    Useful when the assessment was captured while the upstream was
    unavailable. This does NOT invent a zone; it only replaces the
    pending status if the upstream now returns a valid result.
    """
    doc = await db.assessments.find_one({"id": aid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Evaluación no encontrada")
    if doc.get("calc_source") == "authoritative":
        return Assessment(**doc)
    # Rebuild the input from the stored raw data.
    a = AssessmentIn(
        device_id=doc["device_id"],
        fcr=doc["fcr"],
        age=doc["age"],
        readings=doc["readings"],
        fcpv=FCPv(**(doc.get("fcpv") or {})),
    )
    upstream = await _try_upstream_compute(a)
    if upstream is None:
        # Still pending — nothing changed
        return Assessment(**doc)
    update = {
        "zone": upstream.get("zone"),
        "pattern": upstream.get("pattern"),
        "action": upstream.get("action") or doc.get("action"),
        "hrr": upstream.get("hrr", doc["hrr"]),
        "recpct": upstream.get("recpct", doc["recpct"]),
        "fcp_target": upstream.get("fcp_target", doc["fcp_target"]),
        "aurc": upstream.get("aurc", doc["aurc"]),
        "tau": upstream.get("tau", doc["tau"]),
        "context_flag": upstream.get("context_flag", False),
        "calc_source": "authoritative",
        "calc_notice": None,
    }
    await db.assessments.update_one({"id": aid}, {"$set": update})
    doc.update(update)
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
