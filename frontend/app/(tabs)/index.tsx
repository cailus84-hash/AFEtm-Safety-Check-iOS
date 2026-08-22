import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Assessment,
  Profile,
  fetchProfile,
  getDeviceId,
  listAssessments,
} from '@/src/lib/api';
import {
  colors,
  radius,
  shared,
  spacing,
  zoneColor,
  zoneLabel,
  zoneDescription,
  patternLabel,
} from '@/src/lib/theme';

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }) + ' · ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export default function Home() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [last, setLast] = useState<Assessment | null>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const id = await getDeviceId();
      const [p, list] = await Promise.all([
        fetchProfile(id),
        listAssessments(id),
      ]);
      if (!p) {
        router.replace('/profile-setup');
        return;
      }
      setProfile(p);
      setCount(list.length);
      setLast(list[0] ?? null);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const fcpTarget = profile ? Math.round(0.8 * (220 - profile.age)) : 0;

  return (
    <SafeAreaView style={shared.screen} edges={['top']} testID="home-screen">
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }}
        refreshControl={
          <RefreshControl
            tintColor={colors.brandGold}
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>AFE™ SAFETY CHECK</Text>
            <Text style={shared.h2}>Hola{profile ? `, ${profile.name.split(' ')[0]}` : ''}</Text>
          </View>
          <View style={styles.badge}>
            <MaterialCommunityIcons name="shield-check" size={16} color={colors.brandGold} />
            <Text style={styles.badgeText}>PREVENTIVO</Text>
          </View>
        </View>

        {loading ? (
          <View style={{ marginTop: spacing.xxl, alignItems: 'center' }}>
            <ActivityIndicator color={colors.brandGold} />
          </View>
        ) : (
          <>
            {/* Last check hero */}
            {last ? (
              <Pressable
                testID="home-last-card"
                onPress={() => router.push(`/assessment/${last.id}`)}
                style={[
                  styles.heroCard,
                  {
                    borderColor: zoneColor(last.zone),
                    shadowColor: zoneColor(last.zone),
                  },
                ]}
              >
                <Text style={styles.heroLabel}>Última evaluación</Text>
                <Text style={[styles.zoneName, { color: zoneColor(last.zone) }]}>
                  {zoneLabel(last.zone)}
                </Text>
                <Text style={styles.heroDesc}>{zoneDescription(last.zone)}</Text>

                <View style={styles.heroMetaRow}>
                  <MetaChip icon="clock-outline" label={formatDate(last.created_at)} />
                  <MetaChip icon="pulse" label={`Patrón ${patternLabel(last.pattern)}`} />
                </View>
              </Pressable>
            ) : (
              <View style={[styles.heroCard, { borderColor: colors.border }]} testID="home-empty-card">
                <MaterialCommunityIcons
                  name="heart-pulse"
                  size={40}
                  color={colors.brandGold}
                  style={{ alignSelf: 'center', marginBottom: spacing.md }}
                />
                <Text style={[shared.h3, { textAlign: 'center' }]}>
                  Sin evaluaciones previas
                </Text>
                <Text style={[shared.body, { textAlign: 'center', marginTop: spacing.sm }]}>
                  Realiza tu primer Safety Check para conocer tu estado actual
                  de recuperación cardiovascular.
                </Text>
              </View>
            )}

            {/* Quick stats */}
            <View style={styles.statsRow}>
              <StatCard label="FCP OBJETIVO" value={`${fcpTarget}`} unit="bpm" />
              <StatCard label="EVALUACIONES" value={`${count}`} unit="" />
              <StatCard label="EDAD" value={`${profile?.age ?? '—'}`} unit="años" />
            </View>

            {/* Info block */}
            <View style={[shared.card, { marginTop: spacing.xl }]}>
              <Text style={styles.infoTitle}>¿Cómo funciona?</Text>
              <InfoRow n="1" text="Registra tu Frecuencia Cardiaca en reposo (FCr)." />
              <InfoRow n="2" text="Alcanza la FCP objetivo con un esfuerzo controlado." />
              <InfoRow n="3" text="Registra tu FC durante 3 minutos de recuperación." />
              <InfoRow n="4" text="Recibe tu zona AFE y acción preventiva sugerida." />
            </View>

            {/* Disclaimer */}
            <View style={styles.disclaimer}>
              <MaterialCommunityIcons
                name="information-outline"
                size={16}
                color={colors.onSurfaceTertiary}
              />
              <Text style={styles.disclaimerText}>
                Herramienta preventiva. No es una aplicación de diagnóstico
                médico ni sustituye a un profesional de la salud.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.fabWrap} pointerEvents="box-none">
        <Pressable
          testID="home-cta-new"
          style={({ pressed }) => [shared.primaryBtn, styles.fab, pressed && { opacity: 0.9 }]}
          onPress={() => router.push('/(tabs)/new')}
        >
          <MaterialCommunityIcons name="heart-pulse" size={18} color="#000" />
          <Text style={[shared.primaryBtnText, { marginLeft: spacing.sm }]}>
            Nuevo Safety Check
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function MetaChip({ icon, label }: { icon: any; label: string }) {
  return (
    <View style={styles.metaChip}>
      <MaterialCommunityIcons name={icon} size={13} color={colors.onSurfaceTertiary} />
      <Text style={styles.metaText}>{label}</Text>
    </View>
  );
}

function StatCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text style={styles.statValue}>{value}</Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

function InfoRow({ n, text }: { n: string; text: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoBadge}>
        <Text style={styles.infoBadgeText}>{n}</Text>
      </View>
      <Text style={[shared.body, { flex: 1 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  eyebrow: {
    color: colors.brandGold,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: '#141310',
  },
  badgeText: { color: colors.brandGold, fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  heroCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 2,
    padding: spacing.xl,
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  heroLabel: {
    color: colors.onSurfaceTertiary,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  zoneName: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  heroDesc: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19 },
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  metaText: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  stat: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  statLabel: {
    color: colors.onSurfaceTertiary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  statValue: { color: colors.onSurface, fontSize: 22, fontWeight: '800' },
  statUnit: { color: colors.onSurfaceTertiary, fontSize: 11, fontWeight: '600' },
  infoTitle: {
    color: colors.onSurface,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: spacing.md,
    letterSpacing: 0.3,
  },
  infoRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  infoBadge: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: '#1F1B10',
    borderWidth: 1,
    borderColor: colors.brandGold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBadgeText: { color: colors.brandGold, fontSize: 12, fontWeight: '800' },
  disclaimer: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  disclaimerText: {
    color: colors.onSurfaceTertiary,
    fontSize: 11,
    lineHeight: 15,
    flex: 1,
  },
  fabWrap: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    bottom: spacing.lg,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
