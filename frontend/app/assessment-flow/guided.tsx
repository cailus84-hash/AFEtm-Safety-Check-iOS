import { ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { useHeartRateMonitor } from '@/src/hooks/useHeartRateMonitor';
import { useProtocolAudio } from '@/src/hooks/useProtocolAudio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CAPTURE_TIMES, RECOVERY_DURATION } from '@/src/hr/acquisition';
import { preserveObservation } from '@/src/hr/observation';
import { colors, radius, shared, spacing } from '@/src/lib/theme';
import {
  createAssessment,
  fetchProfile,
  getDeviceId,
  UpstreamError,
  CONTEXT_FACTORS,
  CONTEXT_NOTES_MAX,
  type ContextFactor,
} from '@/src/lib/api';
import { useI18n } from '@/src/lib/i18n';

// Icon map for the AFEtm contextual factor toggle buttons.
const FACTOR_ICONS: Record<ContextFactor, ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  illness: 'virus-outline',
  sleep: 'sleep',
  training: 'run-fast',
  dehydration: 'cup-water',
  medication: 'pill',
  pain: 'emoticon-sick-outline',
  stimulants: 'coffee-outline',
  none: 'checkbox-marked-circle-outline',
};

type Phase =
  | 'scan'
  | 'connect'
  | 'ready'
  | 'fcr'
  | 'fcp'
  | 'recovery'
  | 'factors'
  | 'submit'
  | 'observation'
  | 'incomplete'
  | 'error';

