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
# TERMS_VERSION drives the "Terms Version Bump" flow. When we publish a new
# version the mobile app compares this against the value stored on each
# profile (`terms_version`) and forces the athlete to re-accept before any
# new assessment can be created. `TERMS_VERSION` can be overridden via the
# `TERMS_VERSION` env var so the version can be bumped without redeploying
# the whole app image.
TERMS_VERSION = (os.environ.get('TERMS_VERSION') or '1.0').strip()
TERMS_EFFECTIVE_DATE = (os.environ.get('TERMS_EFFECTIVE_DATE') or '2026-06-01').strip()

# Human-readable changelog by version. Rendered on the Terms screen when
# the athlete is being asked to re-accept an updated version.
TERMS_CHANGELOG: Dict[str, Dict[str, str]] = {
    "1.0": {
        "en": "Initial AFEtm Mobile Personal-Use Terms.",
        "es": "Términos iniciales de Uso Personal de AFEtm Mobile.",
    },
    "1.1": {
        "en": (
            "Clarified the personal-use scope for wellness/readiness data, "
            "expanded the institutional-use definition to cover research "
            "and third-party evaluations, and added stronger cross-device "
            "protection wording."
        ),
        "es": (
            "Aclaramos el alcance de uso personal para datos de bienestar/"
            "readiness, ampliamos la definición de uso institucional para "
            "cubrir investigación y evaluaciones de terceros, y reforzamos "
            "la protección entre dispositivos."
        ),
    },
}


class Profile(BaseModel):
    device_id: str
    name: str
    age: int
    weight: float
    sport: str
    target_zone: Optional[str] = None  # None | "BLUE" | "GREEN"
    terms_accepted_at: Optional[str] = None
    terms_version: Optional[str] = None
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ProfileIn(BaseModel):
    device_id: str
    name: str
    age: int
    weight: float
    sport: str
    target_zone: Optional[str] = None


class AcceptTermsIn(BaseModel):
    device_id: str
    version: Optional[str] = None  # defaults to server TERMS_VERSION


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
        "terms_version": TERMS_VERSION,
        "license": "AFEtm Mobile — Personal Use Only",
    }


@api_router.post("/profile", response_model=Profile)
async def upsert_profile(p: ProfileIn):
    """Upsert a personal profile.

    LICENSING RULE (Personal Use Only): A profile represents the ONE person
    who owns the device. There is no roster / no team / no third-party
    athlete concept in the mobile app. The `device_id` is the sole ownership
    key. Callers must have accepted the Terms of Use before any assessment
    can be created (see /assessments enforcement).
    """
    existing = await db.profiles.find_one({"device_id": p.device_id}, {"_id": 0})
    doc = p.model_dump()
    doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    # Preserve prior terms acceptance across profile edits.
    if existing:
        doc["terms_accepted_at"] = existing.get("terms_accepted_at")
        doc["terms_version"] = existing.get("terms_version")
    else:
        doc.setdefault("terms_accepted_at", None)
        doc.setdefault("terms_version", None)
    await db.profiles.update_one(
        {"device_id": p.device_id},
        {"$set": doc},
        upsert=True,
    )
    return Profile(**doc)


@api_router.post("/profile/accept-terms", response_model=Profile)
async def accept_terms(payload: AcceptTermsIn):
    """Record acceptance of the AFEtm Mobile Personal-Use Terms.

    Stores `terms_accepted_at` (ISO timestamp) + `terms_version` on the
    profile document. This endpoint is idempotent: subsequent calls simply
    refresh the acceptance timestamp / version.

    NOTE: This does not require a pre-existing profile — the acceptance can
    happen BEFORE the profile setup step in onboarding. We create a stub
    profile row (name empty, age/weight 0) whose `terms_accepted_at` is set,
    and later /profile POST enriches it with the athlete data.
    """
    now = datetime.now(timezone.utc).isoformat()
    version = payload.version or TERMS_VERSION
    existing = await db.profiles.find_one({"device_id": payload.device_id}, {"_id": 0})
    if existing:
        update = {
            "terms_accepted_at": now,
            "terms_version": version,
            "updated_at": now,
        }
        await db.profiles.update_one({"device_id": payload.device_id}, {"$set": update})
        existing.update(update)
        return Profile(**existing)
    # Create a stub row so subsequent gating can rely on the profile
    # existing. The client MUST still complete profile setup afterwards.
    doc = {
        "device_id": payload.device_id,
        "name": "",
        "age": 0,
        "weight": 0.0,
        "sport": "",
        "target_zone": None,
        "terms_accepted_at": now,
        "terms_version": version,
        "updated_at": now,
    }
    await db.profiles.insert_one(doc.copy())
    doc.pop("_id", None)
    return Profile(**doc)


