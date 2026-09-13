# AFEtm Safety Check — Mobile MVP · PRD

## Overview
AFEtm Safety Check is a preventive cardiovascular recovery assessment app for athletes.
**Not a medical diagnostic tool.** Supports responsible decisions before continuing physical activity.

Tagline (EN default): *Before Training. Before Competition. Before Pushing Harder.*
Tagline (ES): *Antes de entrenar. Antes de competir. Antes de exigir más.*

## Scope (v9 — Personal-Use licensing + institutional gate)

### Onboarding flow (updated)
1. `/` — Hero + language pill (EN default, ES toggle, device-locale detected).
2. `/terms` — **Mandatory Personal-Use Terms acceptance**. Three separate
   checkboxes:
   - "I confirm that I will use AFEtm Mobile only for myself."
   - "I understand that institutional / team / professional / research /
     third-party use requires express authorization from WeWon Smart
     Sport Solutions LLC."
   - "I accept the Terms of Use and Privacy Policy."
     A tappable pill link *"Read the Privacy Policy"* right below the
     third checkbox opens `https://www.wewonsss.com/privacy-policy` via
     `Linking.openURL` (required for App Store review).
   Acceptance is persisted via `POST /api/profile/accept-terms` with
   `terms_version` (currently `1.0`) + ISO timestamp.
3. `/profile-setup` — Athlete profile (name, age, weight, sport, target zone).
4. `/(tabs)` — Home. Gated: if `terms_accepted_at` is null the app
   automatically bounces back to `/terms`.

### Institutional access
- `/institutional` screen accessible from **Terms** and from **Profile → Personal Use Only card**.
- "Request Institutional Access" button opens `https://wewonmatrix.com/` via
  `Linking.openURL`.
- The mobile app cannot activate institutional access on its own — this is
  gated externally by WeWon Smart Sport Solutions LLC.

### Server-side enforcement (`/app/backend/server.py`)
- Every `/api/assessments*` mutation and read enforces `device_id` ownership.
  A mismatch returns HTTP `403 PERSONAL_USE_OWNERSHIP_VIOLATION`.
- `create_assessment` extra checks:
  - Requires an existing profile with `terms_accepted_at` set
    (`PERSONAL_USE_TERMS_REQUIRED`).
  - Rejects when the submitted `age` deviates from the profile age by
    more than 1 year (`PERSONAL_USE_AGE_MISMATCH`) — closes the "someone
    else is being evaluated" loophole.
- `TERMS_VERSION = "1.0"` exposed in the `/api/` health endpoint alongside
  the `license` string.

### New backend endpoints
- `POST /api/profile/accept-terms` → stores `terms_accepted_at` +
  `terms_version` on the profile document (creates a stub profile if none exists).
- `GET /api/terms` → returns the currently published Terms metadata
  (`version`, `effective_date`, bilingual `changelog`). The mobile app
  calls this on Home boot and forces a re-acceptance if the version does
  not match `profile.terms_version`.

### Terms Version Bump
- `TERMS_VERSION` and `TERMS_EFFECTIVE_DATE` are env-driven
  (`backend/.env`). Bumping the env var and restarting the backend is
  enough to invalidate every prior acceptance. The Terms screen auto
  detects this and switches to an **"TERMS UPDATED"** banner that shows
  the previous version, the new version + effective date, and the
  bilingual changelog for the new version. All three checkboxes reset
  so the athlete must actively re-accept.
- Server-side enforcement code `PERSONAL_USE_TERMS_OUTDATED` — assessment
  creation, read and mutation is blocked until the acceptance is
  refreshed. The mobile client also route-guards from Home to
  `/terms?mode=update` before the athlete can attempt anything.

### Removed / never-implemented (Personal-Use scope)
- No Create Athlete / Athlete Roster / Team Management / Organization
  Management / Institutional Dashboard / Coach Management / Bulk
  assessments / Third-party athlete records anywhere in the mobile app.
  The user profile automatically represents the person being evaluated.

## Scope (v8 — i18n + branding)
- **Strict bilingual UX (EN default, ES toggle)**. Full dictionary lives in
  `/app/frontend/src/lib/i18n.tsx`. On first launch the app detects the device
  locale (via `expo-localization`) and defaults to English if not Spanish. The
  choice persists in AsyncStorage (`afetm.lang`).
- **Language switcher** available in two places:
  - Onboarding: top-right pill (`onboarding-lang-toggle`) that toggles between EN/ES.
  - Profile tab: dedicated card with two flag buttons (`profile-lang-en`, `profile-lang-es`).
