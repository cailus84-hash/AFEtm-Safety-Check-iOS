import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, shared, spacing } from '@/src/lib/theme';
import { useI18n } from '@/src/lib/i18n';
import { getDeviceId } from '@/src/lib/api';
import {
  BILLING,
  IOS_PAYWALL_ENABLED,
  purchaseMonthly,
  purchaseYearly,
  restorePurchases,
  startFreeTrial,
} from '@/src/lib/billing';

/**
 * Paywall / subscription screen.
 *
 * Native-store subscriptions only (Apple IAP / Google Play Billing).
 * The mobile app NEVER renders credit-card inputs and NEVER stores card
 * information. The whole payment method flow is delegated to the store.
 *
 * Hierarchy (approved by product):
 *   1. Hero CTA  → "Start 1 Month Free" ($0 today)
 *   2. Plan tiles (Monthly / Annual — Best Value) shown *below* the
 *      free-trial CTA. These become the recurring price after the trial
 *      and are the fallback for athletes who already used the trial.
 *   3. Store disclosure block (mandatory pre-confirmation copy).
 *   4. Secondary actions: Restore Purchases · Manage Subscription.
 *
 * Route: `/paywall`
 *   ?mode=upgrade → hides the "Not now" dismissal and the trial CTA
 *                   (used from Manage Subscription).
 */
