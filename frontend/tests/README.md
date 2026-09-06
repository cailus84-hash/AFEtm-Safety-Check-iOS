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

On Windows with Node 24, `node --test tests/*.test.mjs` passes **58/58** tests:
all existing 40 plus 18 provenance/wrapper tests. Tests use native doubles, not
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
