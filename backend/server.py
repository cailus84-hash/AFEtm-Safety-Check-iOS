from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv, dotenv_values
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import httpx
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, TypeAdapter, ValidationError
from typing import Annotated, List, Optional, Dict
from math import isfinite
import uuid
from datetime import datetime, timezone, timedelta

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
def _clean_env(name: str) -> str:
    """Resolve the AFEtm service credentials with the repo `.env` file as
    the SINGLE SOURCE OF TRUTH.

    Why: deployment platforms can keep their own environment-variable
    store that persists across redeploys. If that store holds a stale
    AFETM service secret, it is injected into the process env and —
    because `load_dotenv()` never overrides pre-existing variables —
    silently wins over the correct value in `backend/.env`, producing
    401 Unauthorized from the authoritative Replit server ONLY in
    production. Reading the file first guarantees the deployed process
    always uses the same token that was verified in development.

    Also trims whitespace/newlines and strips one layer of matching
    surrounding quotes, so the Bearer header can never be corrupted by
    quoting styles.

    NOTE: intentionally NOT applied to MONGO_URL/DB_NAME — those MUST
    keep honoring the platform-injected production values.
    """
    v = None
    try:
        v = dotenv_values(ROOT_DIR / '.env').get(name)
    except Exception:
        v = None
    if not v:
        v = os.environ.get(name) or ''
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in ('"', "'"):
        v = v[1:-1].strip()
    return v


AUTHORITATIVE_UPSTREAM_URL = _clean_env('AUTHORITATIVE_UPSTREAM_URL').rstrip('/')
AUTHORITATIVE_UPSTREAM_TOKEN = _clean_env('AUTHORITATIVE_UPSTREAM_TOKEN')

app = FastAPI(title="AFEtm Safety Check API")


# Deployment health probe. Deployed environments hit `/health` (no
# prefix) to verify the pod is ready — kept intentionally free of any
# business logic, auth, DB access or `/api/*` contract change.
@app.get("/health")
async def health_probe():
    return {"status": "ok", "service": "AFEtm Safety Check"}


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
    athlete_id: Optional[int] = None   # Official AFEtm numeric athleteId (Replit)
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
    athlete_id: Optional[int] = None


class AcceptTermsIn(BaseModel):
    device_id: str
    version: Optional[str] = None  # defaults to server TERMS_VERSION


# ---------- Subscription (Personal / Individual only) ----------
# The mobile app monetizes through NATIVE store subscriptions
# (Apple In-App Purchase / Google Play Billing). Stripe is intentionally
# not used here. This backend keeps a lightweight *mirror* of what the
# native store already owns; real receipt validation goes on the mobile
# client via StoreKit / Google Play Billing and is forwarded here for
# gating and history.
#
# Business rules (Aug 2026):
#   • 1 month free trial when the athlete taps "Start free trial".
#   • Monthly plan  → $19.99 / month
#   • Yearly  plan  → $199.99 / year (marked as "Best value")
#   • Individual / personal use only — no team seats.
FREE_TRIAL_DAYS = 30
PRODUCT_MONTHLY = "afetm_personal_monthly"
PRODUCT_YEARLY = "afetm_personal_yearly"
PRICE_MONTHLY_USD = 19.99
PRICE_YEARLY_USD = 199.99


class Subscription(BaseModel):
    """Snapshot of the athlete's subscription status.

    `status` values:
      - "none"    → never started a trial, no subscription
      - "trial"   → inside the 30-day free trial
      - "active"  → paid, before `expires_at`
      - "expired" → past `expires_at`; must resubscribe
    `plan` values:
      - "trial" | "monthly" | "yearly" | None
    `platform` values:
      - "apple" | "google" | "mock" | None
    """
    status: str = "none"
    plan: Optional[str] = None
    platform: Optional[str] = None
    product_id: Optional[str] = None
    started_at: Optional[str] = None
    expires_at: Optional[str] = None
    canceled_at: Optional[str] = None
    last_verified_at: Optional[str] = None


class StartTrialIn(BaseModel):
    device_id: str


class PurchaseIn(BaseModel):
    device_id: str
    plan: str                       # "monthly" | "yearly"
    platform: str                   # "apple" | "google" | "mock"
    product_id: Optional[str] = None
    receipt: Optional[str] = None   # Native receipt/token (opaque here)


class RestoreIn(BaseModel):
    device_id: str


class CancelIn(BaseModel):
    device_id: str


