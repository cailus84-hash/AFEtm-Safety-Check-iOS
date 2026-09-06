import test from 'node:test';
import assert from 'node:assert/strict';
import { AcquisitionSession, CAPTURE_TIMES, LIVE_SAMPLE_MAX_AGE_MS } from '../src/hr/acquisition.ts';
import { preserveObservation, OBSERVATION_KEY } from '../src/hr/observation.ts';

function fixture() {
  let now = 0;
  const session = new AcquisitionSession('session-a', 'sensor-a', () => now);
  session.markConnected();
  const sample = (bpm, time = now, overrides = {}) => {
    now = time;
    return session.accept({ sessionId: session.id, connectionId: session.connectionId, deviceId: session.deviceId, bpm, receivedAt: time, ...overrides });
  };
  sample(60);
  assert.equal(session.registerResting(), 60);
  const setTime = time => { now = time; };
  const start = (bpm = 150) => { sample(bpm, 20_000); return session.startRecovery(150); };
  const complete = () => {
    start();
    for (const t of CAPTURE_TIMES) {
      sample(120 - t / 30, 20_000 + t * 1000);
      session.advance();
    }
  };
  return { session, sample, setTime, start, complete };
}

async function cannotClassify(session) {
  let requests = 0;
  await assert.rejects(session.submit(async () => { requests++; return { zone: 'SERVER_RESULT' }; }), /INCOMPLETE_ACQUISITION/);
  assert.equal(requests, 0, 'invalid attempts must never call the classifier transport');
}

test('target reached exactly anchors recovery with the measured sample', () => {
  const f = fixture();
  assert.equal(f.start(150), 'started');
  assert.equal(f.session.captured['0'], 150);
  assert.equal(f.session.elapsed, 0);
});

test('target exceeded is eligible', () => {
  const f = fixture();
  assert.equal(f.start(151), 'started');
  assert.equal(f.session.captured['0'], 151);
});

test('target not reached is terminal observation, with no classification or later revival', async () => {
  const f = fixture();
  assert.equal(f.start(149), 'observation');
  assert.equal(f.session.status, 'observation');
  assert.equal(f.session.failureReason, 'target-not-reached');
  assert.equal(f.sample(170, 21_000), false);
  assert.deepEqual(f.session.captured, {});
  f.session.invalidate('disconnected');
  assert.equal(f.session.status, 'observation');
  await cannotClassify(f.session);
});

test('disconnect before target clears live data and prevents recovery', async () => {
  const f = fixture();
  f.sample(150, 20_000);
  f.session.invalidate('disconnected');
  assert.equal(f.session.freshSample(), null);
  assert.equal(f.session.startRecovery(150), 'incomplete');
  assert.equal(f.sample(180, 21_000), false);
  assert.equal(f.session.markConnected(), false);
  await cannotClassify(f.session);
});

test('disconnect during recovery cannot resume or submit retained data', async () => {
  const f = fixture();
  f.start();
  f.sample(120, 80_000);
  f.session.advance();
  f.session.invalidate('disconnected');
  assert.equal(f.session.freshSample(), null);
  f.setTime(200_000);
  f.session.advance();
  assert.equal(f.session.status, 'incomplete');
  await cannotClassify(f.session);
});

test('stale HR cannot establish resting HR or target eligibility', async () => {
  const f = fixture();
  f.sample(150, 20_000);
  f.setTime(20_000 + LIVE_SAMPLE_MAX_AGE_MS + 1);
  assert.equal(f.session.freshSample(), null);
  assert.equal(f.session.registerResting(), null);
  assert.equal(f.session.startRecovery(150), 'incomplete');
  await cannotClassify(f.session);
});

for (const missing of CAPTURE_TIMES) {
  test(`missing HR${missing} is incomplete, never peak/current/zero substitution`, async () => {
    const f = fixture();
    f.start();
    for (const t of CAPTURE_TIMES) {
      if (t !== missing) f.sample(120, 20_000 + t * 1000);
    }
    f.setTime(210_000);
    f.session.advance();
    assert.equal(f.session.status, 'incomplete');
    assert.equal(f.session.captured[String(missing)], undefined);
    await cannotClassify(f.session);
  });
}

