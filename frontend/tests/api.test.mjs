import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const stripTypeScriptTypes = source => ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

function apiFixture(response) {
  const calls = [];
  const storage = new Map();
  const AsyncStorage = {
    async getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    async setItem(key, value) { storage.set(key, value); },
  };
  const source = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const api = vm.runInNewContext(stripTypeScriptTypes(source) + '\n({ createAssessment, listAssessments, getAssessment, resyncAssessment, normalizeAssessment, readLocalAssessmentHistory, LOCAL_ASSESSMENT_HISTORY_KEY, UpstreamError })', {
    process: { env: { EXPO_PUBLIC_BACKEND_URL: 'https://backend.invalid' } },
    fetch: async (url, options) => { calls.push({ url, options }); return response; },
    AsyncStorage,
  });
  return { ...api, calls, storage };
}

test('mobile assessment request and authoritative response are unchanged', async () => {
  const result = { id: 'saved', zone: 'GREEN', calc_source: 'authoritative' };
  const api = apiFixture({ ok: true, status: 200, json: async () => result });
  const payload = { device_id: 'test', age: 40, fcr: 60,
    readings: { 0: 150, 60: 125, 90: 115, 120: 105, 150: 95, 180: 85 },
    factors: ['none'], notes: null, safety_confirmed: true,
    safety_confirmed_at: '2026-09-10T12:00:00Z', ble_device_name: 'Polar Verity Sense' };
  assert.deepEqual(await api.createAssessment(payload), api.normalizeAssessment(result));
  assert.equal(api.calls[0].url, 'https://backend.invalid/api/assessments');
  assert.equal(api.calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(api.calls[0].options.body), payload);
});

test('authoritative assessment result is saved as a local display snapshot unchanged', async () => {
  const result = {
    id: 'saved',
    device_id: 'device',
    created_at: '2026-09-13T12:00:00Z',
    zone: 'BLUE',
    pattern: 'NORMAL',
    action: 'Existing stored recommendation',
    fcr: 74,
    age: 40,
    readings: { 0: 159, 60: 120, 90: 110, 120: 100, 150: 95, 180: 90 },
    fcp_target: 143,
    hr_peak: 159,
    hrr: 39,
    recpct: 82.4,
    aurc: 2500,
    tau: 44,
    fcpv: { sleep: 0, hydration: 1, symptoms: 0, recent_illness: 0, subjective_load: 1 },
    fcpv_total: 2,
    context_flag: false,
    factors: ['none'],
    notes: 'stored note',
    calc_source: 'authoritative',
  };
  const api = apiFixture({ ok: true, status: 200, json: async () => result });
  const saved = await api.createAssessment({ device_id: 'device', age: 40, fcr: 74, readings: result.readings, factors: ['none'] });
  const local = await api.readLocalAssessmentHistory();
  assert.deepEqual(JSON.parse(JSON.stringify(local)), JSON.parse(JSON.stringify([saved])));
  assert.equal(local[0].hr_peak, 159);
  assert.equal(local[0].recpct, 82.4);
  assert.equal(local[0].readings['0'], 159);
});

test('assessment list falls back to local saved snapshots when backend history is unavailable', async () => {
  const api = apiFixture({ ok: true, status: 200, json: async () => ({ id: 'local', created_at: '2026-09-13T12:00:00Z', recpct: 82.4 }) });
  await api.createAssessment({ device_id: 'device', age: 40, fcr: 74, readings: {}, factors: ['none'] });
  api.calls.length = 0;
  const failingListApi = {
    ...api,
  };
  const source = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const restored = vm.runInNewContext(stripTypeScriptTypes(source) + '\n({ listAssessments, readLocalAssessmentHistory })', {
    process: { env: { EXPO_PUBLIC_BACKEND_URL: 'https://backend.invalid' } },
    fetch: async () => ({ ok: false, status: 500, text: async () => 'offline' }),
    AsyncStorage: {
      async getItem(key) { return api.storage.has(key) ? api.storage.get(key) : null; },
      async setItem(key, value) { api.storage.set(key, value); },
    },
  });
  const list = await restored.listAssessments('device');
  assert.equal(failingListApi.calls.length, 0);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'local');
  assert.equal(list[0].recpct, 82.4);
});

