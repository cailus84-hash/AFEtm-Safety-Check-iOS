import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

function wrapper(native) {
  const listeners = new Map();
  const source = readFileSync(new URL('../src/native/PolarBle.ts', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export default PolarBle;\r?\n?/gm, '').replace(/^export /gm, '');
  const api = vm.runInNewContext(`(() => { ${stripTypeScriptTypes(source)}; return PolarBle; })()`, {
    NativeModules: { PolarBleModule: native }, Platform: { OS: 'ios' },
    NativeEventEmitter: class {
      addListener(name, fn) { listeners.set(name, fn); return { remove: () => listeners.delete(name) }; }
    },
  });
  return { api, emit: (name, event) => listeners.get(name)?.(event) };
}

test('wrapper passes immutable device/session/connection arguments to native connect and cleanup', async () => {
  const calls = [];
  const { api } = wrapper({ monotonicNow: () => 123,
    connectSession: (...args) => calls.push(['connect', ...args]),
    disconnectSession: (...args) => calls.push(['disconnect', ...args]),
  });
  await api.connect('device', 'session', 'connection');
  await api.disconnect('device', 'session', 'connection');
  assert.deepEqual(calls, [['connect', 'device', 'session', 'connection'], ['disconnect', 'device', 'session', 'connection']]);
  assert.equal(api.provenanceAvailable, true);
});

test('wrapper forwards native receipt and identity without retimestamping or relabeling', () => {
  const w = wrapper({});
  const original = { id: 'old-device', sessionId: 'old-session', connectionId: 'old-connection', receivedAt: 17, hr: 80 };
  let received;
  w.api.onHr(event => { received = event; });
  w.emit('polar-hr', original);
  assert.equal(received, original);
});

test('wrapper exposes the exact native clock and never falls back for invalid clock values', () => {
  let value = 91234.567;
  const { api } = wrapper({ monotonicNow: () => value });
  assert.equal(api.monotonicNow(), value);
  for (value of [NaN, Infinity, undefined, null, '123', -1]) assert.ok(Number.isNaN(api.monotonicNow()));
  assert.ok(Number.isNaN(wrapper({ monotonicNow() { throw new Error('unavailable'); } }).api.monotonicNow()));
});

test('wrapper detects legacy and absent binaries without using the old untagged native connect', async () => {
  let calls = 0;
  const legacy = wrapper({ connect() { calls++; } }).api;
  assert.equal(legacy.available, true);
  assert.equal(legacy.provenanceAvailable, false);
  await assert.rejects(legacy.connect('d', 's', 'c'), /provenance/);
  assert.equal(calls, 0);
  assert.equal(wrapper(undefined).api.available, false);
});
