/**
 * Scheduler service: Manages dose scheduling, PRN cooldowns, and late-dose interval shifting
 * Core MedFlow logic: depleting-resource piece deduction, late-dose dynamic interval shifting
 */

import type { Medication, Dose } from '../db/schema';
import { db } from '../db/database';
import { GuardianSyncService } from './guardianSync';
import { localDateAtMinutes, localDateKey } from '../utils/localDate';

export class SchedulerService {
  static async reconcileDay(medications: Medication[], date: string): Promise<Dose[]> {
    const existingDoses = await db.getDoses(date);
    for (const med of medications) {
      if (med.scheduleType === 'prn') continue;
      if (med.scheduleType === 'interval' && !med.intervalAnchor) {
        const minutes = this.parseTimeToMinutes(med.fixedTimes?.[0] || '08:00');
        med.intervalAnchor = localDateAtMinutes(date, minutes).toISOString();
        await db.setIntervalAnchor(med.id, med.intervalAnchor);
      }
      if (await db.hasGeneratedDoseDay(med.id, date)) continue;
      const doses = await this.calculateDayDoses(med, date);
      for (const dose of doses) {
        if (existingDoses.some((existing) =>
          existing.medId === med.id &&
          (existing.scheduledAt || localDateAtMinutes(date, existing.scheduledMinutes).toISOString()) === dose.scheduledAt
        )) continue;
        await db.saveDose(dose);
      }
      await db.markDoseDayGenerated(med.id, date);
    }
    return db.getDoses(date);
  }

  /**
   * Calculate all doses for a medication on a given day
   * Returns doses sorted by scheduled time
   */
  static async calculateDayDoses(med: Medication, date = localDateKey(new Date())): Promise<Dose[]> {
    if (med.scheduleType === 'fixed') {
      return this.generateFixedDoses(med, date);
    } else if (med.scheduleType === 'interval') {
      return this.generateIntervalDoses(med, date);
    } else if (med.scheduleType === 'prn') {
      return []; // PRN has no scheduled doses; user initiates
    }
    return [];
  }

  private static generateFixedDoses(med: Medication, date: string): Dose[] {
    const doses: Dose[] = [];
    const times = med.fixedTimes || ['08:00'];

    times.forEach((timeStr) => {
      const [h, m] = timeStr.split(':').map(Number);
      const scheduledMinutes = h * 60 + m;

      doses.push({
        id: `dose-${med.id}-${date}-${timeStr}`,
        medId: med.id,
        scheduledDate: date,
        scheduledAt: localDateAtMinutes(date, scheduledMinutes).toISOString(),
        scheduledMinutes,
        originalMinutes: scheduledMinutes,
        status: 'pending',
      });
    });

    return doses.sort((a, b) => a.scheduledMinutes - b.scheduledMinutes);
  }

