import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Profile, fetchProfile, getDeviceId } from '@/src/lib/api';
import { colors, radius, shared, spacing } from '@/src/lib/theme';

export default function ProfileTab() {
  const router = useRouter();
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
        <Text style={styles.eyebrow}>ATLETA</Text>
        <Text style={shared.h2}>Perfil</Text>
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
          </View>

          <View style={styles.statsGrid}>
            <Stat label="EDAD" value={`${profile.age}`} unit="años" />
            <Stat label="PESO" value={`${profile.weight}`} unit="kg" />
            <Stat label="FCP OBJETIVO" value={`${fcp}`} unit="bpm" />
          </View>

          <Pressable
            testID="profile-edit-btn"
            style={styles.editBtn}
            onPress={() => router.push('/profile-setup')}
          >
            <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.onSurface} />
            <Text style={styles.editBtnText}>Editar perfil</Text>
          </Pressable>

          <View style={[shared.card, { marginTop: spacing.xl }]}>
            <Text style={styles.infoTitle}>Acerca de AFE™ Safety Check</Text>
            <Text style={[shared.body, { marginTop: spacing.sm }]}>
              AFEtm (Alarma de Afectación Fisiológica Temprana) es un
              protocolo preventivo de apoyo a decisiones que evalúa la
              recuperación cardiaca durante un esfuerzo controlado.
            </Text>
            <View style={styles.bulletRow}>
              <MaterialCommunityIcons name="check-circle-outline" size={16} color={colors.zoneGreen} />
              <Text style={[shared.body, { flex: 1 }]}>Apoya decisiones preventivas.</Text>
            </View>
            <View style={styles.bulletRow}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.zoneYellow} />
              <Text style={[shared.body, { flex: 1 }]}>No es una aplicación de diagnóstico médico.</Text>
            </View>
            <View style={styles.bulletRow}>
              <MaterialCommunityIcons name="stethoscope" size={16} color={colors.zoneRed} />
              <Text style={[shared.body, { flex: 1 }]}>
                No sustituye la evaluación profesional.
              </Text>
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
          <Text style={shared.body}>Sin perfil</Text>
          <Pressable
            style={[shared.primaryBtn, { marginTop: spacing.lg, paddingHorizontal: spacing.xxl }]}
            onPress={() => router.push('/profile-setup')}
          >
            <Text style={shared.primaryBtnText}>Crear perfil</Text>
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
  infoTitle: { color: colors.onSurface, fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  bulletRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.md,
  },
  brandFooter: { color: colors.brandGold, fontSize: 18, fontWeight: '900', letterSpacing: 4 },
  tagline: { fontSize: 11, fontWeight: '700', letterSpacing: 2, marginTop: spacing.sm },
});
