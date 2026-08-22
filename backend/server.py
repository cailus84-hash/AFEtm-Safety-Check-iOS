from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
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

app = FastAPI(title="AFEtm Safety Check API")
api_router = APIRouter(prefix="/api")


# ---------- Models ----------
class Profile(BaseModel):
    device_id: str
    name: str
    age: int
    weight: float
    sport: str
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ProfileIn(BaseModel):
    device_id: str
    name: str
    age: int
    weight: float
    sport: str


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


# ---------- Calculation engine ----------
TIMES = [0, 60, 90, 120, 150, 180]


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
    return {"service": "AFEtm Safety Check", "status": "ok"}


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


@api_router.post("/assessments", response_model=Assessment)
async def create_assessment(a: AssessmentIn):
    derived = calc_assessment(a.fcr, a.age, a.readings, a.fcpv.model_dump())
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
