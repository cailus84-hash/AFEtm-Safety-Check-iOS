import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Profile, fetchProfile, getDeviceId } from '@/src/lib/api';
import { IOS_PAYWALL_ENABLED } from '@/src/lib/billing';
import { colors, radius, shared, spacing } from '@/src/lib/theme';
import { useI18n, Lang } from '@/src/lib/i18n';

export default function ProfileTab() {
  const router = useRouter();
  const { t, lang, setLang } = useI18n();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const id = await getDeviceId();
      const p = await fetchProfile(id);
      setProfile(p);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const fcp = profile ? Math.round(0.8 * (220 - profile.age)) : 0;

  return (
    <SafeAreaView style={shared.screen} edges={['top']} testID="profile-tab-screen">
      <View style={styles.header}>
        <Text style={styles.eyebrow}>{t('profile.eyebrow')}</Text>
        <Text style={shared.h2}>{t('profile.title')}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandGold} />
        </View>
      ) : profile ? (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }}>
          <View style={styles.avatarCard}>
            <View style={styles.avatar}>
              <MaterialCommunityIcons name="account" size={40} color={colors.brandGold} />
            </View>
            <Text style={styles.name} testID="profile-name">{profile.name}</Text>
            <View style={styles.sportChip}>
              <MaterialCommunityIcons name="run-fast" size={13} color={colors.brandGold} />
              <Text style={styles.sportChipText}>{profile.sport}</Text>
            </View>
            {profile.target_zone ? (
              <View
                style={[
                  styles.targetChip,
                  {
                    borderColor: profile.target_zone === 'BLUE' ? colors.zoneBlue : colors.zoneGreen,
                    shadowColor: profile.target_zone === 'BLUE' ? colors.zoneBlue : colors.zoneGreen,
                  },
                ]}
                testID="profile-target-chip"
              >
                <MaterialCommunityIcons
                  name="target"
                  size={13}
                  color={profile.target_zone === 'BLUE' ? colors.zoneBlue : colors.zoneGreen}
                />
                <Text
                  style={[
                    styles.targetChipText,
                    { color: profile.target_zone === 'BLUE' ? colors.zoneBlue : colors.zoneGreen },
                  ]}
                >
                  {profile.target_zone === 'BLUE' ? t('profile.target.blue') : t('profile.target.green')}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.statsGrid}>
            <Stat label={t('profile.stat.age')} value={`${profile.age}`} unit={t('profile.stat.age.unit')} />
            <Stat label={t('profile.stat.weight')} value={`${profile.weight}`} unit={t('profile.stat.weight.unit')} />
            <Stat label={t('profile.stat.fcp')} value={`${fcp}`} unit={t('profile.stat.fcp.unit')} />
          </View>

          <Pressable
            testID="profile-edit-btn"
            style={styles.editBtn}
            onPress={() => router.push('/profile-setup')}
          >
            <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.onSurface} />
            <Text style={styles.editBtnText}>{t('profile.edit')}</Text>
          </Pressable>

          <Pressable
            testID="profile-reminders-btn"
            style={[styles.editBtn, { marginTop: spacing.md }]}
            onPress={() => router.push('/reminders')}
          >
            <MaterialCommunityIcons name="bell-ring-outline" size={18} color={colors.brandGold} />
            <Text style={[styles.editBtnText, { color: colors.brandGold }]}>
              {t('profile.reminders')}
            </Text>
            <MaterialCommunityIcons
              name="chevron-right"
              size={18}
              color={colors.onSurfaceTertiary}
              style={{ marginLeft: 'auto' }}
            />
          </Pressable>

          {/* Re-open the 3-slide introduction tour. Uses ?force=1 so
              AsyncStorage seen state is preserved. */}
          <Pressable
            testID="profile-tour-btn"
            style={[styles.editBtn, { marginTop: spacing.md, justifyContent: 'flex-start' }]}
            onPress={() => router.push('/tour?force=1')}
          >
            <MaterialCommunityIcons name="compass-outline" size={18} color={colors.zoneGreen} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.editBtnText, { color: colors.onSurface }]}>
                {t('profile.tour.title')}
              </Text>
              <Text style={styles.tourHint}>{t('profile.tour.body')}</Text>
            </View>
            <MaterialCommunityIcons
              name="chevron-right"
              size={18}
              color={colors.onSurfaceTertiary}
            />
          </Pressable>

          {/* Manage subscription (native store — App Store / Google Play).
              Hidden on iOS v1.0 while the paywall stays mocked. */}
          {IOS_PAYWALL_ENABLED && (
            <Pressable
              testID="profile-subscription-btn"
              style={[styles.editBtn, { marginTop: spacing.md, justifyContent: 'flex-start' }]}
              onPress={() => router.push('/manage-subscription')}
            >
              <MaterialCommunityIcons name="crown-outline" size={18} color={colors.brandGold} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.editBtnText, { color: colors.onSurface }]}>
                  {t('profile.subscription.title')}
                </Text>
                <Text style={styles.tourHint}>{t('profile.subscription.body')}</Text>
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={18}
                color={colors.onSurfaceTertiary}
              />
            </Pressable>
          )}

          {/* Support link — opens the WeWon Safety Check support site.
              Present on every platform to satisfy Apple Guideline 1.5. */}
          <Pressable
            testID="profile-support-btn"
            style={[styles.editBtn, { marginTop: spacing.md, justifyContent: 'flex-start' }]}
            onPress={() =>
              Linking.openURL('https://www.wewonsss.com/contact').catch(() =>
                Linking.openURL('https://www.wewonsss.com').catch(() => {}),
              )
            }
          >
            <MaterialCommunityIcons name="lifebuoy" size={18} color={colors.zoneBlue} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.editBtnText, { color: colors.onSurface }]}>
                {t('profile.support.title')}
              </Text>
              <Text style={styles.tourHint}>{t('profile.support.body')}</Text>
            </View>
            <MaterialCommunityIcons
              name="open-in-new"
              size={16}
              color={colors.onSurfaceTertiary}
            />
          </Pressable>

          {/* TEMPORARY — developer diagnostics for the AFEtm bridge.
              Remove once the field investigation is complete. */}
          <Pressable
            testID="profile-diagnostics-btn"
            style={[styles.editBtn, { marginTop: spacing.md, justifyContent: 'flex-start' }]}
            onPress={() => router.push('/diagnostics')}
          >
            <MaterialCommunityIcons name="bug-outline" size={18} color={colors.zoneYellow} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.editBtnText, { color: colors.onSurface }]}>
                Diagnostics (temp)
              </Text>
              <Text style={styles.tourHint}>Assessment bridge trace — developer only</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color={colors.onSurfaceTertiary} />
          </Pressable>

          {/* Personal-Use License card */}
          <View style={styles.licenseCard} testID="profile-license-card">
            <View style={styles.licenseHead}>
              <View style={styles.licenseIcon}>
                <MaterialCommunityIcons name="shield-lock-outline" size={16} color={colors.brandGold} />
              </View>
              <Text style={styles.licenseTitle}>{t('profile.license.title')}</Text>
            </View>
            <Text style={styles.licenseBody}>{t('profile.license.body')}</Text>
            <Pressable
              testID="profile-institutional-btn"
              onPress={() => router.push('/institutional')}
              style={({ pressed }) => [styles.licenseBtn, pressed && { opacity: 0.9 }]}
            >
              <MaterialCommunityIcons name="office-building-outline" size={14} color={colors.brandGold} />
              <Text style={styles.licenseBtnText}>{t('profile.license.cta')}</Text>
              <MaterialCommunityIcons name="chevron-right" size={16} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>

          {/* Language switcher */}
          <View style={[shared.card, { marginTop: spacing.xl }]} testID="profile-language-card">
            <View style={styles.langHead}>
              <MaterialCommunityIcons name="translate" size={16} color={colors.brandGold} />
              <Text style={styles.langSection}>{t('profile.language.section')}</Text>
            </View>
            <View style={styles.langRow}>
              {(['en', 'es'] as Lang[]).map((code) => {
                const active = lang === code;
                return (
                  <Pressable
                    key={code}
                    testID={`profile-lang-${code}`}
                    onPress={() => setLang(code)}
                    style={[
                      styles.langBtn,
                      active && {
                        borderColor: colors.brandGold,
                        backgroundColor: '#1F1B10',
                        shadowColor: colors.brandGold,
                        shadowOpacity: 0.5,
                        shadowRadius: 8,
                        shadowOffset: { width: 0, height: 0 },
                        elevation: 4,
                      },
                    ]}
                  >
                    <Text style={[styles.flag, active && { color: colors.brandGold }]}>
                      {code === 'en' ? '🇬🇧' : '🇪🇸'}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.langLabel, active && { color: colors.brandGold }]}>
                        {code === 'en' ? t('profile.language.en') : t('profile.language.es')}
                      </Text>
                      <Text style={styles.langCode}>{code.toUpperCase()}</Text>
                    </View>
                    {active && (
                      <MaterialCommunityIcons name="check-circle" size={18} color={colors.brandGold} />
                    )}
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.langHint}>{t('profile.language.hint')}</Text>
          </View>

          <View style={[shared.card, { marginTop: spacing.xl }]}>
            <Text style={styles.infoTitle}>{t('profile.about.title')}</Text>
            <Text style={[shared.body, { marginTop: spacing.sm }]}>
              {t('profile.about.body')}
            </Text>
            <View style={styles.bulletRow}>
              <MaterialCommunityIcons name="check-circle-outline" size={16} color={colors.zoneGreen} />
              <Text style={[shared.body, { flex: 1 }]}>{t('profile.about.b1')}</Text>
            </View>
            <View style={styles.bulletRow}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.zoneYellow} />
              <Text style={[shared.body, { flex: 1 }]}>{t('profile.about.b2')}</Text>
            </View>
            <View style={styles.bulletRow}>
              <MaterialCommunityIcons name="stethoscope" size={16} color={colors.zoneRed} />
              <Text style={[shared.body, { flex: 1 }]}>{t('profile.about.b3')}</Text>
            </View>
          </View>

          <View style={{ alignItems: 'center', marginTop: spacing.xxl }}>
            <Text style={styles.brandFooter}>AFE™ Safety Check</Text>
            <Text style={styles.tagline}>
              <Text style={{ color: colors.zoneBlue }}>WE LEARN.</Text>{' '}
              <Text style={{ color: colors.zoneGreen }}>WE TRAIN.</Text>{' '}
              <Text style={{ color: colors.zoneRed }}>WE WON.</Text>
            </Text>
          </View>
        </ScrollView>
      ) : (
        <View style={styles.center}>
          <Text style={shared.body}>{t('profile.empty')}</Text>
          <Pressable
            style={[shared.primaryBtn, { marginTop: spacing.lg, paddingHorizontal: spacing.xxl }]}
            onPress={() => router.push('/profile-setup')}
          >
            <Text style={shared.primaryBtnText}>{t('profile.create')}</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statUnit}>{unit}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  eyebrow: {
    color: colors.brandGold, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginBottom: 4,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatarCard: {
    alignItems: 'center', marginTop: spacing.lg,
    padding: spacing.xl,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#141310',
    borderWidth: 2, borderColor: colors.brandGold,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.brandGold, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 6,
  },
  name: { color: colors.onSurface, fontSize: 20, fontWeight: '800', marginTop: spacing.md, letterSpacing: 0.3 },
  sportChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong,
    backgroundColor: '#141310',
  },
  sportChipText: { color: colors.brandGold, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  targetChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.pill, borderWidth: 1,
    backgroundColor: '#101410',
    shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 3,
  },
  targetChipText: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  statsGrid: {
    flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md,
  },
  statLabel: { color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1, fontWeight: '700', marginBottom: 6 },
  statValue: { color: colors.onSurface, fontSize: 22, fontWeight: '800' },
  statUnit: { color: colors.onSurfaceTertiary, fontSize: 11, fontWeight: '600' },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSecondary,
  },
  editBtnText: { color: colors.onSurface, fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  tourHint: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  infoTitle: { color: colors.onSurface, fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  bulletRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.md,
  },
  brandFooter: { color: colors.brandGold, fontSize: 18, fontWeight: '900', letterSpacing: 4 },
  tagline: { fontSize: 11, fontWeight: '700', letterSpacing: 2, marginTop: spacing.sm },
  langHead: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginBottom: spacing.md,
  },
  langSection: {
    color: colors.brandGold, fontSize: 11, letterSpacing: 2, fontWeight: '800',
  },
  langRow: { flexDirection: 'row', gap: spacing.md },
  langBtn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  flag: { fontSize: 20 },
  langLabel: { color: colors.onSurface, fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  langCode: { color: colors.onSurfaceTertiary, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  langHint: { color: colors.onSurfaceTertiary, fontSize: 11, lineHeight: 15, marginTop: spacing.md },
  licenseCard: {
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.brandGold,
    backgroundColor: '#141310',
    shadowColor: colors.brandGold, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 4,
  },
  licenseHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  licenseIcon: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 1, borderColor: colors.brandGold,
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  licenseTitle: { color: colors.brandGold, fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  licenseBody: { color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 17 },
  licenseBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  licenseBtnText: { flex: 1, color: colors.brandGold, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
});
