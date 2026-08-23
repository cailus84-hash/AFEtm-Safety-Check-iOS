import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/src/lib/theme';
import { useI18n, zoneShortI18n, zoneDescI18n } from '@/src/lib/i18n';

type ZoneRow = {
  key: 'BLUE' | 'GREEN' | 'YELLOW' | 'RED';
  color: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

const ROWS: ZoneRow[] = [
  { key: 'BLUE', color: colors.zoneBlue, icon: 'shield-check' },
  { key: 'GREEN', color: colors.zoneGreen, icon: 'chart-line-variant' },
  { key: 'YELLOW', color: colors.zoneYellow, icon: 'alert' },
  { key: 'RED', color: colors.zoneRed, icon: 'alarm-light' },
];

export function ColorGuideCard() {
  const { t } = useI18n();
  return (
    <View style={styles.card} testID="color-guide-card">
      <View style={styles.header}>
        <Text style={styles.eyebrow}>{t('guide.eyebrow')}</Text>
        <Text style={styles.title}>{t('guide.title')}</Text>
        <Text style={styles.subtitle}>{t('guide.subtitle')}</Text>
      </View>

      <View style={styles.rows}>
        {ROWS.map((r) => (
          <View
            key={r.key}
            testID={`color-guide-row-${r.key}`}
            style={[styles.row, { borderColor: r.color, shadowColor: r.color }]}
          >
            <View style={[styles.iconWrap, { borderColor: r.color, shadowColor: r.color }]}>
              <MaterialCommunityIcons name={r.icon} size={20} color={r.color} />
            </View>
            <View style={styles.rowBody}>
              <Text style={[styles.rowName, { color: r.color }]}>{zoneShortI18n(t, r.key)}</Text>
              <Text style={styles.rowDesc}>{zoneDescI18n(t, r.key)}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.footerDivider}>
        <View style={styles.dividerLine} />
        <Text style={styles.footerTitle}>{t('guide.footer')}</Text>
        <View style={styles.dividerLine} />
      </View>

      <View style={styles.helpers}>
        <Helper icon="shield-outline" text={t('guide.h1')} />
        <Helper icon="stethoscope" text={t('guide.h2')} />
        <Helper icon="account-heart-outline" text={t('guide.h3')} />
      </View>

      <View style={styles.taglineWrap}>
        <Text style={styles.tagline}>
          <Text style={{ color: colors.zoneBlue }}>WE LEARN.</Text>{' '}
          <Text style={{ color: colors.zoneGreen }}>WE TRAIN.</Text>{' '}
          <Text style={{ color: colors.zoneRed }}>WE WON.</Text>
        </Text>
      </View>
    </View>
  );
}

function Helper({
  icon,
  text,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  text: string;
}) {
  return (
    <View style={styles.helper}>
      <View style={styles.helperIcon}>
        <MaterialCommunityIcons name={icon} size={16} color={colors.brandGold} />
      </View>
      <Text style={styles.helperText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  header: { marginBottom: spacing.md },
  eyebrow: {
    color: colors.brandGold, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginBottom: 4,
  },
  title: { color: colors.onSurface, fontSize: 18, fontWeight: '800', letterSpacing: 0.3 },
  subtitle: { color: colors.onSurfaceTertiary, fontSize: 12, lineHeight: 17, marginTop: 4 },
  rows: { gap: spacing.sm, marginTop: spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1.5, borderRadius: radius.md,
    backgroundColor: colors.surface,
    shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 3,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.6, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 3,
  },
  rowBody: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '900', letterSpacing: 1.2, marginBottom: 3 },
  rowDesc: { color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 17 },
  footerDivider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.brandGold, opacity: 0.5 },
  footerTitle: { color: colors.brandGold, fontSize: 10, letterSpacing: 2, fontWeight: '800' },
  helpers: { marginTop: spacing.md, gap: spacing.sm },
  helper: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  helperIcon: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 1, borderColor: colors.brandGold,
    backgroundColor: '#141310',
    alignItems: 'center', justifyContent: 'center',
  },
  helperText: { color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 18, flex: 1 },
  taglineWrap: {
    alignItems: 'center', marginTop: spacing.lg,
    paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider,
  },
  tagline: { fontSize: 11, fontWeight: '800', letterSpacing: 2 },
});