- **Localized helpers**: `zoneLabelI18n`, `zoneShortI18n`, `zoneDescI18n`,
  `patternLabelI18n`, and locale-aware `formatDate/formatTime/formatDateTime`.
- **Official AFEtm presentation image** (`/app/frontend/assets/images/afetm-hero.png`)
  is rendered on the onboarding screen with a gold-glow frame and
  "OFFICIAL VISUAL GUIDE" / "GUÍA VISUAL OFICIAL" badge.

## Scope (v7 — strict authoritative propagation)
- Backend uses HTTP **424 Failed Dependency** (not 502 — the K8s/Cloudflare ingress rewrites 502 into HTML) to surface authoritative-upstream failures with the exact `{code:'AUTHORITATIVE_UPSTREAM_ERROR', upstream_status, upstream_body, upstream_url}` envelope.
- Frontend `UpstreamError` detection is **code-based** (`detail.code === 'AUTHORITATIVE_UPSTREAM_ERROR'`) — robust to any future status swap.
- When upstream is configured AND returns non-200 → **HTTP 424 is returned to the caller, MongoDB is NOT written**. No local classification, no hidden pending fallback.
- When upstream is configured but network fails (DNS/connect) → 200 pending with `"(Sin red al servidor autoritativo)"` suffix (preserves field measurements).
- When upstream is unconfigured → 200 pending (documented behavior).

## Scope (v6 — strict authoritative-only classification)
- **REMOVED all locally invented thresholds** (Blue≥65 / Green≥40 / Yellow≥25 / Red<25). The backend no longer contains any classification decision code.
- `POST /api/assessments` behaviour:
  - **Upstream configured + reachable**: delegates fully to the authoritative Express server; `calc_source: "authoritative"` with zone/pattern/action from upstream.
  - **Upstream unavailable**: saves raw + documented math (FCP, HRR, RECpct, AURC, τ, FCPv total) with `zone=null, pattern=null, action=null` and `calc_source: "pending"` + notice `"Resultado pendiente de sincronización con el motor oficial AFEtm."`
- New endpoint `POST /api/assessments/{id}/resync` — retries authoritative classification for a pending record (does not invent a zone).
- UI: pending assessments show a distinct gold dashed banner with "REINTENTAR SINCRONIZACIÓN" button. Chart + math still visible. Home hero, history rows, trend sparkline all respect the pending state (no colored zone rendered).

## Scope (v5 — audit + build readiness added)
- **Authoritative-first architecture (NEW)**: `/app/backend/server.py` is now proxy-first.
  When `AUTHORITATIVE_UPSTREAM_URL` + `AUTHORITATIVE_UPSTREAM_TOKEN` are configured,
  every `POST /api/assessments` delegates classification to the official Express
  server (`afeRecoveryEngine.ts` — single source of truth per doc v3.1 §14).
  Fallback to a **REFERENCE MIRROR** is clearly labelled with `calc_source`
  and a yellow banner is shown in the detail screen.
- **Native build readiness**: `app.json` includes the `react-native-ble-plx`
  config plugin, Android `BLUETOOTH_SCAN` / `BLUETOOTH_CONNECT` /
  `ACCESS_FINE_LOCATION` permissions, iOS `NSBluetoothAlwaysUsageDescription`,
  and stable `bundleIdentifier` / `package`. User triggers the build via
  **Publish → Deploy → Generate iOS/Android builds**.

## Calc audit (v3.1 doc conformance)

| Component | Source | Status |
|---|---|---|
| `FCP = round(0.80 × (220 − age))` | doc §6 | Fiel |
| HRR / RECpct / AURC / tau formulas | doc §6 + Tabla 2 | Fiel |
| Zone thresholds | `afeRecoveryEngine.ts` (NOT in doc) | **Delegated to upstream** or reference-mirror |
| Pattern heuristics | `capa de confiabilidad v3` (NOT in doc) | **Delegated to upstream** or reference-mirror |
| FCPv (5×0-2, adjusts label not zone) | doc §8 | Fiel |
| `alertValidation.ts` states | doc §8 | Not implemented (future) |
| `afetm-mini.ts` (family scoring) | doc §3 | Not implemented (future) |

Reference-mirror computations run only when upstream is unconfigured; every
such assessment is stamped with `calc_source: "reference-mirror"` and
`calc_notice` explaining the situation.

