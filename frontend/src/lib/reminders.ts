import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const STORAGE_KEY = 'afetm.reminders';

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // 1=Sun ... 7=Sat (Notifications spec)

export type Reminder = {
  id: string;                // local uuid we store
  label: string;
  hour: number;              // 0-23
  minute: number;            // 0-59
  weekdays: Weekday[];
  notificationIds: string[]; // one scheduled id per weekday
  createdAt: string;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function uid() {
  return 'r-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('afetm-reminders', {
    name: 'Recordatorios AFE',
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: '#D4AF37',
  });
}

export async function ensurePermission(): Promise<boolean> {
  await ensureAndroidChannel();
  const settings = await Notifications.getPermissionsAsync();
  const granted =
    settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED;
  if (granted) return true;
  if (!settings.canAskAgain) return false;
  const req = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return (
    req.granted ||
    req.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    req.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED
  );
}

export async function loadReminders(): Promise<Reminder[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Reminder[];
  } catch {
    return [];
  }
}

async function saveReminders(list: Reminder[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

async function scheduleForWeekdays(
  label: string,
  hour: number,
  minute: number,
  weekdays: Weekday[]
): Promise<string[]> {
  const ids: string[] = [];
  for (const wd of weekdays) {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'AFE™ Safety Check',
        body: label || 'Es momento de tu chequeo preventivo antes de entrenar.',
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: wd,
        hour,
        minute,
      } as any,
    });
    ids.push(id);
  }
  return ids;
}

export async function createReminder(input: {
  label: string;
  hour: number;
  minute: number;
  weekdays: Weekday[];
}): Promise<Reminder> {
  const ok = await ensurePermission();
  if (!ok) throw new Error('Permiso de notificaciones no concedido.');
  const notificationIds = await scheduleForWeekdays(
    input.label,
    input.hour,
    input.minute,
    input.weekdays
  );
  const reminder: Reminder = {
    id: uid(),
    label: input.label,
    hour: input.hour,
    minute: input.minute,
    weekdays: input.weekdays,
    notificationIds,
    createdAt: new Date().toISOString(),
  };
  const list = await loadReminders();
  list.unshift(reminder);
  await saveReminders(list);
  return reminder;
}

export async function deleteReminder(id: string) {
  const list = await loadReminders();
  const target = list.find((r) => r.id === id);
  if (!target) return;
  for (const nid of target.notificationIds) {
    try {
      await Notifications.cancelScheduledNotificationAsync(nid);
    } catch {}
  }
  await saveReminders(list.filter((r) => r.id !== id));
}

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: 'D',
  2: 'L',
  3: 'M',
  4: 'M',
  5: 'J',
  6: 'V',
  7: 'S',
};

export const WEEKDAY_LONG: Record<Weekday, string> = {
  1: 'Domingo',
  2: 'Lunes',
  3: 'Martes',
  4: 'Miércoles',
  5: 'Jueves',
  6: 'Viernes',
  7: 'Sábado',
};

export function formatTime(h: number, m: number) {
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${hh}:${mm}`;
}
