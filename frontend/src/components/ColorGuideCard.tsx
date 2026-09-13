import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Linking } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Asset } from 'expo-asset';
import * as Sharing from 'expo-sharing';
import { colors, radius, spacing } from '@/src/lib/theme';
import { useI18n, zoneShortI18n } from '@/src/lib/i18n';

const GUIDE_IMAGE_BY_LANG: Record<string, number> = {
  en: require('../../assets/images/afetm-hero-en.png'),
  es: require('../../assets/images/afetm-hero-es.png'),
};

type ZoneKey = 'BLUE' | 'GREEN' | 'YELLOW' | 'RED';

type ZoneRow = {
  key: ZoneKey;
  color: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

const ROWS: ZoneRow[] = [
  { key: 'BLUE', color: colors.zoneBlue, icon: 'shield-check' },
  { key: 'GREEN', color: colors.zoneGreen, icon: 'chart-line-variant' },
  { key: 'YELLOW', color: colors.zoneYellow, icon: 'alert' },
  { key: 'RED', color: colors.zoneRed, icon: 'alarm-light' },
];

/**
 * User-facing Color Guide.
 *
 * By product decision this card is kept intentionally simple:
 *   • Color · Action                        (e.g. "Blue — Continue")
 *   • One short explanation
 *   • One operational recommendation
 *
 * No thresholds, no formulas, no AURC / Tau or algorithm internals.
 * The authoritative AFEtm color always comes from the Replit engine —
 * this guide only explains how to react to it.
 */
export function ColorGuideCard() {
  const { t, lang } = useI18n();
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState(false);

  const onShare = async () => {
    if (sharing) return;
    setSharing(true);
    setShareError(false);
    try {
      // Share the OFFICIAL AFEtm Visual Color Guide artwork in the
      // athlete's current language. No device permissions required —
      // the native share sheet handles the destination.
      const asset = Asset.fromModule(GUIDE_IMAGE_BY_LANG[lang] ?? GUIDE_IMAGE_BY_LANG.en);
      await asset.downloadAsync();
      const uri = asset.localUri || asset.uri;
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'AFE™ Visual Color Guide',
          UTI: 'public.png',
        });
      } else {
        // Web preview fallback — open the image so the user can save it.
        await Linking.openURL(uri);
      }
    } catch {
      setShareError(true);
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={styles.card} testID="color-guide-card">
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{t('guide.eyebrow')}</Text>
          <Text style={styles.title}>{t('guide.title')}</Text>
          <Text style={styles.subtitle}>{t('guide.subtitle')}</Text>
        </View>
        <Pressable
          testID="color-guide-share-btn"
          onPress={onShare}
          disabled={sharing}
          style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.8 }]}
          accessibilityLabel={t('guide.share')}
        >
          {sharing ? (
            <ActivityIndicator size="small" color={colors.brandGold} />
          ) : (
            <MaterialCommunityIcons name="share-variant" size={16} color={colors.brandGold} />
          )}
          <Text style={styles.shareBtnText}>{t('guide.share')}</Text>
        </Pressable>
      </View>
      {shareError ? (
        <Text style={styles.shareError} testID="color-guide-share-error">
          {t('guide.share.error')}
        </Text>
      ) : null}

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
              <View style={styles.rowTitleRow}>
                <Text style={[styles.rowName, { color: r.color }]}>
                  {zoneShortI18n(t, r.key)}
                </Text>
                <Text style={styles.rowSep}>—</Text>
                <Text style={[styles.rowAction, { color: r.color }]}>
                  {t(`guide.action.${r.key}` as any)}
                </Text>
              </View>
              <Text style={styles.rowExplanation}>
                {t(`guide.explanation.${r.key}` as any)}
              </Text>
              <View style={styles.recRow}>
                <MaterialCommunityIcons
                  name="arrow-right-thin"
                  size={14}
                  color={colors.onSurfaceTertiary}
                />
                <Text style={styles.rowRecommendation}>
                  {t(`guide.recommendation.${r.key}` as any)}
                </Text>
              </View>
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
  header: { marginBottom: spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    minHeight: 44,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brandGold,
    backgroundColor: '#141310',
  },
  shareBtnText: { color: colors.brandGold, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  shareError: { color: colors.zoneRed, fontSize: 11, marginBottom: spacing.sm },
  eyebrow: {
    color: colors.brandGold, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginBottom: 4,
  },
  title: { color: colors.onSurface, fontSize: 18, fontWeight: '800', letterSpacing: 0.3 },
  subtitle: { color: colors.onSurfaceTertiary, fontSize: 12, lineHeight: 17, marginTop: 4 },
  rows: { gap: spacing.sm, marginTop: spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md,
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
  rowTitleRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6,
    marginBottom: 4,
  },
  rowName: { fontSize: 15, fontWeight: '900', letterSpacing: 1.2 },
  rowSep: { color: colors.onSurfaceTertiary, fontSize: 14, fontWeight: '700' },
  rowAction: { fontSize: 14, fontWeight: '800', letterSpacing: 0.3, flexShrink: 1 },
  rowExplanation: {
    color: colors.onSurface, fontSize: 12, lineHeight: 17, fontWeight: '600',
    marginBottom: 4,
  },
  recRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  rowRecommendation: {
    flex: 1,
    color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 17,
  },
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
