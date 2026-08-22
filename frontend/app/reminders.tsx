import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  Reminder,
  Weekday,
  WEEKDAY_LABELS,
  WEEKDAY_LONG,
  createReminder,
  deleteReminder,
  ensurePermission,
  formatTime,
  loadReminders,
} from '@/src/lib/reminders';
import { colors, radius, shared, spacing } from '@/src/lib/theme';

export default function Reminders() {
  const router = useRouter();
  const [items, setItems] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [permBlocked, setPermBlocked] = useState(false);

  // Create form state
  const [label, setLabel] = useState('Chequeo antes de entrenar');
  const [date, setDate] = useState(() => new Date(new Date().setHours(7, 30, 0, 0)));
  const [showPicker, setShowPicker] = useState(Platform.OS === 'ios');
  const [selectedDays, setSelectedDays] = useState<Weekday[]>([2, 4, 6]); // L,M,V
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await loadReminders();
      setItems(list);
      const ok = await ensurePermission();
      setPermBlocked(!ok);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleDay = (d: Weekday) => {
    setSelectedDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort() as Weekday[]
    );
  };

  const create = async () => {
    setError(null);
    if (selectedDays.length === 0) {
      setError('Selecciona al menos un día.');
      return;
    }
    setSaving(true);
    try {
      await createReminder({
        label: label.trim() || 'Chequeo AFE',
        hour: date.getHours(),
        minute: date.getMinutes(),
        weekdays: selectedDays,
      });
      await load();
    } catch (e: any) {
      setError(e?.message || 'No se pudo crear el recordatorio.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    await deleteReminder(id);
    await load();
  };

  return (
    <SafeAreaView style={shared.screen} edges={['top', 'bottom']} testID="reminders-screen">
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="reminders-back-btn">
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.topTitle}>Recordatorios</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl * 2 }}>
        <Text style={styles.eyebrow}>HÁBITO PREVENTIVO</Text>
        <Text style={shared.h2}>Programa tus chequeos</Text>
        <Text style={[shared.body, { marginTop: spacing.sm }]}>
          Recibe una notificación local antes de tus sesiones exigentes. Ideal
          justo antes de tu ventana habitual de entrenamiento.
        </Text>

        {permBlocked && (
          <View style={styles.warn} testID="reminders-perm-warn">
            <MaterialCommunityIcons name="bell-off-outline" size={16} color={colors.zoneYellow} />
            <Text style={styles.warnText}>
              Notificaciones no permitidas. Habilítalas en Ajustes del sistema
              para poder recibir los recordatorios.
            </Text>
          </View>
        )}

        {/* Existing list */}
        <Text style={[styles.section, { marginTop: spacing.xl }]}>ACTIVOS</Text>
        {loading ? (
          <ActivityIndicator color={colors.brandGold} />
        ) : items.length === 0 ? (
          <Text style={[shared.muted, { marginTop: spacing.sm }]}>
            No hay recordatorios activos.
          </Text>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {items.map((r) => (
              <View key={r.id} style={styles.row} testID={`reminder-item-${r.id}`}>
                <View style={styles.timeBox}>
                  <Text style={styles.time}>{formatTime(r.hour, r.minute)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label} numberOfLines={1}>{r.label}</Text>
                  <View style={styles.daysRow}>
                    {r.weekdays.map((d) => (
                      <View key={d} style={styles.dayChip}>
                        <Text style={styles.dayChipText}>{WEEKDAY_LABELS[d]}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                <Pressable
                  onPress={() => remove(r.id)}
                  style={styles.iconBtn}
                  testID={`reminder-delete-${r.id}`}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.onSurfaceTertiary} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* Create form */}
        <Text style={[styles.section, { marginTop: spacing.xxl }]}>NUEVO</Text>
        <View style={[shared.card, { gap: spacing.md }]}>
          <View>
            <Text style={shared.label}>Etiqueta</Text>
            <TextInput
              testID="reminder-label-input"
              value={label}
              onChangeText={setLabel}
              placeholder="Chequeo antes de entrenar"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={shared.input}
            />
          </View>

          <View>
            <Text style={shared.label}>Hora</Text>
            {Platform.OS === 'android' ? (
              <>
                <Pressable
                  onPress={() => setShowPicker(true)}
                  style={styles.timePickBtn}
                  testID="reminder-time-btn"
                >
                  <MaterialCommunityIcons name="clock-outline" size={18} color={colors.brandGold} />
                  <Text style={styles.timePickText}>
                    {formatTime(date.getHours(), date.getMinutes())}
                  </Text>
                </Pressable>
                {showPicker && (
                  <DateTimePicker
                    testID="reminder-time-picker"
                    value={date}
                    mode="time"
                    is24Hour
                    onChange={(_e, d) => {
                      setShowPicker(false);
                      if (d) setDate(d);
                    }}
                  />
                )}
              </>
            ) : (
              <DateTimePicker
                testID="reminder-time-picker"
                value={date}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                is24Hour
                textColor={colors.onSurface}
                onChange={(_e, d) => { if (d) setDate(d); }}
                style={{ alignSelf: 'flex-start' }}
              />
            )}
          </View>

          <View>
            <Text style={shared.label}>Días</Text>
            <View style={styles.weekRow}>
              {([2, 3, 4, 5, 6, 7, 1] as Weekday[]).map((d) => {
                const active = selectedDays.includes(d);
                return (
                  <Pressable
                    key={d}
                    testID={`reminder-day-${d}`}
                    onPress={() => toggleDay(d)}
                    style={[
                      styles.weekChip,
                      active && { borderColor: colors.brandGold, backgroundColor: '#1F1B10' },
                    ]}
                  >
                    <Text style={[styles.weekChipText, active && { color: colors.brandGold }]}>
                      {WEEKDAY_LABELS[d]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[shared.muted, { marginTop: 6 }]} numberOfLines={1}>
              {selectedDays.length === 0 ? 'Selecciona días' : selectedDays.map((d) => WEEKDAY_LONG[d]).join(', ')}
            </Text>
          </View>

          {error ? <Text style={styles.err} testID="reminder-error">{error}</Text> : null}

          <Pressable
            testID="reminder-create-btn"
            disabled={saving}
            onPress={create}
            style={({ pressed }) => [shared.primaryBtn, (pressed || saving) && { opacity: 0.85 }]}
          >
            {saving ? <ActivityIndicator color="#000" /> : (
              <Text style={shared.primaryBtnText}>Crear recordatorio</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: colors.onSurface, fontSize: 14, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
  eyebrow: { color: colors.brandGold, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginBottom: 4 },
  section: { color: colors.brandGold, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginBottom: spacing.md },
  warn: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    padding: spacing.md, marginTop: spacing.lg,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.zoneYellow,
    backgroundColor: '#1F1A0A',
  },
  warnText: { color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 16, flex: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  timeBox: {
    padding: spacing.sm + 2,
    borderRadius: radius.sm,
    backgroundColor: '#141310',
    borderWidth: 1, borderColor: colors.brandGold,
  },
  time: { color: colors.brandGold, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  label: { color: colors.onSurface, fontSize: 14, fontWeight: '700' },
  daysRow: { flexDirection: 'row', gap: 4, marginTop: 6 },
  dayChip: {
    width: 20, height: 20, borderRadius: 4,
    backgroundColor: colors.surfaceTertiary,
    alignItems: 'center', justifyContent: 'center',
  },
  dayChipText: { color: colors.onSurfaceSecondary, fontSize: 10, fontWeight: '700' },
  timePickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    alignSelf: 'flex-start',
  },
  timePickText: { color: colors.onSurface, fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  weekRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  weekChip: {
    flex: 1, minWidth: 36, height: 36,
    borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
    alignItems: 'center', justifyContent: 'center',
  },
  weekChipText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: '700' },
  err: { color: colors.zoneRed, fontSize: 13, fontWeight: '600' },
});
