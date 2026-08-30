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

// Resolve which HR hook implementation to use ONCE at module load.
// This avoids the classic rules-of-hooks violation of calling different
// hooks based on a runtime check inside a single hook.
//
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _polarNative = require('@/src/native/PolarBle').default;
const _POLAR_AVAILABLE: boolean = !!_polarNative?.available;

export function useHeartRateMonitor() {
  // Prefer the official Polar BLE SDK when the native module is present
  // (dev/production builds). In Expo Go / web preview the module is not
  // linked, so we transparently fall back to the generic HR-service
  // implementation powered by react-native-ble-plx.
  // The choice is captured at module-load time, so React always calls
  // the same hook in the same order for the lifetime of the app.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return _POLAR_AVAILABLE ? useHeartRateMonitorPolar() : useHeartRateMonitorGeneric();
}

function useHeartRateMonitorGeneric() {
  const [status, setStatus] = useState<HrStatus>('idle');
  const [devices, setDevices] = useState<HrDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<HrDevice | null>(null);
  const [hr, setHr] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const subscriptionRef = useRef<any>(null);
  const deviceRef = useRef<any>(null);
  const historyRef = useRef<{ t: number; hr: number }[]>([]);
  const lastDeviceIdRef = useRef<string | null>(null);
  const autoReconnectRef = useRef<boolean>(false);
  const reconnectTimerRef = useRef<any>(null);
  const attemptRef = useRef<number>(0);
  const disconnectSubRef = useRef<any>(null);

  const mgr = getManager();
  const supported = !!mgr;

  useEffect(() => {
    if (!supported) setStatus('unsupported');
    return () => {
      autoReconnectRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      try {
        subscriptionRef.current?.remove?.();
      } catch {}
      try {
        disconnectSubRef.current?.remove?.();
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
        lastDeviceIdRef.current = id;
        autoReconnectRef.current = true;
        attemptRef.current = 0;
        setIsReconnecting(false);
        setReconnectAttempt(0);
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
        // Listen for physical disconnect (out of range / battery / turned off)
        try {
          disconnectSubRef.current?.remove?.();
        } catch {}
        disconnectSubRef.current = device.onDisconnected?.(() => {
          setStatus('disconnected');
          setHr(null);
          if (autoReconnectRef.current) scheduleReconnect();
        });
        subscriptionRef.current = device.monitorCharacteristicForService(
          HR_SERVICE,
          HR_CHAR,
          (err: any, ch: any) => {
            if (err) {
              setError(err?.message ?? 'Sensor desconectado');
              setStatus('disconnected');
              if (autoReconnectRef.current) scheduleReconnect();
              return;
            }
            const value = parseHrMeasurement(ch?.value ?? '');
            if (typeof value === 'number' && value > 0 && value < 250) {
              setHr(value);
              historyRef.current.push({ t: Date.now(), hr: value });
              const cutoff = Date.now() - 30_000;
              historyRef.current = historyRef.current.filter((p) => p.t >= cutoff);
            }
          }
        );
      } catch (e: any) {
        setError(e?.message ?? 'No se pudo conectar');
        setStatus('error');
        if (autoReconnectRef.current) scheduleReconnect();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mgr, stopScan]
  );

  /**
   * Auto-reconnect with exponential backoff. Tries up to 8 times: 1s, 2s, 3s,
   * 5s, 8s, 12s, 20s, 30s. Cancelled by `disconnect()` (user-initiated).
   */
  const scheduleReconnect = useCallback(() => {
    if (!mgr) return;
    if (!autoReconnectRef.current) return;
    const id = lastDeviceIdRef.current;
    if (!id) return;
    if (reconnectTimerRef.current) return; // already scheduled
    const backoffs = [1000, 2000, 3000, 5000, 8000, 12000, 20000, 30000];
    const attempt = attemptRef.current;
    if (attempt >= backoffs.length) {
      setIsReconnecting(false);
      return;
    }
    setIsReconnecting(true);
    setReconnectAttempt(attempt + 1);
    reconnectTimerRef.current = setTimeout(async () => {
      reconnectTimerRef.current = null;
      if (!autoReconnectRef.current) return;
      attemptRef.current += 1;
      try {
        // Clean up previous subs before reconnecting
        try { subscriptionRef.current?.remove?.(); } catch {}
        try { disconnectSubRef.current?.remove?.(); } catch {}
        try { await deviceRef.current?.cancelConnection?.(); } catch {}
        setStatus('connecting');
        const device = await mgr.connectToDevice(id, { autoConnect: false });
        await device.discoverAllServicesAndCharacteristics();
        deviceRef.current = device;
        setConnectedDevice({
          id: device.id,
          name: device.name || device.localName || 'Pulsómetro',
          rssi: device.rssi ?? null,
        });
        setStatus('connected');
        attemptRef.current = 0;
        setIsReconnecting(false);
        setReconnectAttempt(0);
        disconnectSubRef.current = device.onDisconnected?.(() => {
          setStatus('disconnected');
          setHr(null);
          if (autoReconnectRef.current) scheduleReconnect();
        });
        subscriptionRef.current = device.monitorCharacteristicForService(
          HR_SERVICE,
          HR_CHAR,
          (err: any, ch: any) => {
            if (err) {
              setStatus('disconnected');
              if (autoReconnectRef.current) scheduleReconnect();
              return;
            }
            const value = parseHrMeasurement(ch?.value ?? '');
            if (typeof value === 'number' && value > 0 && value < 250) {
              setHr(value);
              historyRef.current.push({ t: Date.now(), hr: value });
              const cutoff = Date.now() - 30_000;
              historyRef.current = historyRef.current.filter((p) => p.t >= cutoff);
            }
          }
        );
      } catch {
        // Try again with next backoff
        if (autoReconnectRef.current) scheduleReconnect();
      }
    }, backoffs[attempt]);
  }, [mgr]);

  const disconnect = useCallback(async () => {
    // Explicit user-initiated disconnect => stop auto-reconnect loop.
    autoReconnectRef.current = false;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    attemptRef.current = 0;
    setIsReconnecting(false);
    setReconnectAttempt(0);
    try {
      subscriptionRef.current?.remove?.();
      subscriptionRef.current = null;
    } catch {}
    try {
      disconnectSubRef.current?.remove?.();
      disconnectSubRef.current = null;
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
    isReconnecting,
    reconnectAttempt,
    startScan,
    stopScan,
    connect,
    disconnect,
    averageLastMs,
  };
}

/**
 * useHeartRateMonitorPolar
 *
 * Same public shape as useHeartRateMonitorGeneric — powered by the
 * native Polar BLE SDK module (iOS + Android). Only exports HR; no
 * PPG / ACC / session recording. The AFEtm classification stays on the
 * Replit backend.
 */
function useHeartRateMonitorPolar() {
  // Reuse the module-level require captured at load time. The eslint
  // directive above suppresses the require-imports rule for that line.
  const PolarBle = _polarNative;

  const [status, setStatus] = useState<HrStatus>('idle');
  const [devices, setDevices] = useState<HrDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<HrDevice | null>(null);
  const [hr, setHr] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReconnecting] = useState(false);
  const [reconnectAttempt] = useState(0);
  const historyRef = useRef<{ t: number; hr: number }[]>([]);

  useEffect(() => {
    const subDev = PolarBle.onDevice((d: any) => {
      setDevices((prev) =>
        prev.find((x) => x.id === d.id)
          ? prev
          : [...prev, { id: d.id, name: d.name || 'Polar', rssi: d.rssi ?? null }]
      );
    });
    const subState = PolarBle.onState((s: any) => {
      switch (s.status) {
        case 'connecting': setStatus('connecting'); break;
        case 'connected':
          setStatus('connected');
          setConnectedDevice({ id: s.id, name: s.name || 'Polar', rssi: null });
          break;
        case 'disconnected':
          setStatus((cur) => (cur === 'connected' ? 'error' : cur));
          setConnectedDevice(null);
          break;
        case 'scan-error':
          setError(s.message || 'Scan error');
          setStatus('error');
          break;
      }
    });
    const subHr = PolarBle.onHr((s: any) => {
      setHr(s.hr);
      historyRef.current.push({ t: Date.now(), hr: s.hr });
      if (historyRef.current.length > 200) historyRef.current.shift();
    });
    return () => {
      subDev?.remove?.();
      subState?.remove?.();
      subHr?.remove?.();
    };
  }, [PolarBle]);

  const startScan = useCallback(async () => {
    setError(null);
    setDevices([]);
    setStatus('scanning');
    try { await PolarBle.startScan(); } catch (e: any) {
      setError(e?.message || 'Polar scan error');
      setStatus('error');
    }
  }, [PolarBle]);

  const stopScan = useCallback(async () => {
    try { await PolarBle.stopScan(); } catch {}
  }, [PolarBle]);

  const connect = useCallback(async (deviceId: string) => {
    setStatus('connecting');
    try { await PolarBle.connect(deviceId); } catch (e: any) {
      setError(e?.message || 'Polar connect error');
      setStatus('error');
    }
  }, [PolarBle]);

  const disconnect = useCallback(async () => {
    try { if (connectedDevice) await PolarBle.disconnect(connectedDevice.id); } catch {}
    setStatus('idle');
    setConnectedDevice(null);
  }, [PolarBle, connectedDevice]);

  const averageLastMs = useCallback(
    (ms: number) => {
      const now = Date.now();
      const samples = historyRef.current.filter((s) => now - s.t <= ms);
      if (samples.length === 0) return hr ?? null;
      const sum = samples.reduce((a, s) => a + s.hr, 0);
      return Math.round(sum / samples.length);
    },
    [hr]
  );

  return {
    supported: true,
    status,
    devices,
    connectedDevice,
    hr,
    error,
    isReconnecting,
    reconnectAttempt,
    startScan,
    stopScan,
    connect,
    disconnect,
    averageLastMs,
  };
}
