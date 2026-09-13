import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { colors, radius, shared, spacing } from '@/src/lib/theme';
import { fetchProfile, getDeviceId } from '@/src/lib/api';
import { useI18n } from '@/src/lib/i18n';

// Language-aware AFEtm Visual Color Guide. Both PNGs are the official
// artwork approved by the client (EN + ES). The `require` map keeps the
// static bundler resolution intact while letting us swap at runtime.
const HERO_BY_LANG = {
  en: require('../assets/images/afetm-hero-en.png'),
  es: require('../assets/images/afetm-hero-es.png'),
} as const;

export default function Index() {
  const router = useRouter();
  const { t, lang, toggle } = useI18n();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const id = await getDeviceId();
        const profile = await fetchProfile(id);
        // Only jump straight to the tabs when the athlete has BOTH
        // accepted the Personal-Use Terms AND completed the profile
        // (name is empty on a "stub" profile created by /accept-terms).
        if (profile && profile.terms_accepted_at && profile.name) {
          router.replace('/(tabs)');
          return;
        }
        if (profile && profile.terms_accepted_at && !profile.name) {
          // Terms already accepted but profile incomplete → skip to setup.
          router.replace('/profile-setup');
          return;
        }
      } catch {}
      setLoading(false);
    })();
  }, [router]);

  if (loading) {
    return (
      <View style={[shared.screen, styles.center]} testID="onboarding-loading">
        <ActivityIndicator color={colors.brandGold} size="large" />
      </View>
    );
  }

  return (
    <View style={shared.screen} testID="onboarding-screen">
      <LinearGradient
        colors={['#050505', '#0A0A0A', '#050505']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Language pill */}
        <View style={styles.langBar}>
          <Pressable
            testID="onboarding-lang-toggle"
            onPress={toggle}
            style={styles.langPill}
          >
            <MaterialCommunityIcons name="translate" size={14} color={colors.brandGold} />
            <Text style={styles.langPillText}>
              {lang === 'en' ? 'EN' : 'ES'}
            </Text>
            <MaterialCommunityIcons name="swap-horizontal" size={12} color={colors.onSurfaceTertiary} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandBlock}>
            <Text style={styles.brand}>AFE™</Text>
            <Text style={styles.tag}>{t('brand.tag')}</Text>
            <View style={styles.divider} />
            <Text style={styles.subtitle}>{t('brand.subtitle')}</Text>
          </View>

          {/* Hero visual — official AFEtm Visual Color Guide */}
          <View style={styles.heroWrap}>
            <View style={styles.heroBadge}>
              <MaterialCommunityIcons
                name="palette-swatch-outline"
                size={12}
                color={colors.brandGold}
              />
              <Text style={styles.heroBadgeText}>
                {t('onboarding.hero.badge')}
              </Text>
            </View>
            <View style={styles.heroImageShadow}>
              <Image
                testID="onboarding-hero-image"
                source={HERO_BY_LANG[lang] ?? HERO_BY_LANG.en}
                style={styles.heroImage}
                resizeMode="contain"
                accessibilityLabel={t('onboarding.hero.alt')}
              />
              <LinearGradient
                colors={['transparent', 'rgba(10,10,10,1)']}
                locations={[0.85, 1]}
                pointerEvents="none"
                style={StyleSheet.absoluteFill}
              />
            </View>
          </View>

          <View style={styles.taglineBlock}>
            <Text style={styles.heroLine}>{t('brand.tagline1')}</Text>
            <Text style={styles.heroLine}>{t('brand.tagline2')}</Text>
            <Text style={[styles.heroLine, { color: colors.brandGold }]}>
              {t('brand.tagline3')}
            </Text>
            <Text style={styles.description}>
              {t('onboarding.description')}
            </Text>
          </View>
        </ScrollView>

        <View style={styles.bottom}>
          <View style={styles.zoneRow}>
            {[colors.zoneBlue, colors.zoneGreen, colors.zoneYellow, colors.zoneRed].map((c) => (
              <View key={c} style={[styles.zoneDot, { backgroundColor: c, shadowColor: c }]} />
            ))}
          </View>

          <Pressable
            testID="onboarding-cta-start"
            style={({ pressed }) => [shared.primaryBtn, pressed && { opacity: 0.85 }]}
            onPress={() => router.push('/terms')}
          >
            <Text style={shared.primaryBtnText}>{t('onboarding.cta')}</Text>
          </Pressable>

          <Text style={styles.disclaimer} testID="onboarding-disclaimer">
            {t('onboarding.disclaimer')}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: spacing.xl },
  center: { alignItems: 'center', justifyContent: 'center' },
  langBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  langPill: {
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
  langPillText: {
    color: colors.brandGold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  content: { paddingBottom: spacing.lg },
  brandBlock: { alignItems: 'center', marginTop: spacing.md },
  brand: {
    color: colors.brandGold,
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: 6,
  },
  tag: {
    color: colors.onSurface,
    fontSize: 12,
    letterSpacing: 6,
    fontWeight: '700',
    marginTop: 2,
  },
  divider: {
    width: 60,
    height: 2,
    backgroundColor: colors.brandGold,
    marginTop: spacing.sm,
    borderRadius: 2,
  },
  subtitle: {
    color: colors.onSurfaceTertiary,
    fontSize: 10,
    letterSpacing: 3,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
  },
  heroWrap: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandGold,
    backgroundColor: '#141310',
    marginBottom: spacing.md,
    shadowColor: colors.brandGold,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  heroBadgeText: {
    color: colors.brandGold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  heroImageShadow: {
    width: '100%',
    aspectRatio: 1122 / 1402,
    maxHeight: 520,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: '#050505',
    shadowColor: colors.brandGold,
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  taglineBlock: { alignItems: 'center', marginTop: spacing.lg },
  heroLine: {
    color: colors.onSurface,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  description: {
    color: colors.onSurfaceTertiary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.md,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  bottom: { paddingBottom: spacing.md, paddingTop: spacing.md },
  zoneRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  zoneDot: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  disclaimer: {
    color: colors.onSurfaceTertiary,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
