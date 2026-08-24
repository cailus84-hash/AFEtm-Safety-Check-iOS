import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, shared, spacing } from '@/src/lib/theme';
import { useI18n } from '@/src/lib/i18n';

const INSTITUTIONAL_URL = 'https://wewonmatrix.com/';

/**
 * Institutional Access screen.
 *
 * Reached from:
 *   - the Terms screen ("Request institutional access" link)
 *   - the Profile tab's Personal-Use license card
 *
 * The mobile app cannot activate institutional access on its own — it can
 * only redirect the user to the official WeWon site so a licensed
 * onboarding can happen there.
 */
export default function Institutional() {
  const router = useRouter();
  const { t } = useI18n();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openUrl = async () => {
    setOpening(true);
    setError(null);
    try {
      const can = await Linking.canOpenURL(INSTITUTIONAL_URL);
      if (!can) throw new Error('canOpenURL=false');
      await Linking.openURL(INSTITUTIONAL_URL);
    } catch {
      setError(t('inst.openError'));
    } finally {
      setOpening(false);
    }
  };

  return (
    <SafeAreaView style={shared.screen} edges={['top', 'bottom']} testID="institutional-screen">
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="inst-back-btn">
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.topTitle}>{t('inst.eyebrow')}</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}>
        <View style={styles.heroWrap}>
          <View style={styles.heroIcon}>
            <MaterialCommunityIcons name="office-building-outline" size={36} color={colors.brandGold} />
          </View>
          <Text style={styles.eyebrow}>{t('inst.eyebrow')}</Text>
          <Text style={shared.h1}>{t('inst.title')}</Text>
          <Text style={[shared.body, { marginTop: spacing.md, textAlign: 'center' }]}>
            {t('inst.body')}
          </Text>
        </View>

        <Text style={styles.section}>{t('inst.what.title')}</Text>
        <View style={styles.list}>
          {[t('inst.what.1'), t('inst.what.2'), t('inst.what.3'), t('inst.what.4')].map((item, i) => (
            <View key={i} style={styles.row}>
              <View style={styles.numBadge}>
                <Text style={styles.numText}>{i + 1}</Text>
              </View>
              <Text style={styles.rowText}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.ctaCard}>
          <MaterialCommunityIcons name="link-variant" size={20} color={colors.brandGold} />
          <Text style={styles.ctaHint}>{t('inst.contact.hint')}</Text>
          <Pressable
            testID="inst-request-btn"
            onPress={openUrl}
            disabled={opening}
            style={({ pressed }) => [
              styles.ctaBtn,
              pressed && { opacity: 0.9 },
              opening && { opacity: 0.7 },
            ]}
          >
            {opening ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <>
                <Text style={styles.ctaBtnText}>{t('inst.contact')}</Text>
                <MaterialCommunityIcons name="arrow-top-right" size={16} color="#000" />
              </>
            )}
          </Pressable>
          <Text style={styles.urlText} numberOfLines={1}>{INSTITUTIONAL_URL}</Text>
          {error ? <Text style={styles.err} testID="inst-error">{error}</Text> : null}
        </View>

        <View style={styles.footerCard}>
          <MaterialCommunityIcons name="information-outline" size={14} color={colors.onSurfaceTertiary} />
          <Text style={styles.footerText}>{t('inst.footer')}</Text>
        </View>
      </ScrollView>
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
  topTitle: { color: colors.onSurface, fontSize: 13, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
  heroWrap: { alignItems: 'center', marginTop: spacing.md },
  heroIcon: {
    width: 76, height: 76, borderRadius: 38,
    borderWidth: 2, borderColor: colors.brandGold,
    backgroundColor: '#141310',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
    shadowColor: colors.brandGold, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 5,
  },
  eyebrow: {
    color: colors.brandGold, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginBottom: 4,
  },
  section: {
    color: colors.brandGold, fontSize: 11, letterSpacing: 2, fontWeight: '700',
    marginTop: spacing.xxl, marginBottom: spacing.md,
  },
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  numBadge: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 1, borderColor: colors.brandGold,
    backgroundColor: '#141310',
    alignItems: 'center', justifyContent: 'center',
  },
  numText: { color: colors.brandGold, fontSize: 12, fontWeight: '800' },
  rowText: { flex: 1, color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19 },
  ctaCard: {
    marginTop: spacing.xxl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 2, borderColor: colors.brandGold,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    shadowColor: colors.brandGold, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 6,
  },
  ctaHint: {
    color: colors.onSurfaceTertiary, fontSize: 12, lineHeight: 17, marginTop: spacing.sm,
    textAlign: 'center',
  },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: spacing.md, alignSelf: 'stretch',
    backgroundColor: colors.brandGold,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  ctaBtnText: { color: '#000', fontSize: 14, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  urlText: {
    color: colors.onSurfaceTertiary, fontSize: 11, marginTop: spacing.sm,
  },
  err: { color: colors.zoneRed, fontSize: 12, marginTop: spacing.sm, textAlign: 'center' },
  footerCard: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    marginTop: spacing.lg, padding: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  footerText: { color: colors.onSurfaceTertiary, fontSize: 11, lineHeight: 15, flex: 1 },
});
