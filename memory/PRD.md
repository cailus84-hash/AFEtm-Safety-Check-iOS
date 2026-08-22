# AFEtm Safety Check — Mobile MVP · PRD

## Overview
AFEtm Safety Check is a preventive cardiovascular recovery assessment app for athletes.
**Not a medical diagnostic tool.** Supports responsible decisions before continuing physical activity.

Tagline: *Antes de entrenar. Antes de competir. Antes de exigir más.*

## Scope (v3)
- **Recovery curve chart** (react-native-svg) on the result screen with dashed FCr / FCP reference lines and zone-color gradient
- **BLE auto-reconnect** with exponential backoff (1s→30s, 8 attempts) + visible reconnect banner during the 3-min recovery window
- **BLE guided flow** with `react-native-ble-plx` (dev build required — no Expo Go)
- Manual assessment flow (fallback)
- Single local profile (no login), device_id auto-persisted via AsyncStorage
- Spanish only, athlete role only
- In-app result summary (no PDF)

## Tech Stack
- Frontend: Expo Router (SDK 54), React Native, `react-native-ble-plx`, `react-native-svg`, expo-linear-gradient, safe-area-context, @expo/vector-icons
- Backend: FastAPI + Motor (MongoDB async), Pydantic v2
- Storage: MongoDB — `profiles`, `assessments` collections

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