  private static generateIntervalDoses(med: Medication, date: string): Dose[] {
    const doses: Dose[] = [];
    const intervalHours = med.intervalHours || 8;
    const startStr = med.fixedTimes?.[0] || '08:00';
    const [h, m] = startStr.split(':').map(Number);
    const anchor = med.intervalAnchor
      ? new Date(med.intervalAnchor)
      : localDateAtMinutes(localDateKey(new Date()), h * 60 + m);
    const intervalMs = intervalHours * 60 * 60 * 1000;
    if (!Number.isFinite(anchor.getTime()) || !Number.isFinite(intervalMs) || intervalMs <= 0) {
      throw new Error(`Invalid interval schedule for ${med.name}`);
    }
    const dayStart = localDateAtMinutes(date, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    let occurrence = Math.max(0, Math.ceil((dayStart.getTime() - anchor.getTime()) / intervalMs));
    let scheduledAt = new Date(anchor.getTime() + occurrence * intervalMs);
    while (scheduledAt < dayEnd) {
      const scheduledMinutes = scheduledAt.getHours() * 60 + scheduledAt.getMinutes();
      doses.push({
        id: `dose-${med.id}-${scheduledAt.getTime()}`,
        medId: med.id,
        scheduledDate: date,
        scheduledAt: scheduledAt.toISOString(),
        scheduledMinutes,
        originalMinutes: scheduledMinutes,
        status: 'pending',
      });
      occurrence += 1;
      scheduledAt = new Date(anchor.getTime() + occurrence * intervalMs);
    }

    return doses;
  }

  /**
   * Process dose taken: deduct inventory, handle late-dose interval shifting
   * Returns updated medication and any doses that were shifted
   */
  static async processDoseTaken(
    med: Medication,
    dose: Dose,
    takenAtMinutes: number
  ): Promise<{ med: Medication; shiftedDoses: Dose[] }> {
    const lateOffsetMinutes = takenAtMinutes - dose.scheduledMinutes;
    const shiftedDoses: Dose[] = [];

    // 1. Deduct inventory (depleting-resource piece deduction)
    med.stockRemaining = Math.max(0, Number((med.stockRemaining - med.doseQty).toFixed(2)));

    // 2. Mark dose as taken
    dose.status = 'taken';
    dose.takenAtStr = this.minutesToTime(takenAtMinutes);

    // 3. PRN cooldown: Start safety cooldown timer
    if (med.scheduleType === 'prn') {
      med.takenTodayCount = (med.takenTodayCount || 0) + 1;
      med.cooldownRemainingSeconds = (med.cooldownHours || 4) * 3600;
    }

    // 4. Auto-shift subsequent interval-based doses if taken late (+90min grace)
    if (med.scheduleType === 'interval' && lateOffsetMinutes > 0) {
      const allDoses = await db.getDosesByMedication(med.id);
      const subsequentDoses = allDoses.filter(
        (d) => d.medId === med.id && d.status === 'pending' && d.scheduledMinutes > dose.scheduledMinutes
      );

      for (const [idx, nextDose] of subsequentDoses.entries()) {
        const newScheduledMinutes = takenAtMinutes + (med.intervalHours || 8) * 60 * (idx + 1);
        nextDose.scheduledMinutes = newScheduledMinutes;
        nextDose.shiftNote = `Auto-shifted +${lateOffsetMinutes}m to maintain ${med.intervalHours}h spacing`;
        shiftedDoses.push(nextDose);
        await db.saveDose(nextDose);
      }
    }

    await db.saveMedication(med);
    await GuardianSyncService.syncPatientDoseFeedToSupabase(
      await db.getMedications(),
      await db.getDoses()
    );
    return { med, shiftedDoses };
  }

  /**
   * Snooze a dose by 15 minutes (PRN & scheduled)
   */
  static async snoozeDose(dose: Dose): Promise<Dose> {
    dose.scheduledMinutes += 15;
    dose.shiftNote = 'Snoozed +15 mins';
    await db.saveDose(dose);
    await GuardianSyncService.syncPatientDoseFeedToSupabase(
      await db.getMedications(),
      await db.getDoses()
    );
    return dose;
  }

  /**
   * Get pending doses for today, grouped by time-of-day
   */
  static async getPendingDoses(): Promise<Dose[]> {
    const allDoses = await db.getDoses();
    return allDoses.filter((d) => d.status === 'pending').sort((a, b) => a.scheduledMinutes - b.scheduledMinutes);
  }

  /**
   * Get today's adherence rate
   */
  static async getTodayAdherence(): Promise<{ taken: number; total: number; percent: number }> {
    const allDoses = await db.getDoses();
    const takenCount = allDoses.filter((d) => d.status === 'taken').length;
    const totalCount = allDoses.length;
    return {
      taken: takenCount,
      total: totalCount,
      percent: totalCount > 0 ? Math.round((takenCount / totalCount) * 100) : 100,
    };
  }

  /**
   * Reset daily PRN counters and cooldowns at midnight
   */
  static async resetDailyPrnCounters(): Promise<void> {
    const medications = await db.getMedications();
    for (const med of medications) {
      if (med.scheduleType === 'prn') {
        med.takenTodayCount = 0;
        med.cooldownRemainingSeconds = 0;
        await db.saveMedication(med);
      }
    }
  }

  /**
   * Decrement PRN cooldown timers (call every second from NotificationService)
   */
  static async decrementPrnCooldowns(): Promise<void> {
    const medications = await db.getMedications();
    for (const med of medications) {
      if (med.scheduleType === 'prn' && (med.cooldownRemainingSeconds || 0) > 0) {
        med.cooldownRemainingSeconds = Math.max(0, (med.cooldownRemainingSeconds || 0) - 1);
        await db.saveMedication(med);
      }
    }
  }

  /**
   * Convert minutes-since-midnight to HH:MM AM/PM string
   */
  private static minutesToTime(minutes: number): string {
    const wrapped = ((minutes % 1440) + 1440) % 1440;
    const hours24 = Math.floor(wrapped / 60);
    const mins = wrapped % 60;
    const ampm = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
    return `${String(hours12).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${ampm}`;
  }

  /**
   * Get time-of-day label (Morning, Afternoon, Evening)
   */
  static getTimeOfDayGroup(minutes: number): string {
    const wrapped = ((minutes % 1440) + 1440) % 1440;
    if (wrapped < 12 * 60) return 'Morning';
    if (wrapped < 17 * 60) return 'Afternoon';
    return 'Evening';
  }

  /**
   * Parse "HH:MM" to minutes since midnight
   */
  static parseTimeToMinutes(timeStr: string): number {
    if (!timeStr) return 8 * 60;
    const [h, m] = timeStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }
}
