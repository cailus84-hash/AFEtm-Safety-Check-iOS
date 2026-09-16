import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = 'afetm.device_id';
export const LOCAL_ASSESSMENT_HISTORY_KEY = 'afetm.local_assessment_history';

function generateId(): string {
  // RFC4122 v4 lite; sufficient as a device identifier
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = generateId();
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;

export type Profile = {
  device_id: string;
  name: string;
  age: number;
  weight: number;
  sport: string;
  target_zone?: 'BLUE' | 'GREEN' | null;
  athlete_id?: number | null;    // Official AFEtm numeric athleteId
  terms_accepted_at?: string | null;
  terms_version?: string | null;
  updated_at?: string;
};

export type FCPv = {
  sleep: number;
  hydration: number;
  symptoms: number;
  recent_illness: number;
  subjective_load: number;
};
type SafeNumber = number | null;

/**
 * Official AFEtm contextual interview factor keys.
 * The mobile UI exposes these as multi-select toggles; "none" is exclusive.
 */
export const CONTEXT_FACTORS = [
  'illness',
  'sleep',
  'training',
  'dehydration',
  'medication',
  'pain',
  'stimulants',
  'none',
] as const;
export type ContextFactor = (typeof CONTEXT_FACTORS)[number];
export const CONTEXT_NOTES_MAX = 2000;

export type Assessment = {
  id: string;
  device_id: string;
  fcr: SafeNumber;
  age: SafeNumber;
  readings: Record<string, SafeNumber>;
  fcp_target: SafeNumber;
  hr_peak: SafeNumber;
  hrr: SafeNumber;
  recpct: SafeNumber;
  aurc: SafeNumber;
  tau: SafeNumber;
  pattern: 'RAPID' | 'NORMAL' | 'DELAYED' | 'FLATTENED' | 'UNSTABLE' | null;
  zone: 'BLUE' | 'GREEN' | 'YELLOW' | 'RED' | null;
  action: string | null;
  fcpv: FCPv | null;
  fcpv_total: SafeNumber;
  context_flag: boolean;
  factors?: ContextFactor[];
  notes?: string | null;
  context_interview_id?: string | null;
  created_at: string;
  calc_source?: 'authoritative' | 'pending';
  calc_notice?: string | null;
};

const NUMERIC_KEYS = ['value', 'result', 'pct', 'percentage', 'recpct', 'hrr', 'aurc', 'tau'] as const;
const TEXT_KEYS = ['text', 'label', 'message', 'en', 'es', 'value'] as const;
const READING_TIMES = ['0', '60', '90', '120', '150', '180'] as const;

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of NUMERIC_KEYS) {
      const n = finiteNumber(record[key]);
      if (n !== null) return n;
    }
  }
  return null;
}

function textValue(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of TEXT_KEYS) {
      const text = textValue(record[key]);
      if (text !== null) return text;
    }
  }
  return null;
}

function normalizeZone(value: unknown): Assessment['zone'] {
  const text = textValue(value)?.trim().toUpperCase();
  if (text === 'BLUE' || text === 'GREEN' || text === 'YELLOW' || text === 'RED') return text;
  return null;
}

function normalizePattern(value: unknown): Assessment['pattern'] {
  const text = textValue(value)?.trim().toUpperCase();
  if (text === 'RAPID' || text === 'NORMAL' || text === 'DELAYED' || text === 'FLATTENED' || text === 'UNSTABLE') return text;
  return null;
}

function normalizeReadings(value: unknown): Record<string, SafeNumber> {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return Object.fromEntries(READING_TIMES.map((time) => [time, finiteNumber(record[time])])) as Record<string, SafeNumber>;
}

function normalizeFcpv(value: unknown): FCPv | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const fcpv = {
    sleep: finiteNumber(record.sleep),
    hydration: finiteNumber(record.hydration),
    symptoms: finiteNumber(record.symptoms),
    recent_illness: finiteNumber(record.recent_illness),
    subjective_load: finiteNumber(record.subjective_load),
  };
  return Object.values(fcpv).every((v) => v !== null) ? fcpv as FCPv : null;
}

