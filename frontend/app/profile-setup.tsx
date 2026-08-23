import { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, radius, shared, spacing } from '@/src/lib/theme';
import { fetchProfile, getDeviceId, saveProfile } from '@/src/lib/api';
import { useI18n } from '@/src/lib/i18n';

const SPORT_KEYS = ['running', 'cycling', 'football', 'crossfit', 'swimming', 'other'] as const;
// Canonical (English) values stored in the backend.
const SPORT_CANONICAL: Record<(typeof SPORT_KEYS)[number], string> = {
  running: 'Running',
  cycling: 'Cycling',
  football: 'Football',
  crossfit: 'CrossFit',
  swimming: 'Swimming',
  other: 'Other',
};

export default function ProfileSetup() {
  const router = useRouter();
  const { t } = useI18n();
  const [deviceId, setDeviceId] = useState('');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [sport, setSport] = useState<string>(SPORT_CANONICAL.running);
  const [targetZone, setTargetZone] = useState<'NONE' | 'GREEN' | 'BLUE'>('NONE');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    (async () => {
      const id = await getDeviceId();
      setDeviceId(id);
      const p = await fetchProfile(id).catch(() => null);
      if (p) {
        setName(p.name);
        setAge(String(p.age));
        setWeight(String(p.weight));
        setSport(p.sport);
        setTargetZone(p.target_zone === 'BLUE' ? 'BLUE' : p.target_zone === 'GREEN' ? 'GREEN' : 'NONE');
      }
      setInitializing(false);
    })();
  }, []);

  const sportLabelFor = useMemo(
    () => (canonical: string) => {
      const key = (SPORT_KEYS.find((k) => SPORT_CANONICAL[k] === canonical) || 'other') as
        | 'running' | 'cycling' | 'football' | 'crossfit' | 'swimming' | 'other';
      return t(`sport.${key}` as any);
    },
    [t]
  );

  const submit = async () => {
    setError(null);
    const ageN = parseInt(age, 10);
    const weightN = parseFloat(weight);
    if (!name.trim()) return setError(t('setup.error.name'));
    if (!ageN || ageN < 10 || ageN > 90) return setError(t('setup.error.age'));
    if (!weightN || weightN < 20 || weightN > 250) return setError(t('setup.error.weight'));

    setSaving(true);
    try {
      await saveProfile({
        device_id: deviceId,
        name: name.trim(),
        age: ageN,
        weight: weightN,
        sport,
        target_zone: targetZone === 'NONE' ? null : targetZone,
      });
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e?.message || t('setup.error.save'));
    } finally {
      setSaving(false);
    }
  };

  if (initializing) {
    return (
      <View style={[shared.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.brandGold} />
      </View>
    );
  }

  return (
    <SafeAreaView style={shared.screen} edges={['top', 'bottom']} testID="profile-setup-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>{t('setup.eyebrow')}</Text>
          <Text style={shared.h1}>{t('setup.title')}</Text>
          <Text style={[shared.body, { marginTop: spacing.sm }]}>{t('setup.subtitle')}</Text>

          <View style={{ marginTop: spacing.xl, gap: spacing.lg }}>
            <View>
              <Text style={shared.label}>{t('setup.field.name')}</Text>
              <TextInput
                testID="profile-name-input"
                style={shared.input}
                value={name}
                onChangeText={setName}
                placeholder={t('setup.field.name.ph')}
                placeholderTextColor={colors.onSurfaceTertiary}
                autoCapitalize="words"
              />
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text style={shared.label}>{t('setup.field.age')}</Text>
                <TextInput
                  testID="profile-age-input"
                  style={shared.input}
                  value={age}
                  onChangeText={(txt) => setAge(txt.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="30"
                  placeholderTextColor={colors.onSurfaceTertiary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={shared.label}>{t('setup.field.weight')}</Text>
                <TextInput
                  testID="profile-weight-input"
                  style={shared.input}
                  value={weight}
                  onChangeText={(txt) => setWeight(txt.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                  placeholder="70"
                  placeholderTextColor={colors.onSurfaceTertiary}
                />
              </View>
            </View>

            <View>
              <Text style={shared.label}>{t('setup.field.sport')}</Text>
              <View style={styles.chipsWrap}>
                {SPORT_KEYS.map((k) => {
                  const value = SPORT_CANONICAL[k];
                  const active = sport === value;
                  return (
                    <Pressable
                      key={k}
                      testID={`profile-sport-${k}`}
                      onPress={() => setSport(value)}
                      style={[
                        styles.chip,
                        active && { borderColor: colors.brandGold, backgroundColor: '#1F1B10' },
                      ]}
                    >
                      <Text style={[styles.chipText, active && { color: colors.brandGold }]}>
                        {sportLabelFor(value)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={shared.label}>{t('setup.field.target')}</Text>
              <Text style={[shared.muted, { marginBottom: spacing.sm }]}>
                {t('setup.field.target.hint')}
              </Text>
              <View style={styles.chipsWrap}>
                {([
                  { key: 'NONE', label: t('setup.target.none'), color: colors.onSurfaceTertiary },
                  { key: 'GREEN', label: t('setup.target.green'), color: colors.zoneGreen },
                  { key: 'BLUE', label: t('setup.target.blue'), color: colors.zoneBlue },
                ] as const).map((opt) => {
                  const active = targetZone === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      testID={`profile-target-${opt.key.toLowerCase()}`}
                      onPress={() => setTargetZone(opt.key)}
                      style={[
                        styles.chip,
                        active && {
                          borderColor: opt.color,
                          backgroundColor: '#141310',
                          shadowColor: opt.color,
                          shadowOpacity: 0.6,
                          shadowRadius: 8,
                          shadowOffset: { width: 0, height: 0 },
                          elevation: 3,
                        },
                      ]}
                    >
                      {opt.key !== 'NONE' && (
                        <View
                          style={{
                            width: 8, height: 8, borderRadius: 4,
                            backgroundColor: opt.color, marginRight: 6,
                          }}
                        />
                      )}
                      <Text style={[styles.chipText, active && { color: opt.color }]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {error ? (
              <Text style={styles.error} testID="profile-error">
                {error}
              </Text>
            ) : null}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            testID="profile-save-btn"
            disabled={saving}
            style={({ pressed }) => [shared.primaryBtn, (pressed || saving) && { opacity: 0.85 }]}
            onPress={submit}
          >
            {saving ? <ActivityIndicator color="#000" /> : (
              <Text style={shared.primaryBtnText}>{t('setup.save')}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  eyebrow: {
    color: colors.brandGold, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginBottom: spacing.sm,
  },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
  },
  chipText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: '600' },
  error: { color: colors.zoneRed, fontSize: 13, fontWeight: '600' },
  footer: {
    padding: spacing.xl, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
});
