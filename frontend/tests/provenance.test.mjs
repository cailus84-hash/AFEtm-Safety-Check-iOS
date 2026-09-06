import test from 'node:test';
import assert from 'node:assert/strict';
import { hookHarness } from './hookHarness.mjs';

async function polar(options) {
  const h = hookHarness(true, options);
  await h.render().connect('sensor-a');
  h.emit('state', { id: 'sensor-a', status: 'connected' });
  return h;
}
function recovery(h) {
  h.emit('hr', { id: 'sensor-a', hr: 60 });
  const session = h.render().acquisition;
  assert.equal(session.registerResting(), 60);
  h.tick(20_000);
  h.emit('hr', { id: 'sensor-a', hr: 150 });
  assert.equal(session.startRecovery(150), 'started');
  return session;
}
function envelope(h, receivedAt, extra = {}) {
  return { ...h.context(), id: 'sensor-a', hr: 110, receivedAt, ...extra };
}

for (const field of ['sessionId', 'connectionId']) {
  test(`Polar rejects an old ${field} for HR, contact loss and disconnect events`, async () => {
    const h = await polar();
    h.emit('hr', { id: 'sensor-a', hr: 65 });
    const old = envelope(h, 0, { [field]: 'previous', contactStatusSupported: true, contactStatus: false });
    h.emitRaw('hr', old);
    h.emitRaw('state', { ...old, status: 'disconnected' });
    assert.equal(h.render().hr, 65);
    assert.equal(h.render().status, 'connected');
    h.unmount();
  });
}

for (const field of ['sessionId', 'connectionId', 'receivedAt']) {
  test(`Polar rejects an envelope missing ${field}`, async () => {
    const h = await polar();
    const event = envelope(h, 0);
    delete event[field];
    h.emitRaw('hr', event);
    assert.equal(h.render().hr, null);
    h.unmount();
  });
}

test('Polar recovery and receipts share native uptime, not the JS clock epoch', async () => {
  const epoch = 9_000_000;
  const h = await polar({ nativeEpoch: epoch });
  const session = recovery(h);
  assert.equal(session.freshSample().receivedAt, epoch + 20_000);
  assert.equal(session.freshSample().connectionId, session.connectionId);
  for (const seconds of [60, 90, 120, 150, 180]) {
    h.tick(20_000 + seconds * 1000);
    h.emit('hr', { id: 'sensor-a', hr: 110 });
    session.advance();
  }
  assert.equal(session.status, 'complete');
  assert.equal(session.elapsed, 180);
  const result = await session.submit(async payload => payload);
  assert.deepEqual(Object.keys(result).sort(), ['fcr', 'readings']);
  assert.deepEqual(Object.keys(result.readings), ['0', '60', '90', '120', '150', '180']);
  h.unmount();
});

test('receipt before HR60 window cannot be moved into the window by delayed JS delivery', async () => {
  const h = await polar();
  const session = recovery(h);
  h.tick(76_000);
  h.emitRaw('hr', envelope(h, 74_999));
  assert.equal(session.freshSample().receivedAt, 74_999);
  h.tick(80_000);
  session.advance();
  assert.equal(session.failureReason, 'missing-checkpoint-60');
  let requests = 0;
  await assert.rejects(session.submit(async () => { requests++; return { zone: 'NEVER' }; }), /INCOMPLETE/);
  assert.equal(requests, 0);
  h.unmount();
});

test('eligible delayed delivery retains the exact native receipt timestamp', async () => {
  const h = await polar();
  const session = recovery(h);
  h.tick(79_000);
  h.emitRaw('hr', envelope(h, 75_000));
  assert.equal(session.freshSample().receivedAt, 75_000);
  h.tick(80_000);
  session.advance();
  assert.equal(session.captured['60'], 110);
  h.tick(81_000);
  h.emitRaw('hr', envelope(h, 80_000, { hr: 99 }));
  session.advance();
  assert.equal(session.captured['60'], 110, 'captured values remain immutable');
  h.unmount();
});

test('native receipt after the window is never backdated into HR60', async () => {
  const h = await polar();
  const session = recovery(h);
  h.tick(82_000);
  h.emitRaw('hr', envelope(h, 80_001));
  session.advance();
  assert.equal(session.failureReason, 'missing-checkpoint-60');
  h.unmount();
});

test('stale native delivery is rejected even if its receipt was inside the window', async () => {
  const h = await polar();
  const session = recovery(h);
  h.tick(81_000);
  h.emitRaw('hr', envelope(h, 75_000));
  assert.equal(h.render().hr, null);
  session.advance();
  assert.equal(session.status, 'incomplete');
  h.unmount();
});

test('unavailable native clock clears live HR and fails recovery closed', async () => {
  const h = await polar();
  const session = recovery(h);
  h.native.monotonicNow = () => NaN;
  h.tick(21_000);
  assert.equal(h.render().hr, null);
  session.advance();
  assert.equal(session.failureReason, 'receipt-clock-unavailable');
  h.unmount();
});

test('legacy native binary is rejected rather than accepting untagged Polar events', async () => {
  const h = hookHarness(true);
  h.native.provenanceAvailable = false;
  await h.render().connect('sensor-a');
  assert.equal(h.calls.connect.length, 0);
  assert.equal(h.render().acquisition.status, 'incomplete');
  assert.match(h.render().error, /provenance/);
  h.unmount();
});

test('old connection callback cannot revive a session after a new same-device attempt', async () => {
  for (const isPolar of [true, false]) {
    const old = isPolar ? await polar() : hookHarness(false);
    if (!isPolar) await old.render().connect('sensor-a');
    const callback = old.callbacks(isPolar ? 'hr' : 'measurement')[0];
    const previous = old.render().acquisition;
    const oldEnvelope = envelope(old, 0);
    old.unmount();
    const next = isPolar ? await polar() : hookHarness(false);
    if (!isPolar) await next.render().connect('sensor-a');
    if (isPolar) callback(oldEnvelope);
    else callback(null, { deviceID: 'sensor-a', value: Buffer.from([0, 180]).toString('base64') });
    assert.equal(previous.status, 'closed');
    assert.equal(next.render().hr, null);
    next.unmount();
  }
});

test('generic BLE uses its connection transaction and first exposed monotonic callback receipt', async () => {
  const h = hookHarness(false);
  await h.render().connect('sensor-a');
  h.tick(1234);
  h.emit('measurement', null, { deviceID: 'sensor-a', value: Buffer.from([0, 80]).toString('base64') });
  const session = h.render().acquisition;
  const sample = session.freshSample();
  assert.equal(h.calls.transactions[0], session.connectionId);
  assert.equal(sample.receivedAt, 1234);
  assert.equal(sample.sessionId, session.id);
  assert.equal(sample.connectionId, session.connectionId);
  assert.equal(session.accept({ ...sample, connectionId: 'old' }), false);
  assert.equal(session.accept({ ...sample, connectionId: undefined }), false);
  h.unmount();
});
