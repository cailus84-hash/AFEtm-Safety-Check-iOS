// Deterministic hook/transport harness, not a React Native renderer.
// Executes the real hook with controlled effects and native event callbacks.
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { AcquisitionSession } from '../src/hr/acquisition.ts';

export function hookHarness(polar = true, { nativeEpoch = 0 } = {}) {
  let time = 0, cursor = 0;
  const slots = [], effects = [], intervals = new Set(), events = new Map();
  const listeners = (event) => {
    if (!events.has(event)) events.set(event, new Set());
    return events.get(event);
  };
  const subscribe = (event, callback) => {
    listeners(event).add(callback);
    return { remove: () => listeners(event).delete(callback) };
  };
  const equal = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }];
    },
    useRef(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { current: initial };
      return slots[i];
    },
    useCallback(callback, deps) {
      const i = cursor++;
      if (!slots[i] || !equal(slots[i].deps, deps)) slots[i] = { callback, deps };
      return slots[i].callback;
    },
    useEffect(effect, deps) {
      const i = cursor++;
      if (!slots[i] || !equal(slots[i].deps, deps)) {
        const old = slots[i];
        slots[i] = { deps };
        effects.push(() => { old?.cleanup?.(); slots[i].cleanup = effect(); });
      }
    },
  };
  const calls = { connect: [], disconnect: [], transactions: [], scan: 0 };
  let context = null;
  const native = {
    available: polar,
    provenanceAvailable: true,
    monotonicNow: () => time + nativeEpoch,
    onDevice: cb => subscribe('device', cb), onState: cb => subscribe('state', cb), onHr: cb => subscribe('hr', cb),
    async startScan() { calls.scan++; }, async stopScan() {},
    async connect(id, sessionId, connectionId) { context = { sessionId, connectionId }; calls.connect.push(id); },
    async disconnect(id) { calls.disconnect.push(id); },
  };
  const device = {
    id: 'sensor-a',
    async discoverAllServicesAndCharacteristics() {},
    async cancelConnection() { calls.disconnect.push(device.id); },
    onDisconnected: cb => subscribe('disconnected', cb),
    monitorCharacteristicForService: (_service, _char, cb, transactionId) => {
      calls.transactions.push(transactionId);
      return subscribe('measurement', cb);
    },
  };
  const manager = {
    startDeviceScan(_services, _options, cb) { calls.scan++; subscribe('scan', cb); },
    stopDeviceScan() {},
    async connectToDevice(id) { calls.connect.push(id); return device; },
  };
  let source = readFileSync(new URL('../src/hooks/useHeartRateMonitor.ts', import.meta.url), 'utf8');
  source = source.replace(/^import .* from .*;\r?\n/gm, '').replace(/^export /gm, '');
  const script = stripTypeScriptTypes(source);
  const run = vm.runInNewContext(`(() => { ${script}; return { useHeartRateMonitor, parseHrMeasurement }; })()`, {
    ...react, AcquisitionSession: class extends AcquisitionSession {
      constructor(id, sensor, clock, connectionId) { super(id, sensor, clock, connectionId); }
    }, acquisitionNow: () => time, PolarBle: native,
    AppState: { addEventListener: (_event, cb) => subscribe('appState', cb) },
    PermissionsAndroid: {}, Platform: { OS: 'ios' },
    require: () => ({ BleManager: class { constructor() { return manager; } } }),
    setInterval: cb => { intervals.add(cb); return cb; }, clearInterval: cb => intervals.delete(cb),
    Date, Uint8Array, atob, console,
  });
  const render = () => {
    cursor = 0;
    const result = run.useHeartRateMonitor();
    while (effects.length) effects.shift()();
    return result;
  };
  const emitRaw = (event, ...args) => { for (const cb of [...listeners(event)]) cb(...args); };
  // Existing behavior tests simulate native-stamped envelopes at emission.
  // Provenance tests use emitRaw to supply old, malformed or delayed envelopes.
  const emit = (event, ...args) => {
    if (polar && ['hr', 'state'].includes(event)) args[0] = { ...context, receivedAt: time + nativeEpoch, ...args[0] };
    emitRaw(event, ...args);
  };
  const tick = next => { time = next; for (const cb of intervals) cb(); };
  const unmount = () => { for (const slot of slots) slot?.cleanup?.(); };
  return { render, emit, emitRaw, tick, unmount, calls, native, context: () => ({ ...context }),
    callbacks: event => [...listeners(event)], parse: run.parseHrMeasurement };
}
