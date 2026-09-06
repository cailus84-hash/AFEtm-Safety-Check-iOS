import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { AcquisitionSession, acquisitionNow } from '../hr/acquisition';
import PolarBle from '../native/PolarBle';

export const HR_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
export const HR_CHAR = '00002a37-0000-1000-8000-00805f9b34fb';
export type HrDevice = { id: string; name: string; rssi: number | null };
export type HrStatus = 'idle' | 'unsupported' | 'no-permission' | 'scanning'
  | 'connecting' | 'connected' | 'disconnected' | 'error';

export function parseHrMeasurement(base64: string): number | null {
  try {
    const binary = globalThis.atob ? globalThis.atob(base64) : '';
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    if (bytes.length < 2) return null;
    if ((bytes[0] & 0x01) === 0x01) return bytes.length < 3 ? null : bytes[1] | (bytes[2] << 8);
    return bytes[1];
  } catch { return null; }
}

async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS === 'ios') return true;
  if (Platform.OS !== 'android') return false;
  const level = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
  if (level >= 31) {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return Object.values(granted).every(value => value === PermissionsAndroid.RESULTS.GRANTED);
  }
  return await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)
    === PermissionsAndroid.RESULTS.GRANTED;
}

let manager: any = null;
function getManager(): any {
  if (Platform.OS === 'web') return null;
  try {
    if (!manager) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { BleManager } = require('react-native-ble-plx');
      manager = new BleManager();
    }
    return manager;
  } catch { return null; }
}

const USE_POLAR = PolarBle.available;
let sessionSequence = 0;