@api_router.get("/profile", response_model=Optional[Profile])
async def get_profile(device_id: str = Query(...)):
    doc = await db.profiles.find_one({"device_id": device_id}, {"_id": 0})
    return doc


async def _call_upstream(a: "AssessmentIn") -> tuple[Optional[dict], Optional[dict]]:
    """Delegate calculation to the authoritative upstream server.

    Returns a tuple ``(derived, error)`` where exactly one is populated:
      - ``derived`` is the classification payload on HTTP 200
      - ``error`` is ``{upstream_status, upstream_body, upstream_url}`` on
        any non-200 response (never falls back — the caller decides).
    Only network / configuration failures return ``(None, None)`` so the
    caller can treat them as "pending".
    """
    if not AUTHORITATIVE_UPSTREAM_URL or not AUTHORITATIVE_UPSTREAM_TOKEN:
        return None, None
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
        async with httpx.AsyncClient(timeout=15.0) as c:
            r = await c.post(url, headers=headers, json=payload)
    except Exception as e:
        logging.warning("Upstream network failure: %s", e)
        # Network-level failure — treat as pending (temporary).
        return None, None
    if r.status_code != 200:
        body = r.text[:2000]
        logging.warning("Upstream %s: %s", r.status_code, body[:200])
        return None, {
            "upstream_url": url,
            "upstream_status": r.status_code,
            "upstream_body": body,
        }
    try:
        data = r.json()
    except Exception:
        return None, {
            "upstream_url": url,
            "upstream_status": r.status_code,
            "upstream_body": r.text[:2000],
        }
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
    for k in ("fcp_target", "hrr", "recpct", "pattern", "zone"):
        if derived.get(k) in (None, ""):
            return None, {
                "upstream_url": url,
                "upstream_status": r.status_code,
                "upstream_body": r.text[:2000],
                "reason": f"Missing required field '{k}' in authoritative response",
            }
    return derived, None


@api_router.get("/terms")
async def get_terms():
    """Return the current AFEtm Mobile Personal-Use Terms metadata.

    The mobile app polls this endpoint on boot / when entering the tabs
    stack. If `version` differs from what the profile stored, the app
    forces the athlete back through the /terms acceptance screen. This is
    the "Terms Version Bump" mechanism.
    """
    return {
        "version": TERMS_VERSION,
        "effective_date": TERMS_EFFECTIVE_DATE,
        "changelog": TERMS_CHANGELOG.get(TERMS_VERSION, {}),
        "license": "AFEtm Mobile — Personal Use Only",
    }


async def _require_owned_profile(device_id: str) -> dict:
    """Personal-use enforcement helper.

    Ensures the caller device_id corresponds to an existing profile that
    HAS accepted the Terms of Use. Returns the profile document. Raises
    the appropriate HTTP error otherwise. All /assessments mutations use
    this to guarantee `authenticatedUserId (device_id) == evaluatedPersonId`.
    """
    prof = await db.profiles.find_one({"device_id": device_id}, {"_id": 0})
    if not prof:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "PERSONAL_USE_PROFILE_REQUIRED",
                "message": (
                    "AFEtm Mobile is licensed for personal use only. "
                    "A personal profile must exist on this device before "
                    "creating or accessing assessments."
                ),
            },
        )
    if not prof.get("terms_accepted_at"):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "PERSONAL_USE_TERMS_REQUIRED",
                "message": (
                    "You must accept the AFEtm Mobile Personal-Use Terms "
                    "before continuing."
                ),
                "terms_version": TERMS_VERSION,
            },
        )
    # Terms Version Bump: previously accepted an older version → must
    # re-accept before continuing. Distinct code so the client can show
    # a "Terms Updated" prompt instead of the initial one.
    if str(prof.get("terms_version") or "") != TERMS_VERSION:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "PERSONAL_USE_TERMS_OUTDATED",
                "message": (
                    "The AFEtm Mobile Personal-Use Terms have been "
                    "updated. Please review and accept the new version "
                    "before continuing."
                ),
                "terms_version": TERMS_VERSION,
                "accepted_version": prof.get("terms_version"),
            },
        )
    return prof


async def _require_owned_assessment(aid: str, device_id: str) -> dict:
    """Reject any attempt to read/modify an assessment owned by another
    device. This is the server-side backstop for the mobile
    Personal-Use-Only rule; the mobile client never has any UI to change
    the device_id, but the API must still refuse to leak or mutate
    records that belong to someone else.
    """
    doc = await db.assessments.find_one({"id": aid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Assessment not found")
    if doc.get("device_id") != device_id:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "PERSONAL_USE_OWNERSHIP_VIOLATION",
                "message": (
                    "AFEtm Mobile is licensed for personal use only. "
                    "You cannot access, modify, or delete assessments "
                    "that belong to another person or device."
                ),
            },
        )
    return doc


