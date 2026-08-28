import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, shared, spacing } from '@/src/lib/theme';
import { useI18n } from '@/src/lib/i18n';
import { getDeviceId } from '@/src/lib/api';
import {
  Subscription,
  cancelSubscription,
  daysUntilExpiry,
  fetchSubscription,
  restorePurchases,
} from '@/src/lib/billing';

/**
 * Manage Subscription screen. Reads the mirror from `/api/subscription`
 * and exposes: current plan/status, cancellation intent (mock — the
 * real cancel happens on the App Store or Google Play), restore, and a
 * shortcut to upgrade / change plan (routes to `/paywall?mode=upgrade`).
 */
export default function ManageSubscription() {
  const router = useRouter();
  const { t, formatDate } = useI18n();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'cancel' | 'restore' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const id = await getDeviceId();
      const s = await fetchSubscription(id);
      setSub(s);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onCancel = async () => {
    setBusy('cancel');
    setMsg(null);
    try {
      const id = await getDeviceId();
      const s = await cancelSubscription(id);
      setSub(s);
    } catch (e: any) {
      setMsg(e?.message || 'Error');
    } finally {
      setBusy(null);
    }
  };

  const onRestore = async () => {
    setBusy('restore');
    setMsg(null);
    try {
      const id = await getDeviceId();
      const s = await restorePurchases(id);
      setSub(s);
    } catch (e: any) {
      setMsg(e?.message || 'Error');
    } finally {
      setBusy(null);
    }
  };

  const statusKey =
    !sub || sub.status === 'none' ? 'manage.status.none' :
    sub.status === 'trial' ? 'manage.status.trial' :
    sub.status === 'active' ? 'manage.status.active' :
    'manage.status.expired';

  const statusColor =
    !sub || sub.status === 'none' || sub.status === 'expired'
      ? colors.onSurfaceTertiary
      : sub.status === 'trial'
        ? colors.zoneYellow
        : colors.zoneGreen;

  const planLabel = !sub || !sub.plan ? t('manage.plan.none')
    : sub.plan === 'trial' ? t('manage.plan.trial')
    : sub.plan === 'monthly' ? t('manage.plan.monthly')
    : t('manage.plan.yearly');

  const days = daysUntilExpiry(sub);
  const expiresLabel = !sub?.expires_at
    ? t('manage.expires.none')
    : sub.status === 'expired'
      ? t('manage.expires.past')
      : t('manage.expires.in', { n: days });

  const canCancel = !!sub && (sub.status === 'trial' || sub.status === 'active') && !sub.canceled_at;
  const canChangePlan = !sub || sub.status !== 'active' || (sub.plan === 'monthly');

  return (
    <SafeAreaView style={shared.screen} edges={['top', 'bottom']} testID="manage-subscription-screen">
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} testID="manage-back-btn" style={styles.iconBtn}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.topTitle}>{t('manage.title')}</Text>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.brandGold} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}>
          <View style={styles.statusCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.section}>{t('manage.status')}</Text>
              <View style={[styles.statusPill, { borderColor: statusColor, shadowColor: statusColor }]}>
                <View style={[styles.dot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusPillText, { color: statusColor }]}>
                  {t(statusKey as any)}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />
            <Text style={styles.section}>{t('manage.plan')}</Text>
            <Text style={styles.value}>{planLabel}</Text>

            <View style={styles.divider} />
            <Text style={styles.section}>{t('manage.expires')}</Text>
            <Text style={styles.value}>
              {expiresLabel}
              {sub?.expires_at ? (
                <Text style={styles.valueSub}> · {formatDate(sub.expires_at)}</Text>
              ) : null}
            </Text>

            {sub?.canceled_at && sub?.expires_at ? (
              <View style={styles.canceledBox} testID="manage-canceled-badge">
                <MaterialCommunityIcons name="close-circle-outline" size={14} color={colors.zoneYellow} />
                <Text style={styles.canceledText}>
                  <Text style={{ fontWeight: '800' }}>{t('manage.canceled.badge')} · </Text>
                  {t('manage.canceled.body', {
                    date: formatDate(sub.canceled_at),
                    expires: formatDate(sub.expires_at),
                  })}
                </Text>
              </View>
            ) : null}
          </View>

          {canChangePlan && (
            <Pressable
              testID="manage-upgrade-btn"
              onPress={() => router.push('/paywall?mode=upgrade')}
              style={({ pressed }) => [
                shared.primaryBtn,
                { marginTop: spacing.lg },
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={shared.primaryBtnText}>{t('manage.upgrade')}</Text>
            </Pressable>
          )}

          {canCancel && (
            <Pressable
              testID="manage-cancel-btn"
              disabled={busy !== null}
              onPress={onCancel}
              style={({ pressed }) => [
                styles.cancelBtn,
                (busy || pressed) && { opacity: 0.8 },
              ]}
            >
              {busy === 'cancel' ? (
                <ActivityIndicator color={colors.zoneRed} />
              ) : (
                <>
                  <MaterialCommunityIcons name="cancel" size={16} color={colors.zoneRed} />
                  <Text style={styles.cancelBtnText}>{t('manage.cancel')}</Text>
                </>
              )}
            </Pressable>
          )}
          {canCancel && (
            <Text style={styles.cancelHint}>{t('manage.cancel.hint')}</Text>
          )}

          <Pressable
            testID="manage-restore-btn"
            onPress={onRestore}
            disabled={busy !== null}
            style={{ alignSelf: 'center', paddingVertical: spacing.md, marginTop: spacing.md }}
          >
            {busy === 'restore' ? (
              <ActivityIndicator color={colors.onSurfaceSecondary} />
            ) : (
              <Text style={styles.restoreText}>{t('manage.restore')}</Text>
            )}
          </Pressable>

          {msg ? <Text style={styles.err} testID="manage-error">{msg}</Text> : null}

          <View style={styles.legal}>
            <MaterialCommunityIcons name="information-outline" size={14} color={colors.onSurfaceTertiary} />
            <Text style={styles.legalText}>{t('manage.legal')}</Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
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
  statusCard: {
    padding: spacing.lg,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { color: colors.brandGold, fontSize: 11, letterSpacing: 2, fontWeight: '800' },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 4,
    borderRadius: radius.pill, borderWidth: 1,
    backgroundColor: '#141310',
    shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 2,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusPillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },
  value: { color: colors.onSurface, fontSize: 16, fontWeight: '800', marginTop: 4 },
  valueSub: { color: colors.onSurfaceTertiary, fontSize: 12, fontWeight: '600' },
  canceledBox: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.zoneYellow,
    backgroundColor: '#1F1A0A',
  },
  canceledText: { flex: 1, color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 17 },
  cancelBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.zoneRed,
    backgroundColor: '#1A0A0A',
  },
  cancelBtnText: { color: colors.zoneRed, fontSize: 14, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  cancelHint: { color: colors.onSurfaceTertiary, fontSize: 11, lineHeight: 15, marginTop: spacing.sm },
  restoreText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textDecorationLine: 'underline' },
  err: { color: colors.zoneRed, fontSize: 12, marginTop: spacing.sm, textAlign: 'center' },
  legal: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  legalText: { flex: 1, color: colors.onSurfaceTertiary, fontSize: 11, lineHeight: 16 },
});