export default function Guided() {
  const router = useRouter();
  const { t } = useI18n();
  const hr = useHeartRateMonitor();
  const { cue, unavailable: audioUnavailable } = useProtocolAudio();
  const [phase, setPhase] = useState<Phase>('scan');
  const [profile, setProfile] = useState<{ age: number; athleteId: number | null } | null>(null);
  const [deviceId, setDeviceId] = useState('');
  const [fcr, setFcr] = useState<number | null>(null);
  const [hrPeak, setHrPeak] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [captured, setCaptured] = useState<Record<string, number>>({});
  const [factors, setFactors] = useState<ContextFactor[]>([]);
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pulse = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<any>(null);
  const submittedRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const toggleFactor = (f: ContextFactor) => {
    setFactors((prev) => {
      if (f === 'none') return prev.includes('none') ? [] : ['none'];
      const next = prev.filter((x) => x !== 'none');
      return next.includes(f) ? next.filter((x) => x !== f) : [...next, f];
    });
  };

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
      setProfile({ age: p.age, athleteId: p.athlete_id ?? null });
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
    const avg = hr.acquisition?.registerResting();
    if (!avg || avg < 30 || avg > 130) {
      cue('warning');
      setErrorMsg(t('guided.fcr.error'));
      return;
    }
    setFcr(avg);
    setErrorMsg(null);
    setPhase('fcp');
    cue('rest', `${hr.acquisition?.id}:rest`);
  }, [hr, t, cue]);

  const markPeakAndStart = useCallback(() => {
    const session = hr.acquisition;
    // Automatic transition and a concurrent button event cannot start twice.
    if (session && session.status !== 'collecting') return;
    const measured = session?.freshSample()?.bpm;
    if (session && measured !== undefined && fcpTarget > 0 && measured >= fcpTarget) {
      cue('target', `${session.id}:target`);
    }
    // Schedule the cue, then immediately let the unchanged controller validate
    // eligibility and capture t=0. Never await audio or use it as a clock.
    const result = session?.startRecovery(fcpTarget);
    if (result === 'observation' && session && measured !== undefined) {
      cue('warning', `${session.id}:terminal-warning`);
      setPhase('observation');
      setErrorMsg(null);
      void preserveObservation(AsyncStorage, {
        session_id: session.id,
        sensor_id: session.deviceId,
        timestamp: new Date().toISOString(),
        status: 'Observation / Target HR Not Reached',
        target_hr: fcpTarget,
        measured_hr: measured,
      }).catch(() => {
        if (mountedRef.current) setErrorMsg(t('guided.observation.unsaved'));
      });
      void hr.disconnect();
      return;
    }
    if (result !== 'started' || !session) {
      cue('warning', `${session?.id}:terminal-warning`);
      setErrorMsg(t('guided.incomplete.body'));
      setPhase('incomplete');
      void hr.disconnect();
      return;
    }
    setHrPeak(session.captured['0']);
    setCaptured({ ...session.captured });
    setErrorMsg(null);
    setElapsed(0);
    setPhase('recovery');
    cue('start', `${session.id}:start`);
  }, [hr, fcpTarget, t, cue]);

  useEffect(() => {
    if (phase !== 'fcp') return;
    const measured = hr.acquisition?.freshSample()?.bpm;
    if (measured !== undefined && fcpTarget > 0 && measured >= fcpTarget) markPeakAndStart();
  }, [phase, hr.hr, hr.acquisition, fcpTarget, markPeakAndStart]);

  useEffect(() => {
    if (['observation', 'incomplete', 'error'].includes(phase)) {
      cue('warning', `${hr.acquisition?.id}:terminal-warning`);
    }
  }, [phase, hr.acquisition, cue]);

  // Recovery timer + auto-captures
  useEffect(() => {
    if (phase !== 'recovery') {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    const session = hr.acquisition;
    if (!session) {
      setPhase('incomplete');
      return;
    }
    timerRef.current = setInterval(() => {
      session.advance();
      setElapsed(session.elapsed);
      setCaptured({ ...session.captured });
      // Cues follow confirmed immutable captures, never the elapsed timer alone.
      if (session.status === 'recovery' || session.status === 'complete') {
        for (const checkpoint of CAPTURE_TIMES) {
          if (session.captured[String(checkpoint)] !== undefined) {
            cue(checkpoint === 180 ? 'complete' : 'checkpoint', `${session.id}:checkpoint:${checkpoint}`);
          }
        }
      }
      if (session.status === 'incomplete') {
        setErrorMsg(t('guided.incomplete.body'));
        setPhase('incomplete');
        void hr.disconnect();
      } else if (session.status === 'complete') {
        clearInterval(timerRef.current);
        timerRef.current = null;
        setPhase('factors');
      }
    }, 500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, hr.acquisition, hr.disconnect, t, cue]);

  // A disconnect before target, during recovery, or before submission is terminal.
  useEffect(() => {
    if (hr.acquisition?.status === 'incomplete'
      && !['incomplete', 'observation', 'submit'].includes(phase)) {
      setErrorMsg(t('guided.incomplete.body'));
      setPhase('incomplete');
      void hr.disconnect();
    }
  }, [hr.acquisition?.status, hr.disconnect, phase, t]);

  // Auto-submit once we hit submit phase
  useEffect(() => {
    if (phase !== 'submit' || submittedRef.current) return;
    submittedRef.current = true;
    (async () => {
      try {
        // Guard: profile MUST have a numeric athleteId before hitting Replit.
        if (!profile?.athleteId || profile.athleteId <= 0) {
          setErrorMsg(t('assess.error.athleteId'));
          setPhase('error');
          return;
        }
        const session = hr.acquisition;
        if (!session) throw new Error('INCOMPLETE_ACQUISITION');
        const res = await session.submit(({ fcr: recordedFcr, readings }) => createAssessment({
          device_id: deviceId,
          fcr: recordedFcr,
          age: profile.age,
          readings,
          factors,
          notes: notes.trim() || null,
          // TEMPORARY diagnostic metadata — captures the connected BLE
          // monitor name so we can trace what the real iPhone sends.
          safety_confirmed: true,
          safety_confirmed_at: new Date().toISOString(),
          ble_device_name: hr.connectedDevice?.name ?? null,
        }));
        // Acquisition is already sealed; native cleanup cannot block the result.
        void hr.disconnect();
        if (mountedRef.current) router.replace(`/assessment/${res.id}`);
      } catch (e: any) {
        if (!mountedRef.current) return;
        submittedRef.current = false;
        if (e?.message === 'INCOMPLETE_ACQUISITION') {
          setErrorMsg(t('guided.incomplete.body'));
          setPhase('incomplete');
          return;
        } else if (e instanceof UpstreamError) {
          setErrorMsg(
            t('assess.error.upstream', {
              status: e.upstream_status ?? '—',
              body: e.reason || e.upstream_body?.slice(0, 200) || e.message,
            })
          );
        } else if (typeof e?.message === 'string' && e.message.includes('ATHLETE_ID_MISSING')) {
          setErrorMsg(t('assess.error.athleteId'));
        } else {
          setErrorMsg(e?.message || t('assess.error.generic'));
        }
        setPhase('error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ---------------- Render helpers ----------------
  const back = async () => {
    mountedRef.current = false;
    void hr.disconnect();
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
          <Text style={styles.topTitle}>{t('guided.title')}</Text>
          <View style={styles.iconBtn} />
        </View>
        <View style={{ padding: spacing.xl, flex: 1, justifyContent: 'center' }}>
          <View style={[shared.card, { alignItems: 'center', gap: spacing.md }]}>
            <MaterialCommunityIcons name="bluetooth-off" size={40} color={colors.zoneYellow} />
            <Text style={[shared.h3, { textAlign: 'center' }]}>
              {t('guided.unsupported.title')}
            </Text>
            <Text style={[shared.body, { textAlign: 'center' }]}>
              {Platform.OS === 'web'
                ? t('guided.unsupported.web')
                : t('guided.unsupported.native')}
            </Text>
            <Pressable
              style={[shared.primaryBtn, { alignSelf: 'stretch', marginTop: spacing.md }]}
              onPress={() => router.replace('/assessment-flow/manual')}
              testID="guided-fallback-manual"
            >
              <Text style={shared.primaryBtnText}>{t('guided.unsupported.cta')}</Text>
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
          <Text style={styles.topTitle}>{phaseLabel(phase, t)}</Text>
          <ConnectionPill hr={hr} t={t} />
        </View>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }}>
        {/* Live HR banner */}
        <LiveHrCard hrValue={hr.hr} pulseAnim={pulse} status={hr.status} phase={phase} elapsed={elapsed} t={t} />

        {/* Phase-specific body */}
        {audioUnavailable && (
          <Text style={[shared.muted, { marginTop: spacing.sm }]} accessibilityLiveRegion="polite">
            {t('guided.audio.unavailable')}
          </Text>
        )}
        {phase === 'scan' && (
          <ScanPhase hr={hr} onSelect={(id) => { setPhase('connect'); hr.connect(id); }} t={t} />
        )}
        {phase === 'connect' && (
          <InfoBlock icon="progress-clock" title={t('guided.connecting.title')} text={t('guided.connecting.body')} />
        )}
        {hr.status === 'connected' && (phase === 'connect' || phase === 'scan') && (
          <ReadyPrompt onStart={() => { cue('click'); setPhase('fcr'); }} t={t} />
        )}
        {phase === 'fcr' && (
          <FcrPhase hrValue={hr.hr} onRegister={registerFcr} t={t} />
        )}
        {phase === 'fcp' && (
          <FcpPhase fcpTarget={fcpTarget} hrValue={hr.hr} fcr={fcr!} onStart={() => { cue('click'); markPeakAndStart(); }} t={t} />
        )}
        {phase === 'recovery' && (
          <>
            {hr.isReconnecting && (
              <View style={styles.reconnectBanner} testID="guided-reconnect-banner">
                <ActivityIndicator color={colors.zoneYellow} size="small" />
                <Text style={styles.reconnectText}>
                  {t('guided.reconnect', { n: hr.reconnectAttempt })}
                </Text>
              </View>
            )}
            <RecoveryPhase elapsed={elapsed} captured={captured} hrPeak={hrPeak} fcr={fcr!} t={t} />
          </>
        )}
        {phase === 'factors' && (
          <View style={[shared.card, { marginTop: spacing.xl }]} testID="guided-factors-phase">
            {captured['180'] !== undefined && (
              <Text style={[shared.h3, { color: colors.brandGold, marginBottom: spacing.lg }]}
                accessibilityLiveRegion="polite" testID="guided-recovery-complete">
                {t('guided.recovery.complete')}
              </Text>
            )}
            <Text style={shared.h3}>{t('assess.context.title')}</Text>
            <Text style={[shared.body, { marginTop: spacing.sm }]}>
              {t('assess.context.body')}
            </Text>

            {(!profile?.athleteId || profile.athleteId <= 0) && (
              <View style={styles.athleteWarn} testID="guided-athlete-warn">
                <MaterialCommunityIcons
                  name="alert-circle-outline"
                  size={16}
                  color={colors.zoneRed}
                />
                <Text style={styles.athleteWarnText}>
                  {t('assess.error.athleteId')}
                </Text>
              </View>
            )}

            <View style={styles.factorsGrid}>
              {CONTEXT_FACTORS.map((f) => {
                const active = factors.includes(f);
                return (
                  <Pressable
                    key={f}
                    testID={`guided-factor-${f}`}
                    onPress={() => toggleFactor(f)}
                    style={[
                      styles.factorChip,
                      active && styles.factorChipActive,
                      f === 'none' && styles.factorChipNone,
                      f === 'none' && active && styles.factorChipNoneActive,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={FACTOR_ICONS[f]}
                      size={18}
                      color={active ? '#000' : colors.brandGold}
                    />
                    <Text
                      style={[
                        styles.factorChipText,
                        active && { color: '#000' },
                      ]}
                      numberOfLines={2}
                    >
                      {t(`assess.factor.${f}` as any)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[shared.muted, { marginTop: spacing.sm }]}>
              {t('assess.context.none.hint')}
            </Text>

            <Text style={[shared.label, { marginTop: spacing.xl }]}>
              {t('assess.context.notes')}
            </Text>
            <TextInput
              testID="guided-factors-notes"
              value={notes}
              onChangeText={(txt) => setNotes(txt.slice(0, CONTEXT_NOTES_MAX))}
              placeholder={t('assess.context.notes.ph')}
              placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.notesInput}
              multiline
              maxLength={CONTEXT_NOTES_MAX}
            />
            <Text style={styles.notesCount}>
              {t('assess.context.notes.count', { n: notes.length })}
            </Text>

            <Pressable
              testID="guided-factors-submit"
              disabled={!factors.length || !(profile?.athleteId && profile.athleteId > 0)}
              onPress={() => { cue('click'); setPhase('submit'); }}
              style={({ pressed }) => [
                shared.primaryBtn,
                { marginTop: spacing.lg },
                (!factors.length || !(profile?.athleteId && profile.athleteId > 0)) && { opacity: 0.4 },
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={shared.primaryBtnText}>{t('assess.submit')}</Text>
            </Pressable>
          </View>
        )}
        {(phase === 'observation' || phase === 'incomplete') && (
          <View style={[shared.card, { marginTop: spacing.xl }]} testID={`guided-${phase}`}>
            <Text style={shared.h3}>{t(phase === 'observation' ? 'guided.observation.title' : 'guided.incomplete.title')}</Text>
            <Text style={[shared.body, { marginTop: spacing.sm }]}>
              {t(phase === 'observation' ? 'guided.observation.body' : 'guided.incomplete.body')}
            </Text>
            <Pressable style={[shared.primaryBtn, { marginTop: spacing.md }]} onPress={() => router.replace('/(tabs)/new')}>
              <Text style={shared.primaryBtnText}>{t('guided.attempt.finish')}</Text>
            </Pressable>
          </View>
        )}
        {phase === 'submit' && (
          <View style={[shared.card, { alignItems: 'center', gap: spacing.md, marginTop: spacing.xl }]}>
            <ActivityIndicator color={colors.brandGold} size="large" />
            <Text style={shared.h3}>{t('guided.submit.title')}</Text>
            <Text style={[shared.body, { textAlign: 'center' }]}>{t('guided.submit.body')}</Text>
          </View>
        )}
        {phase === 'error' && (
          <View style={[shared.card, { marginTop: spacing.xl }]}>
            <Text style={[shared.h3, { color: colors.zoneRed }]}>{t('guided.error.title')}</Text>
            <Text style={[shared.body, { marginTop: spacing.sm }]}>
              {errorMsg || t('guided.error.default')}
            </Text>
            <Pressable
              style={[shared.primaryBtn, { marginTop: spacing.md }]}
              onPress={() => { void hr.disconnect(); router.replace('/(tabs)/new'); }}
            >
              <Text style={shared.primaryBtnText}>{t('guided.error.retry')}</Text>
            </Pressable>
          </View>
        )}

        {errorMsg && phase !== 'error' && phase !== 'incomplete' ? (
          <Text style={styles.error} testID="guided-error">{errorMsg}</Text>
        ) : null}

        {/* No-permission fallback */}
        {hr.status === 'no-permission' && (
          <View style={[shared.card, { marginTop: spacing.xl }]}>
            <Text style={shared.h3}>{t('guided.perm.title')}</Text>
            <Text style={[shared.body, { marginTop: spacing.sm }]}>{t('guided.perm.body')}</Text>
            <Pressable style={[shared.primaryBtn, { marginTop: spacing.md }]} onPress={hr.startScan}>
              <Text style={shared.primaryBtnText}>{t('guided.perm.retry')}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function phaseLabel(p: Phase, t: (k: any) => string) {
  switch (p) {
    case 'scan':
      return t('guided.phase.scan');
    case 'connect':
      return t('guided.phase.connect');
    case 'ready':
      return t('guided.phase.ready');
    case 'fcr':
      return t('guided.phase.fcr');
    case 'fcp':
      return t('guided.phase.fcp');
    case 'recovery':
      return t('guided.phase.recovery');
    case 'factors':
      return t('assess.context.title');
    case 'submit':
      return t('guided.phase.submit');
    case 'observation':
      return t('guided.observation.title');
    case 'incomplete':
      return t('guided.incomplete.title');
    case 'error':
      return t('guided.phase.error');
  }
}

// ---------------- Sub-components ----------------

function ConnectionPill({ hr, t }: { hr: ReturnType<typeof useHeartRateMonitor>; t: any }) {
  const reconnecting = hr.isReconnecting;
  const dotColor = reconnecting ? colors.zoneYellow
    : hr.status === 'connected' ? colors.zoneGreen
    : hr.status === 'scanning' || hr.status === 'connecting' ? colors.zoneYellow
    : colors.onSurfaceTertiary;
  const label = reconnecting
    ? t('guided.pill.reconnecting', { n: hr.reconnectAttempt })
    : hr.connectedDevice?.name ?? (hr.status === 'scanning' ? t('guided.pill.scanning') : t('guided.pill.disconnected'));
  return (
    <View style={styles.connRow} testID="guided-connection-pill">
      <View style={[styles.connDot, { backgroundColor: dotColor, shadowColor: dotColor }]} />
      <Text style={styles.connText} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function LiveHrCard({
  hrValue, pulseAnim, status, phase, elapsed, t,
}: {
  hrValue: number | null;
  pulseAnim: Animated.Value;
  status: any;
  phase: Phase;
  elapsed: number;
  t: any;
}) {
  const scale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const opacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  return (
    <View style={styles.liveCard} testID="guided-live-hr">
      <View style={styles.liveTop}>
        <Text style={styles.liveLabel}>{t('guided.live.label')}</Text>
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
        {status === 'connected' ? t('guided.live.active') : t('guided.live.idle')}
      </Text>
    </View>
  );
}

function ScanPhase({ hr, onSelect, t }: {
  hr: ReturnType<typeof useHeartRateMonitor>;
  onSelect: (id: string) => void;
  t: any;
}) {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <View style={styles.scanHeader}>
        <Text style={styles.sectionTitle}>{t('guided.devices')}</Text>
        <Pressable onPress={hr.startScan} testID="guided-rescan-btn" style={styles.rescan}>
          <MaterialCommunityIcons name="refresh" size={14} color={colors.brandGold} />
          <Text style={styles.rescanText}>{t('guided.scan')}</Text>
        </Pressable>
      </View>
      {hr.status === 'scanning' && (
        <View style={styles.scanning}>
          <ActivityIndicator color={colors.brandGold} />
          <Text style={[shared.muted, { marginTop: spacing.sm }]}>{t('guided.scanning')}</Text>
        </View>
      )}
      {hr.devices.length === 0 && hr.status !== 'scanning' && (
        <Text style={[shared.muted, { marginTop: spacing.md }]}>{t('guided.no.devices')}</Text>
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

      {/* Bluetooth compatibility disclaimer — user's responsibility */}
      <View style={styles.bleDisclaimer} testID="guided-ble-disclaimer">
        <MaterialCommunityIcons name="bluetooth-audio" size={14} color={colors.brandGold} />
        <Text style={styles.bleDisclaimerText}>
          <Text style={{ fontWeight: '800' }}>{t('new.ble.disclaimer.title')} · </Text>
          {t('new.ble.disclaimer.body')}
        </Text>
      </View>
    </View>
  );
}

function ReadyPrompt({ onStart, t }: { onStart: () => void; t: any }) {
  return (
    <View style={[shared.card, { marginTop: spacing.xl }]} testID="guided-ready">
      <Text style={shared.h3}>{t('guided.ready.title')}</Text>
      <Text style={[shared.body, { marginTop: spacing.sm }]}>{t('guided.ready.body')}</Text>
      <Pressable style={[shared.primaryBtn, { marginTop: spacing.md }]} onPress={onStart} testID="guided-start-fcr">
        <Text style={shared.primaryBtnText}>{t('common.continue')}</Text>
      </Pressable>
    </View>
  );
}

function FcrPhase({ hrValue, onRegister, t }: { hrValue: number | null; onRegister: () => void; t: any }) {
  return (
    <View style={[shared.card, { marginTop: spacing.xl }]} testID="phase-fcr">
      <Text style={shared.h3}>{t('guided.fcr.title')}</Text>
      <Text style={[shared.body, { marginTop: spacing.sm }]}>{t('guided.fcr.body')}</Text>
      <Pressable
        testID="guided-register-fcr"
        style={[shared.primaryBtn, { marginTop: spacing.md, opacity: hrValue ? 1 : 0.5 }]}
        onPress={onRegister}
        disabled={!hrValue}
      >
        <Text style={shared.primaryBtnText}>{t('guided.fcr.register')}</Text>
      </Pressable>
    </View>
  );
}

function FcpPhase({ fcpTarget, hrValue, fcr, onStart, t }: {
  fcpTarget: number; hrValue: number | null; fcr: number; onStart: () => void; t: any;
}) {
  const reached = !!hrValue && hrValue >= fcpTarget;
  const progress = hrValue !== null && fcpTarget > 0 ? Math.max(0, Math.min(1, hrValue / fcpTarget)) : 0;
  return (
    <View style={[shared.card, { marginTop: spacing.xl }]} testID="phase-fcp">
      <Text style={shared.h3}>{t('guided.fcp.title')}</Text>
      <Text style={[shared.body, { marginTop: spacing.sm }]}>{t('guided.fcp.body')}</Text>
      <View style={styles.fcpBadges}>
        <FcpBadge label={t('guided.fcp.rhr')} value={`${fcr}`} color={colors.onSurfaceSecondary} />
        <FcpBadge label={t('guided.fcp.target')} value={`${fcpTarget}`} color={colors.brandGold} />
        <FcpBadge label={t('guided.fcp.live')} value={hrValue ? `${hrValue}` : '—'} color={reached ? colors.zoneGreen : colors.onSurface} />
      </View>
      <View style={[styles.progressWrap, { marginTop: spacing.md }]}
        accessibilityRole="progressbar" accessibilityLabel={t('guided.fcp.target')}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={[shared.muted, { marginTop: spacing.sm }]}>{Math.round(progress * 100)}%</Text>
      <Text style={[shared.body, { marginTop: spacing.md }]} accessibilityLiveRegion="polite">
        {t(reached ? 'guided.fcp.reached' : 'guided.fcp.required')}
      </Text>
      <Pressable
        testID="guided-start-recovery"
        style={[styles.rescan, { marginTop: spacing.lg, opacity: hrValue && !reached ? 1 : 0.5 }]}
        onPress={onStart}
        disabled={!hrValue || reached}
      >
        <Text style={styles.rescanText}>{t('guided.fcp.end')}</Text>
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

function RecoveryPhase({ elapsed, captured, hrPeak, fcr, t }: {
  elapsed: number; captured: Record<string, number>; hrPeak: number | null; fcr: number; t: any;
}) {
  const progress = Math.min(1, elapsed / RECOVERY_DURATION);
  return (
    <View style={{ marginTop: spacing.xl }} testID="phase-recovery">
      <Text style={[shared.h3, { color: colors.brandGold, marginBottom: spacing.sm }]}
        accessibilityLiveRegion="polite">{t('guided.fcp.reached')}</Text>
      <Text style={[shared.body, { marginBottom: spacing.lg }]} accessibilityLiveRegion="polite">
        {t('guided.recovery.started')}
      </Text>
      <View style={styles.progressWrap}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={[shared.muted, { textAlign: 'center', marginTop: 6 }]}>
        {elapsed}s / {RECOVERY_DURATION}s
      </Text>

      <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>{t('guided.recovery.captures')}</Text>
      <Text style={[shared.muted, { marginBottom: spacing.md }]}>
        {t('guided.recovery.captures.hint')}
      </Text>
      <View style={styles.captureGrid}>
        <CaptureBox label={t('guided.fcp.rhr')} value={fcr} status="done" />
        <CaptureBox label={t('guided.recovery.peak')} value={hrPeak} status={hrPeak === null ? 'pending' : 'done'} />
        {CAPTURE_TIMES.map((tm) => {
          const key = String(tm);
          const val = captured[key];
          const status: 'pending' | 'active' | 'done' =
            val != null ? 'done' : elapsed >= tm - 5 && elapsed < tm ? 'active' : 'pending';
          return (
            <CaptureBox
              key={key}
              testID={`capture-${tm}`}
              label={`t=${tm}s`}
              value={val ?? null}
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
  label: string; value: number | null; status: 'pending' | 'active' | 'done'; testID?: string;
}) {
  const border =
    status === 'done' ? colors.zoneGreen
    : status === 'active' ? colors.brandGold
    : colors.border;
  return (
    <View testID={testID} style={[styles.captureBox, { borderColor: border, shadowColor: border, shadowOpacity: status !== 'pending' ? 0.5 : 0 }]}>
      <Text style={styles.captureLabel}>{label}</Text>
      <Text style={styles.captureValue}>{value !== null ? value : '—'}</Text>
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
  reconnectBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, marginTop: spacing.lg,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.zoneYellow,
    backgroundColor: '#1F1A0A',
  },
  reconnectText: { color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 16, flex: 1 },
  bleDisclaimer: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    marginTop: spacing.md, padding: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong,
    backgroundColor: '#141310',
  },
  bleDisclaimerText: { flex: 1, color: colors.onSurfaceSecondary, fontSize: 11, lineHeight: 16 },
  athleteWarn: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.zoneRed,
    backgroundColor: 'rgba(220,53,69,0.08)',
    marginTop: spacing.md,
  },
  athleteWarnText: { flex: 1, color: colors.zoneRed, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  factorsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    marginTop: spacing.lg,
  },
  factorChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSecondary,
    minWidth: '48%',
    flexGrow: 1,
  },
  factorChipActive: {
    backgroundColor: colors.brandGold,
    borderColor: colors.brandGold,
  },
  factorChipNone: {
    borderColor: colors.zoneGreen,
    borderStyle: 'dashed',
  },
  factorChipNoneActive: {
    backgroundColor: colors.zoneGreen,
    borderColor: colors.zoneGreen,
    borderStyle: 'solid',
  },
  factorChipText: {
    flex: 1,
    color: colors.onSurface, fontSize: 12, fontWeight: '700',
  },
  notesInput: {
    minHeight: 96,
    padding: spacing.md,
    marginTop: 6,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    color: colors.onSurface, fontSize: 13, lineHeight: 18,
    textAlignVertical: 'top',
  },
  notesCount: {
    color: colors.onSurfaceTertiary, fontSize: 11,
    textAlign: 'right', marginTop: 4,
  },
});