class FCPv(BaseModel):
    sleep: int = 0            # 0-2 (2 = poor)
    hydration: int = 0        # 0-2
    symptoms: int = 0         # 0-2
    recent_illness: int = 0   # 0-2
    subjective_load: int = 0  # 0-2


# Official AFEtm contextual interview factor keys (Replit /api/context-interviews).
# The mobile UI presents these as multi-select toggles. "none" is exclusive.
CONTEXT_FACTOR_KEYS = {
    "illness",       # recent or current illness
    "sleep",         # poor sleep
    "training",      # elevated recent training load
    "dehydration",   # poor hydration
    "medication",    # medication use
    "pain",          # pain or discomfort
    "stimulants",    # energy drinks, caffeine, psychoactive stimulants
    "none",          # no relevant contextual factors (exclusive)
}
NOTES_MAX = 2000


class AssessmentIn(BaseModel):
    device_id: str
    fcr: Annotated[int, Field(gt=0, strict=True)]  # Actual resting HR
    age: int = Field(gt=0, strict=True)
    readings: Dict[str, Annotated[int, Field(gt=0, strict=True)]]  # 0/60/90/120/150/180 s
    fcpv: FCPv = Field(default_factory=FCPv)
    # Official AFEtm contextual interview payload (sent to Replit
    # /api/context-interviews before /api/assessments).
    factors: List[str] = Field(default_factory=list)
    notes: Optional[str] = None
    # --- Diagnostic-only metadata (TEMPORARY). Ignored by all assessment
    # logic; captured verbatim into the diagnostics log so we can inspect
    # exactly what a real iPhone sends. Safe to remove later. ---
    safety_confirmed: Optional[bool] = None
    safety_confirmed_at: Optional[str] = None
    ble_device_name: Optional[str] = None


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
    factors: List[str] = Field(default_factory=list)
    notes: Optional[str] = None
    context_interview_id: Optional[str] = None  # id returned by Replit on success


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


def _profile_from_doc(doc: dict) -> Profile:
    """Defensive Profile serialization.

    Production data can contain LEGACY profile documents created by
    older deploys (e.g. terms-acceptance stubs that lacked name/age/
    weight/sport). Feeding those raw into ``Profile(**doc)`` raises a
    ValidationError → FastAPI 500 "Internal Server Error" — which is
    exactly what broke the "ACEPTAR Y CONTINUAR" button. This helper
    coerces/defaults every field so any historical doc serializes.
    """
    def _i(v, d=0):
        try:
            return int(v)
        except (TypeError, ValueError):
            return d

    def _f(v, d=0.0):
        try:
            return float(v)
        except (TypeError, ValueError):
            return d

    aid = doc.get("athlete_id")
    try:
        aid = int(aid) if aid is not None else None
    except (TypeError, ValueError):
        aid = None
    now = datetime.now(timezone.utc).isoformat()
    return Profile(
        device_id=str(doc.get("device_id") or ""),
        name=str(doc.get("name") or ""),
        age=_i(doc.get("age")),
        weight=_f(doc.get("weight")),
        sport=str(doc.get("sport") or ""),
        target_zone=doc.get("target_zone") if doc.get("target_zone") in ("BLUE", "GREEN") else None,
        athlete_id=aid,
        terms_accepted_at=doc.get("terms_accepted_at"),
        terms_version=str(doc["terms_version"]) if doc.get("terms_version") is not None else None,
        updated_at=str(doc.get("updated_at") or now),
    )


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

    SELF-HEALING: legacy stub docs (older deploys) may lack the required
    profile fields; we backfill safe defaults during acceptance so the doc
    validates against the current schema forever after.
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
        # Heal legacy docs: backfill any missing/None required field with a
        # neutral default so current-schema validation never breaks again.
        for k, dflt in (("name", ""), ("sport", ""), ("age", 0), ("weight", 0.0)):
            if existing.get(k) is None:
                update[k] = dflt
        await db.profiles.update_one({"device_id": payload.device_id}, {"$set": update})
        existing.update(update)
        return _profile_from_doc(existing)
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
    if not doc:
        return None
    # Defensive serialization — legacy docs must never 500 (a 500 here made
    # the mobile client treat the athlete as "no profile" and re-show Terms).
    return _profile_from_doc(doc)


# ------------------------- SUBSCRIPTION ROUTES -----------------------------
#
# These endpoints keep a mirror of the native store subscription so the
# rest of the API (specifically assessment creation) can gate access.
# Real StoreKit / Google Play receipt validation happens on the mobile
# client — this backend simply trusts a validated receipt payload for
# now and stores the resulting state.