test('server history merges with local snapshots, backfills old records, and prevents duplicates', async () => {
  const first = apiFixture({ ok: true, status: 200, json: async () => ({ id: 'same', created_at: '2026-09-13T12:00:00Z', recpct: 80 }) });
  await first.createAssessment({ device_id: 'device', age: 40, fcr: 74, readings: {}, factors: ['none'] });
  const source = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const updated = vm.runInNewContext(stripTypeScriptTypes(source) + '\n({ listAssessments, readLocalAssessmentHistory })', {
    process: { env: { EXPO_PUBLIC_BACKEND_URL: 'https://backend.invalid' } },
    fetch: async () => ({ ok: true, status: 200, json: async () => [
      { id: 'same', created_at: '2026-09-13T12:00:00Z', recpct: 82.4 },
      { id: 'server-old', created_at: '2026-09-12T12:00:00Z', zone: 'GREEN', recpct: 77.7 },
    ] }),
    AsyncStorage: {
      async getItem(key) { return first.storage.has(key) ? first.storage.get(key) : null; },
      async setItem(key, value) { first.storage.set(key, value); },
    },
  });
  const list = await updated.listAssessments('device');
  const local = await updated.readLocalAssessmentHistory();
  assert.equal(list.length, 2);
  assert.equal(local.length, 2);
  assert.equal(list.filter((item) => item.id === 'same').length, 1);
  assert.equal(local.filter((item) => item.id === 'same').length, 1);
  assert.equal(list.find((item) => item.id === 'same').recpct, 82.4);
  assert.equal(local.find((item) => item.id === 'server-old').recpct, 77.7);
});

test('offline history opens from cache after the first successful server sync', async () => {
  const storage = new Map();
  const source = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const synced = vm.runInNewContext(stripTypeScriptTypes(source) + '\n({ listAssessments, readLocalAssessmentHistory })', {
    process: { env: { EXPO_PUBLIC_BACKEND_URL: 'https://backend.invalid' } },
    fetch: async () => ({ ok: true, status: 200, json: async () => [{ id: 'server-old', created_at: '2026-09-12T12:00:00Z', zone: 'GREEN', recpct: 77.7 }] }),
    AsyncStorage: {
      async getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      async setItem(key, value) { storage.set(key, value); },
    },
  });
  assert.equal((await synced.listAssessments('device'))[0].id, 'server-old');
  const offline = vm.runInNewContext(stripTypeScriptTypes(source) + '\n({ listAssessments })', {
    process: { env: { EXPO_PUBLIC_BACKEND_URL: 'https://backend.invalid' } },
    fetch: async () => ({ ok: false, status: 503, text: async () => 'offline' }),
    AsyncStorage: {
      async getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      async setItem(key, value) { storage.set(key, value); },
    },
  });
  const cached = await offline.listAssessments('device');
  assert.equal(cached.length, 1);
  assert.equal(cached[0].id, 'server-old');
  assert.equal(cached[0].recpct, 77.7);
});

test('assessment normalizer extracts stored scalars without recalculation', async () => {
  const raw = {
    id: 'saved',
    device_id: 'device',
    fcr: '60',
    age: 40,
    readings: { 0: 159, 60: '120', 90: { value: 110 }, 120: 100, 150: 95, 180: 90 },
    fcp_target: 143,
    hr_peak: { value: 159 },
    hrr: { hrr: 39 },
    recpct: { value: 82.4 },
    aurc: { aurc: 2500 },
    tau: { tau: 44 },
    pattern: 'NORMAL',
    zone: 'Blue',
    action: { en: 'Existing stored recommendation' },
    fcpv: undefined,
    fcpv_total: { value: 2 },
    context_flag: false,
    created_at: '2026-09-13T12:00:00Z',
    calc_source: 'authoritative',
  };
  const api = apiFixture({ ok: true, status: 200, json: async () => raw });
  const normalized = await api.getAssessment('saved', 'device');
  assert.equal(normalized.recpct, 82.4);
  assert.equal(normalized.action, 'Existing stored recommendation');
  assert.equal(normalized.zone, 'BLUE');
  assert.equal(normalized.hr_peak, 159);
  assert.equal(normalized.readings['90'], 110);
  assert.equal(normalized.fcpv, null);
});

test('assessment list and resync normalize malformed runtime payloads', async () => {
  const raw = { id: 'saved', recpct: { value: 82.4 }, action: { en: 'Existing stored recommendation' } };
  const listApi = apiFixture({ ok: true, status: 200, json: async () => [raw] });
  assert.equal((await listApi.listAssessments('device'))[0].recpct, 82.4);
  const resyncApi = apiFixture({ ok: true, status: 200, json: async () => raw });
  assert.equal((await resyncApi.resyncAssessment('saved', 'device')).action, 'Existing stored recommendation');
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
