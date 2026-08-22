import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useHeartRateMonitor } from '@/src/hooks/useHeartRateMonitor';
import { colors, radius, shared, spacing } from '@/src/lib/theme';
import { createAssessment, fetchProfile, getDeviceId } from '@/src/lib/api';

// Capture windows (seconds elapsed since t=0 of recovery)
// Each window averages the readings during the LAST 5s of the segment
// to reduce sensor noise. Also record t=0 as HR_peak.
const CAPTURE_TIMES = [60, 90, 120, 150, 180] as const;
const RECOVERY_DURATION = 180; // s

type Phase =
  | 'scan'
  | 'connect'
  | 'ready'
  | 'fcr'
  | 'fcp'
  | 'recovery'
  | 'submit'
  | 'error';

export default function Guided() {
  const router = useRouter();
  const hr = useHeartRateMonitor();
  const [phase, setPhase] = useState<Phase>('scan');
  const [profile, setProfile] = useState<{ age: number } | null>(null);
  const [deviceId, setDeviceId] = useState('');
  const [fcr, setFcr] = useState<number | null>(null);
  const [hrPeak, setHrPeak] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [captured, setCaptured] = useState<Record<string, number>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pulse = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<any>(null);

  // Load profile once
  useEffect(() => {
    (async () => {
      const id = await getDeviceId();
      setDeviceId(id);
      const p = await fetchProfile(id).catch(() => null);
      if (!p) {
        router.replace('/profile-setup');
        return;
      }
      setProfile({ age: p.age });
    })();
  }, [router]);

  // Auto-start scan when supported
  useEffect(() => {
    if (hr.supported && phase === 'scan' && hr.status === 'idle') {
      hr.startScan();
    }
  }, [hr, phase]);

  // Pulse animation while HR ticks
  useEffect(() => {
    if (hr.hr) {
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 180, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
        Animated.timing(pulse, { toValue: 0, duration: 340, useNativeDriver: true }),
      ]).start();
    }
  }, [hr.hr, pulse]);

  const fcpTarget = useMemo(() => (profile ? Math.round(0.8 * (220 - profile.age)) : 0), [profile]);

  // ---------------- Phase actions ----------------
  const registerFcr = useCallback(() => {
    // FCr = average of last 15s of readings (rest)
    const avg = hr.averageLastMs(15_000);
    if (!avg || avg < 30 || avg > 130) {
      setErrorMsg('No se pudo registrar FCr. Mantén la calma y espera unos segundos.');
      return;
    }
    setFcr(avg);
    setErrorMsg(null);
    setPhase('fcp');
  }, [hr]);

  const markPeakAndStart = useCallback(() => {
    const current = hr.hr;
    if (!current || current < fcpTarget - 15) {
      setErrorMsg(`Alcanza al menos ~${fcpTarget - 15} bpm antes de iniciar la recuperación.`);
      return;
    }
    setHrPeak(current);
    setCaptured({ '0': current });
    setErrorMsg(null);
    setElapsed(0);
    setPhase('recovery');
  }, [hr.hr, fcpTarget]);

  // Recovery timer + auto-captures
  useEffect(() => {
    if (phase !== 'recovery') {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    const startTs = Date.now();
    timerRef.current = setInterval(() => {
      const s = Math.min(RECOVERY_DURATION, Math.floor((Date.now() - startTs) / 1000));
      setElapsed(s);

      // Capture windows at 60,90,120,150,180 — using average of last 5s
      for (const t of CAPTURE_TIMES) {
        const key = String(t);
        if (s >= t && captured[key] === undefined) {
          const avg = hr.averageLastMs(5_000) ?? hr.hr ?? 0;
          if (avg > 0) {
            setCaptured((prev) => ({ ...prev, [key]: avg }));
          }
        }
      }

      if (s >= RECOVERY_DURATION) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        setPhase('submit');
      }
    }, 500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Auto-submit once we hit submit phase
  useEffect(() => {
    if (phase !== 'submit') return;
    (async () => {
      try {
        // Ensure all captures present (safety fallback: use current hr)
        const readings: Record<string, number> = { '0': hrPeak ?? 0 };
        for (const t of CAPTURE_TIMES) {
          const key = String(t);
          readings[key] = captured[key] ?? hr.hr ?? 0;
        }
        const res = await createAssessment({
          device_id: deviceId,
          fcr: fcr ?? 0,
          age: profile?.age ?? 0,
          readings,
          fcpv: { sleep: 0, hydration: 0, symptoms: 0, recent_illness: 0, subjective_load: 0 },
        });
        // Cleanly disconnect before navigating
        await hr.disconnect().catch(() => {});
        router.replace(`/assessment/${res.id}`);
      } catch (e: any) {
        setErrorMsg(e?.message || 'No se pudo calcular la evaluación.');
        setPhase('error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ---------------- Render helpers ----------------
  const back = async () => {
    try { await hr.disconnect(); } catch {}
    router.back();
  };

  // Unsupported (web / Expo Go)
  if (!hr.supported) {
    return (
      <SafeAreaView style={shared.screen} edges={['top', 'bottom']} testID="guided-unsupported">
        <View style={styles.topBar}>
          <Pressable onPress={back} style={styles.iconBtn} testID="guided-back-btn">
            <MaterialCommunityIcons name="chevron-left" size={26} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.topTitle}>Guiado con BLE</Text>
          <View style={styles.iconBtn} />
        </View>
        <View style={{ padding: spacing.xl, flex: 1, justifyContent: 'center' }}>
          <View style={[shared.card, { alignItems: 'center', gap: spacing.md }]}>
            <MaterialCommunityIcons name="bluetooth-off" size={40} color={colors.zoneYellow} />
            <Text style={[shared.h3, { textAlign: 'center' }]}>
              BLE no disponible en este entorno
            </Text>
            <Text style={[shared.body, { textAlign: 'center' }]}>
              {Platform.OS === 'web'
                ? 'La vista previa web no soporta Bluetooth Low Energy. Escanea el QR de Expo o genera un build nativo para usar el modo Guiado.'
                : 'Expo Go no incluye react-native-ble-plx. Genera un build de desarrollo (Publish → Generate iOS/Android build) para probarlo.'}
            </Text>
            <Pressable
              style={[shared.primaryBtn, { alignSelf: 'stretch', marginTop: spacing.md }]}
              onPress={() => router.replace('/assessment-flow/manual')}
              testID="guided-fallback-manual"
            >
              <Text style={shared.primaryBtnText}>Usar modo manual</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={shared.screen} edges={['top']} testID="guided-screen">
      <View style={styles.topBar}>
        <Pressable onPress={back} style={styles.iconBtn} testID="guided-back-btn">
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.topTitle}>{phaseLabel(phase)}</Text>
          <ConnectionPill hr={hr} />
        </View>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }}>
        {/* Live HR banner */}
        <LiveHrCard hrValue={hr.hr} pulseAnim={pulse} status={hr.status} phase={phase} elapsed={elapsed} />

        {/* Phase-specific body */}
        {phase === 'scan' && (
          <ScanPhase hr={hr} onSelect={(id) => { setPhase('connect'); hr.connect(id); }} />
        )}
        {phase === 'connect' && (
          <InfoBlock icon="progress-clock" title="Conectando…" text="Estableciendo conexión con el pulsómetro." />
        )}
        {hr.status === 'connected' && (phase === 'connect' || phase === 'scan') && (
          <ReadyPrompt onStart={() => setPhase('fcr')} />
        )}
        {phase === 'fcr' && (
          <FcrPhase hrValue={hr.hr} onRegister={registerFcr} />
        )}
        {phase === 'fcp' && (
          <FcpPhase fcpTarget={fcpTarget} hrValue={hr.hr} fcr={fcr!} onStart={markPeakAndStart} />
        )}
        {phase === 'recovery' && (
          <RecoveryPhase elapsed={elapsed} captured={captured} hrPeak={hrPeak} fcr={fcr!} />
        )}
        {phase === 'submit' && (
          <View style={[shared.card, { alignItems: 'center', gap: spacing.md, marginTop: spacing.xl }]}>
            <ActivityIndicator color={colors.brandGold} size="large" />
            <Text style={shared.h3}>Calculando resultado…</Text>
            <Text style={[shared.body, { textAlign: 'center' }]}>
              Estamos analizando tu curva de recuperación.
            </Text>
          </View>
        )}
        {phase === 'error' && (
          <View style={[shared.card, { marginTop: spacing.xl }]}>
            <Text style={[shared.h3, { color: colors.zoneRed }]}>Error</Text>
            <Text style={[shared.body, { marginTop: spacing.sm }]}>
              {errorMsg || 'Ocurrió un problema. Intenta de nuevo.'}
            </Text>
            <Pressable
              style={[shared.primaryBtn, { marginTop: spacing.md }]}
              onPress={() => {
                setErrorMsg(null);
                setPhase('scan');
              }}
            >
              <Text style={shared.primaryBtnText}>Reintentar</Text>
            </Pressable>
          </View>
        )}

        {errorMsg && phase !== 'error' ? (
          <Text style={styles.error} testID="guided-error">{errorMsg}</Text>
        ) : null}

        {/* No-permission fallback */}
        {hr.status === 'no-permission' && (
          <View style={[shared.card, { marginTop: spacing.xl }]}>
            <Text style={shared.h3}>Permisos requeridos</Text>
            <Text style={[shared.body, { marginTop: spacing.sm }]}>
              Concede acceso a Bluetooth para poder detectar tu pulsómetro.
            </Text>
            <Pressable style={[shared.primaryBtn, { marginTop: spacing.md }]} onPress={hr.startScan}>
              <Text style={shared.primaryBtnText}>Reintentar permisos</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function phaseLabel(p: Phase) {
  switch (p) {
    case 'scan':
      return 'Buscando pulsómetro';
    case 'connect':
      return 'Conectando';
    case 'ready':
      return 'Listo';
    case 'fcr':
      return 'Registrar FCr';
    case 'fcp':
      return 'Alcanzar FCP';
    case 'recovery':
      return 'Recuperación 3 min';
    case 'submit':
      return 'Calculando';
    case 'error':
      return 'Error';
  }
}

// ---------------- Sub-components ----------------

function ConnectionPill({ hr }: { hr: ReturnType<typeof useHeartRateMonitor> }) {
  const dotColor = hr.status === 'connected' ? colors.zoneGreen
    : hr.status === 'scanning' || hr.status === 'connecting' ? colors.zoneYellow
    : colors.onSurfaceTertiary;
  const label = hr.connectedDevice?.name ?? (hr.status === 'scanning' ? 'Escaneando…' : 'Sin conexión');
  return (
    <View style={styles.connRow}>
      <View style={[styles.connDot, { backgroundColor: dotColor, shadowColor: dotColor }]} />
      <Text style={styles.connText} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function LiveHrCard({
  hrValue, pulseAnim, status, phase, elapsed,
}: {
  hrValue: number | null;
  pulseAnim: Animated.Value;
  status: any;
  phase: Phase;
  elapsed: number;
}) {
  const scale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const opacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  return (
    <View style={styles.liveCard} testID="guided-live-hr">
      <View style={styles.liveTop}>
        <Text style={styles.liveLabel}>FRECUENCIA EN VIVO</Text>
        {phase === 'recovery' ? (
          <Text style={styles.timer} testID="guided-timer">
            {String(Math.floor(elapsed / 60)).padStart(2, '0')}:
            {String(elapsed % 60).padStart(2, '0')}
          </Text>
        ) : null}
      </View>
      <View style={styles.liveMain}>
        <Animated.View style={{ transform: [{ scale }], opacity }}>
          <MaterialCommunityIcons name="heart" size={44} color={colors.zoneRed} />
        </Animated.View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text style={styles.liveValue}>{hrValue ?? '—'}</Text>
          <Text style={styles.liveUnit}>bpm</Text>
        </View>
      </View>
      <Text style={styles.liveHint}>
        {status === 'connected'
          ? 'Señal activa desde el pulsómetro.'
          : 'Esperando señal del pulsómetro…'}
      </Text>
    </View>
  );
}

function ScanPhase({
  hr, onSelect,
}: {
  hr: ReturnType<typeof useHeartRateMonitor>;
  onSelect: (id: string) => void;
}) {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <View style={styles.scanHeader}>
        <Text style={styles.sectionTitle}>DISPOSITIVOS</Text>
        <Pressable onPress={hr.startScan} testID="guided-rescan-btn" style={styles.rescan}>
          <MaterialCommunityIcons name="refresh" size={14} color={colors.brandGold} />
          <Text style={styles.rescanText}>Buscar</Text>
        </Pressable>
      </View>
      {hr.status === 'scanning' && (
        <View style={styles.scanning}>
          <ActivityIndicator color={colors.brandGold} />
          <Text style={[shared.muted, { marginTop: spacing.sm }]}>
            Buscando pulsómetros compatibles (perfil HR 0x180D)…
          </Text>
        </View>
      )}
      {hr.devices.length === 0 && hr.status !== 'scanning' && (
        <Text style={[shared.muted, { marginTop: spacing.md }]}>
          No se encontraron pulsómetros. Asegúrate de que esté encendido y en modo emparejamiento.
        </Text>
      )}
      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        {hr.devices.map((d) => (
          <Pressable
            key={d.id}
            testID={`guided-device-${d.id}`}
            onPress={() => onSelect(d.id)}
            style={styles.deviceRow}
          >
            <MaterialCommunityIcons name="heart-pulse" size={20} color={colors.brandGold} />
            <View style={{ flex: 1 }}>
              <Text style={styles.deviceName}>{d.name}</Text>
              <Text style={styles.deviceMeta}>
                {d.id.substring(0, 17)} · {d.rssi != null ? `${d.rssi} dBm` : '—'}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color={colors.onSurfaceTertiary} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ReadyPrompt({ onStart }: { onStart: () => void }) {
  return (
    <View style={[shared.card, { marginTop: spacing.xl }]} testID="guided-ready">
      <Text style={shared.h3}>Pulsómetro conectado</Text>
      <Text style={[shared.body, { marginTop: spacing.sm }]}>
        Ponte cómodo y en calma. En el siguiente paso registraremos tu
        Frecuencia Cardiaca en Reposo (FCr).
      </Text>
      <Pressable style={[shared.primaryBtn, { marginTop: spacing.md }]} onPress={onStart} testID="guided-start-fcr">
        <Text style={shared.primaryBtnText}>Continuar</Text>
      </Pressable>
    </View>
  );
}

function FcrPhase({ hrValue, onRegister }: { hrValue: number | null; onRegister: () => void }) {
  return (
    <View style={[shared.card, { marginTop: spacing.xl }]} testID="phase-fcr">
      <Text style={shared.h3}>Registra tu FCr</Text>
      <Text style={[shared.body, { marginTop: spacing.sm }]}>
        Siéntate y respira con calma durante ~1 minuto. Cuando tu FC en
        vivo esté estable, presiona <Text style={{ color: colors.brandGold, fontWeight: '800' }}>Registrar</Text>.
        Promediaremos los últimos 15 s automáticamente.
      </Text>
      <Pressable
        testID="guided-register-fcr"
        style={[shared.primaryBtn, { marginTop: spacing.md, opacity: hrValue ? 1 : 0.5 }]}
        onPress={onRegister}
        disabled={!hrValue}
      >
        <Text style={shared.primaryBtnText}>Registrar FCr</Text>
      </Pressable>
    </View>
  );
}

function FcpPhase({ fcpTarget, hrValue, fcr, onStart }: {
  fcpTarget: number; hrValue: number | null; fcr: number; onStart: () => void;
}) {
  const reached = !!hrValue && hrValue >= fcpTarget;
  return (
    <View style={[shared.card, { marginTop: spacing.xl }]} testID="phase-fcp">
      <Text style={shared.h3}>Alcanza tu FCP objetivo</Text>
      <Text style={[shared.body, { marginTop: spacing.sm }]}>
        Realiza un esfuerzo controlado hasta acercarte a la meta. Cuando la
        alcances, detén el esfuerzo y presiona <Text style={{ color: colors.brandGold, fontWeight: '800' }}>Iniciar recuperación</Text>.
      </Text>
      <View style={styles.fcpBadges}>
        <FcpBadge label="FCr" value={`${fcr}`} color={colors.onSurfaceSecondary} />
        <FcpBadge label="FCP OBJETIVO" value={`${fcpTarget}`} color={colors.brandGold} />
        <FcpBadge label="EN VIVO" value={hrValue ? `${hrValue}` : '—'} color={reached ? colors.zoneGreen : colors.onSurface} />
      </View>
      <Pressable
        testID="guided-start-recovery"
        style={[shared.primaryBtn, { marginTop: spacing.md, opacity: hrValue ? 1 : 0.5 }]}
        onPress={onStart}
        disabled={!hrValue}
      >
        <Text style={shared.primaryBtnText}>Iniciar recuperación</Text>
      </Pressable>
    </View>
  );
}

function FcpBadge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.fcpBadge}>
      <Text style={styles.fcpBadgeLabel}>{label}</Text>
      <Text style={[styles.fcpBadgeValue, { color }]}>{value}</Text>
    </View>
  );
}

function RecoveryPhase({ elapsed, captured, hrPeak, fcr }: {
  elapsed: number; captured: Record<string, number>; hrPeak: number | null; fcr: number;
}) {
  const progress = Math.min(1, elapsed / RECOVERY_DURATION);
  return (
    <View style={{ marginTop: spacing.xl }} testID="phase-recovery">
      <View style={styles.progressWrap}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={[shared.muted, { textAlign: 'center', marginTop: 6 }]}>
        {elapsed}s / {RECOVERY_DURATION}s
      </Text>

      <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>CAPTURAS AUTOMÁTICAS</Text>
      <Text style={[shared.muted, { marginBottom: spacing.md }]}>
        Cada checkpoint promedia los últimos 5 s para eliminar ruido de señal.
      </Text>
      <View style={styles.captureGrid}>
        <CaptureBox label="FCr" value={fcr} status="done" />
        <CaptureBox label="t=0s (Pico)" value={hrPeak ?? 0} status="done" />
        {CAPTURE_TIMES.map((t) => {
          const key = String(t);
          const val = captured[key];
          const status: 'pending' | 'active' | 'done' =
            val != null ? 'done' : elapsed >= t - 5 && elapsed < t ? 'active' : elapsed < t ? 'pending' : 'done';
          return (
            <CaptureBox
              key={key}
              testID={`capture-${t}`}
              label={`t=${t}s`}
              value={val ?? 0}
              status={status}
            />
          );
        })}
      </View>
    </View>
  );
}

function CaptureBox({
  label, value, status, testID,
}: {
  label: string; value: number; status: 'pending' | 'active' | 'done'; testID?: string;
}) {
  const border =
    status === 'done' ? colors.zoneGreen
    : status === 'active' ? colors.brandGold
    : colors.border;
  return (
    <View testID={testID} style={[styles.captureBox, { borderColor: border, shadowColor: border, shadowOpacity: status !== 'pending' ? 0.5 : 0 }]}>
      <Text style={styles.captureLabel}>{label}</Text>
      <Text style={styles.captureValue}>{value > 0 ? value : '—'}</Text>
      <Text style={styles.captureUnit}>bpm</Text>
    </View>
  );
}

function InfoBlock({ icon, title, text }: { icon: any; title: string; text: string }) {
  return (
    <View style={[shared.card, { marginTop: spacing.xl, alignItems: 'center', gap: spacing.md }]}>
      <MaterialCommunityIcons name={icon} size={32} color={colors.brandGold} />
      <Text style={shared.h3}>{title}</Text>
      <Text style={[shared.body, { textAlign: 'center' }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: colors.onSurface, fontSize: 14, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
  connRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  connDot: {
    width: 8, height: 8, borderRadius: 4,
    shadowOpacity: 0.9, shadowRadius: 4, shadowOffset: { width: 0, height: 0 }, elevation: 3,
  },
  connText: { color: colors.onSurfaceTertiary, fontSize: 11, fontWeight: '600', flexShrink: 1 },
  liveCard: {
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.zoneRed,
    backgroundColor: colors.surfaceSecondary,
    shadowColor: colors.zoneRed,
    shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 6,
  },
  liveTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liveLabel: { color: colors.zoneRed, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  timer: { color: colors.brandGold, fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  liveMain: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.md,
  },
  liveValue: { color: colors.onSurface, fontSize: 72, fontWeight: '900', letterSpacing: 1 },
  liveUnit: { color: colors.onSurfaceTertiary, fontSize: 14, fontWeight: '700', letterSpacing: 2 },
  liveHint: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: spacing.sm },
  scanHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rescan: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong,
  },
  rescanText: { color: colors.brandGold, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  scanning: { alignItems: 'center', paddingVertical: spacing.lg },
  deviceRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  deviceName: { color: colors.onSurface, fontSize: 14, fontWeight: '700' },
  deviceMeta: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  sectionTitle: {
    color: colors.brandGold, fontSize: 11, letterSpacing: 2, fontWeight: '700',
  },
  fcpBadges: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  fcpBadge: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  fcpBadgeLabel: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  fcpBadgeValue: { fontSize: 22, fontWeight: '900', marginTop: 4 },
  progressWrap: {
    height: 6, borderRadius: 3, backgroundColor: colors.surfaceTertiary, overflow: 'hidden',
    marginTop: spacing.md,
  },
  progressFill: { height: '100%', backgroundColor: colors.brandGold },
  captureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  captureBox: {
    width: '31%',
    padding: spacing.sm,
    borderWidth: 1.5, borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 3,
  },
  captureLabel: { color: colors.brandGold, fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  captureValue: { color: colors.onSurface, fontSize: 20, fontWeight: '900', marginTop: 4 },
  captureUnit: { color: colors.onSurfaceTertiary, fontSize: 10, fontWeight: '600' },
  error: { color: colors.zoneRed, fontSize: 13, fontWeight: '600', marginTop: spacing.lg },
});
