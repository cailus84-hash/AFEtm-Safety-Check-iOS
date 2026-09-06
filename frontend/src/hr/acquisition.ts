// Client acquisition/eligibility only. No physiological result calculation.
export const CAPTURE_TIMES = [60, 90, 120, 150, 180] as const;
export const RECOVERY_DURATION = 180;
// Transport freshness limit, matching the five-second acquisition window.
export const LIVE_SAMPLE_MAX_AGE_MS = 5_000;
export const acquisitionNow = () => performance.now();

export type AcquisitionState =
  | 'connecting' | 'collecting' | 'recovery' | 'complete'
  | 'observation' | 'incomplete' | 'submitted' | 'closed';
export type Sample = {
  sessionId: string;
  deviceId: string;
  connectionId: string;
  bpm: number;
  receivedAt: number;
};

export class AcquisitionSession {
  readonly id: string;
  readonly deviceId: string;
  readonly connectionId: string;
  private clock: () => number;
  private createdAt: number;
  private samples: Sample[] = [];
  private readings: Record<string, number> = {};
  private resting: number | null = null;
  private recoveryStart: number | null = null;
  private connected = false;
  private state: AcquisitionState = 'connecting';
  private reason: string | null = null;

  constructor(id: string, deviceId: string, clock = acquisitionNow, connectionId = id) {
    this.id = id;
    this.deviceId = deviceId;
    this.connectionId = connectionId;
    this.clock = clock;
    this.createdAt = clock();
  }

  get status() { return this.state; }
  get failureReason() { return this.reason; }
  get fcr() { return this.resting; }
  get captured(): Readonly<Record<string, number>> { return Object.freeze({ ...this.readings }); }
  get elapsed() {
    return this.recoveryStart === null ? 0
      : Math.min(RECOVERY_DURATION, Math.max(0, Math.floor((this.clock() - this.recoveryStart) / 1000)));
  }

  markConnected() {
    if (this.state !== 'connecting') return false;
    this.connected = true;
    this.state = 'collecting';
    return true;
  }

  accept(sample: Sample) {
    const now = this.clock();
    if (!this.connected || !['collecting', 'recovery'].includes(this.state)
      || sample.sessionId !== this.id || sample.deviceId !== this.deviceId
      || sample.connectionId !== this.connectionId
      || !Number.isFinite(now) || !Number.isFinite(this.createdAt)
      || !Number.isInteger(sample.bpm) || sample.bpm <= 0 || sample.bpm >= 250
      || !Number.isFinite(sample.receivedAt) || sample.receivedAt > now
      || sample.receivedAt < this.createdAt
      || now - sample.receivedAt > LIVE_SAMPLE_MAX_AGE_MS
      || (this.samples.length > 0 && sample.receivedAt < this.samples[this.samples.length - 1].receivedAt)) return false;
    this.samples.push({ ...sample });
    // Keep the complete recovery history even when timer callbacks are delayed.
    if (this.state === 'collecting') this.samples = this.samples.filter(s => s.receivedAt >= now - 15_000);
    return true;
  }

  freshSample(): Sample | null {
    if (!this.connected || !['collecting', 'recovery', 'complete'].includes(this.state)) return null;
    const sample = this.samples[this.samples.length - 1];
    const age = sample ? this.clock() - sample.receivedAt : Infinity;
    return sample && age >= 0 && age <= LIVE_SAMPLE_MAX_AGE_MS ? { ...sample } : null;
  }

  private average(start: number, end: number) {
    const samples = this.samples.filter(s => s.receivedAt >= start && s.receivedAt <= end);
    if (!samples.length) return null;
    return Math.round(samples.reduce((sum, s) => sum + s.bpm, 0) / samples.length);
  }

  registerResting(): number | null {
    if (this.state !== 'collecting' || !this.freshSample()) return null;
    const now = this.clock();
    const value = this.average(now - 15_000, now);
    // Preserve the existing resting-input validation; do not infer new rules.
    if (value === null || value < 30 || value > 130) return null;
    this.resting = value;
    return value;
  }

  startRecovery(target: number): 'started' | 'observation' | 'incomplete' {
    if (this.state !== 'collecting' || this.resting === null) return 'incomplete';
    const sample = this.freshSample();
    if (!sample || !Number.isFinite(target) || target <= 0) {
      this.invalidate('stale-or-missing-hr');
      return 'incomplete';
    }
    if (sample.bpm < target) {
      this.state = 'observation';
      this.reason = 'target-not-reached';
      this.samples = [];
      return 'observation';
    }
    // One synchronous eligibility decision and origin; no React-effect clock.
    this.recoveryStart = this.clock();
    this.readings = { '0': sample.bpm };
    this.state = 'recovery';
    return 'started';
  }

  advance() {
    if (this.state !== 'recovery' || this.recoveryStart === null) return;
    const now = this.clock();
    if (!Number.isFinite(now)) { this.invalidate('receipt-clock-unavailable'); return; }
    for (const checkpoint of CAPTURE_TIMES) {
      const key = String(checkpoint);
      const end = this.recoveryStart + checkpoint * 1000;
      if (now < end || this.readings[key] !== undefined) continue;
      const value = this.average(end - 5_000, end);
      if (value === null) {
        this.invalidate(`missing-checkpoint-${checkpoint}`);
        return;
      }
      this.readings[key] = value;
    }
    if (CAPTURE_TIMES.every(t => this.readings[String(t)] !== undefined)) this.state = 'complete';
  }

  invalidate(reason: string) {
    this.connected = false;
    this.samples = [];
    // A posted immutable snapshot cannot be revoked by subsequent sensor cleanup.
    if (['submitted', 'observation', 'incomplete', 'closed'].includes(this.state)) return;
    this.resting = null;
    this.readings = {};
    this.reason = reason;
    this.state = 'incomplete';
  }

  close() {
    this.connected = false;
    this.samples = [];
    this.readings = {};
    this.resting = null;
    this.state = 'closed';
  }

  async submit<T>(send: (data: { fcr: number; readings: Record<string, number> }) => Promise<T>): Promise<T> {
    this.advance();
    if (!this.connected || this.state !== 'complete' || this.resting === null
      || ![0, ...CAPTURE_TIMES].every(t => Number.isInteger(this.readings[String(t)]) && this.readings[String(t)] > 0)) {
      throw new Error('INCOMPLETE_ACQUISITION');
    }
    const data = { fcr: this.resting, readings: { ...this.readings } };
    this.state = 'submitted'; // Prevent duplicate requests and subsequent sample mutation.
    try {
      return await send(data);
    } catch (error) {
      this.state = this.connected ? 'complete' : 'incomplete';
      throw error;
    }
  }
}
