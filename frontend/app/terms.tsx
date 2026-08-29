import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, shared, spacing } from '@/src/lib/theme';
import { useI18n } from '@/src/lib/i18n';
import {
  acceptTerms,
  fetchProfile,
  getCurrentTerms,
  getDeviceId,
  TermsInfo,
} from '@/src/lib/api';

const FALLBACK_VERSION = '1.0';

/**
 * Mandatory acceptance of the AFEtm Mobile Personal-Use Terms.
 *
 * Two modes:
 *   • Initial (default) — first-time onboarding, all three checkboxes.
 *   • Update — the server bumped the Terms version. We fetch the new
 *     version + changelog from `GET /api/terms`, show a "TERMS UPDATED"
 *     banner explaining what changed and require re-acceptance before
 *     the athlete can create any new assessment.
 *
 * The screen auto-detects the "update" case:
 *   1. If the profile already has `terms_accepted_at` AND the server
 *      version differs from the accepted one → update mode.
 *   2. If the route is opened with `?mode=update` (e.g. by the home
 *      redirect) we also force update mode.
 */
export default function Terms() {
  const router = useRouter();
  const { t, lang, toggle } = useI18n();
  const { mode } = useLocalSearchParams<{ mode?: string }>();

  const [c1, setC1] = useState(false);
  const [c2, setC2] = useState(false);
  const [c3, setC3] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [serverTerms, setServerTerms] = useState<TermsInfo | null>(null);
  const [previousVersion, setPreviousVersion] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [info, deviceId] = await Promise.all([
          getCurrentTerms().catch(() => null),
          getDeviceId(),
        ]);
        setServerTerms(info);
        const prof = await fetchProfile(deviceId).catch(() => null);
        const prev = prof?.terms_version ?? null;
        setPreviousVersion(prev);
      } finally {
        setInitializing(false);
      }
    })();
  }, []);

  const version = serverTerms?.version ?? FALLBACK_VERSION;
  const effectiveDate = serverTerms?.effective_date ?? '';
  const changelog =
    (lang === 'es' ? serverTerms?.changelog?.es : serverTerms?.changelog?.en) ??
    serverTerms?.changelog?.en ??
    '';
  const isUpdate =
    mode === 'update' ||
    (!!previousVersion && previousVersion !== version);
  const allChecked = c1 && c2 && c3;

  const proceed = async () => {
    if (!allChecked) {
      setError(t('terms.error.all'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const deviceId = await getDeviceId();
      const prof = await acceptTerms(deviceId, version);
      // If profile is already complete (name set) → go to home,
      // otherwise onboarding continues to profile-setup.
      if (prof?.name) {
        router.replace('/(tabs)');
      } else {
        router.replace('/profile-setup');
      }
    } catch (e: any) {
      setError(e?.message || t('terms.error.save'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={shared.screen} edges={['top', 'bottom']} testID="terms-screen">
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="terms-back-btn">
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.topTitle}>{t('terms.title')}</Text>
        <Pressable onPress={toggle} style={styles.langPill} testID="terms-lang-toggle">
          <MaterialCommunityIcons name="translate" size={12} color={colors.brandGold} />
          <Text style={styles.langPillText}>{lang === 'en' ? 'EN' : 'ES'}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {initializing ? (
          <View style={{ paddingTop: spacing.xxxl, alignItems: 'center' }}>
            <ActivityIndicator color={colors.brandGold} />
          </View>
        ) : (
          <>
            {isUpdate && (
              <View style={styles.updateCard} testID="terms-update-banner">
                <View style={styles.updateBadgeRow}>
                  <View style={styles.updateBadge}>
                    <MaterialCommunityIcons name="autorenew" size={12} color="#000" />
                    <Text style={styles.updateBadgeText}>{t('terms.updated.eyebrow')}</Text>
                  </View>
                </View>
                <Text style={styles.updateTitle}>{t('terms.updated.title')}</Text>
                <Text style={styles.updateBody}>{t('terms.updated.body')}</Text>
                <View style={styles.updateMetaRow}>
                  {previousVersion ? (
                    <View style={styles.updateMetaChip}>
                      <MaterialCommunityIcons
                        name="history"
                        size={11}
                        color={colors.onSurfaceTertiary}
                      />
                      <Text style={styles.updateMetaText}>
                        {t('terms.updated.previous', { previous: previousVersion })}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.updateMetaChip}>
                    <MaterialCommunityIcons
                      name="check-decagram-outline"
                      size={11}
                      color={colors.brandGold}
                    />
                    <Text style={[styles.updateMetaText, { color: colors.brandGold }]}>
                      {t('terms.updated.new', { version, date: effectiveDate })}
                    </Text>
                  </View>
                </View>
                {changelog ? (
                  <View style={styles.changelogBox}>
                    <Text style={styles.changelogTitle}>
                      {t('terms.updated.changelog')}
                    </Text>
                    <Text style={styles.changelogText}>{changelog}</Text>
                  </View>
                ) : null}
              </View>
            )}

            <Text style={styles.eyebrow}>{t('terms.eyebrow')}</Text>
            <Text style={shared.h1}>{t('terms.title')}</Text>

            <View style={styles.versionRow}>
              <View style={styles.versionPill}>
                <MaterialCommunityIcons name="shield-lock-outline" size={12} color={colors.brandGold} />
                <Text style={styles.versionText}>{t('terms.version', { version })}</Text>
              </View>
            </View>

            <View style={styles.introCard}>
              <Text style={styles.introText}>{t('terms.intro')}</Text>
            </View>

            {/* Allowed */}
            <Text style={[styles.section, { color: colors.zoneGreen, marginTop: spacing.xl }]}>
              {t('terms.sectionAllowed')}
            </Text>
            <View style={styles.list}>
              <Bullet color={colors.zoneGreen} icon="check-circle" text={t('terms.allowed.1')} />
              <Bullet color={colors.zoneGreen} icon="check-circle" text={t('terms.allowed.2')} />
              <Bullet color={colors.zoneGreen} icon="check-circle" text={t('terms.allowed.3')} />
            </View>

            {/* NOT Allowed */}
            <Text style={[styles.section, { color: colors.zoneRed, marginTop: spacing.lg }]}>
              {t('terms.sectionNotAllowed')}
            </Text>
            <View style={styles.list}>
              <Bullet color={colors.zoneRed} icon="close-circle" text={t('terms.notAllowed.1')} />
              <Bullet color={colors.zoneRed} icon="close-circle" text={t('terms.notAllowed.2')} />
              <Bullet color={colors.zoneRed} icon="close-circle" text={t('terms.notAllowed.3')} />
              <Bullet color={colors.zoneRed} icon="close-circle" text={t('terms.notAllowed.4')} />
              <Bullet color={colors.zoneRed} icon="close-circle" text={t('terms.notAllowed.5')} />
            </View>

            {/* Hardware / Bluetooth compatibility (user's responsibility) */}
            <Text style={[styles.section, { color: colors.brandGold, marginTop: spacing.lg }]}>
              {t('terms.sectionHardware')}
            </Text>
            <View style={styles.list} testID="terms-hardware-block">
              <Bullet color={colors.brandGold} icon="bluetooth" text={t('terms.hardware.1')} />
              <Bullet color={colors.brandGold} icon="shield-off-outline" text={t('terms.hardware.2')} />
              <Bullet color={colors.zoneGreen} icon="pencil-outline" text={t('terms.hardware.3')} />
            </View>

            <View style={styles.divider} />

            <Checkbox testID="terms-chk-self" checked={c1} onToggle={() => setC1((v) => !v)} label={t('terms.checkbox.self')} />
            <Checkbox testID="terms-chk-institutional" checked={c2} onToggle={() => setC2((v) => !v)} label={t('terms.checkbox.institutional')} />
            <Checkbox testID="terms-chk-terms" checked={c3} onToggle={() => setC3((v) => !v)} label={t('terms.checkbox.terms')} />

            <View style={styles.instCard}>
              <View style={styles.instCardHeader}>
                <MaterialCommunityIcons
                  name="office-building-outline"
                  size={16}
                  color={colors.brandGold}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.instTitle} numberOfLines={2}>
                    {t('terms.institutional.cta')}
                  </Text>
                  <Text style={styles.instHint} numberOfLines={2}>
                    {t('inst.contact.hint')}
                  </Text>
                </View>
              </View>
              <Pressable
                style={({ pressed }) => [styles.instBtn, pressed && { opacity: 0.85 }]}
                onPress={() => router.push('/institutional')}
                testID="terms-institutional-link"
              >
                <Text style={styles.instBtnText} numberOfLines={1}>
                  {t('terms.institutional.link')}
                </Text>
                <MaterialCommunityIcons name="arrow-top-right" size={14} color={colors.brandGold} />
              </Pressable>
            </View>

            {error ? <Text style={styles.error} testID="terms-error">{error}</Text> : null}
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          testID="terms-accept-btn"
          disabled={!allChecked || saving || initializing}
          onPress={proceed}
          style={({ pressed }) => [
            shared.primaryBtn,
            (!allChecked || saving || initializing) && { opacity: 0.4 },
            pressed && { opacity: 0.85 },
          ]}
        >
          {saving ? <ActivityIndicator color="#000" /> : (
            <Text style={shared.primaryBtnText}>
              {isUpdate ? t('terms.updated.accept') : t('terms.accept')}
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Bullet({ color, icon, text }: { color: string; icon: any; text: string }) {
  return (
    <View style={styles.bullet}>
      <MaterialCommunityIcons name={icon} size={16} color={color} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

function Checkbox({
  checked, onToggle, label, testID,
}: { checked: boolean; onToggle: () => void; label: string; testID: string }) {
  return (
    <Pressable onPress={onToggle} style={styles.checkboxRow} testID={testID}>
      <View
        style={[
          styles.checkbox,
          checked && {
            borderColor: colors.brandGold,
            backgroundColor: colors.brandGold,
            shadowColor: colors.brandGold,
            shadowOpacity: 0.5,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 0 },
            elevation: 3,
          },
        ]}
      >
        {checked && <MaterialCommunityIcons name="check" size={16} color="#000" />}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: colors.onSurface, fontSize: 13, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', flex: 1, textAlign: 'center' },
  langPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong,
    backgroundColor: '#141310',
  },
  langPillText: { color: colors.brandGold, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl * 2 },
  updateCard: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 2, borderColor: colors.brandGold,
    backgroundColor: '#141310',
    shadowColor: colors.brandGold, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 6,
  },
  updateBadgeRow: { flexDirection: 'row', marginBottom: spacing.sm },
  updateBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: 4,
    borderRadius: radius.pill, backgroundColor: colors.brandGold,
  },
  updateBadgeText: { color: '#000', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  updateTitle: { color: colors.brandGold, fontSize: 17, fontWeight: '900', letterSpacing: 0.3 },
  updateBody: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  updateMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  updateMetaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  updateMetaText: { color: colors.onSurfaceTertiary, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  changelogBox: {
    marginTop: spacing.md,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border,
  },
  changelogTitle: { color: colors.brandGold, fontSize: 10, letterSpacing: 1.5, fontWeight: '800', marginBottom: 4 },
  changelogText: { color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 17 },
  eyebrow: {
    color: colors.brandGold, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginBottom: 4,
  },
  versionRow: { flexDirection: 'row', marginTop: spacing.sm },
  versionPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: 4,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong,
    backgroundColor: '#141310',
  },
  versionText: { color: colors.brandGold, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  introCard: {
    marginTop: spacing.lg, padding: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandGold,
    backgroundColor: '#141310',
  },
  introText: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 20 },
  section: { fontSize: 11, letterSpacing: 2, fontWeight: '800', marginBottom: spacing.sm },
  list: { gap: spacing.sm },
  bullet: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  bulletText: { flex: 1, color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.xl },
  checkboxRow: {
    flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start',
    padding: spacing.md, marginBottom: spacing.sm,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 4,
    borderWidth: 2, borderColor: colors.borderStrong,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  checkboxLabel: { color: colors.onSurface, fontSize: 13, lineHeight: 19, flex: 1 },
  instCard: {
    // Stack the card vertically so the CTA never squeezes the title
    // into a 1-char column on narrow screens (regression seen in ES).
    flexDirection: 'column',
    gap: spacing.sm,
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSecondary,
  },
  instCardHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
  },
  instTitle: { color: colors.onSurface, fontSize: 13, fontWeight: '800' },
  instHint: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  instBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    alignSelf: 'stretch',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brandGold,
    backgroundColor: '#1F1B10',
  },
  instBtnText: { color: colors.brandGold, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  error: { color: colors.zoneRed, fontSize: 13, fontWeight: '600', marginTop: spacing.md },
  footer: {
    padding: spacing.xl, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
});