## Scope (v5 — features)
- **Comparar sesiones**: modo multi-selección en el historial (long-press o toggle en el header) → pantalla `/compare` con curvas superpuestas + deltas RECpct/HRR/τ
- **Zona objetivo**: campo `target_zone` en el perfil (Ninguna / Verde / Azul). Cuando una evaluación iguala o supera el objetivo, se muestra un banner con trofeo y se dispara confetti (una vez por evaluación, con flag persistido en AsyncStorage)
- **Compartir resultado**: exporta banner + gráfica como PNG (`react-native-view-shot` + `expo-sharing`)
- **Tendencia semanal**: sparkline en Home con las últimas 7 evaluaciones
- **Recordatorios locales**: `expo-notifications` con trigger WEEKLY
- **Recovery curve chart** con líneas de referencia FCr / FCP
- **BLE guiado + auto-reconnect** (`react-native-ble-plx`, dev build required)
- Manual assessment flow (fallback)
- Single local profile (no login)
- Spanish only

## Tech Stack
- Frontend: Expo Router (SDK 54), React Native, `react-native-ble-plx`, `react-native-svg`, `react-native-view-shot`, `react-native-confetti-cannon`, `expo-sharing`, `expo-notifications`, `@react-native-community/datetimepicker`
- Backend: FastAPI + Motor (MongoDB async), Pydantic v2
- Storage: MongoDB — `profiles` (con `target_zone`), `assessments` collections. AsyncStorage — device_id, reminders, celebración por evaluación

## Screens
1. **Onboarding** (`/`) — brand hero + Comenzar CTA + disclaimer
2. **Profile Setup** (`/profile-setup`) — name, age, weight, sport chips
3. **Tabs**
   - **Home** (`/(tabs)/`) — last assessment hero card with neon zone color, quick stats, CTA
   - **Nuevo** (`/(tabs)/new`) — **choice screen**: Guiado (BLE) vs Manual
   - **Historial** (`/(tabs)/history`) — filterable list, color-coded stripes
   - **Perfil** (`/(tabs)/profile`) — profile card, stats, edit
4. **Assessment flows** (outside tabs)
   - `/assessment-flow/guided` — BLE: escanear → conectar → FCr live → alcanzar FCP → recuperación 3 min con capturas automáticas cada 30 s (promediando los últimos 5 s para eliminar ruido)
   - `/assessment-flow/manual` — 4-step guided form
5. **Assessment Detail** (`/assessment/[id]`) — zone banner + pattern + action, metric grid, curve, FCPv, delete

## AFE Calculation Engine (server-side)
- Timeline: `t = 0, 60, 90, 120, 150, 180 s`
- `FCP = round(0.80 × (220 − edad))`
- `HRR = HR_peak − HR_60s`
- `RECpct = (HR_peak − HR_180s) / (HR_peak − FCr) × 100`
- `AURC` — trapezoidal integration across 0/60/90/120/150/180s
- `τ (tau)` — first t where HR ≤ HR_peak − 0.632 × (HR_peak − FCr)
- **Patterns**: RAPID, NORMAL, DELAYED, FLATTENED, UNSTABLE
- **Zones**: BLUE (recpct≥65 & RAPID), GREEN (recpct≥40), YELLOW (recpct≥25), RED (<25 or UNSTABLE/FLATTENED)
- **FCPv**: 5 factors × 0–2 → `context_flag = total ≥ 6`

## BLE Integration
- Standard Heart Rate Service `0x180D`, Heart Rate Measurement `0x2A37`
- Config plugin: `react-native-ble-plx` with `bluetoothAlwaysPermission`
- Android runtime permissions: `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT` (API 31+) or `ACCESS_FINE_LOCATION` (API ≤30)
- iOS: `NSBluetoothAlwaysUsageDescription`
- Guided flow auto-captures HR averages over the last 5 s of each 30 s window (starting at t=60s) → reduces sensor noise
- Fallback UI on web/Expo Go redirects user to manual flow

## Design
Guidelines in `/app/design_guidelines.json`. Dark-first utility aesthetic with gold `#D4AF37` brand and 4 neon-glow zone colors (Blue/Green/Yellow/Red).

## Deferred
- Coach role & multi-athlete — v3
- Multi-idioma — v3
- PDF report generation — v3
- Background BLE + reconexión automática — v3