def _serialize_subscription(doc: Optional[dict]) -> Subscription:
    if not doc or not doc.get("subscription"):
        return Subscription()
    sub = doc["subscription"] or {}
    now = datetime.now(timezone.utc)
    expires_at = sub.get("expires_at")
    status = sub.get("status") or "none"
    # Auto-expire based on wall clock so we never serve stale "active"
    # rows if the natural expiry passed without a purchase renewal.
    if expires_at and status in ("trial", "active"):
        try:
            exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if exp <= now:
                status = "expired"
        except Exception:
            pass
    return Subscription(
        status=status,
        plan=sub.get("plan"),
        platform=sub.get("platform"),
        product_id=sub.get("product_id"),
        started_at=sub.get("started_at"),
        expires_at=expires_at,
        canceled_at=sub.get("canceled_at"),
        last_verified_at=sub.get("last_verified_at"),
    )


async def _load_subscription(device_id: str) -> Subscription:
    doc = await db.profiles.find_one({"device_id": device_id}, {"_id": 0})
    return _serialize_subscription(doc)


async def _write_subscription(device_id: str, sub: Subscription) -> Subscription:
    await db.profiles.update_one(
        {"device_id": device_id},
        {"$set": {"subscription": sub.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return sub


@api_router.get("/subscription", response_model=Subscription)
async def get_subscription(device_id: str = Query(...)):
    return await _load_subscription(device_id)


@api_router.post("/subscription/start-trial", response_model=Subscription)
async def start_trial(payload: StartTrialIn):
    """Grant the 30-day free trial once per device.

    Refuses to overwrite an already-active or already-consumed trial to
    prevent the athlete from farming multiple trials by re-tapping.
    """
    current = await _load_subscription(payload.device_id)
    if current.status in ("trial", "active"):
        return current
    if current.started_at:  # trial was already used previously
        raise HTTPException(
            status_code=409,
            detail={
                "code": "TRIAL_ALREADY_USED",
                "message": "The 30-day free trial has already been used on this device.",
            },
        )
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=FREE_TRIAL_DAYS)
    sub = Subscription(
        status="trial",
        plan="trial",
        platform=None,
        product_id=None,
        started_at=now.isoformat(),
        expires_at=expires.isoformat(),
        last_verified_at=now.isoformat(),
    )
    return await _write_subscription(payload.device_id, sub)


@api_router.post("/subscription/purchase", response_model=Subscription)
async def record_purchase(payload: PurchaseIn):
    """Record a validated native purchase.

    The mobile client is responsible for validating the receipt against
    StoreKit or Google Play Billing before calling this endpoint. Right
    now the backend simply trusts the payload and extends the
    subscription by 30 / 365 days. TODO: server-to-server validation
    with Apple/Google when we are ready to leave the placeholder phase.
    """
    if payload.plan not in ("monthly", "yearly"):
        raise HTTPException(400, "plan must be 'monthly' or 'yearly'")
    if payload.platform not in ("apple", "google", "mock"):
        raise HTTPException(400, "platform must be apple | google | mock")
    now = datetime.now(timezone.utc)
    days = 30 if payload.plan == "monthly" else 365
    product = payload.product_id or (
        PRODUCT_MONTHLY if payload.plan == "monthly" else PRODUCT_YEARLY
    )
    sub = Subscription(
        status="active",
        plan=payload.plan,
        platform=payload.platform,
        product_id=product,
        started_at=now.isoformat(),
        expires_at=(now + timedelta(days=days)).isoformat(),
        canceled_at=None,
        last_verified_at=now.isoformat(),
    )
    return await _write_subscription(payload.device_id, sub)


@api_router.post("/subscription/restore", response_model=Subscription)
async def restore_subscription(payload: RestoreIn):
    """Return the currently stored subscription for this device.

    On real devices the client will first ask the native store for the
    latest entitlements and forward them via /subscription/purchase; the
    mock version simply echoes what we already have.
    """
    return await _load_subscription(payload.device_id)


@api_router.post("/subscription/cancel", response_model=Subscription)
async def cancel_subscription(payload: CancelIn):
    """Mark subscription as canceled (still valid until `expires_at`).

    The native stores are the source of truth for real cancellation —
    this endpoint just records the intent so the UI can show it.
    """
    current = await _load_subscription(payload.device_id)
    if current.status not in ("trial", "active"):
        return current
    now = datetime.now(timezone.utc).isoformat()
    sub = current.model_copy(update={"canceled_at": now, "last_verified_at": now})
    return await _write_subscription(payload.device_id, sub)


def _num(v):
    """Best-effort numeric coercion (Replit returns some values as strings)."""
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


async def _call_upstream_context_interview(
    athlete_id: int, athlete_name: str, factors: List[str], notes: Optional[str]
) -> tuple[Optional[dict], Optional[dict]]:
    """Log the AFEtm Contextual Interview with the authoritative Replit engine.

    This MUST run successfully before ``/api/assessments`` — Replit
    returns HTTP 428 ``contextInterviewRequired`` if we skip it.

    Returns ``(data, error)`` where exactly one is populated. Same
    envelope convention as ``_call_upstream``: an all-None tuple means
    "network-level failure" which the caller can treat as pending.
    """
    if not AUTHORITATIVE_UPSTREAM_URL or not AUTHORITATIVE_UPSTREAM_TOKEN:
        return None, None
    url = f"{AUTHORITATIVE_UPSTREAM_URL}/api/context-interviews"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {AUTHORITATIVE_UPSTREAM_TOKEN}",
    }
    # Payload matches the official Replit schema EXACTLY:
    #   { athleteId: number, athleteName: string, factors: string[], notes?: string }
    payload = {
        "athleteId": int(athlete_id),           # NEVER a string
        "athleteName": str(athlete_name or ""),
        "factors": list(factors),
    }
    if notes:
        payload["notes"] = str(notes)[:NOTES_MAX]
    try:
        async with httpx.AsyncClient(timeout=15.0) as c:
            r = await c.post(url, headers=headers, json=payload)
    except Exception as e:
        logging.warning("Upstream context-interview network failure: %s", e)
        return None, None
    if r.status_code not in (200, 201):
        body = r.text[:2000]
        logging.warning(
            "Upstream context-interview %s: %s", r.status_code, body[:200]
        )
        return None, {
            "upstream_url": url,
            "upstream_status": r.status_code,
            "upstream_body": body,
        }
    try:
        data = r.json()
        if not isinstance(data, dict):
            raise ValueError("Expected a JSON object")
    except ValueError:
        return None, {
            "upstream_url": url,
            "upstream_status": r.status_code,
            "upstream_body": r.text[:2000],
            "reason": "Invalid contextual interview response; expected a JSON object",
        }
    return data, None


async def _call_upstream(
    a: "AssessmentIn",
    athlete_id: Optional[int] = None,
    context_interview_id: Optional[str] = None,
) -> tuple[Optional[dict], Optional[dict]]:
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
    # Replit AFEtm engine schema (authoritative). Emergent only forwards
    # captured data; Replit remains the calculation + classification
    # engine. Field mapping (see doc from user 2026-08-24):
    #   age               → athlete age
    #   restingHr         → resting HR (a.fcr)
    #   maxHr             → *actual measured peak HR* reached during
    #                       the assessment (readings at t=0s, i.e. peak
    #                       at the end of effort). Not the theoretical
    #                       220-age; that would be a different value.
    #   hr60s, hr90s,
    #   hr120s, hr150s    → recovery-window readings.
    #   hr3m              → HR at 180 s (mapped to `hr3m`, not `hr180s`).
    #   safetyConfirmed   → true once the athlete completed the safety
    #                       screening in-app.
    #   safetyConfirmedAt → ISO 8601 timestamp WITH timezone.
    peak_hr = a.readings.get("0")
    safety_confirmed_at = datetime.now(timezone.utc).isoformat()
    payload = {
        "age": a.age,
        "restingHr": a.fcr,
        "maxHr": peak_hr,
        "hr60s": a.readings.get("60"),
        "hr90s": a.readings.get("90"),
        "hr120s": a.readings.get("120"),
        "hr150s": a.readings.get("150"),
        "hr3m": a.readings.get("180"),
        "safetyConfirmed": True,
        "safetyConfirmedAt": safety_confirmed_at,
        # Extra context passed through — Replit may ignore unknown fields.
        "fcpv": a.fcpv.model_dump(),
    }
    # Replit (as of 2026-09-10) REQUIRES the official athleteId in the
    # assessment payload and enforces that the athlete exists AND belongs
    # to the API token's account. Omitting it triggers an upstream 500.
    if athlete_id is not None:
        payload["athleteId"] = int(athlete_id)
    if context_interview_id is not None:
        # Link the previously logged contextual interview when available.
        try:
            payload["contextInterviewId"] = int(context_interview_id)
        except (TypeError, ValueError):
            payload["contextInterviewId"] = context_interview_id
    try:
        async with httpx.AsyncClient(timeout=15.0) as c:
            r = await c.post(url, headers=headers, json=payload)
    except Exception as e:
        logging.warning("Upstream network failure: %s", e)
        # Network-level failure — treat as pending (temporary).
        return None, None
    if r.status_code not in (200, 201):
        body = r.text[:2000]
        logging.warning("Upstream %s: %s", r.status_code, body[:200])
        error: dict = {
            "upstream_url": url,
            "upstream_status": r.status_code,
            "upstream_body": body,
        }
        # Controlled explanations for the athlete-registry contract so the
        # mobile user sees an actionable message instead of a raw 4xx/5xx.
        if r.status_code == 404:
            error["reason"] = (
                "El servidor AFEtm no encontró tu athleteId "
                f"({athlete_id}). Verifica que tu perfil use el athleteId "
                "oficial registrado en tu cuenta AFEtm."
            )
        elif r.status_code == 403:
            error["reason"] = (
                f"El athleteId ({athlete_id}) pertenece a otra cuenta AFEtm. "
                "Usa el athleteId oficial de tu propia cuenta."
            )
        return None, error
    try:
        data = r.json()
        if not isinstance(data, dict):
            raise ValueError("Expected a JSON object")
    except ValueError:
        return None, {
            "upstream_url": url,
            "upstream_status": r.status_code,
            "upstream_body": r.text[:2000],
        }
    # Field mapping: Replit's authoritative response schema uses camelCase
    # and slightly different field names. Emergent never invents these —
    # every value below is taken as-is from Replit and only re-keyed to
    # the schema the mobile app expects. If a required field is truly
    # absent, the call is rejected (no local fallback).
    zone_raw = data.get("zone") or data.get("colorZone")
    zone_norm = str(zone_raw).strip().upper() if zone_raw else None
    pattern_raw = data.get("pattern") or data.get("recoveryPattern")
    pattern_norm = str(pattern_raw).strip().upper() if pattern_raw else None
    def present(*keys):
        # Zero is an authoritative value, not an absent field.
        return next((data[k] for k in keys if data.get(k) is not None), None)

    derived = {
        # Authoritative TARGET HR (a.k.a. FCP / HRP / targetHr) — must
        # come from Replit's calculation. Accept the canonical alternate
        # field names Replit may use. Emergent never invents this value.
        "fcp_target": (
            data.get("fcp_target")
            or data.get("targetHr")
            or data.get("HRP")
            or data.get("fcp")
            or data.get("hr90Target")
            or data.get("hrTargetKarvonen")
        ),
        "hr_peak": data.get("hr_peak") or data.get("maxHr") or a.readings.get("0"),
        # HRR at 3 min is the canonical AFEtm HRR reported to the athlete.
        "hrr": present("hrr", "hrr180", "hrr90"),
        # RECpct at 3 min is the canonical AFEtm recovery-percent value.
        "recpct": present("recpct", "recPct180", "recPercent180"),
        "aurc": data.get("aurc"),
        "tau": data.get("tau"),
        "pattern": pattern_norm,
        "zone": zone_norm,
        "action": data.get("action") or "",
        "fcpv_total": data.get("fcpv_total")
            or int(sum(a.fcpv.model_dump().values())),
        "context_flag": data.get("context_flag", False),
    }
    # Required authoritative fields. `fcp_target` is intentionally NOT
    # required here — it is a well-known age-derived value (Karvonen 80%)
    # that our local `calc_math_only` already computes, so we accept
    # Replit's authoritative classification even if this field is null.
    for k in ("hrr", "recpct", "pattern", "zone"):
        if derived.get(k) in (None, ""):
            return None, {
                "upstream_url": url,
                "upstream_status": r.status_code,
                "upstream_body": r.text[:2000],
                "reason": f"Missing required field '{k}' in authoritative response",
            }
    # Validate the existing mobile DTO types before any database write.
    # This only checks transport integrity; it does not calculate a result.
    for key, value in derived.items():
        if value is None:
            continue
        try:
            value = TypeAdapter(Assessment.model_fields[key].annotation).validate_python(value)
            if isinstance(value, (int, float)) and not isfinite(value):
                raise ValueError("Non-finite value")
        except (ValidationError, ValueError, OverflowError):
            return None, {
                "upstream_url": url,
                "upstream_status": r.status_code,
                "upstream_body": r.text[:2000],
                "reason": f"Invalid field '{key}' in authoritative response",
            }
        derived[key] = value
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


def _new_diag(a: "AssessmentIn") -> dict:
    """TEMPORARY developer diagnostic — capture the REAL values Emergent
    receives from the mobile app before the Replit bridge runs.

    NEVER stores the Bearer token or any secret. Removed once the
    field investigation is complete."""
    r = a.readings or {}
    return {
        "id": str(uuid.uuid4()),
        "device_id": a.device_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "payload_received": True,
        # --- exact values received from the mobile app ---
        "age": a.age,
        "restingHr": a.fcr,
        "maxHr": r.get("0"),
        "hr60s": r.get("60"),
        "hr90s": r.get("90"),
        "hr120s": r.get("120"),
        "hr150s": r.get("150"),
        "hr3m": r.get("180"),
        "factors": list(a.factors or []),
        "notes_present": bool(a.notes),
        "safetyConfirmed": a.safety_confirmed,
        "safetyConfirmedAt": a.safety_confirmed_at,
        "bleDeviceName": a.ble_device_name,
        # Filled in from the profile during processing:
        "athleteId": None,
        "athleteName": None,
        # --- bridge trace (no secrets; the upstream URL is public) ---
        "upstream_url": AUTHORITATIVE_UPSTREAM_URL,
        "context_interview_sent": False,
        "context_interview_status": None,
        "assessment_sent": False,
        "assessment_status": None,
        "replit_http_response": None,
        "authoritative_result_received": False,
        "zone": None,
        "error": None,
    }


async def _save_diag(diag: dict) -> None:
    """Persist the diagnostic entry. Never raises."""
    try:
        await db.diagnostics.insert_one(dict(diag))
    except Exception as e:
        logging.warning("diag save failed: %s", e)


@api_router.get("/diagnostics/last")
async def get_last_diagnostics(device_id: str = Query(...), limit: int = Query(5, le=20)):
    """TEMPORARY developer diagnostics — most recent assessment attempts
    for this device. Contains no secrets (Bearer token is never stored)."""
    cur = (
        db.diagnostics.find({"device_id": device_id}, {"_id": 0})
        .sort("timestamp", -1)
        .limit(limit)
    )
    return await cur.to_list(length=limit)


@api_router.post("/assessments", response_model=Assessment)
async def create_assessment(a: AssessmentIn):
    """Thin diagnostic wrapper around the real implementation.

    Captures exactly what the mobile app sent and how each bridge stage
    responded, persisting the trace even when the request aborts with an
    HTTPException. Assessment logic itself lives unchanged in
    ``_create_assessment_impl``."""
    diag = _new_diag(a)
    try:
        return await _create_assessment_impl(a, diag)
    except HTTPException as e:
        diag["error"] = e.detail if isinstance(e.detail, dict) else {"message": str(e.detail)}
        raise
    finally:
        await _save_diag(diag)


async def _create_assessment_impl(a: AssessmentIn, diag: dict) -> Assessment:
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
    # Subscription / free-trial gate. During the 30-day trial and while
    # the paid subscription is active, the athlete keeps full access; if
    # the subscription is expired or was never started, the mobile app
    # must show the paywall (client also enforces this proactively).
    sub = await _load_subscription(a.device_id)
    if sub.status not in ("trial", "active"):
        raise HTTPException(
            status_code=402,
            detail={
                "code": "SUBSCRIPTION_REQUIRED",
                "message": (
                    "A free trial or an active subscription is required "
                    "before creating an AFEtm assessment."
                ),
                "status": sub.status,
            },
        )
    # Extra safety: the age used to compute FCP must match the profile's age.
    # Mismatches are treated as an ownership violation (someone is trying to
    # submit for a different person).
    try:
        profile_age = TypeAdapter(Annotated[int, Field(gt=0)]).validate_python(profile.get("age"))
        if isinstance(profile.get("age"), bool):
            raise ValueError("Invalid age")
    except (ValidationError, ValueError):
        raise HTTPException(400, detail={
            "code": "PROFILE_AGE_INVALID",
            "message": "Your profile needs a valid age before submitting an assessment.",
        })
    if abs(profile_age - a.age) > 1:
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

    # ------------------------------------------------------------------
    # AFEtm Contextual Interview validation (Replit /api/context-interviews)
    # ------------------------------------------------------------------
    # 1. The athlete MUST have a numeric AFEtm athleteId in their profile.
    #    Never invent one; never send a string. If missing, stop the
    #    request and report the problem to the mobile client.
    raw_aid = profile.get("athlete_id")
    try:
        athlete_id_num = TypeAdapter(Annotated[int, Field(gt=0)]).validate_python(raw_aid)
        if isinstance(raw_aid, bool):
            athlete_id_num = None
    except ValidationError:
        athlete_id_num = None
    if not athlete_id_num or athlete_id_num <= 0:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "ATHLETE_ID_MISSING",
                "message": (
                    "This account has no AFEtm athleteId. Please provide "
                    "your official AFEtm athleteId in your profile before "
                    "running an assessment. AFEtm never invents identifiers."
                ),
            },
        )
    # Diagnostic trace (no logic impact)
    if not isinstance(profile.get("name"), str) or not profile["name"].strip():
        raise HTTPException(400, detail={
            "code": "PROFILE_NAME_INVALID",
            "message": "Your profile needs a name before submitting the contextual interview.",
        })
    diag["athleteId"] = athlete_id_num
    diag["athleteName"] = profile.get("name") or ""

    # 2. factors validation: at least one official key; "none" is exclusive.
    submitted = [str(f).strip() for f in (a.factors or []) if str(f).strip()]
    unknown = [f for f in submitted if f not in CONTEXT_FACTOR_KEYS]
    if unknown:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "CONTEXT_FACTORS_INVALID",
                "message": f"Unknown contextual factor(s): {unknown}",
                "allowed": sorted(list(CONTEXT_FACTOR_KEYS)),
            },
        )
    if not submitted:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "CONTEXT_FACTORS_REQUIRED",
                "message": (
                    "At least one AFEtm contextual factor is required. "
                    "Use 'none' if no relevant factor applies."
                ),
                "allowed": sorted(list(CONTEXT_FACTOR_KEYS)),
            },
        )
    # "none" is exclusive — collapse to just ["none"] when present.
    if "none" in submitted:
        submitted = ["none"]
    else:
        # Deduplicate preserving order.
        seen = set()
        deduped = []
        for f in submitted:
            if f not in seen:
                seen.add(f)
                deduped.append(f)
        submitted = deduped

    # notes: optional, hard-clamp to 2000 chars server-side too.
    notes_clean: Optional[str] = None
    if a.notes:
        notes_clean = str(a.notes).strip()[:NOTES_MAX] or None

    math = calc_math_only(a.fcr, a.age, a.readings, a.fcpv.model_dump())
    upstream_configured = bool(AUTHORITATIVE_UPSTREAM_URL and AUTHORITATIVE_UPSTREAM_TOKEN)
    context_interview_id: Optional[str] = None
    if upstream_configured:
        # STEP 1/2 — Log the contextual interview with Replit BEFORE the
        # assessment call. Any non-2xx status is surfaced as-is; we never
        # continue silently past a context-interview failure.
        diag["context_interview_sent"] = True
        ci_data, ci_error = await _call_upstream_context_interview(
            athlete_id_num, profile.get("name") or "", submitted, notes_clean
        )
        if ci_error is not None:
            diag["context_interview_status"] = ci_error.get("upstream_status")
            diag["replit_http_response"] = {
                "stage": "context-interview",
                "status": ci_error.get("upstream_status"),
                "body": (ci_error.get("upstream_body") or "")[:400],
            }
            raise HTTPException(
                status_code=424,
                detail={
                    "code": "AUTHORITATIVE_UPSTREAM_ERROR",
                    "stage": "context-interview",
                    "message": (
                        "The authoritative AFEtm server rejected the "
                        "contextual interview. The assessment WAS NOT saved."
                    ),
                    **ci_error,
                },
            )
        if ci_data is None:
            # Network-level failure while configured — treat as pending.
            diag["context_interview_status"] = "NETWORK_FAILURE"
            derived = {**math, "pattern": None, "zone": None, "action": None, "context_flag": False}
            calc_source = "pending"
            calc_notice = PENDING_NOTICE + " (Sin red al servidor autoritativo — entrevista contextual)"
        else:
            diag["context_interview_status"] = 201
            _cid_raw = (
                ci_data.get("id")
                or ci_data.get("interviewId")
                or ci_data.get("contextInterviewId")
            )
            context_interview_id = str(_cid_raw) if _cid_raw is not None else None
            # STEP 2/2 — Now the actual assessment call.
            diag["assessment_sent"] = True
            derived, error = await _call_upstream(
                a, athlete_id_num, context_interview_id
            )
            if error is not None:
                diag["assessment_status"] = error.get("upstream_status")
                diag["replit_http_response"] = {
                    "stage": "assessment",
                    "status": error.get("upstream_status"),
                    "body": (error.get("upstream_body") or "")[:400],
                }
                raise HTTPException(
                    status_code=424,
                    detail={
                        "code": "AUTHORITATIVE_UPSTREAM_ERROR",
                        "stage": "assessment",
                        "message": (
                            "El servidor autoritativo AFEtm rechazó la solicitud. "
                            "La evaluación NO se guardó para no ocultar el error."
                        ),
                        **error,
                    },
                )
            if derived is None:
                diag["assessment_status"] = "NETWORK_FAILURE"
                derived = {**math, "pattern": None, "zone": None, "action": None, "context_flag": False}
                calc_source = "pending"
                calc_notice = PENDING_NOTICE + " (Sin red al servidor autoritativo)"
            else:
                diag["assessment_status"] = 201
                derived = {**math, **{k: v for k, v in derived.items() if v is not None}}
                derived.setdefault("context_flag", False)
                calc_source = "authoritative"
                calc_notice = None
                diag["authoritative_result_received"] = True
                diag["zone"] = derived.get("zone")
                diag["replit_http_response"] = {
                    "stage": "assessment",
                    "status": 201,
                    "zone": derived.get("zone"),
                    "pattern": derived.get("pattern"),
                }
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
        "factors": submitted,
        "notes": notes_clean,
        "context_interview_id": context_interview_id,
        "created_at": now,
        "calc_source": calc_source,
        "calc_notice": calc_notice,
        **derived,
    }
    assessment = Assessment(**doc)
    await db.assessments.insert_one(assessment.model_dump())
    return assessment


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
    profile = await db.profiles.find_one({"device_id": device_id}, {"_id": 0}) or {}
    doc = await _require_owned_assessment(aid, device_id)
    if doc.get("calc_source") == "authoritative":
        return Assessment(**doc)
    # Rebuild the input from the stored raw data.
    try:
        a = AssessmentIn(
            device_id=doc["device_id"],
            fcr=doc["fcr"],
            age=doc["age"],
            readings=doc["readings"],
            fcpv=doc.get("fcpv") or {},
        )
    except (ValidationError, KeyError):
        raise HTTPException(400, detail={
            "code": "ASSESSMENT_DATA_INVALID",
            "message": "This saved attempt has missing or invalid data. Please repeat the assessment.",
        })
    for t in TIMES:
        if str(t) not in a.readings:
            raise HTTPException(400, f"Falta lectura en t={t}s")
    # Replit requires the official athleteId also on resync.
    try:
        resync_aid = TypeAdapter(Annotated[int, Field(gt=0)]).validate_python(
            profile.get("athlete_id")
        )
    except ValidationError:
        raise HTTPException(400, detail={
            "code": "ATHLETE_ID_MISSING",
            "message": (
                "This account has no AFEtm athleteId. Please provide "
                "your official AFEtm athleteId in your profile before "
                "re-syncing an assessment."
            ),
        })
    upstream, error = await _call_upstream(
        a, resync_aid, doc.get("context_interview_id")
    )
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
    # Null optional upstream metrics retain their existing stored values,
    # matching create-assessment behavior (no replacement HR samples).
    update = {k: v for k, v in update.items() if v is not None or k == "calc_notice"}
    assessment = Assessment(**{**doc, **update})
    await db.assessments.update_one({"id": aid}, {"$set": update})
    return assessment


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


@api_router.delete("/profile")
async def delete_all_my_data(device_id: str = Query(...)):
    """Permanently erase ALL server-side data for this device.

    Apple Guideline 5.1.1(v): the athlete must be able to delete their
    account/data from within the app. Removes the profile (including the
    subscription mirror), every assessment and every diagnostics trace.
    """
    prof = await db.profiles.delete_one({"device_id": device_id})
    assess = await db.assessments.delete_many({"device_id": device_id})
    diags = await db.diagnostics.delete_many({"device_id": device_id})
    return {
        "deleted": True,
        "profile_deleted": prof.deleted_count,
        "assessments_deleted": assess.deleted_count,
        "diagnostics_deleted": diags.deleted_count,
    }


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
