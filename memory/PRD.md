# AFEtm Safety Check — Mobile MVP · PRD

## Overview
AFEtm Safety Check is a preventive cardiovascular recovery assessment app for athletes.
**Not a medical diagnostic tool.** Supports responsible decisions before continuing physical activity.

Tagline: *Antes de entrenar. Antes de competir. Antes de exigir más.*

## Scope (v1)
- Manual assessment flow (BLE integration deferred to v2)
- Single local profile (no login), device_id auto-persisted via AsyncStorage
- Spanish only, athlete role only
- In-app result summary (no PDF)

## Tech Stack
- Frontend: Expo Router (SDK 54), React Native, expo-linear-gradient, safe-area-context, @expo/vector-icons
- Backend: FastAPI + Motor (MongoDB async), Pydantic v2
- Storage: MongoDB — `profiles`, `assessments` collections

## Screens
1. **Onboarding** (`/`) — brand hero + Comenzar CTA + disclaimer
2. **Profile Setup** (`/profile-setup`) — name, age, weight, sport chips
3. **Tabs**
   - **Home** (`/(tabs)/`) — last assessment hero card with neon zone color, quick stats, CTA
   - **Nuevo** (`/(tabs)/new`) — 4-step guided assessment (FCr → FCP display → readings 0/30/60/90/120/180s → FCPv contextual questions)
   - **Historial** (`/(tabs)/history`) — filterable list (Todas / Azul / Verde / Amarillo / Rojo), color-coded stripes
   - **Perfil** (`/(tabs)/profile`) — profile card, stats, edit
4. **Assessment Detail** (`/assessment/[id]`) — zone banner + pattern + action, metric grid (HRR/RECpct/AURC/τ), curve readings, FCPv breakdown, disclaimer, delete

## Backend API
- `GET /api/` — health
- `POST /api/profile` — upsert profile
- `GET /api/profile?device_id=` — get profile (or null)
- `POST /api/assessments` — compute + persist evaluation
- `GET /api/assessments?device_id=` — list (sorted desc)
- `GET /api/assessments/{id}` — detail
- `DELETE /api/assessments/{id}` — remove

## AFE Calculation Engine (server-side)
- `FCP = round(0.80 × (220 − edad))`
- `HRR = HR_peak − HR_60s`
- `RECpct = (HR_peak − HR_180s) / (HR_peak − FCr) × 100`
- `AURC` — trapezoidal integration across 0/30/60/90/120/180s
- `τ (tau)` — first t where HR ≤ HR_peak − 0.632 × (HR_peak − FCr)
- **Patterns**: RAPID, NORMAL, DELAYED, FLATTENED, UNSTABLE
- **Zones**: BLUE (recpct≥65 & RAPID), GREEN (recpct≥40), YELLOW (recpct≥25), RED (<25 or UNSTABLE/FLATTENED)
- **FCPv**: 5 factors × 0–2 (sleep, hydration, symptoms, recent_illness, subjective_load) → `context_flag = total ≥ 6` (adjusts label, never zone)

## Design
Guidelines in `/app/design_guidelines.json`. Dark-first utility aesthetic with gold `#D4AF37` brand and 4 neon-glow zone colors (Blue/Green/Yellow/Red).

## Deferred
- BLE pulsómetro nativo (0x180D / 0x2A37) — v2
- Coach role & multi-athlete — v2
- Multi-idioma — v2
- PDF report generation — v2
