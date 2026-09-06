import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

/**
 * PolarBle — JS wrapper for the official Polar BLE SDK.
 *
 * The module is *provided by the native side of the app* (iOS Swift +
 * Android Kotlin) and only exists in dev builds / production builds
 * generated via Emergent → Publish. In Expo Go and the web preview the
 * `available` flag stays `false` and callers must fall back to the
 * generic `react-native-ble-plx` implementation.
 *
 * The module exposes ONLY live HR — no PPG, ACC or session recording.
 * Zone / pattern / action classification stays on the Replit backend.
 */

const native = NativeModules.PolarBleModule as any;
const emitter =
  native ? new NativeEventEmitter(native) : null;

export type PolarDevice = {
  id: string;
  name: string;
  rssi: number;
  address?: string;
  connectable?: boolean;
};

export type PolarHrSample = {
  sessionId: string;
  connectionId: string;
  receivedAt: number;
  id: string;
  hr: number;
  contactStatus?: boolean;
  contactStatusSupported?: boolean;
  rrsMs?: number[];
};

export type PolarState = {
  sessionId?: string;
  connectionId?: string;
  status:
    | 'connecting' | 'connected' | 'disconnected'
    | 'hr-ready' | 'bt-on' | 'bt-off'
    | 'battery' | 'scan-error';
  id?: string;
  name?: string;
  level?: number;
  message?: string;
  pairingError?: boolean;
};

export const PolarBle = {
  available: !!native,
  provenanceAvailable: !!native && typeof native.monotonicNow === 'function'
    && typeof native.connectSession === 'function' && typeof native.disconnectSession === 'function',
  platform: Platform.OS,

  // Exact native clock read. Never translate uptime into JS performance.now().
  monotonicNow(): number {
    try {
      const value = native?.monotonicNow();
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : NaN;
    } catch { return NaN; }
  },

  async startScan() {
    if (!native) throw new Error('PolarBle native module not available in this environment.');
    return native.startScan();
  },
  async stopScan() {
    if (!native) return;
    return native.stopScan();
  },
  async connect(deviceId: string, sessionId: string, connectionId: string) {
    if (!native) throw new Error('PolarBle native module not available.');
    if (!this.provenanceAvailable) throw new Error('Polar native provenance support requires a new native binary.');
    return native.connectSession(deviceId, sessionId, connectionId);
  },
  async disconnect(deviceId: string, sessionId: string, connectionId: string) {
    if (!native) return;
    return native.disconnectSession(deviceId, sessionId, connectionId);
  },

  onDevice(cb: (d: PolarDevice) => void) {
    return emitter?.addListener('polar-device', cb);
  },
  onHr(cb: (s: PolarHrSample) => void) {
    return emitter?.addListener('polar-hr', cb);
  },
  onState(cb: (s: PolarState) => void) {
    return emitter?.addListener('polar-state', cb);
  },
};

export default PolarBle;
