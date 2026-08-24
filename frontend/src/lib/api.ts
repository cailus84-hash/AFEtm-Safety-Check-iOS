import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = 'afetm.device_id';

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

export type Assessment = {
  id: string;
  device_id: string;
  fcr: number;
  age: number;
  readings: Record<string, number>;
  fcp_target: number;
  hr_peak: number;
  hrr: number;
  recpct: number;
  aurc: number;
  tau: number;
  pattern: 'RAPID' | 'NORMAL' | 'DELAYED' | 'FLATTENED' | 'UNSTABLE' | null;
  zone: 'BLUE' | 'GREEN' | 'YELLOW' | 'RED' | null;
  action: string | null;
  fcpv: FCPv;
  fcpv_total: number;
  context_flag: boolean;
  created_at: string;
  calc_source?: 'authoritative' | 'pending';
  calc_notice?: string | null;
};

export class UpstreamError extends Error {
  status: number;
  upstream_status?: number;
  upstream_body?: string;
  upstream_url?: string;
  code?: string;
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
    }
  }
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
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
    throw new Error(
      (detail && (detail.message || detail.detail)) ||
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
  fcpv: FCPv;
}) {
  return req<Assessment>('/assessments', { method: 'POST', body: JSON.stringify(payload) });
}

export async function listAssessments(deviceId: string) {
  return req<Assessment[]>(`/assessments?device_id=${encodeURIComponent(deviceId)}`);
}

export async function getAssessment(id: string, deviceId: string) {
  return req<Assessment>(`/assessments/${id}?device_id=${encodeURIComponent(deviceId)}`);
}

export async function deleteAssessment(id: string, deviceId: string) {
  return req<{ deleted: boolean }>(
    `/assessments/${id}?device_id=${encodeURIComponent(deviceId)}`,
    { method: 'DELETE' }
  );
}

export async function resyncAssessment(id: string, deviceId: string) {
  return req<Assessment>(
    `/assessments/${id}/resync?device_id=${encodeURIComponent(deviceId)}`,
    { method: 'POST' }
  );
}
