import test from 'node:test';
import assert from 'node:assert/strict';
import { hookHarness } from './hookHarness.mjs';

async function connected(polar) {
  const h = hookHarness(polar);
  await h.render().connect('sensor-a');
  if (polar) h.emit('state', { status: 'connected', id: 'sensor-a', name: 'Verity Sense' });
  return h;
}

for (const polar of [true, false]) {
  const source = polar ? 'Polar' : 'generic BLE';
  const bpm = (h, value, id = 'sensor-a') => polar
    ? h.emit('hr', { id, hr: value })
    : h.emit('measurement', null, { deviceID: id, value: Buffer.from([0, value]).toString('base64') });

  test(`${source}: lock sensor, reject wrong device, preserve live value across rerenders`, async () => {
    const h = await connected(polar);
    bpm(h, 65);
    assert.equal(h.render().hr, 65);
    await h.render().connect('sensor-b');
    assert.deepEqual(h.calls.connect, ['sensor-a']);
    bpm(h, 180, 'sensor-b');
    assert.equal(h.render().hr, 65);
    assert.equal(h.render().acquisition.registerResting(), 65);
    h.unmount();
  });

  test(`${source}: stale display is cleared without another native sample`, async () => {
    const h = await connected(polar);
    bpm(h, 65);
    h.tick(5001);
    assert.equal(h.render().hr, null);
    assert.equal(h.render().acquisition.registerResting(), null);
    h.unmount();
  });

  test(`${source}: disconnect invalidates session; late callback cannot revive it`, async () => {
    const h = await connected(polar);
    bpm(h, 65);
    const callback = h.callbacks(polar ? 'hr' : 'measurement')[0];
    if (polar) h.emit('state', { status: 'disconnected', id: 'sensor-a' });
    else h.emit('disconnected');
    assert.equal(h.render().hr, null);
    assert.equal(h.render().connectedDevice, null);
    assert.equal(h.render().acquisition.status, 'incomplete');
    if (polar) callback({ id: 'sensor-a', hr: 180 });
    else callback(null, { deviceID: 'sensor-a', value: Buffer.from([0, 180]).toString('base64') });
    assert.equal(h.render().hr, null);
    await h.render().connect('sensor-a');
    assert.deepEqual(h.calls.connect, ['sensor-a']);
    h.unmount();
  });

  test(`${source}: unmount removes subscriptions and closes old callbacks`, async () => {
    const h = await connected(polar);
    const session = h.render().acquisition;
    h.unmount();
    assert.equal(session.status, 'closed');
    assert.equal(h.callbacks(polar ? 'hr' : 'measurement').length, 0);
    assert.ok(h.calls.disconnect.includes('sensor-a'));
  });

  test(`${source}: background event invalidates acquisition synchronously`, async () => {
    const h = await connected(polar);
    bpm(h, 65);
    h.emit('appState', 'background');
    assert.equal(h.render().acquisition.status, 'incomplete');
    assert.equal(h.render().hr, null);
    h.unmount();
  });
}

test('Polar: samples before connection confirmation and no-contact events are rejected', async () => {
  const h = hookHarness(true);
  await h.render().connect('sensor-a');
  h.emit('hr', { id: 'sensor-a', hr: 80 });
  assert.equal(h.render().hr, null);
  h.emit('state', { status: 'connected', id: 'sensor-a' });
  h.emit('hr', { id: 'sensor-a', hr: 80, contactStatusSupported: true, contactStatus: false });
  assert.equal(h.render().hr, null);
  h.emit('state', { status: 'bt-off' });
  assert.equal(h.render().acquisition.status, 'incomplete');
  h.unmount();
});

test('generic parser preserves 8-bit/16-bit BPM decoding and rejects truncated data', () => {
  const h = hookHarness(false);
  assert.equal(h.parse(Buffer.from([0, 72]).toString('base64')), 72);
  assert.equal(h.parse(Buffer.from([1, 44, 1]).toString('base64')), 300);
  assert.equal(h.parse(Buffer.from([1, 44]).toString('base64')), null);
  assert.equal(h.parse('!'), null);
});

test('Polar: asynchronous scan error is surfaced and listeners are cleaned up', async () => {
  const h = hookHarness(true);
  await h.render().startScan();
  h.emit('state', { status: 'scan-error', message: 'scan failed' });
  await Promise.resolve();
  assert.equal(h.render().status, 'error');
  assert.equal(h.render().error, 'scan failed');
  assert.equal(h.callbacks('device').length, 0);
  assert.equal(h.callbacks('state').length, 0);
  h.unmount();
});

test('Polar: concurrent scan starts do not multiply subscriptions', async () => {
  const h = hookHarness(true);
  const hook = h.render();
  await Promise.all([hook.startScan(), hook.startScan()]);
  assert.equal(h.calls.scan, 1);
  assert.equal(h.callbacks('device').length, 1);
  h.unmount();
});
