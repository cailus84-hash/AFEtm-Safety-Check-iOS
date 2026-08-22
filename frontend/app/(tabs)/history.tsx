import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Assessment,
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
  patternLabel,
} from '@/src/lib/theme';

const FILTERS = ['ALL', 'BLUE', 'GREEN', 'YELLOW', 'RED'] as const;
type Filter = (typeof FILTERS)[number];

function fmt(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
  };
}

export default function History() {
  const router = useRouter();
  const [items, setItems] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('ALL');

  const load = useCallback(async () => {
    try {
      const id = await getDeviceId();
      const list = await listAssessments(id);
      setItems(list);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = filter === 'ALL' ? items : items.filter((i) => i.zone === filter);

  return (
    <SafeAreaView style={shared.screen} edges={['top']} testID="history-screen">
      {/* Sticky header */}
      <View style={styles.header}>
        <Text style={styles.eyebrow}>REGISTRO</Text>
        <Text style={shared.h2}>Historial</Text>
      </View>

      {/* Sticky chip row */}
      <View style={styles.chipRowWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {FILTERS.map((f) => {
            const active = filter === f;
            const label =
              f === 'ALL' ? 'Todas' : zoneLabel(f as any).split(' · ')[0];
            const color = f === 'ALL' ? colors.brandGold : zoneColor(f as any);
            return (
              <Pressable
                key={f}
                testID={`history-filter-${f.toLowerCase()}`}
                onPress={() => setFilter(f)}
                style={[
                  styles.chip,
                  active && { borderColor: color, backgroundColor: '#141310' },
                ]}
              >
                {f !== 'ALL' && (
                  <View
                    style={[styles.chipDot, { backgroundColor: color, shadowColor: color }]}
                  />
                )}
                <Text style={[styles.chipText, active && { color }]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandGold} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxxl }}
          refreshControl={
            <RefreshControl
              tintColor={colors.brandGold}
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
            />
          }
        >
          {filtered.length === 0 ? (
            <View style={styles.empty} testID="history-empty">
              <MaterialCommunityIcons name="clipboard-pulse-outline" size={48} color={colors.onSurfaceTertiary} />
              <Text style={[shared.h3, { marginTop: spacing.md, textAlign: 'center' }]}>
                No hay historial disponible
              </Text>
              <Text style={[shared.body, { textAlign: 'center', marginTop: spacing.sm }]}>
                Realiza tu primer Safety Check y tus evaluaciones aparecerán aquí.
              </Text>
            </View>
          ) : (
            <View style={{ gap: spacing.md }}>
              {filtered.map((a) => {
                const { date, time } = fmt(a.created_at);
                const color = zoneColor(a.zone);
                return (
                  <Pressable
                    key={a.id}
                    testID={`history-item-${a.id}`}
                    onPress={() => router.push(`/assessment/${a.id}`)}
                    style={styles.row}
                  >
                    <View style={[styles.leftStripe, { backgroundColor: color }]} />
                    <View style={{ flex: 1, padding: spacing.md }}>
                      <View style={styles.rowTop}>
                        <Text style={[styles.zoneName, { color }]}>{zoneLabel(a.zone)}</Text>
                        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.onSurfaceTertiary} />
                      </View>
                      <View style={styles.metaWrap}>
                        <Meta icon="clock-outline" text={`${date} · ${time}`} />
                        <Meta icon="pulse" text={`Patrón ${patternLabel(a.pattern)}`} />
                        <Meta icon="heart" text={`Rec ${a.recpct}%`} />
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Meta({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.meta}>
      <MaterialCommunityIcons name={icon} size={12} color={colors.onSurfaceTertiary} />
      <Text style={styles.metaText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  eyebrow: {
    color: colors.brandGold,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 4,
  },
  chipRowWrap: {
    height: 56,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  chipRow: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    alignItems: 'center',
  },
  chip: {
    flexShrink: 0,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  chipDot: {
    width: 8, height: 8, borderRadius: 4,
    shadowOpacity: 0.9, shadowRadius: 4, shadowOffset: { width: 0, height: 0 }, elevation: 3,
  },
  chipText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', marginTop: spacing.xxxl, paddingHorizontal: spacing.xl },
  row: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  leftStripe: { width: 4 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  zoneName: { fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  metaWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: colors.onSurfaceTertiary, fontSize: 11, fontWeight: '600' },
});