export function normalizeAssessment(raw: unknown): Assessment {
  const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    ...(record as Partial<Assessment>),
    id: textValue(record.id) ?? '',
    device_id: textValue(record.device_id) ?? '',
    fcr: finiteNumber(record.fcr),
    age: finiteNumber(record.age),
    readings: normalizeReadings(record.readings),
    fcp_target: finiteNumber(record.fcp_target),
    hr_peak: finiteNumber(record.hr_peak),
    hrr: finiteNumber(record.hrr),
    recpct: finiteNumber(record.recpct),
    aurc: finiteNumber(record.aurc),
    tau: finiteNumber(record.tau),
    pattern: normalizePattern(record.pattern),
    zone: normalizeZone(record.zone),
    action: textValue(record.action),
    fcpv: normalizeFcpv(record.fcpv),
    fcpv_total: finiteNumber(record.fcpv_total),
    context_flag: record.context_flag === true,
    factors: Array.isArray(record.factors) ? record.factors as ContextFactor[] : undefined,
    notes: textValue(record.notes),
    context_interview_id: textValue(record.context_interview_id),
    created_at: textValue(record.created_at) ?? '',
    calc_source: record.calc_source === 'authoritative' || record.calc_source === 'pending' ? record.calc_source : undefined,
    calc_notice: textValue(record.calc_notice),
  };
}

function sortAssessments(list: Assessment[]) {
  return [...list].sort((a, b) => {
    const at = Date.parse(a.created_at);
    const bt = Date.parse(b.created_at);
    if (Number.isFinite(at) && Number.isFinite(bt) && bt !== at) return bt - at;
    return String(b.id).localeCompare(String(a.id));
  });
}

function mergeAssessments(primary: Assessment[], secondary: Assessment[]) {
  const byId = new Map<string, Assessment>();
  for (const item of secondary) {
    if (item.id) byId.set(item.id, item);
  }
  for (const item of primary) {
    if (item.id) byId.set(item.id, item);
  }
  return sortAssessments([...byId.values()]);
}

export async function readLocalAssessmentHistory() {
  const raw = await AsyncStorage.getItem(LOCAL_ASSESSMENT_HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? sortAssessments(parsed.map(normalizeAssessment).filter((item) => item.id))
      : [];
  } catch {
    return [];
  }
}

export async function saveLocalAssessmentHistorySnapshot(assessment: Assessment) {
  if (!assessment.id) return assessment;
  const existing = await readLocalAssessmentHistory();
  const merged = mergeAssessments([assessment], existing);
  await AsyncStorage.setItem(LOCAL_ASSESSMENT_HISTORY_KEY, JSON.stringify(merged));
  return assessment;
}

async function saveLocalAssessmentHistorySnapshots(assessments: Assessment[]) {
  const valid = assessments.filter((assessment) => assessment.id);
  if (!valid.length) return readLocalAssessmentHistory();
  const existing = await readLocalAssessmentHistory();
  const merged = mergeAssessments(valid, existing);
  await AsyncStorage.setItem(LOCAL_ASSESSMENT_HISTORY_KEY, JSON.stringify(merged));
  return merged;
}

export class UpstreamError extends Error {
  status: number;
  upstream_status?: number;
  upstream_body?: string;
  upstream_url?: string;
  code?: string;
  /** Controlled, human-readable explanation from the Emergent backend
   *  (e.g. "athleteId not found upstream"). Preferred over raw bodies. */
  reason?: string;
  constructor(status: number, detail: any) {
    const msg =
      (detail && (detail.message || detail.detail)) ||
      (typeof detail === 'string' ? detail : `HTTP ${status}`);
    super(msg);
    this.name = 'UpstreamError';
    this.status = status;
    if (detail && typeof detail === 'object') {
      this.code = detail.code;
      this.upstream_status = detail.upstream_status;
      this.upstream_body = detail.upstream_body;
      this.upstream_url = detail.upstream_url;
      this.reason = detail.reason;
    }
  }
}

