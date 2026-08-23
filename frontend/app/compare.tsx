import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Assessment, getAssessment } from '@/src/lib/api';
import { CompareChart } from '@/src/components/CompareChart';
import { colors, radius, shared, spacing, zoneColor } from '@/src/lib/theme';
import { useI18n, zoneShortI18n, patternLabelI18n } from '@/src/lib/i18n';

export default function Compare() {
  const router = useRouter();
  const { t, formatDateTime } = useI18n();
  const { ids } = useLocalSearchParams<{ ids: string }>();
  const { width } = useWindowDimensions();
  const [a, setA] = useState<Assessment | null>(null);
  const [b, setB] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [id1, id2] = String(ids ?? '').split(',').filter(Boolean);
        if (!id1 || !id2) {
          setError(t('compare.error.select'));
          return;
        }
        const [aa, bb] = await Promise.all([getAssessment(id1), getAssessment(id2)]);
        const sorted = [aa, bb].sort((x, y) => x.created_at.localeCompare(y.created_at));
        setA(sorted[0]);
        setB(sorted[1]);
      } catch (e: any) {
        setError(e?.message || t('compare.error.select'));
      } finally {
        setLoading(false);
      }
    })();
  }, [ids, t]);

  if (loading) {
    return (
      <View style={[shared.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.brandGold} />
      </View>
    );
  }
  if (error || !a || !b) {
    return (
      <SafeAreaView style={shared.screen} edges={['top', 'bottom']}>
        <View style={{ padding: spacing.xl }}>
          <Text style={shared.h2}>{t('compare.error.title')}</Text>
          <Text style={[shared.body, { marginTop: spacing.sm }]}>{error}</Text>
          <Pressable style={[shared.primaryBtn, { marginTop: spacing.lg }]} onPress={() => router.back()}>
            <Text style={shared.primaryBtnText}>{t('detail.back')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const ca = a.zone ? zoneColor(a.zone) : colors.brandGold;
  const cb = b.zone ? zoneColor(b.zone) : colors.brandGold;
  const labelA = a.zone ? zoneShortI18n(t, a.zone) : t('common.pending');
  const labelB = b.zone ? zoneShortI18n(t, b.zone) : t('common.pending');
  const dRec = +(b.recpct - a.recpct).toFixed(1);
  const dHrr = b.hrr - a.hrr;
  const dTau = +(b.tau - a.tau).toFixed(0);

  const chartW = Math.min(width - spacing.xl * 2, 360);

  return (
    <SafeAreaView style={shared.screen} edges={['top']} testID="compare-screen">
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} testID="compare-back-btn" style={styles.iconBtn}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.topTitle}>{t('compare.title')}</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }}>
        <Text style={styles.eyebrow}>{t('compare.eyebrow')}</Text>
        <Text style={shared.h2}>{t('compare.heading')}</Text>

        <View style={{ alignItems: 'center', marginTop: spacing.lg }}>
          <CompareChart
            a={{ label: `A · ${labelA}`, color: ca, readings: a.readings }}
            b={{ label: `B · ${labelB}`, color: cb, readings: b.readings }}
            times={[0, 60, 90, 120, 150, 180]}
            width={chartW}
            height={240}
          />
        </View>

        <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
          <SessionCard label={t('compare.session.a')} a={a} c={ca} zoneLabel={labelA} solid
            formatDateTime={formatDateTime} t={t} />
          <SessionCard label={t('compare.session.b')} a={b} c={cb} zoneLabel={labelB}
            formatDateTime={formatDateTime} t={t} />
        </View>

        <Text style={styles.section}>{t('compare.section.deltas')}</Text>
        <View style={styles.deltaGrid}>
          <Delta label="RECpct" value={`${dRec > 0 ? '+' : ''}${dRec}%`} positive={dRec >= 0} unit="" />
          <Delta label="HRR" value={`${dHrr > 0 ? '+' : ''}${dHrr}`} positive={dHrr >= 0} unit="bpm" />
          <Delta label="τ (tau)" value={`${dTau > 0 ? '+' : ''}${dTau}`} positive={dTau <= 0} unit="s" invert />
        </View>

        <Text style={[shared.muted, { marginTop: spacing.md }]}>{t('compare.footer')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function SessionCard({ label, a, c, zoneLabel, solid, formatDateTime, t }: {
  label: string; a: Assessment; c: string; zoneLabel: string; solid?: boolean;
  formatDateTime: (iso: string) => string; t: any;
}) {
  return (
    <View style={[styles.card, { borderColor: c }]}>
      <View style={styles.cardTop}>
        <View style={styles.cardBadge}>
          <View
            style={{
              width: 20,
              borderTopWidth: solid ? 3 : 3,
              borderColor: c,
              borderStyle: solid ? 'solid' : 'dashed',
            }}
          />
          <Text style={styles.cardLabel}>{label}</Text>
        </View>
        <Text style={[styles.cardZone, { color: c }]}>{zoneLabel}</Text>
      </View>
      <Text style={styles.cardDate}>{formatDateTime(a.created_at)}</Text>
      <View style={styles.cardMetaRow}>
        <MetaMini label="RECpct" value={`${a.recpct}%`} />
        <MetaMini label="HRR" value={`${a.hrr}bpm`} />
        <MetaMini label="τ" value={`${a.tau}s`} />
        <MetaMini label={t('detail.chip.pattern')} value={a.pattern ? patternLabelI18n(t, a.pattern) : '—'} />
      </View>
    </View>
  );
}

function MetaMini({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaMini}>
      <Text style={styles.metaMiniLabel}>{label}</Text>
      <Text style={styles.metaMiniValue}>{value}</Text>
    </View>
  );
}

function Delta({ label, value, positive, unit, invert }: {
  label: string; value: string; positive: boolean; unit: string; invert?: boolean;
}) {
  const isGood = invert ? !positive : positive;
  const c = isGood ? colors.zoneGreen : colors.zoneRed;
  return (
    <View style={styles.delta}>
      <Text style={styles.deltaLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <Text style={[styles.deltaValue, { color: c }]}>{value}</Text>
        {unit ? <Text style={styles.deltaUnit}>{unit}</Text> : null}
      </View>
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
  eyebrow: { color: colors.brandGold, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginBottom: 4 },
  section: { color: colors.brandGold, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginTop: spacing.xl, marginBottom: spacing.md },
  card: {
    padding: spacing.md,
    borderRadius: radius.md, borderWidth: 1.5,
    backgroundColor: colors.surfaceSecondary,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardBadge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardLabel: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  cardZone: { fontSize: 14, fontWeight: '900', letterSpacing: 0.3 },
  cardDate: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 4 },
  cardMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
  metaMini: {},
  metaMiniLabel: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  metaMiniValue: { color: colors.onSurface, fontSize: 14, fontWeight: '800', marginTop: 2 },
  deltaGrid: { flexDirection: 'row', gap: spacing.md },
  delta: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  deltaLabel: { color: colors.brandGold, fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  deltaValue: { fontSize: 22, fontWeight: '900', marginTop: 4 },
  deltaUnit: { color: colors.onSurfaceTertiary, fontSize: 11, fontWeight: '600' },
});
