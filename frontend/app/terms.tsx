import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, shared, spacing } from '@/src/lib/theme';
import { useI18n } from '@/src/lib/i18n';
import { acceptTerms, getDeviceId } from '@/src/lib/api';

const TERMS_VERSION = '1.0';
const INSTITUTIONAL_URL = 'https://wewonmatrix.com/';

/**
 * Mandatory acceptance of the AFEtm Mobile Personal-Use Terms.
 *
 * Placed AFTER the /index onboarding hero and BEFORE /profile-setup.
 * The three individual checkboxes must all be checked for the primary
 * button to enable. Acceptance is persisted server-side (with a
 * timestamp + version) via /api/profile/accept-terms. Without a valid
 * acceptance, /api/assessments rejects with HTTP 403.
 */
export default function Terms() {
  const router = useRouter();
  const { t, lang, toggle } = useI18n();
  const [c1, setC1] = useState(false);
  const [c2, setC2] = useState(false);
  const [c3, setC3] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allChecked = c1 && c2 && c3;

  const openInstitutional = () => {
    router.push('/institutional');
  };

  const proceed = async () => {
    if (!allChecked) {
      setError(t('terms.error.all'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const deviceId = await getDeviceId();
      await acceptTerms(deviceId, TERMS_VERSION);
      router.replace('/profile-setup');
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
        <Text style={styles.eyebrow}>{t('terms.eyebrow')}</Text>
        <Text style={shared.h1}>{t('terms.title')}</Text>

        {/* Version + license badge */}
        <View style={styles.versionRow}>
          <View style={styles.versionPill}>
            <MaterialCommunityIcons name="shield-lock-outline" size={12} color={colors.brandGold} />
            <Text style={styles.versionText}>{t('terms.version', { version: TERMS_VERSION })}</Text>
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

        <View style={styles.divider} />

        {/* Checkboxes */}
        <Checkbox testID="terms-chk-self" checked={c1} onToggle={() => setC1((v) => !v)} label={t('terms.checkbox.self')} />
        <Checkbox testID="terms-chk-institutional" checked={c2} onToggle={() => setC2((v) => !v)} label={t('terms.checkbox.institutional')} />
        <Checkbox testID="terms-chk-terms" checked={c3} onToggle={() => setC3((v) => !v)} label={t('terms.checkbox.terms')} />

        {/* Institutional CTA */}
        <View style={styles.instCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.instTitle}>{t('terms.institutional.cta')}</Text>
            <Text style={styles.instHint}>{t('inst.contact.hint')}</Text>
          </View>
          <Pressable
            style={styles.instBtn}
            onPress={openInstitutional}
            testID="terms-institutional-link"
          >
            <Text style={styles.instBtnText}>{t('terms.institutional.link')}</Text>
            <MaterialCommunityIcons name="arrow-top-right" size={14} color={colors.brandGold} />
          </Pressable>
        </View>

        {error ? <Text style={styles.error} testID="terms-error">{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          testID="terms-accept-btn"
          disabled={!allChecked || saving}
          onPress={proceed}
          style={({ pressed }) => [
            shared.primaryBtn,
            (!allChecked || saving) && { opacity: 0.4 },
            pressed && { opacity: 0.85 },
          ]}
        >
          {saving ? <ActivityIndicator color="#000" /> : (
            <Text style={shared.primaryBtnText}>{t('terms.accept')}</Text>
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
  checked,
  onToggle,
  label,
  testID,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  testID: string;
}) {
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
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSecondary,
  },
  instTitle: { color: colors.onSurface, fontSize: 13, fontWeight: '800' },
  instHint: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  instBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
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
