import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { LocalNotificationSchema } from '@capacitor/local-notifications';
import type { Dose, Medication } from '../db/schema';
import { db } from '../db/database';
import { localDateAtMinutes, localDateKey } from '../utils/localDate';
import { SchedulerService } from './scheduler';

const CHANNEL_ID = 'medication-reminders';
const REMINDER_SOURCE = 'medflow-medication-reminder';

function notificationId(doseId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < doseId.length; index++) {
    hash = Math.imul(hash ^ doseId.charCodeAt(index), 16777619);
  }
  return (hash >>> 1) || 1;
}

function scheduledTime(dose: Dose): Date {
  if (!dose.scheduledDate) throw new Error('A medication dose has no scheduled date');
  const date = dose.scheduledAt
    ? new Date(dose.scheduledAt)
    : localDateAtMinutes(dose.scheduledDate, dose.scheduledMinutes);
  if (!Number.isFinite(date.getTime())) throw new Error('A medication dose has an invalid scheduled time');
  return date;
}

export class NotificationService {
  static isAvailable(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  }

  static async initialize(): Promise<void> {
    if (!this.isAvailable()) return;
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Medication reminders',
      description: 'Reminders for scheduled medication doses',
      importance: 4,
      visibility: 0,
      vibration: true,
    });
  }

  static async upcoming(medications: Medication[], now = new Date()): Promise<LocalNotificationSchema[]> {
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const notifications: LocalNotificationSchema[] = [];
    const ids = new Map<number, string>();

    while (cursor < end) {
      const date = localDateKey(cursor);
      const saved = await db.getDoses(date);
      for (const med of medications) {
        if (med.scheduleType === 'prn') continue;
        const existing = saved.filter((dose) => dose.medId === med.id);
        const doses = [...existing];
        if (!await db.hasGeneratedDoseDay(med.id, date)) {
          const generated = await SchedulerService.calculateDayDoses(med, date);
          for (const dose of generated) {
            if (!existing.some((item) => scheduledTime(item).getTime() === scheduledTime(dose).getTime())) {
              doses.push(dose);
            }
          }
        }
        for (const dose of doses) {
          if (dose.status !== 'pending') continue;
          const at = scheduledTime(dose);
          if (at <= now || at >= end) continue;
          const id = notificationId(dose.id);
          const previous = ids.get(id);
          if (previous && previous !== dose.id) {
            throw new Error('Medication reminder IDs conflict; reminders were not updated');
          }
          ids.set(id, dose.id);
          notifications.push({
            id,
            title: `${med.name} ${med.strength}`.trim(),
            body: `Time to take ${med.doseQty} ${med.unit}`,
            channelId: CHANNEL_ID,
            schedule: { at, allowWhileIdle: true },
            isExactNotification: true,
            isExactMandatory: true,
            extra: { source: REMINDER_SOURCE, doseId: dose.id },
          });
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return notifications.sort((a, b) => a.schedule!.at!.getTime() - b.schedule!.at!.getTime());
  }

  static async synchronize(medications: Medication[], requestPermission: boolean): Promise<void> {
    if (!this.isAvailable()) return;
    const notifications = await this.upcoming(medications);
    const desired = new Map(notifications.map((notification) => [notification.id, notification]));
    const pending = (await LocalNotifications.getPending()).notifications;
    for (const item of pending) {
      const expected = desired.get(item.id);
      if (expected && (item.extra?.source !== REMINDER_SOURCE || item.extra?.doseId !== expected.extra.doseId)) {
        throw new Error('Medication reminder ID conflicts with another notification');
      }
    }
    const obsolete = pending.filter((item) =>
      item.extra?.source === REMINDER_SOURCE && !desired.has(item.id)
    );
    if (obsolete.length) await LocalNotifications.cancel({ notifications: obsolete.map(({ id }) => ({ id })) });
    if (!notifications.length) return;

    let display = await LocalNotifications.checkPermissions();
    if (display.display !== 'granted' && requestPermission) {
      display = await LocalNotifications.requestPermissions();
    }
    if (display.display !== 'granted') {
      throw new Error('Enable MedFlow notifications in Android settings to receive medication reminders');
    }
    let exact = await LocalNotifications.checkExactNotificationSetting();
    if (exact.exact_alarm !== 'granted' && requestPermission) {
      exact = await LocalNotifications.changeExactNotificationSetting();
    }
    if (exact.exact_alarm !== 'granted') {
      throw new Error('Allow alarms and reminders in Android settings to receive exact medication reminders');
    }
    const result = await LocalNotifications.schedule({ notifications });
    if (result.warning) throw new Error(result.warning.message);
    if (result.notifications.length !== notifications.length) {
      throw new Error('Android did not schedule every medication reminder');
    }
  }
}
