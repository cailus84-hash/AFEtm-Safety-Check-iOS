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
  id: string;
  hr: number;
  contactStatus?: boolean;
  contactStatusSupported?: boolean;
  rrsMs?: number[];
};

export type PolarState = {
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
  platform: Platform.OS,

  async startScan() {
    if (!native) throw new Error('PolarBle native module not available in this environment.');
    return native.startScan();
  },
  async stopScan() {
    if (!native) return;
    return native.stopScan();
  },
  async connect(deviceId: string) {
    if (!native) throw new Error('PolarBle native module not available.');
    return native.connect(deviceId);
  },
  async disconnect(deviceId: string) {
    if (!native) return;
    return native.disconnect(deviceId);
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
