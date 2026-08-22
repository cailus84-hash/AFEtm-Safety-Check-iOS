import { useEffect, useState } from 'react';
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

const SPORTS = ['Running', 'Ciclismo', 'Fútbol', 'CrossFit', 'Natación', 'Otro'];

export default function ProfileSetup() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState('');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [sport, setSport] = useState<string>('Running');
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

  const submit = async () => {
    setError(null);
    const ageN = parseInt(age, 10);
    const weightN = parseFloat(weight);
    if (!name.trim()) return setError('Ingresa tu nombre.');
    if (!ageN || ageN < 10 || ageN > 90) return setError('Edad debe ser entre 10 y 90.');
    if (!weightN || weightN < 20 || weightN > 250) return setError('Peso debe ser entre 20 y 250 kg.');

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
      setError(e?.message || 'No se pudo guardar el perfil.');
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.eyebrow}>PASO 1 DE 1</Text>
          <Text style={shared.h1}>Perfil del atleta</Text>
          <Text style={[shared.body, { marginTop: spacing.sm }]}>
            Ingresa tus datos base. Los usaremos para calcular tu Frecuencia
            Cardiaca Pico objetivo.
          </Text>

          <View style={{ marginTop: spacing.xl, gap: spacing.lg }}>
            <View>
              <Text style={shared.label}>Nombre</Text>
              <TextInput
                testID="profile-name-input"
                style={shared.input}
                value={name}
                onChangeText={setName}
                placeholder="Tu nombre"
                placeholderTextColor={colors.onSurfaceTertiary}
                autoCapitalize="words"
              />
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text style={shared.label}>Edad</Text>
                <TextInput
                  testID="profile-age-input"
                  style={shared.input}
                  value={age}
                  onChangeText={(t) => setAge(t.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="30"
                  placeholderTextColor={colors.onSurfaceTertiary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={shared.label}>Peso (kg)</Text>
                <TextInput
                  testID="profile-weight-input"
                  style={shared.input}
                  value={weight}
                  onChangeText={(t) => setWeight(t.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                  placeholder="70"
                  placeholderTextColor={colors.onSurfaceTertiary}
                />
              </View>
            </View>

            <View>
              <Text style={shared.label}>Deporte</Text>
              <View style={styles.chipsWrap}>
                {SPORTS.map((s) => {
                  const active = sport === s;
                  return (
                    <Pressable
                      key={s}
                      testID={`profile-sport-${s.toLowerCase()}`}
                      onPress={() => setSport(s)}
                      style={[
                        styles.chip,
                        active && { borderColor: colors.brandGold, backgroundColor: '#1F1B10' },
                      ]}
                    >
                      <Text style={[styles.chipText, active && { color: colors.brandGold }]}>
                        {s}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={shared.label}>Zona objetivo (opcional)</Text>
              <Text style={[shared.muted, { marginBottom: spacing.sm }]}>
                Al alcanzar o superar esta zona en un chequeo, lo celebraremos contigo.
              </Text>
              <View style={styles.chipsWrap}>
                {([
                  { key: 'NONE', label: 'Ninguna', color: colors.onSurfaceTertiary },
                  { key: 'GREEN', label: 'Verde · Favorable', color: colors.zoneGreen },
                  { key: 'BLUE', label: 'Azul · Óptimo', color: colors.zoneBlue },
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
            style={({ pressed }) => [
              shared.primaryBtn,
              (pressed || saving) && { opacity: 0.85 },
            ]}
            onPress={submit}
          >
            {saving ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={shared.primaryBtnText}>Guardar perfil</Text>
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
    color: colors.brandGold,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
  },
  chipText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: '600' },
  error: {
    color: colors.zoneRed,
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    padding: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
});
