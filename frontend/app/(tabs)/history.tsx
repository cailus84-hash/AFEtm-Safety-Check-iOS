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
import { colors, radius, shared, spacing, zoneColor } from '@/src/lib/theme';
import { useI18n, zoneShortI18n, patternLabelI18n } from '@/src/lib/i18n';

const FILTERS = ['ALL', 'BLUE', 'GREEN', 'YELLOW', 'RED'] as const;
type Filter = (typeof FILTERS)[number];

export default function History() {
  const router = useRouter();
  const { t, formatDate, formatTime } = useI18n();
  const [items, setItems] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

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

  const toggleCompareMode = () => {
    setCompareMode((v) => !v);
    setSelected([]);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const openCompare = () => {
    if (selected.length !== 2) return;
    router.push(`/compare?ids=${selected.join(',')}`);
  };

  const filtered = filter === 'ALL' ? items : items.filter((i) => i.zone === filter);

  return (
    <SafeAreaView style={shared.screen} edges={['top']} testID="history-screen">
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{t('history.eyebrow')}</Text>
          <Text style={shared.h2}>{t('history.title')}</Text>
        </View>
        <Pressable
          testID="history-compare-toggle"
          onPress={toggleCompareMode}
          style={[
            styles.compareToggle,
            compareMode && { borderColor: colors.brandGold, backgroundColor: '#141310' },
          ]}
        >
          <MaterialCommunityIcons
            name={compareMode ? 'close' : 'compare-horizontal'}
            size={14}
            color={compareMode ? colors.brandGold : colors.onSurfaceSecondary}
          />
          <Text
            style={[
              styles.compareToggleText,
              compareMode && { color: colors.brandGold },
            ]}
          >
            {compareMode ? t('history.exit') : t('history.compare')}
          </Text>
        </Pressable>
      </View>

      <View style={styles.chipRowWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {FILTERS.map((f) => {
            const active = filter === f;
            const label = f === 'ALL' ? t('history.filter.all') : zoneShortI18n(t, f as any);
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
                  <View style={[styles.chipDot, { backgroundColor: color, shadowColor: color }]} />
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
                {t('history.empty.title')}
              </Text>
              <Text style={[shared.body, { textAlign: 'center', marginTop: spacing.sm }]}>
                {t('history.empty.body')}
              </Text>
            </View>
          ) : (
            <View style={{ gap: spacing.md }}>
              {filtered.map((a) => {
                const isPending = !a.zone;
                const color = isPending ? colors.brandGold : zoneColor(a.zone!);
                const label = isPending ? t('common.pending') : zoneShortI18n(t, a.zone!);
                const isSelected = selected.includes(a.id);
                return (
                  <Pressable
                    key={a.id}
                    testID={`history-item-${a.id}`}
                    onPress={() =>
                      compareMode ? toggleSelect(a.id) : router.push(`/assessment/${a.id}`)
                    }
                    onLongPress={() => {
                      if (!compareMode) setCompareMode(true);
                      toggleSelect(a.id);
                    }}
                    style={[
                      styles.row,
                      compareMode && isSelected && { borderColor: colors.brandGold },
                    ]}
                  >
                    <View style={[styles.leftStripe, { backgroundColor: color }]} />
                    <View style={{ flex: 1, padding: spacing.md }}>
                      <View style={styles.rowTop}>
                        <Text style={[styles.zoneName, { color }]}>{label}</Text>
                        {compareMode ? (
                          <View
                            style={[
                              styles.checkbox,
                              isSelected && { borderColor: colors.brandGold, backgroundColor: colors.brandGold },
                            ]}
                            testID={`history-check-${a.id}`}
                          >
                            {isSelected && (
                              <MaterialCommunityIcons name="check" size={14} color="#000" />
                            )}
                          </View>
                        ) : (
                          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.onSurfaceTertiary} />
                        )}
                      </View>
                      <View style={styles.metaWrap}>
                        <Meta icon="clock-outline" text={`${formatDate(a.created_at)} · ${formatTime(a.created_at)}`} />
                        {a.pattern ? (
                          <Meta icon="pulse" text={`${t('detail.chip.pattern')} ${patternLabelI18n(t, a.pattern)}`} />
                        ) : (
                          <Meta icon="cloud-sync-outline" text={t('common.unclassified')} />
                        )}
                        <Meta icon="heart" text={t('history.meta.rec', { value: a.recpct })} />
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      {compareMode && (
        <View style={styles.compareBar} pointerEvents="box-none">
          <View style={styles.compareBarInner}>
            <Text style={styles.compareBarText}>
              {selected.length === 0
                ? t('history.compare.selectTwo')
                : selected.length === 1
                ? t('history.compare.selectOne')
                : t('history.compare.ready')}
            </Text>
            <Pressable
              testID="history-compare-cta"
              disabled={selected.length !== 2}
              onPress={openCompare}
              style={[
                shared.primaryBtn,
                { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
                selected.length !== 2 && { opacity: 0.45 },
              ]}
            >
              <Text style={shared.primaryBtnText}>{t('history.compare')}</Text>
            </Pressable>
          </View>
        </View>
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
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  compareToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSecondary,
  },
  compareToggleText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  eyebrow: {
    color: colors.brandGold, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginBottom: 4,
  },
  chipRowWrap: {
    height: 56, justifyContent: 'center',
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  chipRow: { paddingHorizontal: spacing.xl, gap: spacing.sm, alignItems: 'center' },
  chip: {
    flexShrink: 0, height: 36,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border,
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
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 4,
    borderWidth: 2, borderColor: colors.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  compareBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
  compareBarInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: spacing.md,
  },
  compareBarText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: '600', flex: 1 },
  leftStripe: { width: 4 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  zoneName: { fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  metaWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: colors.onSurfaceTertiary, fontSize: 11, fontWeight: '600' },
});
