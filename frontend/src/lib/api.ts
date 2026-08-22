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
  pattern: 'RAPID' | 'NORMAL' | 'DELAYED' | 'FLATTENED' | 'UNSTABLE';
  zone: 'BLUE' | 'GREEN' | 'YELLOW' | 'RED';
  action: string;
  fcpv: FCPv;
  fcpv_total: number;
  context_flag: boolean;
  created_at: string;
};

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function saveProfile(p: Omit<Profile, 'updated_at'>) {
  return req<Profile>('/profile', { method: 'POST', body: JSON.stringify(p) });
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

export async function getAssessment(id: string) {
  return req<Assessment>(`/assessments/${id}`);
}

export async function deleteAssessment(id: string) {
  return req<{ deleted: boolean }>(`/assessments/${id}`, { method: 'DELETE' });
}