@api_router.post("/assessments", response_model=Assessment)
async def create_assessment(a: AssessmentIn):
    """Create a new assessment.

    Rules (strict):
      1. When the authoritative upstream is CONFIGURED (URL + TOKEN both
         non-empty), the mobile backend performs ONE real request. If it
         returns 200, the record is saved with ``calc_source: "authoritative"``.
         **If it returns any non-200 status, we raise HTTP 502 with the
         exact upstream status + body — no local classification, no
         pending fallback.** This makes auth misconfigurations impossible
         to hide behind a silent fallback.
      2. When the upstream is UNCONFIGURED, the record is saved with raw
         measurements + documented math and ``calc_source: "pending"``.
      3. Under NO circumstances do we generate a local Blue/Green/Yellow/Red.

    PERSONAL-USE ENFORCEMENT: Requires an existing profile owned by
    ``a.device_id`` that has accepted the current Terms of Use. Any
    attempt to submit an assessment for a different device / person is
    rejected with HTTP 403.
    """
    # Personal-use enforcement: only the owner of the profile can create.
    profile = await _require_owned_profile(a.device_id)
    # Extra safety: the age used to compute FCP must match the profile's age.
    # Mismatches are treated as an ownership violation (someone is trying to
    # submit for a different person).
    if profile.get("age") and abs(int(profile["age"]) - int(a.age)) > 1:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "PERSONAL_USE_AGE_MISMATCH",
                "message": (
                    "Assessment age does not match the personal profile. "
                    "AFEtm Mobile is licensed for personal use only."
                ),
            },
        )
    math = calc_math_only(a.fcr, a.age, a.readings, a.fcpv.model_dump())
    upstream_configured = bool(AUTHORITATIVE_UPSTREAM_URL and AUTHORITATIVE_UPSTREAM_TOKEN)
    if upstream_configured:
        derived, error = await _call_upstream(a)
        if error is not None:
            # Surface the EXACT authoritative failure — do NOT fall back.
            # Uses 424 Failed Dependency (semantically correct + not
            # rewritten by Cloudflare/K8s ingress the way 502 is).
            raise HTTPException(
                status_code=424,
                detail={
                    "code": "AUTHORITATIVE_UPSTREAM_ERROR",
                    "message": (
                        "El servidor autoritativo AFEtm rechazó la solicitud. "
                        "La evaluación NO se guardó para no ocultar el error."
                    ),
                    **error,
                },
            )
        if derived is None:
            # Network-level failure while configured — treat as pending so the
            # user does not lose the measurements captured in the field.
            derived = {**math, "pattern": None, "zone": None, "action": None, "context_flag": False}
            calc_source = "pending"
            calc_notice = PENDING_NOTICE + " (Sin red al servidor autoritativo)"
        else:
            derived = {**math, **{k: v for k, v in derived.items() if v is not None}}
            derived.setdefault("context_flag", False)
            calc_source = "authoritative"
            calc_notice = None
    else:
        # Upstream not configured → pending (documented behavior).
        derived = {**math, "pattern": None, "zone": None, "action": None, "context_flag": False}
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
async def resync_assessment(aid: str, device_id: str = Query(...)):
    """Retry authoritative classification for a pending assessment.

    Useful when the assessment was captured while the upstream was
    unavailable. This does NOT invent a zone; it only replaces the
    pending status if the upstream now returns a valid result.

    PERSONAL-USE ENFORCEMENT: The caller device_id MUST match the owner
    of the assessment. Requests from any other device are rejected 403.
    """
    await _require_owned_profile(device_id)
    doc = await _require_owned_assessment(aid, device_id)
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
    upstream, error = await _call_upstream(a)
    if error is not None:
        # Same rule: never hide a real upstream failure behind a pending record.
        raise HTTPException(
            status_code=424,
            detail={
                "code": "AUTHORITATIVE_UPSTREAM_ERROR",
                "message": "El servidor autoritativo AFEtm rechazó la re-sincronización.",
                **error,
            },
        )
    if upstream is None:
        # Network-level failure or upstream unconfigured — still pending
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
async def get_assessment(aid: str, device_id: str = Query(...)):
    """Fetch an assessment.

    PERSONAL-USE ENFORCEMENT: Only the owner device may read the record.
    Any other device receives HTTP 403 — prevents cross-device / cross
    account data leakage even if someone guesses an assessment id.
    """
    doc = await _require_owned_assessment(aid, device_id)
    return Assessment(**doc)


@api_router.delete("/assessments/{aid}")
async def delete_assessment(aid: str, device_id: str = Query(...)):
    """Delete an assessment. Restricted to the owning device."""
    await _require_owned_assessment(aid, device_id)
    res = await db.assessments.delete_one({"id": aid, "device_id": device_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Assessment not found")
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
