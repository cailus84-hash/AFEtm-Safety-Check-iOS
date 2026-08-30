import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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

const TIMES = ['0', '60', '90', '120', '150', '180'] as const;

// Official AFEtm contextual factor icons for the toggle UI. Kept in sync
// with `CONTEXT_FACTORS` from api.ts (source of truth).
const FACTOR_ICONS: Record<ContextFactor, keyof typeof MaterialCommunityIcons.glyphMap> = {
  illness: 'virus-outline',
  sleep: 'sleep',
  training: 'run-fast',
  dehydration: 'cup-water',
  medication: 'pill',
  pain: 'emoticon-sick-outline',
  stimulants: 'coffee-outline',
  none: 'checkbox-marked-circle-outline',
};

export default function NewAssessment() {
  const router = useRouter();
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [age, setAge] = useState<number | null>(null);
  const [hasAthleteId, setHasAthleteId] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [fcr, setFcr] = useState('');
  const [readings, setReadings] = useState<Record<string, string>>({});
  const [factors, setFactors] = useState<ContextFactor[]>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const id = await getDeviceId();
      setDeviceId(id);
      const p = await fetchProfile(id).catch(() => null);
      if (!p) {
        router.replace('/profile-setup');
        return;
      }
      setAge(p.age);
      setHasAthleteId(!!p.athlete_id && p.athlete_id > 0);
    })();
  }, [router]);

  const fcpTarget = useMemo(() => (age ? Math.round(0.8 * (220 - age)) : 0), [age]);
  const totalSteps = 4;

  const toggleFactor = (f: ContextFactor) => {
    setFactors((prev) => {
      // "none" is exclusive: selecting it clears the others; selecting any
      // other factor removes "none".
      if (f === 'none') {
        return prev.includes('none') ? [] : ['none'];
      }
      const next = prev.filter((x) => x !== 'none');
      return next.includes(f) ? next.filter((x) => x !== f) : [...next, f];
    });
  };

  const validateStep = (): string | null => {
    if (step === 0) {
      const n = parseInt(fcr, 10);
      if (!n || n < 30 || n > 130) return t('assess.error.rhr');
      return null;
    }
    if (step === 2) {
      for (const time of TIMES) {
        const v = parseInt(readings[time] || '', 10);
        if (!v || v < 40 || v > 230) return t('assess.error.reading', { t: time });
      }
      const peak = parseInt(readings['0'], 10);
      if (peak < fcpTarget - 20) return t('assess.error.peak', { fcp: fcpTarget });
      return null;
    }
    if (step === 3) {
      if (!factors.length) return t('assess.error.factors');
      return null;
    }
    return null;
  };

  const next = () => {
    const err = validateStep();
    if (err) return setError(err);
    setError(null);
    setStep((s) => Math.min(s + 1, totalSteps - 1));
  };
  const back = () => {
    setError(null);
    if (step === 0) router.back();
    else setStep((s) => s - 1);
  };

  const submit = async () => {
    const err = validateStep();
    if (err) return setError(err);
    if (!hasAthleteId) return setError(t('assess.error.athleteId'));
    setSubmitting(true);
    setError(null);
    try {
      const parsedReadings: Record<string, number> = {};
      TIMES.forEach((tm) => (parsedReadings[tm] = parseInt(readings[tm], 10)));
      const res = await createAssessment({
        device_id: deviceId,
        fcr: parseInt(fcr, 10),
        age: age!,
        readings: parsedReadings,
        factors,
        notes: notes.trim() || null,
      });
      router.replace(`/assessment/${res.id}`);
    } catch (e: any) {
      if (e instanceof UpstreamError) {
        setError(
          t('assess.error.upstream', {
            status: e.upstream_status,
            body: e.upstream_body?.slice(0, 200) || e.message,
          })
        );
      } else if (typeof e?.message === 'string' && e.message.includes('ATHLETE_ID_MISSING')) {
        setError(t('assess.error.athleteId'));
      } else {
        setError(e?.message || t('assess.error.generic'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={shared.screen} edges={['top']} testID="new-assessment-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable onPress={back} testID="assessment-back-btn" style={styles.iconBtn}>
            <MaterialCommunityIcons name="chevron-left" size={26} color={colors.onSurface} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>{t('assess.step', { n: step + 1, total: totalSteps })}</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${((step + 1) / totalSteps) * 100}%` }]} />
            </View>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}
          keyboardShouldPersistTaps="handled"
        >
          {step === 0 && (
            <View testID="step-fcr">
              <Text style={shared.h2}>{t('assess.rhr.title')}</Text>
              <Text style={[shared.body, { marginTop: spacing.sm }]}>{t('assess.rhr.body')}</Text>
              <View style={styles.bigInputWrap}>
                <TextInput
                  testID="fcr-input"
                  style={styles.bigInput}
                  value={fcr}
                  onChangeText={(txt) => setFcr(txt.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="60"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  maxLength={3}
                />
                <Text style={styles.bigUnit}>bpm</Text>
              </View>
              <Text style={[shared.muted, { textAlign: 'center' }]}>{t('assess.rhr.range')}</Text>
            </View>
          )}

          {step === 1 && (
            <View testID="step-fcp">
              <Text style={shared.h2}>{t('assess.fcp.title')}</Text>
              <Text style={[shared.body, { marginTop: spacing.sm }]}>{t('assess.fcp.body')}</Text>
              <View style={styles.fcpBox}>
                <Text style={styles.fcpLabel}>{t('assess.fcp.label')}</Text>
                <Text style={styles.fcpValue}>{fcpTarget}</Text>
                <Text style={styles.fcpUnit}>bpm</Text>
                <Text style={styles.fcpFormula}>0.80 × (220 − {age ?? '?'})</Text>
              </View>
              <View style={styles.tip}>
                <MaterialCommunityIcons name="lightbulb-on-outline" size={16} color={colors.brandGold} />
                <Text style={styles.tipText}>{t('assess.fcp.tip')}</Text>
              </View>
            </View>
          )}

          {step === 2 && (
            <View testID="step-readings">
              <Text style={shared.h2}>{t('assess.readings.title')}</Text>
              <Text style={[shared.body, { marginTop: spacing.sm }]}>{t('assess.readings.body')}</Text>
              <View style={styles.readingsGrid}>
                {TIMES.map((tm) => (
                  <View key={tm} style={styles.readingCard}>
                    <Text style={styles.readingTime}>t = {tm}s</Text>
                    <TextInput
                      testID={`reading-input-${tm}`}
                      style={styles.readingInput}
                      value={readings[tm] ?? ''}
                      onChangeText={(v) =>
                        setReadings((r) => ({ ...r, [tm]: v.replace(/[^0-9]/g, '') }))
                      }
                      keyboardType="number-pad"
                      placeholder="—"
                      placeholderTextColor={colors.onSurfaceTertiary}
                      maxLength={3}
                    />
                    <Text style={styles.readingUnit}>bpm</Text>
                  </View>
                ))}
              </View>
              <Text style={[shared.muted, { marginTop: spacing.md }]}>{t('assess.readings.hint')}</Text>
            </View>
          )}

          {step === 3 && (
            <View testID="step-factors">
              <Text style={shared.h2}>{t('assess.context.title')}</Text>
              <Text style={[shared.body, { marginTop: spacing.sm }]}>
                {t('assess.context.body')}
              </Text>

              {!hasAthleteId && (
                <View style={styles.athleteWarn} testID="factors-athlete-warn">
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
                      testID={`factor-${f}`}
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
                testID="factors-notes-input"
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
            </View>
          )}

          {error ? (
            <Text style={styles.error} testID="assessment-error">
              {error}
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {step < totalSteps - 1 ? (
            <Pressable
              testID="assessment-next-btn"
              style={({ pressed }) => [shared.primaryBtn, pressed && { opacity: 0.9 }]}
              onPress={next}
            >
              <Text style={shared.primaryBtnText}>{t('common.next')}</Text>
            </Pressable>
          ) : (
            <Pressable
              testID="assessment-submit-btn"
              disabled={submitting}
              style={({ pressed }) => [shared.primaryBtn, (pressed || submitting) && { opacity: 0.9 }]}
              onPress={submit}
            >
              {submitting ? <ActivityIndicator color="#000" /> : (
                <Text style={shared.primaryBtnText}>{t('assess.submit')}</Text>
              )}
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  iconBtn: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.pill,
  },
  eyebrow: {
    color: colors.brandGold, fontSize: 10, letterSpacing: 2, fontWeight: '700', marginBottom: 6,
  },
  progressBar: { height: 4, backgroundColor: colors.surfaceTertiary, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.brandGold },
  bigInputWrap: {
    alignItems: 'center', justifyContent: 'center',
    marginTop: spacing.xxl, marginBottom: spacing.md,
  },
  bigInput: {
    color: colors.onSurface, fontSize: 84, fontWeight: '900', textAlign: 'center',
    minWidth: 180, letterSpacing: 2,
  },
  bigUnit: { color: colors.brandGold, fontSize: 14, letterSpacing: 3, fontWeight: '700' },
  fcpBox: {
    alignItems: 'center', marginTop: spacing.xxl,
    padding: spacing.xl,
    borderWidth: 2, borderColor: colors.brandGold, borderRadius: radius.lg,
    backgroundColor: '#141310',
    shadowColor: colors.brandGold, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 6,
  },
  fcpLabel: { color: colors.brandGold, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  fcpValue: { color: colors.onSurface, fontSize: 84, fontWeight: '900', letterSpacing: 2, marginTop: 4 },
  fcpUnit: { color: colors.onSurfaceTertiary, fontSize: 14, fontWeight: '600', letterSpacing: 2 },
  fcpFormula: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: spacing.md, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  tip: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    marginTop: spacing.xl, padding: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  tipText: { color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 17, flex: 1 },
  readingsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xl },
  readingCard: {
    width: '48%', padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary, alignItems: 'center',
  },
  readingTime: { color: colors.brandGold, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  readingInput: {
    color: colors.onSurface, fontSize: 32, fontWeight: '800', textAlign: 'center',
    marginTop: 6, minWidth: 90, letterSpacing: 1,
  },
  readingUnit: { color: colors.onSurfaceTertiary, fontSize: 11, fontWeight: '600' },
  fcpvBlock: {
    padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
  },
  fcpvLabel: { color: colors.onSurface, fontSize: 14, fontWeight: '700' },
  fcpvHint: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2, marginBottom: spacing.md },
  fcpvOpts: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  fcpvOpt: {
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
  },
  fcpvOptText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: '600' },
  // AFEtm contextual factor chips (multi-select). "none" gets a distinctive
  // dashed green outline to signal its exclusive-clear behaviour.
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
  error: { color: colors.zoneRed, fontSize: 13, fontWeight: '600', marginTop: spacing.lg },
  footer: {
    padding: spacing.xl, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
});
