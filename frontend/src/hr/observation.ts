export const OBSERVATION_KEY = 'afetm.acquisition_observations.v1';
export type Observation = {
  session_id: string;
  sensor_id: string;
  timestamp: string;
  status: 'Observation / Target HR Not Reached';
  target_hr: number;
  measured_hr: number;
};

// Existing local storage only. These records are never assessment API payloads.
export async function preserveObservation(
  storage: { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> },
  observation: Observation,
) {
  const raw = await storage.getItem(OBSERVATION_KEY);
  let previous: Observation[] = [];
  try {
    const value = raw ? JSON.parse(raw) : [];
    if (Array.isArray(value)) previous = value.filter(entry => entry && typeof entry.session_id === 'string');
  } catch { /* A corrupt local log must not affect eligibility. */ }
  await storage.setItem(OBSERVATION_KEY, JSON.stringify([
    observation, ...previous.filter(entry => entry.session_id !== observation.session_id),
  ].slice(0, 20)));
}
