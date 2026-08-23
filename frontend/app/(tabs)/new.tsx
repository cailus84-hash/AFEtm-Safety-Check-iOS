import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, shared, spacing } from '@/src/lib/theme';
import { useI18n } from '@/src/lib/i18n';

export default function NewChoice() {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <SafeAreaView style={shared.screen} edges={['top']} testID="new-choice-screen">
      <View style={styles.header}>
        <Text style={styles.eyebrow}>{t('new.eyebrow')}</Text>
        <Text style={shared.h2}>{t('new.title')}</Text>
        <Text style={[shared.body, { marginTop: spacing.sm }]}>{t('new.subtitle')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
        <Pressable
          testID="mode-guided"
          onPress={() => router.push('/assessment-flow/guided')}
          style={({ pressed }) => [styles.modeCard, styles.modeGuided, pressed && { opacity: 0.9 }]}
        >
          <View style={styles.badgeRow}>
            <View style={[styles.pill, { backgroundColor: colors.brandGold }]}>
              <Text style={styles.pillText}>{t('new.guided.badge')}</Text>
            </View>
          </View>
          <View style={[styles.iconWrap, { borderColor: colors.brandGold, shadowColor: colors.brandGold }]}>
            <MaterialCommunityIcons name="bluetooth-connect" size={30} color={colors.brandGold} />
          </View>
          <Text style={styles.modeTitle}>{t('new.guided.title')}</Text>
          <Text style={styles.modeDesc}>{t('new.guided.desc')}</Text>
          <View style={styles.stepsRow}>
            <Step n="1" text={t('new.step.scan')} />
            <Step n="2" text={t('new.step.connect')} />
            <Step n="3" text={t('new.step.rhr')} />
            <Step n="4" text={t('new.step.fcp')} />
            <Step n="5" text={t('new.step.recovery')} />
          </View>
        </Pressable>

        <Pressable
          testID="mode-manual"
          onPress={() => router.push('/assessment-flow/manual')}
          style={({ pressed }) => [styles.modeCard, styles.modeManual, pressed && { opacity: 0.9 }]}
        >
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons name="pencil-outline" size={28} color={colors.onSurfaceSecondary} />
          </View>
          <Text style={styles.modeTitle}>{t('new.manual.title')}</Text>
          <Text style={styles.modeDesc}>{t('new.manual.desc')}</Text>
        </Pressable>

        {Platform.OS === 'web' ? (
          <View style={styles.warn} testID="ble-web-warning">
            <MaterialCommunityIcons name="alert-outline" size={16} color={colors.zoneYellow} />
            <Text style={styles.warnText}>{t('new.web.warning')}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Step({ n, text }: { n: string; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepBadgeText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  eyebrow: {
    color: colors.brandGold, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginBottom: 4,
  },
  modeCard: {
    borderWidth: 1.5, borderRadius: radius.lg, padding: spacing.xl,
    backgroundColor: colors.surfaceSecondary,
  },
  modeGuided: {
    borderColor: colors.brandGold, shadowColor: colors.brandGold,
    shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 6,
  },
  modeManual: { borderColor: colors.border },
  badgeRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: spacing.sm },
  pill: { paddingHorizontal: spacing.md, paddingVertical: 3, borderRadius: radius.pill },
  pillText: { color: '#000', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  iconWrap: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: colors.surface,
    borderWidth: 1.5, borderColor: colors.borderStrong,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
    shadowOpacity: 0.7, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 5,
  },
  modeTitle: {
    color: colors.onSurface, fontSize: 20, fontWeight: '900',
    letterSpacing: 0.3, marginBottom: spacing.sm,
  },
  modeDesc: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19 },
  stepsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  step: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBadge: {
    width: 20, height: 20, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.brandGold,
    alignItems: 'center', justifyContent: 'center',
  },
  stepBadgeText: { color: colors.brandGold, fontSize: 11, fontWeight: '800' },
  stepText: { color: colors.onSurfaceTertiary, fontSize: 12, fontWeight: '600' },
  warn: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.zoneYellow,
    backgroundColor: '#1F1A0A',
  },
  warnText: { color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 17, flex: 1 },
});
