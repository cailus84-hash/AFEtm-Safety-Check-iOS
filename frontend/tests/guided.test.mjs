import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { hookHarness } from './hookHarness.mjs';
import { CAPTURE_TIMES, RECOVERY_DURATION } from '../src/hr/acquisition.ts';
import { preserveObservation } from '../src/hr/observation.ts';

// Execute the screen's real event handlers/effects up to its render boundary.
// This verifies payload/submission behavior; it is not a visual/device test.
async function screenFixture() {
  const sensor = hookHarness(true);
  await sensor.render().connect('sensor-a');
  sensor.emit('state', { status: 'connected', id: 'sensor-a', name: 'Verity Sense' });
  let cursor = 0;
  const slots = [], effects = [], timers = new Set(), requests = [], navigation = [];
  let stored = null;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const hooks = {
    useState(value) {
      const i = cursor++;
      slots[i] ??= { value };
      return [slots[i].value, v => { slots[i].value = typeof v === 'function' ? v(slots[i].value) : v; }];
    },
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useCallback(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { fn, deps };
      return slots[i].fn;
    },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: fn(), deps };
      return slots[i].value;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        const old = slots[i]; slots[i] = { deps };
        effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  const router = { replace: path => navigation.push(path), back() {} };
  const i18n = { t: key => key };
  let source = readFileSync(new URL('../app/assessment-flow/guided.tsx', import.meta.url), 'utf8');
  source = source.slice(0, source.indexOf('  // ---------------- Render helpers ----------------'));
  source = source.replace(/^import[\s\S]*?from ['"][^'"]+['"];\r?\n/gm, '')
    .replace('export default function Guided()', 'function Guided()');
  source += '\nreturn { phase, fcpTarget, registerFcr, markPeakAndStart, setPhase, setFactors };\n}\n';
  const Guided = vm.runInNewContext(`(() => { ${stripTypeScriptTypes(source)}; return Guided; })()`, {
    ...hooks, useHeartRateMonitor: sensor.render, useRouter: () => router, useI18n: () => i18n,
    CAPTURE_TIMES, RECOVERY_DURATION, preserveObservation,
    getDeviceId: async () => 'installation-id',
    fetchProfile: async () => ({ age: 40, athlete_id: 7 }),
    createAssessment: async payload => { requests.push(JSON.parse(JSON.stringify(payload))); return { id: 'from-replit', zone: 'SERVER_ONLY' }; },
    UpstreamError: class extends Error {},
    AsyncStorage: { async getItem() { return stored; }, async setItem(_key, value) { stored = value; } },
    Animated: { Value: class {}, timing() {}, sequence: () => ({ start() {} }) },
    Easing: { out() {}, quad() {} },
    setInterval: cb => { timers.add(cb); return cb; }, clearInterval: cb => timers.delete(cb),
    Date, console,
  });
  const render = () => {
    cursor = 0;
    const result = Guided();
    while (effects.length) effects.shift()();
    return result;
  };
  const flush = async () => { for (let i = 0; i < 8; i++) { await Promise.resolve(); render(); } };
  const sample = (time, value) => {
    sensor.tick(time);
    sensor.emit('hr', { id: 'sensor-a', hr: value });
    render();
  };
  const tick = () => { for (const callback of [...timers]) callback(); render(); };
  render(); await flush();
  sample(0, 60);
  render().setPhase('fcr'); render().registerFcr(); render();
  return { render, flush, sample, tick, sensor, requests, navigation, stored: () => stored,
    close() { for (const slot of slots) slot?.cleanup?.(); sensor.unmount(); } };
}

test('guided complete path uses original API fields and server result navigation', async () => {
  const f = await screenFixture();
  assert.equal(f.render().fcpTarget, 144);
  f.sample(20_000, 144);
  f.render().markPeakAndStart(); f.render();
  for (const t of CAPTURE_TIMES) { f.sample(20_000 + t * 1000, 120); f.tick(); }
  assert.equal(f.render().phase, 'factors');
  f.render().setFactors(['none']); f.render();
  f.render().setPhase('submit'); await f.flush();
  assert.equal(f.requests.length, 1);
  const payload = f.requests[0];
  assert.deepEqual(Object.keys(payload).sort(), [
    'device_id', 'fcr', 'age', 'readings', 'factors', 'notes',
    'safety_confirmed', 'safety_confirmed_at', 'ble_device_name',
  ].sort());
  assert.deepEqual(payload.readings, { 0: 144, 60: 120, 90: 120, 120: 120, 150: 120, 180: 120 });
  assert.equal(payload.device_id, 'installation-id');
  assert.equal(payload.fcr, 60);
  assert.equal(payload.age, 40);
  assert.equal(payload.ble_device_name, 'Verity Sense');
  assert.deepEqual(payload.factors, ['none']);
  assert.equal(payload.notes, null);
  assert.equal(payload.safety_confirmed, true);
  assert.ok(Number.isFinite(Date.parse(payload.safety_confirmed_at)));
  assert.deepEqual(f.navigation, ['/assessment/from-replit']);
  f.close();
});

test('guided target-not-reached records observation locally and cannot invoke classification', async () => {
  const f = await screenFixture();
  f.sample(20_000, 143);
  f.render().markPeakAndStart(); await f.flush();
  assert.equal(f.render().phase, 'observation');
  assert.equal(JSON.parse(f.stored())[0].status, 'Observation / Target HR Not Reached');
  assert.equal(f.requests.length, 0);
  // Even an attempted phase bypass cannot bypass the acquisition submission gate.
  f.render().setPhase('submit'); await f.flush();
  assert.equal(f.requests.length, 0);
  assert.equal(f.navigation.length, 0);
  f.close();
});

test('guided missing HR180 blocks submission despite newer live HR', async () => {
  const f = await screenFixture();
  f.sample(20_000, 144);
  f.render().markPeakAndStart(); f.render();
  for (const t of [60, 90, 120, 150]) { f.sample(20_000 + t * 1000, 120); f.tick(); }
  f.sample(201_000, 110); f.tick(); await f.flush();
  assert.equal(f.render().phase, 'incomplete');
  f.render().setPhase('submit'); await f.flush();
  assert.equal(f.requests.length, 0);
  assert.equal(f.navigation.length, 0);
  f.close();
});

test('guided disconnect before target ends attempt without request', async () => {
  const f = await screenFixture();
  f.sensor.emit('state', { id: 'sensor-a', status: 'disconnected' });
  await f.flush();
  assert.equal(f.render().phase, 'incomplete');
  assert.equal(f.requests.length, 0);
  f.close();
});

test('guided delayed timer preserves the original windows', async () => {
  const f = await screenFixture();
  f.sample(20_000, 144);
  f.render().markPeakAndStart(); f.render();
  for (const t of CAPTURE_TIMES) f.sample(20_000 + t * 1000, 120);
  f.sample(210_000, 200); f.tick();
  assert.equal(f.render().phase, 'factors');
  f.render().setFactors(['none']); f.render();
  f.render().setPhase('submit'); await f.flush();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].readings['180'], 120);
  f.close();
});