## TEMPORARY — Developer Diagnostics (remove after field investigation)
- Backend: `_new_diag()/_save_diag()` wrapper around `create_assessment` persists
  every assessment attempt into `db.diagnostics` (payload received, athleteId/Name,
  HR values, factors, safetyConfirmed, BLE device name, Replit bridge trace,
  zone). No secrets stored. `GET /api/diagnostics/last?device_id=&limit=`.
- Frontend: `/diagnostics` screen (route `app/diagnostics.tsx`) + temporary
  "Diagnostics (temp)" row in Profile tab.
- `AssessmentIn` gained OPTIONAL diagnostic-only fields: `safety_confirmed`,
  `safety_confirmed_at`, `ble_device_name` (ignored by assessment logic).
- Env hardening: `_clean_env()` strips quotes/whitespace from
  AUTHORITATIVE_UPSTREAM_URL/TOKEN (production 401 root-cause fix).

## Session 2026-09-11 (fork) — Replit contract fix + App Store items
- **Workspace synced**: connected `origin` → `cailus84-hash/AFEtm-Safety-Check-iOS`, fast-forwarded local `main` `4d23de1` → `8485501` ("Harden mobile assessment validation"). Verified `feat/protocol-audio-cues` tip `3143b86` has IDENTICAL content to `8485501` (empty diff).
- **ROOT CAUSE — Sept 10 06:50 CT failure**: Replit `/api/assessments` now REQUIRES an `athleteId` that exists AND belongs to the token's account. Without it → upstream 500; unknown id → 404 "Athlete not found"; other user's athlete → 403. Emergent's payload didn't include athleteId at all.
- **FIX (transport only, no algorithm change)**: `_call_upstream()` now forwards `athleteId` + `contextInterviewId`; resync path validates profile athleteId too. Upstream 404/403 mapped to controlled Spanish `reason` shown in-app (UpstreamError.reason in api.ts, rendered by manual/guided flows).
- **PENDING EXTERNAL**: the Replit account behind our token (userId 53969071) has NO registered athletes (probed ids 1–40: only 2 & 6 exist, owned by others). Full E2E green requires the user to register the athlete on Replit and put that real athleteId in the mobile profile.
- **Delete my data (Apple 5.1.1v)**: `DELETE /api/profile?device_id=` erases profile+assessments+diagnostics; Profile tab danger card with two-step inline confirm; clears local reminders; routes to onboarding (dismissAll + replace('/')).
- **Root ErrorBoundary**: `src/components/ErrorBoundary.tsx` wraps Stack in `_layout.tsx` (bilingual static fallback + retry).
- **Testing**: backend pytest 23/23 + curl E2E (incomplete data → controlled 400 "Falta lectura en t=Xs", no ghost records); testing_agent frontend iteration_9 ALL PASS.
- **NOT DONE by user request**: no deps removed, billing untouched, diagnostics view kept, no build/publish triggered.

## Session 2026-09-13 — Share Color Guide
- ColorGuideCard (Home tab) gained a "Share / Compartir" pill button: shares the OFFICIAL
  AFEtm Visual Color Guide artwork (assets/images/afetm-hero-en|es.png, per current language)
  via expo-sharing (native share sheet); web fallback opens the image. Installed expo-asset.
  i18n keys: guide.share, guide.share.error. Verified E2E on web preview (full onboarding walk).
- Athlete registration on Replit remains a USER action: token cannot create/list athletes
  (401); user must register their athlete in their Replit AFEtm account and set the real
  athleteId in the mobile profile, then validate from iPhone.

## Session 2026-09-13 — Expo SDK 57 upgrade
- Upgraded Expo SDK 54 → 57 (expo 57.0.22, react-native 0.86.3, react 19.2.3) via
  `yarn expo install expo@^57 && yarn expo install --fix`. expo-doctor: 20/20 pass.
- Breaking-change migrations applied:
  * app.json: removed `newArchEnabled` and `android.edgeToEdgeEnabled` (defaults in 55+).
  * Replaced deprecated `@expo/vector-icons` with `@react-native-vector-icons/material-design-icons`
    (19 files; default import; `keyof typeof X.glyphMap` → `ComponentProps<typeof X>['name']` in 3 files).
  * `src/hooks/use-icon-fonts.ts` simplified — new icon packages self-register fonts via expo-font
    (Expo Go CDN workaround no longer needed).
- Verified: web preview boots, full onboarding→home walk OK, icons render, tabs navigate, Share Guide intact.
- NOTE: native Polar/BLE plugin untouched; needs a fresh dev/production build to validate on device.
