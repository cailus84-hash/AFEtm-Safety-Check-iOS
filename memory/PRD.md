# AFEtm Safety Check — Mobile MVP · PRD

## Overview
AFEtm Safety Check is a preventive cardiovascular recovery assessment app for athletes.
**Not a medical diagnostic tool.** Supports responsible decisions before continuing physical activity.

Tagline: *Antes de entrenar. Antes de competir. Antes de exigir más.*

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
