import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import ConfettiCannon from 'react-native-confetti-cannon';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Assessment, deleteAssessment, fetchProfile, getAssessment, getDeviceId, resyncAssessment, UpstreamError } from '@/src/lib/api';
import { RecoveryChart } from '@/src/components/RecoveryChart';
import { colors, radius, shared, spacing, zoneColor } from '@/src/lib/theme';
import {
  useI18n,
  zoneLabelI18n,
  zoneDescI18n,
  patternLabelI18n,
} from '@/src/lib/i18n';

const TIMES = ['0', '60', '90', '120', '150', '180'];

export default function AssessmentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, formatDateTime } = useI18n();
  const { width } = useWindowDimensions();
  const [a, setA] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareErr, setShareErr] = useState<string | null>(null);
  const [targetMet, setTargetMet] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [resyncErr, setResyncErr] = useState<string | null>(null);
  const shareRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      try {
        if (!id) return;
        const deviceId = await getDeviceId();
        const assessment = await getAssessment(id, deviceId);
        setA(assessment);

        if (!assessment.zone) return;
        const profile = await fetchProfile(deviceId).catch(() => null);
        const target = profile?.target_zone ?? null;
        const rank: Record<string, number> = { RED: 0, YELLOW: 1, GREEN: 2, BLUE: 3 };
        if (target && rank[assessment.zone] >= rank[target]) {
          setTargetMet(true);
          const key = `afetm.celebrated.${assessment.id}`;
          const already = await AsyncStorage.getItem(key);
          if (!already) {
            await AsyncStorage.setItem(key, '1');
            setShowConfetti(true);
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const doResync = async () => {
    if (!id) return;
    setResyncing(true);
    setResyncErr(null);
    try {
      const deviceId = await getDeviceId();
      const updated = await resyncAssessment(id, deviceId);
      setA(updated);
    } catch (e: any) {
      if (e instanceof UpstreamError) {
        setResyncErr(
          `HTTP ${e.upstream_status} · ${e.upstream_body?.slice(0, 240) || e.message}`
        );
      } else {
        setResyncErr(e?.message || t('detail.resync.error'));
      }
    } finally {
      setResyncing(false);
    }
  };

  const remove = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      const deviceId = await getDeviceId();
      await deleteAssessment(id, deviceId);
      router.replace('/(tabs)/history');
    } finally {
      setDeleting(false);
    }
  };

  const share = async () => {
    setShareErr(null);
    setSharing(true);
    try {
      if (Platform.OS === 'web') {
        setShareErr(t('detail.share.web'));
        return;
      }
      if (!shareRef.current) {
        setShareErr(t('detail.share.prepareErr'));
        return;
      }
      const uri = await captureRef(shareRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        setShareErr(t('detail.share.unavailable'));
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: t('detail.share.title'),
      });
    } catch (e: any) {
      setShareErr(e?.message || t('detail.share.error'));
    } finally {
      setSharing(false);
    }
  };

  if (loading) {
    return (
      <View style={[shared.screen, { alignItems: 'center', justifyContent: 'center' }]} testID="detail-loading">
        <ActivityIndicator color={colors.brandGold} />
      </View>
    );
  }

  if (!a) {
    return (
      <SafeAreaView style={shared.screen}>
        <View style={{ padding: spacing.xl }}>
          <Text style={shared.h2}>{t('detail.notFound')}</Text>
          <Pressable style={[shared.primaryBtn, { marginTop: spacing.lg }]} onPress={() => router.replace('/(tabs)')}>
            <Text style={shared.primaryBtnText}>{t('detail.back')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const pending = !a.zone || a.calc_source !== 'authoritative';
  const color = pending ? colors.brandGold : zoneColor(a.zone!);

  return (
    <SafeAreaView style={shared.screen} edges={['top']} testID="assessment-detail-screen">
      {showConfetti && !pending && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="confetti-overlay">
          <ConfettiCannon
            count={140}
            origin={{ x: -20, y: 0 }}
            explosionSpeed={340}
            fallSpeed={2600}
            fadeOut
            autoStart
            colors={[colors.brandGold, colors.zoneBlue, colors.zoneGreen, colors.zoneYellow, colors.onSurface]}
          />
        </View>
      )}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} testID="detail-back-btn" style={styles.iconBtn}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.topTitle}>{t('detail.title')}</Text>
        <View style={{ flexDirection: 'row' }}>
          <Pressable
            onPress={share}
            testID="detail-share-btn"
            style={styles.iconBtn}
            disabled={sharing}
          >
            {sharing ? (
              <ActivityIndicator color={colors.brandGold} size="small" />
            ) : (
              <MaterialCommunityIcons name="share-variant" size={20} color={colors.brandGold} />
            )}
          </Pressable>
          <Pressable
            onPress={() => setConfirmDel((v) => !v)}
            testID="detail-delete-toggle"
            style={styles.iconBtn}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.onSurfaceTertiary} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }}>
        <ViewShot
          ref={shareRef}
          options={{ format: 'png', quality: 1 }}
          style={styles.shareRegion}
          testID="detail-share-region"
        >
          {!pending ? (
            <View
              style={[styles.banner, { borderColor: color, shadowColor: color }]}
              testID="result-zone-banner"
            >
              <LinearGradient
                colors={[`${color}30`, 'transparent']}
                style={StyleSheet.absoluteFill}
              />
              <View style={[styles.bannerIcon, { borderColor: color, shadowColor: color }]}>
                <MaterialCommunityIcons
                  name={
                    a.zone === 'BLUE' ? 'shield-check'
                    : a.zone === 'GREEN' ? 'chart-line-variant'
                    : a.zone === 'YELLOW' ? 'alert'
                    : 'alert-octagon'
                  }
                  size={28}
                  color={color}
                />
              </View>
              <Text style={styles.bannerEyebrow}>{t('detail.zone.eyebrow')}</Text>
              <Text style={[styles.bannerZone, { color }]}>{zoneLabelI18n(t, a.zone!)}</Text>
              <Text style={styles.bannerDesc}>{zoneDescI18n(t, a.zone!)}</Text>
              <View style={styles.bannerRow}>
                <View style={styles.bannerChip}>
                  <Text style={styles.bannerChipLabel}>{t('detail.chip.pattern')}</Text>
                  <Text style={styles.bannerChipValue}>
                    {a.pattern ? patternLabelI18n(t, a.pattern) : '—'}
                  </Text>
                </View>
                <View style={styles.bannerChip}>
                  <Text style={styles.bannerChipLabel}>{t('detail.chip.action')}</Text>
                  <Text style={styles.bannerChipValue}>{a.action ?? '—'}</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.pendingBanner} testID="result-pending-banner">
              <View style={styles.pendingIconWrap}>
                <MaterialCommunityIcons name="cloud-sync-outline" size={28} color={colors.brandGold} />
              </View>
              <Text style={styles.pendingEyebrow}>{t('detail.pending.eyebrow')}</Text>
              <Text style={styles.pendingTitle}>{t('detail.pending.title')}</Text>
              <Text style={styles.pendingDesc}>
                {a.calc_notice || t('detail.pending.desc')}
              </Text>
              <Text style={styles.pendingHint}>{t('detail.pending.hint')}</Text>
              <Pressable
                testID="detail-resync-btn"
                onPress={doResync}
                disabled={resyncing}
                style={[styles.resyncBtn, resyncing && { opacity: 0.6 }]}
              >
                {resyncing ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="refresh" size={16} color="#000" />
                    <Text style={styles.resyncBtnText}>{t('detail.resync')}</Text>
                  </>
                )}
              </Pressable>
              {resyncErr ? (
                <Text style={styles.resyncErr} testID="detail-resync-error">
                  Upstream: {resyncErr}
                </Text>
              ) : null}
            </View>
          )}

          <Text style={styles.date}>{formatDateTime(a.created_at)}</Text>

          {targetMet && !pending && (
            <View style={styles.celebrateBanner} testID="celebrate-banner">
              <MaterialCommunityIcons name="trophy" size={20} color={colors.brandGold} />
              <Text style={styles.celebrateText}>{t('detail.celebrate')}</Text>
            </View>
          )}

          <Text style={styles.sectionTitle}>{t('detail.section.chart')}</Text>
          <View testID="result-recovery-chart" style={{ alignItems: 'center' }}>
            <RecoveryChart
              readings={a.readings}
              times={[0, 60, 90, 120, 150, 180]}
              fcr={a.fcr}
              fcpTarget={a.fcp_target}
              zoneColor={color}
              width={Math.min(width - spacing.xl * 2, 360)}
              height={210}
            />
          </View>

          <Text style={styles.shareFooter}>AFE™ Safety Check</Text>
        </ViewShot>

        {shareErr ? (
          <Text style={styles.shareErr} testID="detail-share-error">{shareErr}</Text>
        ) : null}

        <Text style={styles.sectionTitle}>{t('detail.section.metrics')}</Text>
        <View style={styles.metricsGrid}>
          <Metric label="HRR" value={`${a.hrr}`} unit="bpm" hint={t('detail.metric.hrr.hint')} />
          <Metric label="RECpct" value={`${a.recpct}`} unit="%" hint={t('detail.metric.recpct.hint')} />
          <Metric label="AURC" value={`${a.aurc}`} unit="" hint={t('detail.metric.aurc.hint')} />
          <Metric label="τ (tau)" value={`${a.tau}`} unit="s" hint={t('detail.metric.tau.hint')} />
        </View>

        <Text style={styles.sectionTitle}>{t('detail.section.reference')}</Text>
        <View style={styles.refGrid}>
          <RefItem label={t('detail.ref.rhr')} value={`${a.fcr}`} unit="bpm" />
          <RefItem label={t('detail.ref.peak')} value={`${a.hr_peak}`} unit="bpm" />
          <RefItem label={t('detail.ref.fcp')} value={`${a.fcp_target}`} unit="bpm" />
          <RefItem label={t('detail.ref.age')} value={`${a.age}`} unit={t('detail.ref.age.unit')} />
        </View>

        <Text style={styles.sectionTitle}>{t('detail.section.readings')}</Text>
        <View style={styles.curveWrap}>
          {TIMES.map((tm) => (
            <View key={tm} style={styles.curveItem}>
              <Text style={styles.curveTime}>{tm}s</Text>
              <Text style={styles.curveHr}>{a.readings[tm]}</Text>
              <Text style={styles.curveUnit}>bpm</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>{t('detail.section.context')}</Text>
        <View style={[shared.card, { padding: spacing.md }]}>
          <FcpvRow label={t('detail.fcpv.sleep')} value={a.fcpv.sleep} />
          <FcpvRow label={t('detail.fcpv.hydration')} value={a.fcpv.hydration} />
          <FcpvRow label={t('detail.fcpv.symptoms')} value={a.fcpv.symptoms} />
          <FcpvRow label={t('detail.fcpv.illness')} value={a.fcpv.recent_illness} />
          <FcpvRow label={t('detail.fcpv.load')} value={a.fcpv.subjective_load} />
          <View style={styles.fcpvTotalRow}>
            <Text style={styles.fcpvTotalLabel}>{t('detail.fcpv.total')}</Text>
            <Text style={styles.fcpvTotalValue}>{a.fcpv_total} / 10</Text>
          </View>
          {a.context_flag ? (
            <View style={styles.contextFlag}>
              <MaterialCommunityIcons name="alert-outline" size={14} color={colors.zoneYellow} />
              <Text style={styles.contextFlagText}>{t('detail.contextFlag')}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.disclaimer} testID="result-disclaimer">
          <MaterialCommunityIcons name="information-outline" size={16} color={colors.onSurfaceTertiary} />
          <Text style={styles.disclaimerText}>{t('detail.disclaimer')}</Text>
        </View>

        {confirmDel ? (
          <View style={styles.deleteBox}>
            <Text style={[shared.body, { marginBottom: spacing.md }]}>
              {t('detail.delete.confirm')}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Pressable
                style={[shared.secondaryBtn, { flex: 1 }]}
                onPress={() => setConfirmDel(false)}
                testID="detail-delete-cancel"
              >
                <Text style={shared.secondaryBtnText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                testID="detail-delete-confirm"
                disabled={deleting}
                style={[shared.primaryBtn, { flex: 1, backgroundColor: colors.zoneRed }]}
                onPress={remove}
              >
                {deleting ? <ActivityIndicator color="#fff" /> : (
                  <Text style={[shared.primaryBtnText, { color: '#fff' }]}>{t('common.delete')}</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          testID="detail-home-btn"
          style={({ pressed }) => [shared.primaryBtn, pressed && { opacity: 0.9 }]}
          onPress={() => router.replace('/(tabs)')}
        >
          <Text style={shared.primaryBtnText}>{t('detail.home')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Metric({ label, value, unit, hint }: { label: string; value: string; unit: string; hint: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text style={styles.metricValue}>{value}</Text>
        {unit ? <Text style={styles.metricUnit}>{unit}</Text> : null}
      </View>
      <Text style={styles.metricHint}>{hint}</Text>
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
          const c =
            value === 0 ? colors.zoneGreen : value === 1 ? colors.zoneYellow : colors.zoneRed;
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
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  topTitle: { color: colors.onSurface, fontSize: 15, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  banner: {
    borderRadius: radius.lg, borderWidth: 2, padding: spacing.xl,
    backgroundColor: colors.surfaceSecondary,
    shadowOpacity: 0.7, shadowRadius: 16, shadowOffset: { width: 0, height: 0 },
    elevation: 10, overflow: 'hidden',
  },
  bannerIcon: {
    width: 52, height: 52, borderRadius: 26,
    borderWidth: 2, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.7, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 6,
    marginBottom: spacing.md,
  },
  bannerEyebrow: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 3, fontWeight: '700' },
  bannerZone: { fontSize: 32, fontWeight: '900', letterSpacing: 0.5, marginTop: 6 },
  bannerDesc: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  bannerRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  bannerChip: {
    flex: 1,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md,
    backgroundColor: colors.surface,
  },
  bannerChipLabel: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  bannerChipValue: { color: colors.onSurface, fontSize: 14, fontWeight: '800', marginTop: 4 },
  date: {
    color: colors.onSurfaceTertiary, fontSize: 12,
    textAlign: 'center', marginTop: spacing.lg, letterSpacing: 0.5,
  },
  sectionTitle: {
    color: colors.brandGold, fontSize: 11, letterSpacing: 2, fontWeight: '700',
    marginTop: spacing.xl, marginBottom: spacing.md,
  },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metric: {
    width: '48%', padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
  },
  metricLabel: { color: colors.brandGold, fontSize: 11, letterSpacing: 1, fontWeight: '700' },
  metricValue: { color: colors.onSurface, fontSize: 28, fontWeight: '900', marginTop: 4 },
  metricUnit: { color: colors.onSurfaceTertiary, fontSize: 11, fontWeight: '600' },
  metricHint: { color: colors.onSurfaceTertiary, fontSize: 10, marginTop: 4 },
  refGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  refItem: {
    flexGrow: 1, minWidth: '47%', padding: spacing.sm + 2,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
  },
  refLabel: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  refValue: { color: colors.onSurface, fontSize: 18, fontWeight: '800', marginTop: 2 },
  refUnit: { color: colors.onSurfaceTertiary, fontSize: 11, fontWeight: '600' },
  curveWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  curveItem: {
    width: '31%', alignItems: 'center', padding: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
  },
  curveTime: { color: colors.brandGold, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  curveHr: { color: colors.onSurface, fontSize: 22, fontWeight: '900', marginTop: 2 },
  curveUnit: { color: colors.onSurfaceTertiary, fontSize: 10, fontWeight: '600' },
  fcpvRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  fcpvLabel: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: '600' },
  fcpvDots: { flexDirection: 'row', gap: 6 },
  fcpvDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1 },
  fcpvTotalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: spacing.md,
  },
  fcpvTotalLabel: { color: colors.brandGold, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  fcpvTotalValue: { color: colors.onSurface, fontSize: 18, fontWeight: '900' },
  contextFlag: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    marginTop: spacing.md, padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.zoneYellow,
    backgroundColor: '#1F1A0A',
  },
  contextFlagText: { color: colors.onSurfaceSecondary, fontSize: 11, lineHeight: 15, flex: 1 },
  disclaimer: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    marginTop: spacing.xl, padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border,
  },
  disclaimerText: { color: colors.onSurfaceTertiary, fontSize: 11, lineHeight: 15, flex: 1 },
  shareRegion: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  shareFooter: {
    color: colors.brandGold, fontSize: 12, letterSpacing: 4, fontWeight: '900',
    textAlign: 'center', marginTop: spacing.lg,
  },
  shareErr: { color: colors.zoneRed, fontSize: 12, fontWeight: '600', marginTop: spacing.sm },
  celebrateBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: spacing.md, padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.brandGold,
    backgroundColor: '#1F1B10',
    shadowColor: colors.brandGold,
    shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 5,
  },
  celebrateText: {
    color: colors.brandGold, fontSize: 13, fontWeight: '800', letterSpacing: 0.3, flex: 1,
  },
  pendingBanner: {
    borderRadius: radius.lg,
    borderWidth: 2, borderColor: colors.brandGold, borderStyle: 'dashed',
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.xl,
    shadowColor: colors.brandGold,
    shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 5,
    alignItems: 'flex-start',
  },
  pendingIconWrap: {
    width: 52, height: 52, borderRadius: 26,
    borderWidth: 2, borderColor: colors.brandGold,
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
    shadowColor: colors.brandGold, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 4,
  },
  pendingEyebrow: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 3, fontWeight: '700' },
  pendingTitle: { color: colors.brandGold, fontSize: 22, fontWeight: '900', letterSpacing: 0.3, marginTop: 4 },
  pendingDesc: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  pendingHint: { color: colors.onSurfaceTertiary, fontSize: 11, lineHeight: 16, marginTop: spacing.md },
  resyncBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.brandGold,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.lg,
    alignSelf: 'stretch',
  },
  resyncBtnText: { color: '#000', fontSize: 14, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  resyncErr: {
    color: colors.zoneRed, fontSize: 11, marginTop: spacing.sm, lineHeight: 15,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  deleteBox: {
    marginTop: spacing.xl, padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.zoneRed,
    backgroundColor: '#1A0A0A',
  },
  footer: {
    padding: spacing.xl, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
});