export function useHeartRateMonitor() {
  const mgr = USE_POLAR ? null : getManager();
  const supported = USE_POLAR || !!mgr;
  const [status, setStatus] = useState<HrStatus>(supported ? 'idle' : 'unsupported');
  const [devices, setDevices] = useState<HrDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<HrDevice | null>(null);
  const [hr, setHr] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, refresh] = useState(0);
  const sessionRef = useRef<AcquisitionSession | null>(null);
  const deviceRef = useRef<any>(null);
  const subscriptions = useRef<any[]>([]);
  const scanSubscription = useRef<any>(null);
  const scanStateSubscription = useRef<any>(null);
  const scanning = useRef(false);
  const scanStarting = useRef(false);
  const mounted = useRef(true);

  const update = useCallback(() => {
    if (!mounted.current) return;
    setHr(sessionRef.current?.freshSample()?.bpm ?? null);
    refresh(value => value + 1);
  }, []);

  const stopScan = useCallback(async () => {
    scanning.current = false;
    scanSubscription.current?.remove?.();
    scanSubscription.current = null;
    scanStateSubscription.current?.remove?.();
    scanStateSubscription.current = null;
    try {
      if (USE_POLAR) await PolarBle.stopScan();
      else mgr?.stopDeviceScan();
    } catch { /* Scan shutdown must not retain a session. */ }
    if (mounted.current) setStatus(current => current === 'scanning' ? 'idle' : current);
  }, [mgr]);

  const releaseSubscriptions = useCallback(() => {
    for (const subscription of subscriptions.current) subscription?.remove?.();
    subscriptions.current = [];
  }, []);

  const fail = useCallback((session: AcquisitionSession, reason: string) => {
    if (!mounted.current || sessionRef.current !== session) return;
    session.invalidate(reason);
    setHr(null);
    setConnectedDevice(null);
    setStatus('disconnected');
    update();
  }, [update]);

  const disconnect = useCallback(async () => {
    const session = sessionRef.current;
    if (session) session.invalidate('disconnected');
    releaseSubscriptions();
    if (mounted.current) {
      setHr(null);
      setConnectedDevice(null);
      setStatus('disconnected');
      update();
    }
    void stopScan();
    const device = deviceRef.current;
    deviceRef.current = null;
    try {
      if (USE_POLAR && session) await PolarBle.disconnect(session.deviceId, session.id, session.connectionId);
      else await device?.cancelConnection?.();
    } catch { /* Session is already invalidated locally. */ }
  }, [releaseSubscriptions, stopScan, update]);

  useEffect(() => {
    mounted.current = true;
    // Receipt time is not sensor acquisition time.
    // End the attempt when JS background continuity cannot be established.
    const appState = AppState.addEventListener('change', state => {
      if (state !== 'active' && sessionRef.current) {
        fail(sessionRef.current, 'app-not-active');
        void disconnect();
      }
    });
    const timer = setInterval(update, 250);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      appState.remove();
      void disconnect();
      sessionRef.current?.close();
    };
  }, [disconnect, fail, update]);

  const startScan = useCallback(async () => {
    if (!supported || sessionRef.current || scanStarting.current) return;
    scanStarting.current = true;
    try {
      await stopScan();
      if (!mounted.current || sessionRef.current) return;
      setError(null);
      if (!await requestBlePermissions()) {
        if (mounted.current) setStatus('no-permission');
        return;
      }
      if (!mounted.current || sessionRef.current) return;
      scanning.current = true;
      setDevices([]);
      setStatus('scanning');
      const onDevice = (device: HrDevice) => {
        if (!mounted.current || !scanning.current || sessionRef.current) return;
        setDevices(previous => previous.some(d => d.id === device.id) ? previous : [...previous, device]);
      };
      if (USE_POLAR) {
        scanSubscription.current = PolarBle.onDevice(d => onDevice({ id: d.id, name: d.name || 'Polar', rssi: d.rssi ?? null }));
        scanStateSubscription.current = PolarBle.onState(s => {
          if (!mounted.current || !scanning.current) return;
          if (s.status === 'scan-error' || s.status === 'bt-off') {
            setError(s.message || 'Bluetooth scan unavailable');
            setStatus('error');
            void stopScan();
          }
        });
        await PolarBle.startScan();
      } else {
        mgr.startDeviceScan([HR_SERVICE], null, (err: any, device: any) => {
          if (!mounted.current || !scanning.current) return;
          if (err) { setError(err.message); setStatus('error'); void stopScan(); return; }
          if (device) onDevice({ id: device.id, name: device.name || device.localName || 'HR monitor', rssi: device.rssi ?? null });
        });
      }
    } catch (err: any) {
      if (mounted.current) { setError(err?.message || 'Scan error'); setStatus('error'); }
      void stopScan();
    } finally {
      scanStarting.current = false;
    }
  }, [mgr, stopScan, supported]);

  const connect = useCallback(async (id: string) => {
    if (!mounted.current || !supported || sessionRef.current) return;
    const sessionId = `${Date.now()}-${++sessionSequence}`;
    const connectionId = `${sessionId}-connection`;
    const clock = USE_POLAR ? () => PolarBle.monotonicNow() : acquisitionNow;
    const session = new AcquisitionSession(sessionId, id, clock, connectionId);
    sessionRef.current = session; // Lock before asynchronous connection work.
    const info = devices.find(d => d.id === id) || { id, name: USE_POLAR ? 'Polar' : 'HR monitor', rssi: null };
    const current = () => mounted.current && sessionRef.current === session;
    const receive = (deviceId: string, value: unknown, receivedAt: number) => {
      if (!current() || typeof value !== 'number') return;
      if (session.accept({ sessionId, connectionId, deviceId, bpm: value, receivedAt })) update();
    };
    setHr(null);
    setConnectedDevice(null);
    setError(null);
    setStatus('connecting');
    await stopScan();
    if (!current() || session.status !== 'connecting') return;
    try {
      if (USE_POLAR) {
        if (!PolarBle.provenanceAvailable || !Number.isFinite(clock())) {
          throw new Error('Polar native acquisition provenance is unavailable; a compatible native binary is required.');
        }
        const belongs = (s: { sessionId?: string; connectionId?: string }) =>
          s.sessionId === sessionId && s.connectionId === connectionId;
        subscriptions.current.push(PolarBle.onState(s => {
          if (!current() || !belongs(s)) return;
          if (s.status === 'bt-off') { fail(session, 'bluetooth-off'); return; }
          if (s.id !== id) return;
          if (s.status === 'connected' && session.markConnected()) {
            setConnectedDevice({ ...info, name: s.name || info.name });
            setStatus('connected');
            update();
          } else if (s.status === 'disconnected') fail(session, 'disconnected');
        }));
        subscriptions.current.push(PolarBle.onHr(s => {
          if (!current() || !belongs(s) || s.id !== id) return;
          if (s.contactStatusSupported && s.contactStatus === false) { fail(session, 'sensor-contact-lost'); return; }
          receive(s.id, s.hr, s.receivedAt);
        }));
        await PolarBle.connect(id, sessionId, connectionId);
        if (!current() || ['incomplete', 'closed', 'observation'].includes(session.status)) await PolarBle.disconnect(id, sessionId, connectionId);
      } else {
        const device = await mgr.connectToDevice(id, { autoConnect: false });
        if (device.id !== id) { await device.cancelConnection(); throw new Error('Connected device does not match selected device.'); }
        if (!current() || session.status !== 'connecting') { await device.cancelConnection(); return; }
        deviceRef.current = device;
        await device.discoverAllServicesAndCharacteristics();
        if (!current() || !session.markConnected()) { await device.cancelConnection(); return; }
        setConnectedDevice(info);
        setStatus('connected');
        subscriptions.current.push(device.onDisconnected?.(() => fail(session, 'disconnected')));
        subscriptions.current.push(device.monitorCharacteristicForService(HR_SERVICE, HR_CHAR, (err: any, characteristic: any) => {
          // BLE-PLX exposes no native timestamp. Capture at its first JS boundary,
          // before parsing, using this immutable connection's callback closure.
          const receivedAt = acquisitionNow();
          if (err) { fail(session, 'disconnected'); return; }
          receive(characteristic?.deviceID ?? device.id, parseHrMeasurement(characteristic?.value ?? ''), receivedAt);
        }, connectionId));
      }
    } catch (err: any) {
      if (current()) { setError(err?.message || 'Connection error'); fail(session, 'connection-error'); }
    }
    update();
  }, [devices, fail, mgr, stopScan, supported, update]);

  return {
    supported, status, devices, connectedDevice, hr, error,
    acquisition: sessionRef.current,
    // A disconnect ends the attempt; never silently resume its data stream.
    isReconnecting: false, reconnectAttempt: 0,
    startScan, stopScan, connect, disconnect,
  };
}
