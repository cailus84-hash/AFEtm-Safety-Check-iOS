import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ImageBackground } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, radius, shared, spacing } from '@/src/lib/theme';
import { fetchProfile, getDeviceId } from '@/src/lib/api';

export default function Index() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const id = await getDeviceId();
        const profile = await fetchProfile(id);
        if (profile) {
          router.replace('/(tabs)');
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
      <ImageBackground
        source={{
          uri: 'https://images.pexels.com/photos/9665181/pexels-photo-9665181.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=1200&w=800',
        }}
        style={styles.bg}
        imageStyle={{ opacity: 0.55 }}
      >
        <LinearGradient
          colors={['rgba(10,10,10,0.4)', 'rgba(10,10,10,0.95)', '#0A0A0A']}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.top}>
            <Text style={styles.brand}>AFE™</Text>
            <Text style={styles.tag}>SAFETY CHECK</Text>
            <View style={styles.divider} />
            <Text style={styles.subtitle}>
              Sports Performance Intelligence
            </Text>
          </View>

          <View style={styles.middle}>
            <Text style={styles.heroLine}>Antes de entrenar.</Text>
            <Text style={styles.heroLine}>Antes de competir.</Text>
            <Text style={[styles.heroLine, { color: colors.brandGold }]}>
              Antes de exigir más.
            </Text>
            <Text style={styles.description}>
              Chequeo preventivo de recuperación cardiovascular para apoyar
              decisiones responsables antes de continuar con tu actividad
              física planificada.
            </Text>
          </View>

          <View style={styles.bottom}>
            <View style={styles.zoneRow}>
              {[colors.zoneBlue, colors.zoneGreen, colors.zoneYellow, colors.zoneRed].map((c) => (
                <View key={c} style={[styles.zoneDot, { backgroundColor: c, shadowColor: c }]} />
              ))}
            </View>

            <Pressable
              testID="onboarding-cta-start"
              style={({ pressed }) => [shared.primaryBtn, pressed && { opacity: 0.85 }]}
              onPress={() => router.push('/profile-setup')}
            >
              <Text style={shared.primaryBtnText}>Comenzar</Text>
            </Pressable>

            <Text style={styles.disclaimer} testID="onboarding-disclaimer">
              No es una aplicación de diagnóstico médico. No sustituye la
              evaluación profesional.
            </Text>
          </View>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: 'space-between' },
  center: { alignItems: 'center', justifyContent: 'center' },
  top: { alignItems: 'center', marginTop: spacing.xxl },
  brand: {
    color: colors.brandGold,
    fontSize: 56,
    fontWeight: '900',
    letterSpacing: 6,
  },
  tag: {
    color: colors.onSurface,
    fontSize: 14,
    letterSpacing: 6,
    fontWeight: '700',
    marginTop: 2,
  },
  divider: {
    width: 60,
    height: 2,
    backgroundColor: colors.brandGold,
    marginTop: spacing.md,
    borderRadius: 2,
  },
  subtitle: {
    color: colors.onSurfaceTertiary,
    fontSize: 11,
    letterSpacing: 3,
    marginTop: spacing.md,
    textTransform: 'uppercase',
  },
  middle: { alignItems: 'center' },
  heroLine: {
    color: colors.onSurface,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  description: {
    color: colors.onSurfaceTertiary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xl,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  bottom: { paddingBottom: spacing.md },
  zoneRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
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
    marginTop: spacing.lg,
  },
});
