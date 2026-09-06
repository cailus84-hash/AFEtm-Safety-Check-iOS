# Guided acquisition regression tests

Run from frontend with Node.js 24 (no package installation required):

```sh
node --test tests/*.test.mjs
```

`acquisition.test.mjs` tests the production session controller with an injected
monotonic clock. `monitor.test.mjs` executes the actual TypeScript hook using
controlled React-hook and native-transport doubles. `guided.test.mjs` executes
the actual guided screen's handlers and effects up to its JSX render boundary,
with mocked API and storage. Invalid attempts must never invoke the API mock;
valid attempts must retain the existing payload shape. No test contacts Replit.

These are deterministic logic/transport tests, not a React Native renderer,
Expo typecheck, native build, or physical sensor validation. Node's module-type
and experimental type-stripping warnings do not require changing the Expo
package type. No dependencies were added to run these tests.

## Acquisition boundaries

- The target formula in the screen is unchanged. The minus-15 tolerance is gone.
- One connection/device per mounted attempt. Disconnection/contact loss or app
  inactivity ends acquisition; returning to the assessment menu starts a fresh
  attempt on re-entry. There is no silent reconnect into an existing attempt.
- Live samples expire after 5,000 ms. This is a transport freshness bound, not a
  physiological threshold. Resting acquisition retains the existing 15-second
  average and existing input validation; it additionally requires a fresh sample.
- Recovery uses inclusive fixed windows [55,60], [85,90], [115,120], [145,150],
  [175,180] seconds from one monotonic t=0. Actual samples are averaged and
  rounded as before. An empty window is incomplete; no values are substituted.
- Histories and live HR clear on invalidation. Captures are immutable while
  valid; invalidation discards acquisition data and blocks submission.
- Target-not-reached observations are local only, under
  `afetm.acquisition_observations.v1`, capped at 20 records. They contain no zone
  or calculated result and do not use the assessment API. Storage failure is
  surfaced on the observation screen.

## Step 2 provenance

Polar HR events carry immutable `sessionId`, `connectionId`, device `id` and
`receivedAt` captured at entry to the SDK HR callback. iOS uses system uptime;
Android uses elapsed realtime. A pure synchronous native clock read supplies
the same clock domain to the session controller, including its recovery origin.
No clock offset is estimated; no timestamp is interpolated or replaced at JS
delivery. Missing tags, wrong connections, and invalid/stale receipts are rejected.
Old tagged disconnect commands cannot terminate a new acquisition.

iOS creates a separate SDK/observer for each connection. Polar Android 5.5.0
uses a singleton, so scan/connection owners are shut down before a new owner is
created. Automatic reconnection is disabled; a disconnect invalidates the attempt.
The iOS observer tuple signature is corrected against Polar 5.5.0, the version
declared by the existing Android plugin; the iOS build does not currently pin it.

Generic BLE retains a connection-bound callback and passes its connection ID
as BLE-PLX's native monitor transaction ID. BLE-PLX 3.5.1 filters native events
by this ID before invoking the callback. `performance.now()` is read immediately
at that callback, before parsing. That library exposes no native receipt clock
or sensor acquisition timestamp; pre-JS latency remains unobservable on this path.

`provenance.test.mjs` exercises old/missing tags, delayed delivery, stale and
out-of-window receipts, separate clock epochs, unavailable clocks, legacy native
binaries and old subscription callbacks. `polarWrapper.test.mjs` executes the
actual wrapper to check native arguments and unchanged event/clock forwarding.

## Verification and remaining limits

On Windows with Node 24, `node --test tests/*.test.mjs` passes **78/78** tests:
the existing 58 acquisition/provenance tests plus 20 guided UX/audio tests. Tests use native doubles, not
compiled Swift/Kotlin or a physical sensor. The valid guided payload test checks
all existing fields; provenance is never added to the assessment API request.

Full Expo TypeScript check: `node node_modules/typescript/bin/tsc --noEmit -p
tsconfig.json` passes with **0 errors** after the authorized typecheck cleanup:
guided/manual upstream-status interpolation now handles undefined, and the
unsupported, unforwarded ViewShot `testID` prop was removed. These were the three
pre-existing errors also reproduced against b4903a8 with the same dependencies.
Dependencies were installed with Yarn 1.22.22, `--ignore-scripts --no-lockfile`;
no dependency versions, lockfiles or production configuration were changed.

Native changes need a future separately authorized build and device validation.
A legacy Polar native binary fails closed, with an explicit compatibility error;
this is not an OTA-only update. Synchronous clock access requires in-process JS
(not the legacy remote Chrome debugger). Validate the actual SDK/native bridge
and clock exports on iPhone and Android. iOS project/SDK registration remains a
separate, unverified build concern. No iOS project was regenerated or built.

Fixed windows apply to validated **receipt** timestamps, not to unexposed sensor
measurement times. Native SDK scheduling latency also precedes the Polar callback.
Delayed delivery may conservatively leave a checkpoint incomplete; it never
causes substitution. Physical measurement-time provenance is not claimed.

No backend, API helper/contract, manual flow, physiological/result formulas,
thresholds, billing, authentication, production/native configuration or Watch
code is changed by this step.

## Guided audio and stage transitions

The guided screen automatically calls the existing `startRecovery` controller
when its fresh eligible reading reaches the unchanged target. The target cue is
scheduled immediately before that call; no audio promise is awaited. The native
receipt clock still defines t=0 and all five fixed windows. Sound does not gate
acquisition, and neither sound status nor UI progress enters the AFE payload.

Seven original PCM assets live in `assets/audio`: rest confirmation, target
success, recovery start, checkpoint, HR180 double-beep, neutral warning and a
subtle action click. Each lasts under half a second. Regenerate these assets with
`node scripts/generate-protocol-cues.mjs` if needed; this is not a build hook.
Checkpoint cues follow confirmed captures only. Warnings interrupt and discard
queued progress sounds. Repeated renders cannot repeat a keyed cue. Players and
queued sounds are released on unmount; backgrounding cancels playback.

`protocolAudio.test.mjs` tests queue ordering, cancellation, native-player doubles,
legacy-module failure, playback errors and WAV integrity. The guided tests cover
automatic target entry, invalid/stale input, confirmed checkpoint cues and payload
preservation with audio unavailable. No native sound output or visual iPhone
rendering has been verified on this Windows host.

`expo-audio` is pinned to **1.1.1**, matching Expo SDK 54's bundled recommendation.
It must be included in the next separately authorized native binary. No config
plugin, recording API, microphone permission request, native bridge or production
configuration was changed. The dependency's Android manifest declares recording
permission by default; an eventual Android build should review that library
permission separately. This task does not alter build configuration.

Full TypeScript check passes with zero errors. ESLint invoked directly over Expo's
default `src`, `app`, and existing `components` scope passes with zero errors and
three pre-existing warnings. The Expo wrapper itself cannot find `npx` on this
host. An additional whole-repository lint scan found 26 pre-existing errors and
seven pre-existing warnings in broader sources/tests/vendor files; those are
outside this UX change. No new lint errors or warnings remain.

Physical iPhone validation remains required for audibility, volume/silent-mode
behavior, headphones/Bluetooth audio routing, interruptions, perceived transition
timing, on-screen layout, and continuous Verity Sense acquisition while cues play.
No push, deployment, prebuild, native build or Watch work was performed for this
audio/UX task.
