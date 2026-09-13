import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Assessment,
  Profile,
  fetchProfile,
  getCurrentTerms,
  getDeviceId,
  listAssessments,
} from '@/src/lib/api';
import {
  Subscription,
  daysUntilExpiry,
  ensureIOSFreeAccess,
  fetchSubscription,
  hasActiveAccess,
  IOS_PAYWALL_ENABLED,
} from '@/src/lib/billing';
import { TrendSparkline } from '@/src/components/TrendSparkline';
import { ColorGuideCard } from '@/src/components/ColorGuideCard';
import {
  colors,
  radius,
  shared,
  spacing,
  zoneColor,
} from '@/src/lib/theme';
import {
  useI18n,
  zoneLabelI18n,
  zoneDescI18n,
  patternLabelI18n,
} from '@/src/lib/i18n';

export default function Home() {
  const router = useRouter();
  const { t, formatDateTime } = useI18n();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // License reminder — shown on the 1st of every month, once per month.
  // Dismissal is per YYYY-MM so the reminder returns next month.
  const [showLicenseReminder, setShowLicenseReminder] = useState(false);
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  const load = useCallback(async () => {
    try {
      const id = await getDeviceId();
      // Fetch profile + current server terms in parallel. If the server
      // has bumped the Terms version, we bounce to /terms?mode=update
      // to force a re-acceptance before the athlete can create anything
      // (the server also enforces this via 403 PERSONAL_USE_TERMS_OUTDATED).
      const [p, list, terms] = await Promise.all([
        fetchProfile(id),
        listAssessments(id).catch(() => []),
        getCurrentTerms().catch(() => null),
      ]);
      if (!p) {
        router.replace('/');
        return;
      }
      if (!p.terms_accepted_at) {
        router.replace('/terms');
        return;
      }
      if (terms && p.terms_version && terms.version !== p.terms_version) {
        router.replace('/terms?mode=update');
        return;
      }
      if (!p.name) {
        router.replace('/profile-setup');
        return;
      }
      // First-time athletes must go through the 3-slide introduction
      // tour once. Reopenable later from Profile → "Introduction tour".
      try {
        const seen = await AsyncStorage.getItem('afetm.tourSeen');
        if (seen !== '1') {
          router.replace('/tour');
          return;
        }
      } catch {}

      // Subscription state — controls whether the athlete can start new
      // Safety Checks. Never bounces to the paywall automatically; we
      // only surface the gate banner in the UI so browsing history and
      // reading past assessments stays available.
      try {
        const s = await fetchSubscription(id);
        setSubscription(s);
      } catch {
        setSubscription(null);
      }

      // License reminder — visible on the 1st of every month unless the
      // athlete already dismissed it for this month.
      try {
        const now = new Date();
        if (now.getDate() === 1) {
          const key = `afetm.licenseReminderDismissed.${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          const dismissed = await AsyncStorage.getItem(key);
          setShowLicenseReminder(dismissed !== '1');
        } else {
          setShowLicenseReminder(false);
        }
      } catch {
        setShowLicenseReminder(false);
      }

      setProfile(p);
      setAssessments(list);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const dismissLicenseReminder = useCallback(async () => {
    setShowLicenseReminder(false);
    try {
      const now = new Date();
      const key = `afetm.licenseReminderDismissed.${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      await AsyncStorage.setItem(key, '1');
    } catch {}
  }, []);

  const fcpTarget = profile ? Math.round(0.8 * (220 - profile.age)) : 0;
  const last = assessments[0] ?? null;
  const count = assessments.length;
  const trendData = [...assessments]
    .filter((a) => a.zone !== null && a.zone !== undefined)
    .slice(0, 7)
    .reverse()
    .map((a) => ({ recpct: a.recpct, zone: a.zone as 'BLUE' | 'GREEN' | 'YELLOW' | 'RED' }));

  return (
    <SafeAreaView style={shared.screen} edges={['top']} testID="home-screen">
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }}
        refreshControl={
          <RefreshControl
            tintColor={colors.brandGold}
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>{t('home.eyebrow')}</Text>
            <Text style={shared.h2}>
              {t('home.greeting')}{profile ? `, ${profile.name.split(' ')[0]}` : ''}
            </Text>
          </View>
          <View style={styles.badge}>
            <MaterialCommunityIcons name="shield-check" size={16} color={colors.brandGold} />
            <Text style={styles.badgeText}>{t('home.badge')}</Text>
          </View>
        </View>

        {/* Monthly Personal-license reminder — 1st of the month only,
            dismissible for the rest of the month. */}
        {showLicenseReminder && (
          <View style={styles.licenseReminder} testID="home-license-reminder">
            <View style={styles.licenseReminderMain}>
              <View style={styles.licenseReminderIcon}>
                <MaterialCommunityIcons
                  name="shield-lock-outline"
                  size={16}
                  color={colors.brandGold}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.licenseReminderEyebrow}>
                  {t('home.license.eyebrow')}
                </Text>
                <Text style={styles.licenseReminderTitle}>
                  {t('home.license.title')}
                </Text>
                <Text style={styles.licenseReminderBody}>
                  {t('home.license.body')}
                </Text>
              </View>
              <Pressable
                testID="home-license-reminder-dismiss"
                onPress={dismissLicenseReminder}
                hitSlop={10}
                style={styles.licenseReminderClose}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={16}
                  color={colors.onSurfaceTertiary}
                />
              </Pressable>
            </View>
            <Pressable
              testID="home-license-reminder-cta"
              onPress={() => router.push('/institutional')}
              style={({ pressed }) => [
                styles.licenseReminderCta,
                pressed && { opacity: 0.85 },
              ]}
            >
              <MaterialCommunityIcons
                name="office-building-outline"
                size={13}
                color={colors.brandGold}
              />
              <Text style={styles.licenseReminderCtaText}>
                {t('home.license.cta')}
              </Text>
              <MaterialCommunityIcons
                name="chevron-right"
                size={14}
                color={colors.onSurfaceTertiary}
              />
            </Pressable>
          </View>
        )}

        {loading ? (
          <View style={{ marginTop: spacing.xxl, alignItems: 'center' }}>
            <ActivityIndicator color={colors.brandGold} />
          </View>
        ) : (
          <>
            {/* Subscription pill (trial countdown or active plan).
                Hidden on iOS v1.0 (free-access mode). */}
            {IOS_PAYWALL_ENABLED && subscription && hasActiveAccess(subscription) && (
              <Pressable
                testID="home-subscription-pill"
                onPress={() => router.push('/manage-subscription')}
                style={styles.subPill}
              >
                <MaterialCommunityIcons
                  name={subscription.status === 'trial' ? 'gift-outline' : 'crown-outline'}
                  size={13}
                  color={subscription.status === 'trial' ? colors.zoneYellow : colors.brandGold}
                />
                <Text
                  style={[
                    styles.subPillText,
                    { color: subscription.status === 'trial' ? colors.zoneYellow : colors.brandGold },
                  ]}
                >
                  {subscription.status === 'trial'
                    ? t('home.subscription.trial.pill', { n: daysUntilExpiry(subscription) })
                    : t('home.subscription.active.pill')}
                </Text>
                <MaterialCommunityIcons name="chevron-right" size={14} color={colors.onSurfaceTertiary} />
              </Pressable>
            )}

            {/* Subscription gate banner — visible when no active access.
                Hidden on iOS v1.0 (free-access mode) since we render no
                paywall or Manage Subscription entries on iOS. */}
            {IOS_PAYWALL_ENABLED && subscription && !hasActiveAccess(subscription) && (
              <View style={styles.gateCard} testID="home-subscription-gate">
                <View style={styles.gateHeader}>
                  <View style={styles.gateIcon}>
                    <MaterialCommunityIcons name="lock-outline" size={16} color={colors.brandGold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.gateTitle}>{t('home.subscription.gate.title')}</Text>
                    <Text style={styles.gateBody}>{t('home.subscription.gate.body')}</Text>
                  </View>
                </View>
                <Pressable
                  testID="home-subscription-gate-cta"
                  onPress={() => router.push('/paywall')}
                  style={({ pressed }) => [
                    styles.gateCta,
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={subscription.status === 'none' ? 'gift-outline' : 'crown-outline'}
                    size={14}
                    color="#000"
                  />
                  <Text style={styles.gateCtaText}>
                    {subscription.status === 'none'
                      ? t('home.subscription.gate.trialCta')
                      : t('home.subscription.gate.cta')}
                  </Text>
                </Pressable>
              </View>
            )}

            {last ? (
              last.zone ? (
                <Pressable
                  testID="home-last-card"
                  onPress={() => router.push(`/assessment/${last.id}`)}
                  style={[
                    styles.heroCard,
                    {
                      borderColor: zoneColor(last.zone),
                      shadowColor: zoneColor(last.zone),
                    },
                  ]}
                >
                  <Text style={styles.heroLabel}>{t('home.lastEval')}</Text>
                  <Text style={[styles.zoneName, { color: zoneColor(last.zone) }]}>
                    {zoneLabelI18n(t, last.zone)}
                  </Text>
                  <Text style={styles.heroDesc}>{zoneDescI18n(t, last.zone)}</Text>

                  <View style={styles.heroMetaRow}>
                    <MetaChip icon="clock-outline" label={formatDateTime(last.created_at)} />
                    {last.pattern ? (
                      <MetaChip
                        icon="pulse"
                        label={t('home.meta.pattern', { name: patternLabelI18n(t, last.pattern) })}
                      />
                    ) : null}
                  </View>
                </Pressable>
              ) : (
                <Pressable
                  testID="home-last-pending-card"
                  onPress={() => router.push(`/assessment/${last.id}`)}
                  style={[
                    styles.heroCard,
                    {
                      borderColor: colors.brandGold,
                      shadowColor: colors.brandGold,
                      borderStyle: 'dashed',
                    },
                  ]}
                >
                  <Text style={styles.heroLabel}>{t('home.lastEval')}</Text>
                  <Text style={[styles.zoneName, { color: colors.brandGold }]}>
                    {t('home.pending.title')}
                  </Text>
                  <Text style={styles.heroDesc}>{t('home.pending.desc')}</Text>
                  <View style={styles.heroMetaRow}>
                    <MetaChip icon="clock-outline" label={formatDateTime(last.created_at)} />
                    <MetaChip icon="cloud-sync-outline" label={t('common.unclassified')} />
                  </View>
                </Pressable>
              )
            ) : (
              <View style={[styles.heroCard, { borderColor: colors.border }]} testID="home-empty-card">
                <MaterialCommunityIcons
                  name="heart-pulse"
                  size={40}
                  color={colors.brandGold}
                  style={{ alignSelf: 'center', marginBottom: spacing.md }}
                />
                <Text style={[shared.h3, { textAlign: 'center' }]}>{t('home.emptyTitle')}</Text>
                <Text style={[shared.body, { textAlign: 'center', marginTop: spacing.sm }]}>
                  {t('home.emptyBody')}
                </Text>
              </View>
            )}

            <View style={styles.statsRow}>
              <StatCard label={t('home.stats.fcp')} value={`${fcpTarget}`} unit={t('home.stats.fcp.unit')} />
              <StatCard label={t('home.stats.count')} value={`${count}`} unit="" />
              <StatCard label={t('home.stats.age')} value={`${profile?.age ?? '—'}`} unit={t('home.stats.age.unit')} />
            </View>

            <View style={[shared.card, { marginTop: spacing.xl }]} testID="home-trend-card">
              <View style={styles.trendHead}>
                <View>
                  <Text style={styles.infoTitle}>{t('home.trend.title')}</Text>
                  <Text style={[shared.muted, { marginTop: 2 }]}>
                    {t('home.trend.subtitle', { n: trendData.length || 7 })}
                  </Text>
                </View>
                {trendData.length >= 2 && (
                  <View style={styles.trendDelta}>
                    <MaterialCommunityIcons
                      name={
                        trendData[trendData.length - 1].recpct >= trendData[0].recpct
                          ? 'trending-up'
                          : 'trending-down'
                      }
                      size={16}
                      color={
                        trendData[trendData.length - 1].recpct >= trendData[0].recpct
                          ? colors.zoneGreen
                          : colors.zoneRed
                      }
                    />
                    <Text
                      style={[
                        styles.trendDeltaText,
                        {
                          color:
                            trendData[trendData.length - 1].recpct >= trendData[0].recpct
                              ? colors.zoneGreen
                              : colors.zoneRed,
                        },
                      ]}
                    >
                      {(trendData[trendData.length - 1].recpct - trendData[0].recpct).toFixed(1)}%
                    </Text>
                  </View>
                )}
              </View>
              {trendData.length === 0 ? (
                <Text style={[shared.muted, { textAlign: 'center', paddingVertical: spacing.lg }]}>
                  {t('home.trend.empty')}
                </Text>
              ) : (
                <View style={{ alignItems: 'center', marginTop: spacing.sm }}>
                  <TrendSparkline data={trendData} width={320} height={88} />
                </View>
              )}
            </View>

            <View style={[shared.card, { marginTop: spacing.xl }]}>
              <Text style={styles.infoTitle}>{t('home.how.title')}</Text>
              <InfoRow n="1" text={t('home.how.1')} />
              <InfoRow n="2" text={t('home.how.2')} />
              <InfoRow n="3" text={t('home.how.3')} />
              <InfoRow n="4" text={t('home.how.4')} />
            </View>

            <View style={{ marginTop: spacing.xl }}>
              <ColorGuideCard />
            </View>

            <View style={styles.disclaimer}>
              <MaterialCommunityIcons
                name="information-outline"
                size={16}
                color={colors.onSurfaceTertiary}
              />
              <Text style={styles.disclaimerText}>{t('home.disclaimer')}</Text>
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.fabWrap} pointerEvents="box-none">
        <Pressable
          testID="home-cta-new"
          style={({ pressed }) => [shared.primaryBtn, styles.fab, pressed && { opacity: 0.9 }]}
          onPress={() => {
            // If the athlete doesn't have access, send them to the paywall
            // instead of the assessment flow. Backend also enforces this.
            // On iOS v1.0 the paywall is hidden — free access is granted
            // silently via ensureIOSFreeAccess() so we route straight to
            // the assessment picker.
            if (subscription && !hasActiveAccess(subscription)) {
              if (IOS_PAYWALL_ENABLED) {
                router.push('/paywall');
                return;
              }
              ensureIOSFreeAccess().finally(() => router.push('/(tabs)/new'));
              return;
            }
            router.push('/(tabs)/new');
          }}
        >
          <MaterialCommunityIcons name="heart-pulse" size={18} color="#000" />
          <Text style={[shared.primaryBtnText, { marginLeft: spacing.sm }]}>
            {t('home.newCheck')}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function MetaChip({ icon, label }: { icon: any; label: string }) {
  return (
    <View style={styles.metaChip}>
      <MaterialCommunityIcons name={icon} size={13} color={colors.onSurfaceTertiary} />
      <Text style={styles.metaText}>{label}</Text>
    </View>
  );
}

function StatCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text style={styles.statValue}>{value}</Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

function InfoRow({ n, text }: { n: string; text: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoBadge}>
        <Text style={styles.infoBadgeText}>{n}</Text>
      </View>
      <Text style={[shared.body, { flex: 1 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  eyebrow: {
    color: colors.brandGold,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: '#141310',
  },
  badgeText: { color: colors.brandGold, fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  // License reminder card (1st of the month, subtle gold outline)
  licenseReminder: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.brandGold,
    backgroundColor: '#141310',
    shadowColor: colors.brandGold, shadowOpacity: 0.22, shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 }, elevation: 3,
  },
  licenseReminderMain: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
  },
  licenseReminderIcon: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 1, borderColor: colors.brandGold,
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  licenseReminderEyebrow: {
    color: colors.brandGold, fontSize: 9, letterSpacing: 1.5, fontWeight: '800',
    marginBottom: 2,
  },
  licenseReminderTitle: {
    color: colors.onSurface, fontSize: 13, fontWeight: '800', marginBottom: 4,
  },
  licenseReminderBody: {
    color: colors.onSurfaceSecondary, fontSize: 11, lineHeight: 16,
  },
  licenseReminderClose: {
    width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
  },
  licenseReminderCta: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: spacing.sm, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.divider,
  },
  licenseReminderCtaText: {
    flex: 1, color: colors.brandGold, fontSize: 11, fontWeight: '800', letterSpacing: 0.5,
  },
  heroCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 2,
    padding: spacing.xl,
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  heroLabel: {
    color: colors.onSurfaceTertiary,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  zoneName: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  heroDesc: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19 },
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  metaText: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  stat: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  statLabel: {
    color: colors.onSurfaceTertiary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  statValue: { color: colors.onSurface, fontSize: 22, fontWeight: '800' },
  statUnit: { color: colors.onSurfaceTertiary, fontSize: 11, fontWeight: '600' },
  infoTitle: {
    color: colors.onSurface,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: spacing.md,
    letterSpacing: 0.3,
  },
  trendHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  trendDelta: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong,
    backgroundColor: '#141310',
  },
  trendDeltaText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  infoRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  infoBadge: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: '#1F1B10',
    borderWidth: 1,
    borderColor: colors.brandGold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBadgeText: { color: colors.brandGold, fontSize: 12, fontWeight: '800' },
  disclaimer: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  disclaimerText: {
    color: colors.onSurfaceTertiary,
    fontSize: 11,
    lineHeight: 15,
    flex: 1,
  },
  fabWrap: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    bottom: spacing.lg,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md, paddingVertical: 5,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong,
    backgroundColor: '#141310',
    marginBottom: spacing.md,
  },
  subPillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  gateCard: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.brandGold,
    backgroundColor: '#141310',
    shadowColor: colors.brandGold, shadowOpacity: 0.3, shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 }, elevation: 4,
  },
  gateHeader: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  gateIcon: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 1, borderColor: colors.brandGold,
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  gateTitle: { color: colors.brandGold, fontSize: 13, fontWeight: '800', marginBottom: 4 },
  gateBody: { color: colors.onSurfaceSecondary, fontSize: 11, lineHeight: 16 },
  gateCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.brandGold,
  },
  gateCtaText: { color: '#000', fontSize: 12, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
});
