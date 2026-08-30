# Polar BLE SDK — AFEtm Safety Check integration notes

Official Polar SDK integration for **AFEtm Safety Check** (iOS + Android).
Reference: https://github.com/polarofficial/polar-ble-sdk

## What this integration does

- Adds the official Polar BLE SDK to the iOS and Android builds.
- Exposes a JS module (`src/native/PolarBle.ts`) with `startScan`,
  `stopScan`, `connect`, `disconnect` and event streams for
  `polar-device`, `polar-state`, `polar-hr`.
- `useHeartRateMonitor` transparently prefers the Polar SDK when the
  native module is available and falls back to `react-native-ble-plx`
  otherwise (Expo Go / web preview).

## What this integration is NOT

- The AFEtm classification (Blue / Green / Yellow / Red) remains 100 %
  on the Replit backend. Nothing about the algorithm is exposed or
  duplicated on-device. Polar is used **only** as a real-time HR/BPM
  source.
- No AccessLink API / no Polar Flow cloud sync in this phase.

## Files added

- `plugins/withPolarBle.js` — Expo config plugin (Podfile, Info.plist,
  AndroidManifest, Gradle repos + deps).
- `ios/PolarBle/PolarBleModule.swift` and `.m` — iOS bridge.
- `android/app/src/main/java/com/wewon/afetm/polarble/PolarBleModule.kt`
  and `PolarBlePackage.kt` — Android bridge.
- `src/native/PolarBle.ts` — TypeScript wrapper.
- Updated `src/hooks/useHeartRateMonitor.ts` to auto-select Polar.

## Native build workflow

1. In Emergent, click **Publish → Generate iOS build** (Apple developer
   account required) or **Generate Android build**.
2. After `expo prebuild` runs, register the Android package in
   `android/app/src/main/java/.../MainApplication.kt`:
   ```kotlin
   import com.wewon.afetm.polarble.PolarBlePackage
   ...
   override fun getPackages(): List<ReactPackage> {
       val packages = PackageList(this).packages
       packages.add(PolarBlePackage())
       return packages
   }
   ```
   *(Emergent build pipeline can do this automatically via a follow-up
   config-plugin patch — this manual step is only needed if the plugin
   patch is skipped.)*
3. On iOS, `pod install` picks up `PolarBleSdk` automatically. No manual
   change needed.
4. Test on a physical iPhone / Android device with a Polar Verity Sense
   (or any Polar HRM). Expo Go and the web preview stay on the generic
   `react-native-ble-plx` path.

## Verification

- The onboarding, terms, tour, paywall, home, assessment flow, history,
  compare, detail, and profile screens are unchanged.
- The device-selection screen in `assessment-flow/guided` now shows
  Polar devices first (natively filtered) plus any additional generic
  HRM straps through the fallback path.
