/**
 * Notifications service: Local Android exact alarms and lock-screen alerts
 * Uses @capacitor/local-notifications for SCHEDULE_EXACT_ALARM permission
 */

import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

export class NotificationService {
  private static isNativePlatform = !Capacitor.isNativePlatform || Capacitor.getPlatform() !== 'web';

  /**
   * Request notification permissions (Android 13+)
   */
  static async requestPermissions(): Promise<boolean> {
    if (!this.isNativePlatform) {
      // Browser mode: notifications not available
      console.log('ℹ️ Notifications not available in browser mode');
      return false;
    }

    try {
      const result = await LocalNotifications.requestPermissions();
      return result.granted;
    } catch (err) {
      console.warn('Notification permission request failed', err);
      return false;
    }
  }

  /**
   * Schedule exact alarm for medication reminder
   * Shows on lock screen with TAKE_NOW and SNOOZE_15 action buttons
   */
  static async scheduleExactAlarm(options: {
    id: number;
    medName: string;
    strength: string;
    doseQty: string;
    scheduleTime: string; // "08:00 AM"
    scheduledMinutes: number; // minutes since midnight
  }): Promise<void> {
    try {
      const now = new Date();
      const scheduledDate = new Date();
      const [h, m] = options.scheduleTime.split(':').map(Number);
      scheduledDate.setHours(h, m, 0, 0);

      // If scheduled time is in the past, skip (already missed)
      if (scheduledDate <= now) return;

      await LocalNotifications.schedule({
        notifications: [
          {
            id: options.id,
            title: `💊 ${options.medName} ${options.strength}`,
            body: `Take ${options.doseQty} • Scheduled ${options.scheduleTime}`,
            schedule: { at: scheduledDate },
            smallIcon: 'ic_stat_notification',
            largeBody: `${options.medName} ${options.strength}\nTake ${options.doseQty}\nScheduled: ${options.scheduleTime}`,
            actionTypeId: 'med_reminder',
            summaryText: 'MedFlow Medication Reminder',
          },
        ],
      });
    } catch (err) {
      console.warn('Failed to schedule exact alarm', err);
    }
  }

  /**
   * Cancel scheduled notification
   */
  static async cancelNotification(id: number): Promise<void> {
    try {
      await LocalNotifications.cancel({ notifications: [{ id }] });
    } catch (err) {
      console.warn('Failed to cancel notification', err);
    }
  }

  /**
   * Check if notifications are enabled on device
   */
  static async isNotificationEnabled(): Promise<boolean> {
    try {
      const result = await LocalNotifications.checkPermissions();
      return result.display === 'granted';
    } catch (err) {
      return false;
    }
  }

  /**
   * Register action handlers (TAKE_NOW, SNOOZE_15)
   * Called from main.ts to wire up button actions
   */
  static registerActionHandlers(callbacks: {
    onTakeNow?: (medId: string) => void;
    onSnooze?: (medId: string) => void;
  }): void {
    LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
      const actionId = notification.actionId;
      if (actionId === 'take_now' && callbacks.onTakeNow) {
        // Extract medId from notification data
        callbacks.onTakeNow(notification.notification.extra?.medId || '');
      } else if (actionId === 'snooze_15' && callbacks.onSnooze) {
        callbacks.onSnooze(notification.notification.extra?.medId || '');
      }
    });
  }
}
