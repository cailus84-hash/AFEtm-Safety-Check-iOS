import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

function apiFixture(response) {
  const calls = [];
  const source = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const api = vm.runInNewContext(stripTypeScriptTypes(source) + '\n({ createAssessment, UpstreamError })', {
    process: { env: { EXPO_PUBLIC_BACKEND_URL: 'https://backend.invalid' } },
    fetch: async (url, options) => { calls.push({ url, options }); return response; },
  });
  return { ...api, calls };
}

test('mobile assessment request and authoritative response are unchanged', async () => {
  const result = { id: 'saved', zone: 'GREEN', calc_source: 'authoritative' };
  const api = apiFixture({ ok: true, status: 200, json: async () => result });
  const payload = { device_id: 'test', age: 40, fcr: 60,
    readings: { 0: 150, 60: 125, 90: 115, 120: 105, 150: 95, 180: 85 },
    factors: ['none'], notes: null, safety_confirmed: true,
    safety_confirmed_at: '2026-09-10T12:00:00Z', ble_device_name: 'Polar Verity Sense' };
  assert.equal(await api.createAssessment(payload), result);
  assert.equal(api.calls[0].url, 'https://backend.invalid/api/assessments');
  assert.equal(api.calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(api.calls[0].options.body), payload);
});

test('missing checkpoint validation displays its message', async () => {
  const api = apiFixture({ ok: false, status: 400, text: async () => JSON.stringify({ detail: 'Missing HR150' }) });
  await assert.rejects(api.createAssessment({}), { message: 'Missing HR150' });
});

test('invalid HR validation displays the field and explanation', async () => {
  const api = apiFixture({ ok: false, status: 422, text: async () => JSON.stringify({ detail: [
    { loc: ['body', 'readings', '180'], msg: 'Input should be greater than 0' },
  ] }) });
  await assert.rejects(api.createAssessment({}), { message: 'readings.180: Input should be greater than 0' });
});

test('Replit failure remains a structured upstream error without a result', async () => {
  const api = apiFixture({ ok: false, status: 424, text: async () => JSON.stringify({ detail: {
    code: 'AUTHORITATIVE_UPSTREAM_ERROR', message: 'Assessment was not saved',
    upstream_status: 500, upstream_body: '{"message":"Internal server error"}',
  } }) });
  await assert.rejects(api.createAssessment({}), error => {
    assert.ok(error instanceof api.UpstreamError);
    assert.equal(error.status, 424);
    assert.equal(error.upstream_status, 500);
    return true;
  });
});
