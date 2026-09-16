import { View, Text, StyleSheet, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Assessment } from '@/src/lib/api';
import { RecoveryChart } from '@/src/components/RecoveryChart';
import { colors, radius, shared, spacing, zoneColor } from '@/src/lib/theme';
import {
  useI18n,
  zoneLabelI18n,
  zoneDescI18n,
  patternLabelI18n,
} from '@/src/lib/i18n';

const TIMES = ['0', '60', '90', '120', '150', '180'] as const;
const isFiniteNumber = (value: number | null | undefined): value is number => Number.isFinite(value);
const displayNumber = (value: number | null | undefined) => isFiniteNumber(value) ? String(value) : '—';

export function AssessmentResultView({
  assessment,
  onClose,
}: {
  assessment: Assessment;
  onClose?: () => void;
}) {
  const { t, formatDateTime } = useI18n();
  const { width } = useWindowDimensions();
  const pending = !assessment.zone;
  const color = pending ? colors.brandGold : zoneColor(assessment.zone!);
  const chartReady = TIMES.every((tm) => isFiniteNumber(assessment.readings?.[tm]))
    && isFiniteNumber(assessment.fcr)
    && isFiniteNumber(assessment.fcp_target);
  const displayDate = Number.isFinite(Date.parse(assessment.created_at))
    ? formatDateTime(assessment.created_at)
    : '—';

  return (
    <SafeAreaView style={shared.screen} edges={['top']} testID="assessment-result-view">
      <View style={styles.topBar}>
        {onClose ? (
          <Pressable onPress={onClose} testID="assessment-result-close" style={styles.iconBtn}>
            <MaterialCommunityIcons name="chevron-left" size={26} color={colors.onSurface} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
        <Text style={styles.topTitle}>{t('detail.title')}</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }}>
        {!pending ? (
          <View style={[styles.banner, { borderColor: color, shadowColor: color }]}>
            <View style={[styles.bannerIcon, { borderColor: color, shadowColor: color }]}>
              <MaterialCommunityIcons
                name={
                  assessment.zone === 'BLUE' ? 'shield-check'
                  : assessment.zone === 'GREEN' ? 'chart-line-variant'
                  : assessment.zone === 'YELLOW' ? 'alert'
                  : 'alert-octagon'
                }
                size={28}
                color={color}
              />
            </View>
            <Text style={styles.eyebrow}>{t('detail.zone.eyebrow')}</Text>
            <Text style={[styles.zone, { color }]}>{zoneLabelI18n(t, assessment.zone!)}</Text>
            <Text style={styles.desc}>{zoneDescI18n(t, assessment.zone!)}</Text>
            <View style={styles.bannerRow}>
              <View style={styles.bannerChip}>
                <Text style={styles.bannerChipLabel}>{t('detail.chip.pattern')}</Text>
                <Text style={styles.bannerChipValue}>
                  {assessment.pattern ? patternLabelI18n(t, assessment.pattern) : '—'}
                </Text>
              </View>
              <View style={styles.bannerChip}>
                <Text style={styles.bannerChipLabel}>{t('detail.chip.action')}</Text>
                <Text style={styles.bannerChipValue}>{assessment.action ?? '—'}</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.pendingBanner}>
            <MaterialCommunityIcons name="cloud-sync-outline" size={28} color={colors.brandGold} />
            <Text style={styles.pendingTitle}>{t('detail.pending.title')}</Text>
            <Text style={styles.desc}>{assessment.calc_notice || t('detail.pending.desc')}</Text>
          </View>
        )}

        <Text style={styles.date}>{displayDate}</Text>

        <Text style={styles.sectionTitle}>{t('detail.section.chart')}</Text>
        <View testID="result-recovery-chart" style={{ alignItems: 'center' }}>
          {chartReady ? (
            <RecoveryChart
              readings={assessment.readings as Record<string, number>}
              times={[0, 60, 90, 120, 150, 180]}
              fcr={assessment.fcr as number}
              fcpTarget={assessment.fcp_target as number}
              zoneColor={color}
              width={Math.min(width - spacing.xl * 2, 360)}
              height={210}
            />
          ) : (
            <Text style={shared.muted}>—</Text>
          )}
        </View>

        <Text style={styles.sectionTitle}>{t('detail.section.metrics')}</Text>
        <View style={styles.metricsGrid}>
          <Metric label="HRR" value={displayNumber(assessment.hrr)} unit="bpm" />
          <Metric label="RECpct" value={displayNumber(assessment.recpct)} unit="%" />
          <Metric label="AURC" value={displayNumber(assessment.aurc)} unit="" />
          <Metric label="τ (tau)" value={displayNumber(assessment.tau)} unit="s" />
        </View>

        <Text style={styles.sectionTitle}>{t('detail.section.reference')}</Text>
        <View style={styles.refGrid}>
          <RefItem label={t('detail.ref.rhr')} value={displayNumber(assessment.fcr)} unit="bpm" />
          <RefItem label={t('detail.ref.peak')} value={displayNumber(assessment.hr_peak)} unit="bpm" />
          <RefItem label={t('detail.ref.fcp')} value={displayNumber(assessment.fcp_target)} unit="bpm" />
          <RefItem label={t('detail.ref.age')} value={displayNumber(assessment.age)} unit={t('detail.ref.age.unit')} />
        </View>

        <Text style={styles.sectionTitle}>{t('detail.section.readings')}</Text>
        <View style={styles.curveWrap}>
          {TIMES.map((tm) => (
            <View key={tm} style={styles.curveItem}>
              <Text style={styles.curveTime}>{tm}s</Text>
              <Text style={styles.curveHr}>{displayNumber(assessment.readings?.[tm])}</Text>
              <Text style={styles.curveUnit}>bpm</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>{t('detail.section.context')}</Text>
        <View style={[shared.card, { padding: spacing.md }]}>
          {assessment.fcpv ? (
            <>
              <FcpvRow label={t('detail.fcpv.sleep')} value={assessment.fcpv.sleep} />
              <FcpvRow label={t('detail.fcpv.hydration')} value={assessment.fcpv.hydration} />
              <FcpvRow label={t('detail.fcpv.symptoms')} value={assessment.fcpv.symptoms} />
              <FcpvRow label={t('detail.fcpv.illness')} value={assessment.fcpv.recent_illness} />
              <FcpvRow label={t('detail.fcpv.load')} value={assessment.fcpv.subjective_load} />
              <View style={styles.fcpvTotalRow}>
                <Text style={styles.fcpvTotalLabel}>{t('detail.fcpv.total')}</Text>
                <Text style={styles.fcpvTotalValue}>{displayNumber(assessment.fcpv_total)} / 10</Text>
              </View>
            </>
          ) : (
            <Text style={shared.muted}>—</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text style={styles.metricValue}>{value}</Text>
        {unit ? <Text style={styles.metricUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

function RefItem({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.refItem}>
      <Text style={styles.refLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <Text style={styles.refValue}>{value}</Text>
        <Text style={styles.refUnit}>{unit}</Text>
      </View>
    </View>
  );
}

function FcpvRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.fcpvRow}>
      <Text style={styles.fcpvLabel}>{label}</Text>
      <View style={styles.fcpvDots}>
        {[0, 1, 2].map((n) => {
          const active = n <= value;
          const c = value === 0 ? colors.zoneGreen : value === 1 ? colors.zoneYellow : colors.zoneRed;
          return (
            <View
              key={n}
              style={[
                styles.fcpvDot,
                { backgroundColor: active ? c : colors.surfaceTertiary, borderColor: active ? c : colors.border },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  topTitle: { color: colors.onSurface, fontSize: 15, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  banner: { borderRadius: radius.lg, borderWidth: 2, padding: spacing.xl, backgroundColor: colors.surfaceSecondary, shadowOpacity: 0.7, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 10, overflow: 'hidden' },
  bannerIcon: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.7, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 6, marginBottom: spacing.md },
  eyebrow: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 3, fontWeight: '700' },
  zone: { fontSize: 32, fontWeight: '900', letterSpacing: 0.5, marginTop: 6 },
  desc: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  bannerRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  bannerChip: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surface },
  bannerChipLabel: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  bannerChipValue: { color: colors.onSurface, fontSize: 14, fontWeight: '800', marginTop: 4 },
  pendingBanner: { borderRadius: radius.lg, borderWidth: 2, borderColor: colors.brandGold, borderStyle: 'dashed', backgroundColor: colors.surfaceSecondary, padding: spacing.xl, alignItems: 'flex-start' },
  pendingTitle: { color: colors.brandGold, fontSize: 22, fontWeight: '900', letterSpacing: 0.3, marginTop: spacing.sm },
  date: { color: colors.onSurfaceTertiary, fontSize: 12, textAlign: 'center', marginTop: spacing.lg, letterSpacing: 0.5 },
  sectionTitle: { color: colors.brandGold, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginTop: spacing.xl, marginBottom: spacing.md },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metric: { width: '48%', padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  metricLabel: { color: colors.brandGold, fontSize: 11, letterSpacing: 1, fontWeight: '700' },
  metricValue: { color: colors.onSurface, fontSize: 28, fontWeight: '900', marginTop: 4 },
  metricUnit: { color: colors.onSurfaceTertiary, fontSize: 11, fontWeight: '600' },
  refGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  refItem: { flexGrow: 1, minWidth: '47%', padding: spacing.sm + 2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  refLabel: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  refValue: { color: colors.onSurface, fontSize: 18, fontWeight: '800', marginTop: 2 },
  refUnit: { color: colors.onSurfaceTertiary, fontSize: 11, fontWeight: '600' },
  curveWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  curveItem: { width: '31%', alignItems: 'center', padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  curveTime: { color: colors.brandGold, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  curveHr: { color: colors.onSurface, fontSize: 22, fontWeight: '900', marginTop: 2 },
  curveUnit: { color: colors.onSurfaceTertiary, fontSize: 10, fontWeight: '600' },
  fcpvRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  fcpvLabel: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: '600' },
  fcpvDots: { flexDirection: 'row', gap: 6 },
  fcpvDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1 },
  fcpvTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.md },
  fcpvTotalLabel: { color: colors.brandGold, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  fcpvTotalValue: { color: colors.onSurface, fontSize: 18, fontWeight: '900' },
});
