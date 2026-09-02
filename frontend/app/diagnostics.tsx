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
import { colors, radius, shared, spacing } from '@/src/lib/theme';
import {
  DiagnosticEntry,
  fetchDiagnostics,
  getDeviceId,
} from '@/src/lib/api';

/**
 * TEMPORARY developer diagnostic screen.
 *
 * Shows the exact values Emergent received from this device for the most
 * recent assessment attempts, plus the Replit bridge trace. Contains NO
 * secrets — the Bearer token is never stored nor displayed anywhere.
 *
 * Remove this screen (and the /api/diagnostics endpoints) once the field
 * investigation is complete.
 */
export default function Diagnostics() {
  const router = useRouter();
  const [entries, setEntries] = useState<DiagnosticEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '(not set)';

  const load = useCallback(async () => {
    try {
      setErr(null);
      const id = await getDeviceId();
      const list = await fetchDiagnostics(id, 5);
      setEntries(list);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load diagnostics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={shared.screen} edges={['top', 'bottom']} testID="diagnostics-screen">
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="diag-back">
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.topTitle}>DIAGNOSTICS · TEMP</Text>
        <Pressable onPress={() => { setRefreshing(true); load(); }} style={styles.iconBtn} testID="diag-refresh">
          <MaterialCommunityIcons name="refresh" size={20} color={colors.brandGold} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandGold} />
        }
      >
        <View style={styles.metaCard}>
          <Row k="Backend URL" v={backendUrl} />
          <Row k="Screen time" v={new Date().toISOString()} />
        </View>

        {loading ? (
          <ActivityIndicator color={colors.brandGold} style={{ marginTop: spacing.xl }} />
        ) : err ? (
          <Text style={[shared.body, { color: colors.zoneRed, marginTop: spacing.lg }]}>{err}</Text>
        ) : !entries?.length ? (
          <Text style={[shared.body, { marginTop: spacing.lg }]}>
            No assessment attempts recorded yet for this device. Run one assessment and pull to refresh.
          </Text>
        ) : (
          entries.map((d) => (
            <View key={d.id} style={styles.card} testID={`diag-entry-${d.id}`}>
              <Text style={styles.cardTitle}>{d.timestamp}</Text>

              <Section title="VALUES RECEIVED BY EMERGENT" />
              <Row k="payload received" v={yn(d.payload_received)} good={d.payload_received} />
              <Row k="age" v={s(d.age)} />
              <Row k="restingHr" v={s(d.restingHr)} />
              <Row k="maxHr (t=0)" v={s(d.maxHr)} />
              <Row k="hr60s" v={s(d.hr60s)} />
              <Row k="hr90s" v={s(d.hr90s)} />
              <Row k="hr120s" v={s(d.hr120s)} />
              <Row k="hr150s" v={s(d.hr150s)} />
              <Row k="hr3m (t=180)" v={s(d.hr3m)} />
              <Row k="athleteId" v={s(d.athleteId)} />
              <Row k="athleteName" v={s(d.athleteName)} />
              <Row k="factors" v={(d.factors || []).join(', ') || '—'} />
              <Row k="safetyConfirmed" v={s(d.safetyConfirmed)} />
              <Row k="safetyConfirmedAt" v={s(d.safetyConfirmedAt)} />
              <Row k="BLE device name" v={s(d.bleDeviceName)} />

              <Section title="REPLIT BRIDGE TRACE" />
              <Row k="upstream" v={d.upstream_url} />
              <Row k="context interview sent" v={yn(d.context_interview_sent)} good={d.context_interview_sent} />
              <Row k="context interview status" v={s(d.context_interview_status)} />
              <Row k="assessment sent" v={yn(d.assessment_sent)} good={d.assessment_sent} />
              <Row k="assessment status" v={s(d.assessment_status)} />
              <Row
                k="authoritative result"
                v={yn(d.authoritative_result_received)}
                good={d.authoritative_result_received}
              />
              {d.zone ? <Row k="zone" v={d.zone} good /> : null}
              {d.replit_http_response ? (
                <View style={styles.jsonBox}>
                  <Text style={styles.jsonText}>
                    {JSON.stringify(d.replit_http_response, null, 2)}
                  </Text>
                </View>
              ) : null}
              {d.error ? (
                <View style={[styles.jsonBox, { borderColor: colors.zoneRed }]}>
                  <Text style={[styles.jsonText, { color: colors.zoneRed }]}>
                    {JSON.stringify(d.error, null, 2)}
                  </Text>
                </View>
              ) : null}
            </View>
          ))
        )}

        <Text style={styles.footer}>
          Temporary developer tool. No Bearer token or secret is stored or shown.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function s(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}
function yn(v: boolean | null | undefined): string {
  return v ? 'YES' : 'NO';
}

function Section({ title }: { title: string }) {
  return <Text style={styles.section}>{title}</Text>;
}

function Row({ k, v, good }: { k: string; v: string; good?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowKey}>{k}</Text>
      <Text
        style={[
          styles.rowVal,
          good === true && { color: colors.zoneGreen },
          v === 'NO' && good === false && { color: colors.zoneRed },
        ]}
        numberOfLines={2}
      >
        {v}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: colors.brandGold, fontSize: 12, letterSpacing: 2.5, fontWeight: '800' },
  metaCard: {
    padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.brandGold,
    backgroundColor: '#141310',
  },
  card: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  cardTitle: { color: colors.brandGold, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  section: {
    color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1.5, fontWeight: '800',
    marginTop: spacing.md, marginBottom: 4,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md,
    paddingVertical: 3,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider,
  },
  rowKey: { color: colors.onSurfaceSecondary, fontSize: 12 },
  rowVal: { color: colors.onSurface, fontSize: 12, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  jsonBox: {
    marginTop: spacing.sm, padding: spacing.sm,
    borderRadius: radius.sm ?? 6, borderWidth: 1, borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  jsonText: { color: colors.onSurfaceSecondary, fontSize: 10, fontFamily: 'monospace' as any },
  footer: {
    color: colors.onSurfaceTertiary, fontSize: 10, textAlign: 'center',
    marginTop: spacing.xl,
  },
});
