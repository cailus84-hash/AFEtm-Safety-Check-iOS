import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';

// Standard Bluetooth Heart Rate Service (0x180D) / Heart Rate Measurement (0x2A37)
export const HR_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
export const HR_CHAR = '00002a37-0000-1000-8000-00805f9b34fb';

export type HrDevice = { id: string; name: string; rssi: number | null };
export type HrStatus =
  | 'idle'
  | 'unsupported'
  | 'no-permission'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

/**
 * Parses a Heart Rate Measurement characteristic value (base64) per the
 * Bluetooth SIG spec. The first byte is a flags byte; bit 0 selects 8-bit
 * (0) vs 16-bit (1) HR value that follows.
 */
export function parseHrMeasurement(base64: string): number | null {
  try {
    // Buffer polyfill via global — react-native provides base64->bytes via atob
    // eslint-disable-next-line no-undef
    const binary = globalThis.atob ? globalThis.atob(base64) : '';
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    if (bytes.length < 2) return null;
    const flags = bytes[0];
    const is16 = (flags & 0x01) === 0x01;
    if (is16) {
      if (bytes.length < 3) return null;
      return bytes[1] | (bytes[2] << 8);
    }
    return bytes[1];
  } catch {
    return null;
  }
}

async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS === 'ios') return true;
  if (Platform.OS !== 'android') return false;
  const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
  if (apiLevel >= 31) {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return Object.values(granted).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
  }
  const g = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  return g === PermissionsAndroid.RESULTS.GRANTED;
}

// ---- Web / Expo Go safe stub ------------------------------------------------
// react-native-ble-plx cannot load on web (and won't work in Expo Go). We
// dynamically require it and fall back to "unsupported" if unavailable.
type BleManager = any;
let _mgr: BleManager | null = null;
function getManager(): BleManager | null {
  if (Platform.OS === 'web') return null;
  try {
    if (_mgr) return _mgr;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BleManager } = require('react-native-ble-plx');
    _mgr = new BleManager();
    return _mgr;
  } catch {
    return null;
  }
}

export function useHeartRateMonitor() {
  const [status, setStatus] = useState<HrStatus>('idle');
  const [devices, setDevices] = useState<HrDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<HrDevice | null>(null);
  const [hr, setHr] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const subscriptionRef = useRef<any>(null);
  const deviceRef = useRef<any>(null);
  const historyRef = useRef<{ t: number; hr: number }[]>([]);

  const mgr = getManager();
  const supported = !!mgr;

  useEffect(() => {
    if (!supported) setStatus('unsupported');
    return () => {
      try {
        subscriptionRef.current?.remove?.();
      } catch {}
      try {
        deviceRef.current?.cancelConnection?.();
      } catch {}
    };
  }, [supported]);

  const startScan = useCallback(async () => {
    if (!mgr) return;
    setError(null);
    const ok = await requestBlePermissions();
    if (!ok) {
      setStatus('no-permission');
      return;
    }
    setDevices([]);
    setStatus('scanning');
    mgr.startDeviceScan([HR_SERVICE], null, (err: any, device: any) => {
      if (err) {
        setError(err?.message ?? 'Error de escaneo');
        setStatus('error');
        return;
      }
      if (!device) return;
      setDevices((prev) => {
        if (prev.find((d) => d.id === device.id)) return prev;
        return [
          ...prev,
          { id: device.id, name: device.name || device.localName || 'Pulsómetro', rssi: device.rssi },
        ];
      });
    });
  }, [mgr]);

  const stopScan = useCallback(() => {
    if (!mgr) return;
    try {
      mgr.stopDeviceScan();
    } catch {}
    if (status === 'scanning') setStatus('idle');
  }, [mgr, status]);

  const connect = useCallback(
    async (id: string) => {
      if (!mgr) return;
      try {
        setError(null);
        stopScan();
        setStatus('connecting');
        const device = await mgr.connectToDevice(id, { autoConnect: false });
        await device.discoverAllServicesAndCharacteristics();
        deviceRef.current = device;
        const info: HrDevice = {
          id: device.id,
          name: device.name || device.localName || 'Pulsómetro',
          rssi: device.rssi ?? null,
        };
        setConnectedDevice(info);
        setStatus('connected');
        historyRef.current = [];
        subscriptionRef.current = device.monitorCharacteristicForService(
          HR_SERVICE,
          HR_CHAR,
          (err: any, ch: any) => {
            if (err) {
              setError(err?.message ?? 'Sensor desconectado');
              setStatus('disconnected');
              return;
            }
            const value = parseHrMeasurement(ch?.value ?? '');
            if (typeof value === 'number' && value > 0 && value < 250) {
              setHr(value);
              historyRef.current.push({ t: Date.now(), hr: value });
              // Keep last 30 seconds of readings
              const cutoff = Date.now() - 30_000;
              historyRef.current = historyRef.current.filter((p) => p.t >= cutoff);
            }
          }
        );
      } catch (e: any) {
        setError(e?.message ?? 'No se pudo conectar');
        setStatus('error');
      }
    },
    [mgr, stopScan]
  );

  const disconnect = useCallback(async () => {
    try {
      subscriptionRef.current?.remove?.();
      subscriptionRef.current = null;
    } catch {}
    try {
      await deviceRef.current?.cancelConnection?.();
    } catch {}
    deviceRef.current = null;
    setConnectedDevice(null);
    setHr(null);
    setStatus('disconnected');
  }, []);

  /**
   * Returns the mean HR of samples captured in the last `windowMs` ms.
   * Falls back to the most recent value if the window is empty.
   */
  const averageLastMs = useCallback(
    (windowMs: number): number | null => {
      const now = Date.now();
      const samples = historyRef.current.filter((p) => p.t >= now - windowMs);
      if (samples.length === 0) return hr;
      const sum = samples.reduce((s, p) => s + p.hr, 0);
      return Math.round(sum / samples.length);
    },
    [hr]
  );

  return {
    supported,
    status,
    devices,
    connectedDevice,
    hr,
    error,
    startScan,
    stopScan,
    connect,
    disconnect,
    averageLastMs,
  };
}