export default function Paywall() {
  const router = useRouter();
  const { t } = useI18n();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [busy, setBusy] = useState<'trial' | 'monthly' | 'yearly' | 'restore' | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const isUpgrade = mode === 'upgrade';

  const dispatch = async (
    kind: 'trial' | 'monthly' | 'yearly' | 'restore',
    errKey: 'paywall.error.trial' | 'paywall.error.purchase' | 'paywall.error.restore',
  ) => {
    setBusy(kind);
    setMessage(null);
    try {
      const id = await getDeviceId();
      const sub =
        kind === 'trial' ? await startFreeTrial(id)
        : kind === 'monthly' ? await purchaseMonthly(id)
        : kind === 'yearly' ? await purchaseYearly(id)
        : await restorePurchases(id);

      if (kind === 'trial') {
        setMessage({ tone: 'ok', text: t('paywall.success.trial') });
      } else if (kind === 'restore') {
        if (sub.status === 'active' || sub.status === 'trial') {
          setMessage({ tone: 'ok', text: t('paywall.success.purchase') });
        }
      } else {
        setMessage({ tone: 'ok', text: t('paywall.success.purchase') });
      }
      if (sub.status === 'active' || sub.status === 'trial') {
        setTimeout(() => router.replace('/(tabs)'), 700);
      }
    } catch (e: any) {
      const msg = e?.message?.includes('TRIAL_ALREADY_USED')
        ? t('paywall.trialUsed')
        : e?.message || t(errKey);
      setMessage({ tone: 'err', text: msg });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={shared.screen} testID="paywall-screen">
      <LinearGradient
        colors={['#050505', '#0A0A0A', '#050505']}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            testID="paywall-back"
            style={styles.iconBtn}
          >
            <MaterialCommunityIcons name="chevron-left" size={26} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.topTitle}>{t('paywall.eyebrow')}</Text>
          {!isUpgrade ? (
            <Pressable
              testID="paywall-dismiss"
              onPress={() => router.replace('/(tabs)')}
            >
              <Text style={styles.dismiss}>{t('paywall.dismiss')}</Text>
            </Pressable>
          ) : (
            <View style={styles.iconBtn} />
          )}
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* v1.0 iOS App Store launch: the mocked paywall is hidden.
              We keep the code intact and simply render an informational
              "free access" card so any route that still points here
              lands gracefully. Zero purchase buttons, zero pricing. */}
          {!IOS_PAYWALL_ENABLED ? (
            <View style={styles.freeAccessCard} testID="paywall-ios-free-access">
              <View style={styles.heroBadge}>
                <MaterialCommunityIcons name="gift-outline" size={11} color="#000" />
                <Text style={styles.heroBadgeText}>{t('paywall.free.eyebrow')}</Text>
              </View>
              <Text style={styles.title} testID="paywall-free-title">
                {t('paywall.free.title')}
              </Text>
              <Text style={[styles.subtitle, { marginTop: spacing.sm }]}>
                {t('paywall.free.body')}
              </Text>
              <Pressable
                testID="paywall-free-continue"
                onPress={() => router.replace('/(tabs)')}
                style={({ pressed }) => [
                  styles.heroBtn,
                  { marginTop: spacing.lg },
                  pressed && { opacity: 0.9 },
                ]}
              >
                <MaterialCommunityIcons name="arrow-right-circle-outline" size={16} color="#000" />
                <Text style={styles.heroBtnText}>{t('paywall.free.cta')}</Text>
              </Pressable>
            </View>
          ) : (
          <>
          <View style={styles.trialBadge}>
            <MaterialCommunityIcons name="gift-outline" size={12} color="#000" />
            <Text style={styles.trialBadgeText}>{t('paywall.trialBadge')}</Text>
          </View>

          <Text style={styles.title}>{t('paywall.title')}</Text>
          <Text style={styles.subtitle}>{t('paywall.subtitle')}</Text>

          {/* Benefits */}
          <View style={styles.benefits}>
            <Benefit icon="heart-pulse" text={t('paywall.benefit.assessments')} />
            <Benefit icon="history" text={t('paywall.benefit.history')} />
            <Benefit icon="compare-horizontal" text={t('paywall.benefit.compare')} />
            <Benefit icon="chart-timeline-variant" text={t('paywall.benefit.recovery')} />
          </View>

          {/* HERO: Start 1 Month Free */}
          {!isUpgrade && (
            <View style={styles.heroCard} testID="paywall-hero-trial">
              <View style={styles.heroBadge}>
                <MaterialCommunityIcons name="star-four-points" size={11} color="#000" />
                <Text style={styles.heroBadgeText}>{t('paywall.trialBadge')}</Text>
              </View>
              <Text style={styles.heroPrice}>$0</Text>
              <Text style={styles.heroPriceLabel}>{t('paywall.cta.trial.sub')}</Text>
              <Pressable
                testID="paywall-cta-trial"
                disabled={busy !== null}
                onPress={() => dispatch('trial', 'paywall.error.trial')}
                style={({ pressed }) => [
                  styles.heroBtn,
                  (busy || pressed) && { opacity: 0.9 },
                ]}
              >
                {busy === 'trial' ? <ActivityIndicator color="#000" /> : (
                  <>
                    <MaterialCommunityIcons name="gift-outline" size={16} color="#000" />
                    <Text style={styles.heroBtnText}>{t('paywall.cta.trial')}</Text>
                  </>
                )}
              </Pressable>

              {/* Mandatory disclosure — shown BEFORE the store confirmation. */}
              <View style={styles.disclosure}>
                <Text style={styles.disclosureTitle}>{t('paywall.disclosure.title')}</Text>
                <DiscRow icon="cash-remove" strong text={t('paywall.disclosure.today')} />
                <DiscRow icon="autorenew" text={t('paywall.disclosure.renew')} />
                <DiscRow icon="cellphone-lock" text={t('paywall.disclosure.store')} />
              </View>
            </View>
          )}

          {/* PLANS after the trial */}
          <View style={styles.plansHeaderRow}>
            <View style={styles.plansHeaderLine} />
            <Text style={styles.plansHeaderText}>
              {isUpgrade ? t('paywall.eyebrow') : t('paywall.trialBadge') /* small caps chip */}
            </Text>
            <View style={styles.plansHeaderLine} />
          </View>

          {/* Annual (Best Value) */}
          <View
            testID="paywall-plan-yearly"
            style={[styles.plan, styles.planYearly]}
          >
            <View style={styles.bestBadge}>
              <MaterialCommunityIcons name="star-four-points" size={11} color="#000" />
              <Text style={styles.bestBadgeText}>{t('paywall.plan.yearly.badge')}</Text>
            </View>
            <View style={styles.planRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.planTitle}>{t('paywall.plan.yearly.title')}</Text>
                <Text style={styles.planPrice}>{t('paywall.plan.yearly.price')}</Text>
                <Text style={styles.planSave}>
                  {t('paywall.plan.yearly.save', { p: BILLING.yearly.savingsPercent })}
                </Text>
              </View>
              <MaterialCommunityIcons name="trophy-outline" size={28} color={colors.brandGold} />
            </View>
            <Pressable
              testID="paywall-cta-yearly"
              disabled={busy !== null}
              onPress={() => dispatch('yearly', 'paywall.error.purchase')}
              style={({ pressed }) => [
                styles.primaryBtn,
                (busy || pressed) && { opacity: 0.85 },
              ]}
            >
              {busy === 'yearly' ? <ActivityIndicator color="#000" /> : (
                <Text style={styles.primaryBtnText}>{t('paywall.cta.yearly')}</Text>
              )}
            </Pressable>
          </View>

          {/* Monthly */}
          <View testID="paywall-plan-monthly" style={styles.plan}>
            <View style={styles.planRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.planTitle}>{t('paywall.plan.monthly.title')}</Text>
                <Text style={styles.planPrice}>{t('paywall.plan.monthly.price')}</Text>
              </View>
              <MaterialCommunityIcons name="calendar-month-outline" size={26} color={colors.onSurfaceSecondary} />
            </View>
            <Pressable
              testID="paywall-cta-monthly"
              disabled={busy !== null}
              onPress={() => dispatch('monthly', 'paywall.error.purchase')}
              style={({ pressed }) => [
                styles.secondaryBtn,
                (busy || pressed) && { opacity: 0.85 },
              ]}
            >
              {busy === 'monthly' ? <ActivityIndicator color={colors.brandGold} /> : (
                <Text style={styles.secondaryBtnText}>{t('paywall.cta.monthly')}</Text>
              )}
            </Pressable>
          </View>

          {/* Secondary actions row */}
          <View style={styles.linksRow}>
            <Pressable
              testID="paywall-restore"
              disabled={busy !== null}
              onPress={() => dispatch('restore', 'paywall.error.restore')}
              style={styles.linkBtn}
            >
              {busy === 'restore' ? (
                <ActivityIndicator color={colors.onSurfaceTertiary} />
              ) : (
                <>
                  <MaterialCommunityIcons
                    name="restore"
                    size={14}
                    color={colors.onSurfaceSecondary}
                  />
                  <Text style={styles.linkText}>{t('paywall.restore')}</Text>
                </>
              )}
            </Pressable>
            <View style={styles.linksDot} />
            <Pressable
              testID="paywall-manage"
              onPress={() => router.push('/manage-subscription')}
              style={styles.linkBtn}
            >
              <MaterialCommunityIcons
                name="cog-outline"
                size={14}
                color={colors.onSurfaceSecondary}
              />
              <Text style={styles.linkText}>{t('paywall.manage')}</Text>
            </Pressable>
          </View>

          {message && (
            <View
              testID={`paywall-msg-${message.tone}`}
              style={[
                styles.msg,
                { borderColor: message.tone === 'ok' ? colors.zoneGreen : colors.zoneRed },
              ]}
            >
              <MaterialCommunityIcons
                name={message.tone === 'ok' ? 'check-circle-outline' : 'alert-circle-outline'}
                size={16}
                color={message.tone === 'ok' ? colors.zoneGreen : colors.zoneRed}
              />
              <Text style={styles.msgText}>{message.text}</Text>
            </View>
          )}

          {/* Legal */}
          <View style={styles.legal}>
            <Text style={styles.legalText}>{t('paywall.legal.tool')}</Text>
            <Text style={styles.legalText}>{t('paywall.legal.renew')}</Text>
          </View>
          </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Benefit({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.benefit}>
      <View style={styles.benefitIcon}>
        <MaterialCommunityIcons name={icon} size={16} color={colors.brandGold} />
      </View>
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

function DiscRow({
  icon, text, strong,
}: { icon: any; text: string; strong?: boolean }) {
  return (
    <View style={styles.discRow}>
      <MaterialCommunityIcons
        name={icon}
        size={14}
        color={strong ? colors.brandGold : colors.onSurfaceSecondary}
      />
      <Text style={[styles.discText, strong && styles.discTextStrong]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topTitle: {
    color: colors.brandGold, fontSize: 12, letterSpacing: 2.5, fontWeight: '800',
  },
  dismiss: {
    color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: '700', letterSpacing: 0.5,
    paddingHorizontal: spacing.md, paddingVertical: 8,
  },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  trialBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.brandGold,
    marginTop: spacing.sm,
  },
  trialBadgeText: { color: '#000', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: {
    color: colors.onSurface, fontSize: 26, fontWeight: '900',
    letterSpacing: 0.3, marginTop: spacing.md, lineHeight: 32,
  },
  subtitle: {
    color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19,
    marginTop: spacing.sm, marginBottom: spacing.lg,
  },
  benefits: { gap: spacing.sm, marginBottom: spacing.xl },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  benefitIcon: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 1, borderColor: colors.brandGold,
    backgroundColor: '#141310',
    alignItems: 'center', justifyContent: 'center',
  },
  benefitText: { flex: 1, color: colors.onSurface, fontSize: 13, fontWeight: '600' },

  /* Hero (free trial) */
  heroCard: {
    borderRadius: radius.lg,
    borderWidth: 2, borderColor: colors.brandGold,
    backgroundColor: '#141310',
    padding: spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: colors.brandGold, shadowOpacity: 0.45, shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 }, elevation: 8,
    alignItems: 'center',
  },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.brandGold,
    marginBottom: spacing.sm,
  },
  heroBadgeText: { color: '#000', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  heroPrice: {
    color: colors.brandGold, fontSize: 48, fontWeight: '900',
    letterSpacing: 1, lineHeight: 52,
  },
  heroPriceLabel: {
    color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: '700',
    letterSpacing: 0.3, marginTop: 2, textAlign: 'center',
  },
  heroBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    alignSelf: 'stretch',
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brandGold,
  },
  heroBtnText: {
    color: '#000', fontSize: 14, fontWeight: '900',
    letterSpacing: 1, textTransform: 'uppercase',
  },
  disclosure: {
    alignSelf: 'stretch',
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    gap: 8,
  },
  disclosureTitle: {
    color: colors.brandGold, fontSize: 10, letterSpacing: 1.5, fontWeight: '800',
    marginBottom: 2,
  },
  discRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  discText: { flex: 1, color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 17 },
  discTextStrong: { color: colors.onSurface, fontWeight: '800' },

  /* Plans header */
  plansHeaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginBottom: spacing.md,
  },
  plansHeaderLine: { flex: 1, height: 1, backgroundColor: colors.divider },
  plansHeaderText: {
    color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 2, fontWeight: '800',
  },

  plan: {
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  planYearly: {
    borderColor: colors.brandGold, borderWidth: 2,
    shadowColor: colors.brandGold, shadowOpacity: 0.35, shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 }, elevation: 6,
  },
  bestBadge: {
    position: 'absolute', top: -10, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.brandGold,
    shadowColor: colors.brandGold, shadowOpacity: 0.6, shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 }, elevation: 4,
  },
  bestBadgeText: { color: '#000', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  planTitle: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1.5, fontWeight: '800' },
  planPrice: {
    color: colors.onSurface, fontSize: 22, fontWeight: '900', marginTop: 2, letterSpacing: 0.3,
  },
  planSave: { color: colors.zoneGreen, fontSize: 11, fontWeight: '700', marginTop: 4, letterSpacing: 0.3 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.brandGold,
    borderRadius: radius.md, paddingVertical: spacing.md,
  },
  primaryBtnText: { color: '#000', fontSize: 14, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.brandGold, backgroundColor: '#1F1B10',
    borderRadius: radius.md, paddingVertical: spacing.md,
  },
  secondaryBtnText: {
    color: colors.brandGold, fontSize: 13, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase',
  },

  linksRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  linkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: spacing.sm,
  },
  linkText: {
    color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.5,
    textDecorationLine: 'underline',
  },
  linksDot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: colors.onSurfaceTertiary, opacity: 0.5,
  },

  msg: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    marginTop: spacing.md, padding: spacing.md,
    borderRadius: radius.md, borderWidth: 1,
    backgroundColor: colors.surfaceSecondary,
  },
  msgText: { flex: 1, color: colors.onSurface, fontSize: 12, lineHeight: 17 },
  legal: {
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 4,
  },
  legalText: { color: colors.onSurfaceTertiary, fontSize: 11, lineHeight: 16 },
  freeAccessCard: {
    marginTop: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1.5, borderColor: colors.brandGold,
    backgroundColor: '#141310',
    shadowColor: colors.brandGold, shadowOpacity: 0.35, shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 }, elevation: 6,
  },
});
