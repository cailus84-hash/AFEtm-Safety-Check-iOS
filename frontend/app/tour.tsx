import { useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  useWindowDimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, radius, shared, spacing } from '@/src/lib/theme';
import { useI18n } from '@/src/lib/i18n';

export const TOUR_SEEN_KEY = 'afetm.tourSeen';

/**
 * 3-slide introduction tour ("Onboarding / Introducción").
 *
 * Shown ONCE right after the athlete completes the profile setup and is
 * always re-openable from the Profile tab. The screen is deliberately
 * kept preventive and non-clinical — no thresholds, no metric names, no
 * medical vocabulary. Design follows the AFEtm dark identity: near-black
 * background, gold header accents and per-zone neon dots on slide 3.
 *
 * Navigation contract:
 *   • entry with no `?force=1` param → after finishing (or Skip) we mark
 *     the tour as seen in AsyncStorage and route to /(tabs).
 *   • entry with `?force=1` (from Profile) → we do NOT touch AsyncStorage
 *     and simply go back to the Profile tab when done.
 */
export default function TourScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { force } = useLocalSearchParams<{ force?: string }>();
  const isForced = force === '1';
  const { width } = useWindowDimensions();

  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const total = 3;

  const finish = async () => {
    if (!isForced) {
      try { await AsyncStorage.setItem(TOUR_SEEN_KEY, '1'); } catch {}
      router.replace('/(tabs)');
    } else {
      router.back();
    }
  };

  const goTo = (next: number) => {
    if (next >= total) return finish();
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
    setIndex(next);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    scrollX.setValue(x);
    const i = Math.round(x / Math.max(width, 1));
    if (i !== index) setIndex(i);
  };

  const slides = useMemo(() => [
    <SlideOne key="1" t={t} />,
    <SlideTwo key="2" t={t} />,
    <SlideThree key="3" t={t} />,
  ], [t]);

  return (
    <View style={shared.screen} testID="tour-screen">
      <LinearGradient
        colors={['#050505', '#0A0A0A', '#050505']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <View style={styles.stepPill}>
            <Text style={styles.stepPillText}>
              {t('tour.step', { n: index + 1, total })}
            </Text>
          </View>
          <Pressable
            testID="tour-skip"
            onPress={finish}
            style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.skipText}>{t('tour.skip')}</Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color={colors.onSurfaceTertiary} />
          </Pressable>
        </View>

        {/* Slides */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: false, listener: onScroll as any }
          )}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
        >
          {slides.map((slide, i) => (
            <View key={i} style={{ width, flex: 1 }}>
              {slide}
            </View>
          ))}
        </ScrollView>

        {/* Dot indicator */}
        <View style={styles.dots} testID="tour-dots">
          {[0, 1, 2].map((i) => {
            const dw = scrollX.interpolate({
              inputRange: [(i - 1) * width, i * width, (i + 1) * width],
              outputRange: [8, 24, 8],
              extrapolate: 'clamp',
            });
            const bg = index === i ? colors.brandGold : colors.borderStrong;
            return (
              <Animated.View
                key={i}
                style={[styles.dot, { width: dw, backgroundColor: bg }]}
              />
            );
          })}
        </View>

        {/* Primary CTA */}
        <View style={styles.footer}>
          <Pressable
            testID="tour-cta"
            onPress={() => goTo(index + 1)}
            style={({ pressed }) => [
              shared.primaryBtn,
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={shared.primaryBtnText}>
              {index === total - 1 ? t('tour.start') : t('tour.continue')}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

/* ───────────── Slide 1 — What is it ───────────── */

function SlideOne({ t }: { t: any }) {
  return (
    <ScrollView
      contentContainerStyle={styles.slideContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.eyebrowGreen}>{t('tour.s1.eyebrow')}</Text>

      <View style={styles.brandRow}>
        <Text style={styles.brandBig}>AFE™</Text>
        <Text style={styles.brandTag}>SAFETY CHECK</Text>
      </View>

      {/* Central shield with pulse */}
      <View style={styles.centerVisual}>
        <View style={styles.shieldRing}>
          <View style={styles.shieldRingInner}>
            <MaterialCommunityIcons name="shield-check-outline" size={54} color={colors.brandGold} />
          </View>
        </View>
        <View style={styles.zoneRow}>
          {[colors.zoneBlue, colors.zoneGreen, colors.zoneYellow, colors.zoneRed].map((c) => (
            <View key={c} style={[styles.zoneDot, { backgroundColor: c, shadowColor: c }]} />
          ))}
        </View>
      </View>

      <Text style={styles.slideTitle}>{t('tour.s1.title')}</Text>
      <Text style={styles.slideBody}>{t('tour.s1.body')}</Text>

      <View style={styles.discCard}>
        <MaterialCommunityIcons name="information-outline" size={14} color={colors.onSurfaceTertiary} />
        <Text style={styles.discText}>{t('tour.s1.foot')}</Text>
      </View>
    </ScrollView>
  );
}

/* ───────────── Slide 2 — How does it work ───────────── */

function SlideTwo({ t }: { t: any }) {
  return (
    <ScrollView
      contentContainerStyle={styles.slideContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.eyebrowGold}>{t('tour.s2.eyebrow')}</Text>
      <Text style={styles.slideTitle}>{t('tour.s2.title')}</Text>

      <View style={styles.stepsWrap}>
        <StepItem
          n="1"
          icon="target-variant"
          color={colors.zoneRed}
          text={t('tour.s2.step1')}
        />
        <StepConnector color={colors.zoneYellow} />
        <StepItem
          n="2"
          icon="timer-sand"
          color={colors.zoneYellow}
          text={t('tour.s2.step2')}
        />
        <StepConnector color={colors.zoneGreen} />
        <StepItem
          n="3"
          icon="palette-outline"
          color={colors.zoneGreen}
          text={t('tour.s2.step3')}
        />
      </View>
    </ScrollView>
  );
}

function StepItem({
  n, icon, color, text,
}: { n: string; icon: any; color: string; text: string }) {
  return (
    <View style={styles.step} testID={`tour-step-${n}`}>
      <View style={[styles.stepIcon, { borderColor: color, shadowColor: color }]}>
        <MaterialCommunityIcons name={icon} size={26} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.stepNumBadge}>
          <Text style={styles.stepNumText}>{n}</Text>
        </View>
        <Text style={styles.stepText}>{text}</Text>
      </View>
    </View>
  );
}

function StepConnector({ color }: { color: string }) {
  return (
    <View style={styles.connectorWrap} pointerEvents="none">
      <View style={[styles.connectorLine, { backgroundColor: color }]} />
    </View>
  );
}

/* ───────────── Slide 3 — Colors ───────────── */

function SlideThree({ t }: { t: any }) {
  const rows = [
    { key: 'BLUE', color: colors.zoneBlue, icon: 'shield-check', label: 'Azul · Blue', desc: t('tour.s3.blue') },
    { key: 'GREEN', color: colors.zoneGreen, icon: 'chart-line-variant', label: 'Verde · Green', desc: t('tour.s3.green') },
    { key: 'YELLOW', color: colors.zoneYellow, icon: 'alert-outline', label: 'Amarillo · Yellow', desc: t('tour.s3.yellow') },
    { key: 'RED', color: colors.zoneRed, icon: 'alarm-light-outline', label: 'Rojo · Red', desc: t('tour.s3.red') },
  ] as const;
  return (
    <ScrollView
      contentContainerStyle={styles.slideContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.eyebrowGold}>{t('tour.s3.eyebrow')}</Text>
      <Text style={styles.slideTitle}>{t('tour.s3.title')}</Text>

      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        {rows.map((r) => (
          <View
            key={r.key}
            testID={`tour-zone-${r.key}`}
            style={[styles.zoneCard, { borderColor: r.color, shadowColor: r.color }]}
          >
            <View style={[styles.zoneIconWrap, { borderColor: r.color, shadowColor: r.color }]}>
              <MaterialCommunityIcons name={r.icon} size={20} color={r.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.zoneLabel, { color: r.color }]}>{r.label}</Text>
              <Text style={styles.zoneDesc}>{r.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.quoteCard}>
        <MaterialCommunityIcons name="format-quote-open" size={18} color={colors.brandGold} />
        <Text style={styles.quoteText}>{t('tour.s3.footer')}</Text>
      </View>
    </ScrollView>
  );
}

/* ───────────── Styles ───────────── */

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
  },
  stepPill: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: '#141310',
    borderWidth: 1, borderColor: colors.borderStrong,
  },
  stepPillText: { color: colors.brandGold, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  skipBtn: { flexDirection: 'row', alignItems: 'center' },
  skipText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  slideContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },

  // Slide 1
  eyebrowGreen: {
    color: colors.zoneGreen, fontSize: 11, letterSpacing: 2.5, fontWeight: '800',
    marginBottom: spacing.md,
  },
  eyebrowGold: {
    color: colors.brandGold, fontSize: 11, letterSpacing: 2.5, fontWeight: '800',
    marginBottom: spacing.md,
  },
  brandRow: {
    flexDirection: 'row', alignItems: 'baseline', gap: 8,
    marginBottom: spacing.lg,
  },
  brandBig: {
    color: colors.brandGold, fontSize: 44, fontWeight: '900', letterSpacing: 4,
  },
  brandTag: {
    color: colors.onSurface, fontSize: 12, letterSpacing: 3.5, fontWeight: '700',
  },
  centerVisual: { alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.xl },
  shieldRing: {
    width: 168, height: 168, borderRadius: 84,
    borderWidth: 1, borderColor: colors.brandGold,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.brandGold, shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 0 }, elevation: 8,
  },
  shieldRingInner: {
    width: 128, height: 128, borderRadius: 64,
    borderWidth: 2, borderColor: colors.brandGold,
    backgroundColor: '#141310',
    alignItems: 'center', justifyContent: 'center',
  },
  zoneRow: {
    flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl,
  },
  zoneDot: {
    width: 12, height: 12, borderRadius: 6,
    shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 5,
  },
  slideTitle: {
    color: colors.onSurface, fontSize: 24, fontWeight: '900', letterSpacing: 0.3,
    marginBottom: spacing.sm,
  },
  slideBody: {
    color: colors.onSurfaceSecondary, fontSize: 15, lineHeight: 22,
  },
  discCard: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  discText: { color: colors.onSurfaceTertiary, fontSize: 12, lineHeight: 17, flex: 1 },

  // Slide 2
  stepsWrap: { marginTop: spacing.lg },
  step: {
    flexDirection: 'row', gap: spacing.md, alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  stepIcon: {
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 2,
    backgroundColor: '#141310',
    alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.7, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 5,
  },
  stepNumBadge: {
    alignSelf: 'flex-start',
    minWidth: 22, height: 22, borderRadius: 4,
    paddingHorizontal: 6,
    borderWidth: 1, borderColor: colors.brandGold,
    backgroundColor: '#1F1B10',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  stepNumText: { color: colors.brandGold, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  stepText: { color: colors.onSurface, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  connectorWrap: {
    alignItems: 'center', paddingVertical: 4,
  },
  connectorLine: {
    width: 2, height: 16, opacity: 0.75, borderRadius: 1,
  },

  // Slide 3
  zoneCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md, borderWidth: 1.5,
    backgroundColor: colors.surfaceSecondary,
    shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 3,
  },
  zoneIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1.5, backgroundColor: '#141310',
    alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.6, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 3,
  },
  zoneLabel: { fontSize: 14, fontWeight: '900', letterSpacing: 0.4, marginBottom: 2 },
  zoneDesc: { color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 17 },
  quoteCard: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.brandGold,
    backgroundColor: '#141310',
  },
  quoteText: { color: colors.onSurface, fontSize: 13, lineHeight: 19, fontStyle: 'italic', flex: 1 },

  // Bottom
  dots: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: spacing.md,
  },
  dot: { height: 8, borderRadius: 4 },
  footer: {
    padding: spacing.xl, paddingTop: spacing.md,
  },
});