export async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    let detail: any = null;
    const text = await res.text();
    try {
      const parsed = JSON.parse(text);
      // FastAPI wraps HTTPException detail under "detail"
      detail = parsed?.detail ?? parsed;
    } catch {
      detail = text;
    }
    // Detect authoritative upstream errors robustly. Prefer matching by the
    // structured "code" field so any status (424, 502, etc.) that carries
    // the AUTHORITATIVE_UPSTREAM_ERROR envelope is surfaced correctly.
    if (
      detail &&
      typeof detail === 'object' &&
      (detail.code === 'AUTHORITATIVE_UPSTREAM_ERROR' ||
        (typeof detail.upstream_status === 'number' && typeof detail.upstream_body !== 'undefined'))
    ) {
      throw new UpstreamError(res.status, detail);
    }
    // FastAPI validation errors identify missing/invalid assessment fields.
    if (res.status === 422 && Array.isArray(detail)) {
      const messages = detail.map((issue) => {
        const field = Array.isArray(issue?.loc) ? issue.loc.filter((part: unknown) => part !== 'body').join('.') : '';
        return typeof issue?.msg === 'string' ? `${field ? `${field}: ` : ''}${issue.msg}` : '';
      }).filter(Boolean);
      if (messages.length) throw new Error(messages.join('; '));
    }
    throw new Error(
      (detail && (detail.message || detail.detail)) ||
        (typeof detail === 'string' ? detail : '') ||
        text ||
        `HTTP ${res.status}`
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function saveProfile(p: Omit<Profile, 'updated_at'>) {
  return req<Profile>('/profile', { method: 'POST', body: JSON.stringify(p) });
}

export async function acceptTerms(deviceId: string, version = '1.0') {
  return req<Profile>('/profile/accept-terms', {
    method: 'POST',
    body: JSON.stringify({ device_id: deviceId, version }),
  });
}

export type TermsInfo = {
  version: string;
  effective_date: string;
  changelog: { en?: string; es?: string };
  license: string;
};

export async function getCurrentTerms() {
  return req<TermsInfo>('/terms');
}

export async function fetchProfile(deviceId: string) {
  return req<Profile | null>(`/profile?device_id=${encodeURIComponent(deviceId)}`);
}

export async function createAssessment(payload: {
  device_id: string;
  fcr: number;
  age: number;
  readings: Record<string, number>;
  fcpv?: FCPv;
  factors: ContextFactor[];
  notes?: string | null;
  // TEMPORARY diagnostic metadata (ignored by assessment logic)
  safety_confirmed?: boolean;
  safety_confirmed_at?: string;
  ble_device_name?: string | null;
}) {
  const assessment = normalizeAssessment(await req<unknown>('/assessments', { method: 'POST', body: JSON.stringify(payload) }));
  await saveLocalAssessmentHistorySnapshot(assessment);
  return assessment;
}

/** TEMPORARY developer diagnostics — trace of recent assessment attempts. */
export type DiagnosticEntry = {
  id: string;
  device_id: string;
  timestamp: string;
  payload_received: boolean;
  age: number;
  restingHr: number;
  maxHr: number | null;
  hr60s: number | null;
  hr90s: number | null;
  hr120s: number | null;
  hr150s: number | null;
  hr3m: number | null;
  factors: string[];
  notes_present: boolean;
  safetyConfirmed: boolean | null;
  safetyConfirmedAt: string | null;
  bleDeviceName: string | null;
  athleteId: number | null;
  athleteName: string | null;
  upstream_url: string;
  context_interview_sent: boolean;
  context_interview_status: number | string | null;
  assessment_sent: boolean;
  assessment_status: number | string | null;
  replit_http_response: Record<string, unknown> | null;
  authoritative_result_received: boolean;
  zone: string | null;
  error: Record<string, unknown> | null;
};

export async function fetchDiagnostics(deviceId: string, limit = 5) {
  return req<DiagnosticEntry[]>(
    `/diagnostics/last?device_id=${encodeURIComponent(deviceId)}&limit=${limit}`
  );
}

export async function listAssessments(deviceId: string) {
  const local = await readLocalAssessmentHistory();
  try {
    const raw = await req<unknown>(`/assessments?device_id=${encodeURIComponent(deviceId)}`);
    const remote = Array.isArray(raw) ? raw.map(normalizeAssessment) : [];
    const merged = mergeAssessments(remote, local);
    await saveLocalAssessmentHistorySnapshots(merged);
    return merged;
  } catch (error) {
    if (local.length) return local;
    throw error;
  }
}

export async function getAssessment(id: string, deviceId: string) {
  return normalizeAssessment(await req<unknown>(`/assessments/${id}?device_id=${encodeURIComponent(deviceId)}`));
}

export async function deleteAssessment(id: string, deviceId: string) {
  return req<{ deleted: boolean }>(
    `/assessments/${id}?device_id=${encodeURIComponent(deviceId)}`,
    { method: 'DELETE' }
  );
}

/** Apple 5.1.1(v) — permanently erase ALL server data for this device. */
export async function deleteAllMyData(deviceId: string) {
  return req<{ deleted: boolean }>(
    `/profile?device_id=${encodeURIComponent(deviceId)}`,
    { method: 'DELETE' }
  );
}

export async function resyncAssessment(id: string, deviceId: string) {
  return normalizeAssessment(await req<unknown>(
    `/assessments/${id}/resync?device_id=${encodeURIComponent(deviceId)}`,
    { method: 'POST' }
  ));
}