test('delayed callback uses all five original windows, never the latest reading', async () => {
  const f = fixture();
  f.start();
  for (const [i, t] of CAPTURE_TIMES.entries()) {
    f.sample(120 + i, 20_000 + (t - 5) * 1000);
    f.sample(122 + i, 20_000 + t * 1000);
  }
  f.sample(200, 201_000); // outside the HR180 window
  f.setTime(210_000);
  f.session.advance();
  assert.deepEqual(f.session.captured, { 0: 150, 60: 121, 90: 122, 120: 123, 150: 124, 180: 125 });
  assert.equal(f.session.status, 'complete');
});

test('both window boundaries are included; samples just outside are excluded', () => {
  const f = fixture();
  f.start();
  f.sample(200, 74_999);
  f.sample(110, 75_000);
  f.sample(120, 80_000);
  f.sample(200, 80_001);
  f.session.advance();
  assert.equal(f.session.captured['60'], 115);
});

test('captured checkpoints cannot be changed by later readings or consumer mutation', () => {
  const f = fixture();
  f.start();
  f.sample(120, 80_000);
  f.session.advance();
  assert.throws(() => { f.session.captured['60'] = 200; }, TypeError);
  f.sample(200, 81_000);
  f.session.advance();
  assert.equal(f.session.captured['60'], 120);
});

test('wrong sensor and wrong session samples are rejected', () => {
  const f = fixture();
  assert.equal(f.sample(180, 20_000, { deviceId: 'sensor-b' }), false);
  assert.equal(f.sample(180, 20_000, { sessionId: 'session-old' }), false);
  assert.equal(f.session.freshSample(), null);
});

test('non-numeric, zero, nonfinite, fractional, future and out-of-order samples are rejected', () => {
  const f = fixture();
  for (const bpm of [0, NaN, Infinity, '150', 150.5]) assert.equal(f.sample(bpm), false);
  assert.equal(f.sample(150, 0, { receivedAt: 1 }), false);
  f.sample(150, 20_000);
  assert.equal(f.sample(140, 20_001, { receivedAt: 19_999 }), false);
});

test('closing a session clears history and captures; new session starts empty', () => {
  const f = fixture();
  f.complete();
  f.session.close();
  assert.deepEqual(f.session.captured, {});
  assert.equal(f.session.fcr, null);
  assert.equal(f.session.freshSample(), null);
  const next = new AcquisitionSession('session-b', 'sensor-a', () => 210_000);
  next.markConnected();
  assert.equal(next.registerResting(), null);
  assert.equal(next.accept({ sessionId: 'session-a', deviceId: 'sensor-a', receivedAt: 210_000, bpm: 150 }), false);
});

test('complete assessment submits only the original acquisition fields once', async () => {
  const f = fixture();
  f.complete();
  let requests = 0;
  const result = await f.session.submit(async data => {
    requests++;
    assert.deepEqual(data, { fcr: 60, readings: { 0: 150, 60: 118, 90: 117, 120: 116, 150: 115, 180: 114 } });
    return { id: 'server-assessment', zone: 'SERVER_RESULT' };
  });
  assert.equal(result.zone, 'SERVER_RESULT');
  assert.equal(requests, 1);
  await cannotClassify(f.session);
});

test('disconnect between completion and submit blocks the API', async () => {
  const f = fixture();
  f.complete();
  f.session.invalidate('disconnected');
  await cannotClassify(f.session);
});

test('background interruption blocks submission', async () => {
  const f = fixture();
  f.start();
  f.session.invalidate('app-not-active');
  await cannotClassify(f.session);
});

test('local observation log is bounded, deduplicated, and has no result fields', async () => {
  let raw = null;
  const storage = {
    async getItem(key) { assert.equal(key, OBSERVATION_KEY); return raw; },
    async setItem(key, value) { assert.equal(key, OBSERVATION_KEY); raw = value; },
  };
  const record = {
    session_id: 'a', sensor_id: 'sensor-a', timestamp: '2026-09-06T00:00:00Z',
    status: 'Observation / Target HR Not Reached', target_hr: 150, measured_hr: 149,
  };
  for (let i = 0; i < 25; i++) await preserveObservation(storage, { ...record, session_id: String(i) });
  await preserveObservation(storage, { ...record, session_id: '24' });
  const saved = JSON.parse(raw);
  assert.equal(saved.length, 20);
  assert.equal(saved.filter(s => s.session_id === '24').length, 1);
  assert.equal(saved[0].status, record.status);
  assert.equal('zone' in saved[0], false);
});
