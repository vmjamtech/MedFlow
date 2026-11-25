/**
 * Database layer: SQLite + localStorage fallback for 100% offline operation
 * No internet required for personal medication & vitals tracking
 */

import { CapacitorSQLite, SQLiteDBConnection, SQLiteConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import type { Medication, Dose, VitalLog, IntakeHistory } from './schema';
import { localDateAtMinutes, localDateKey } from '../utils/localDate';

export interface LocalProfile {
  name: string;
  age: number | null;
  sex: 'Prefer not to say' | 'Male' | 'Female' | 'Other';
  photo: string;
}

export const EMPTY_LOCAL_PROFILE: LocalProfile = {
  name: '',
  age: null,
  sex: 'Prefer not to say',
  photo: '',
};

export class MedFlowDatabase {
  private db: SQLiteDBConnection | null = null;
  private dbName = 'medflow.db';
  private sqlite: SQLiteConnection | null = null;
  private isNativePlatform = false;

  async init(): Promise<void> {
    // Detect if running on native platform (Android/iOS)
    this.isNativePlatform = Capacitor.isNativePlatform();

    try {
      if (this.isNativePlatform) {
        // Try to open SQLite on Android/iOS
        this.sqlite = new SQLiteConnection(CapacitorSQLite);
        const db = await this.sqlite.createConnection(this.dbName, false, 'no-encryption', 1, false);
        await db.open();
        this.db = db;
        await this.createTables();
        console.log('✓ SQLite database initialized (native platform)');
      } else {
        // Browser mode: use localStorage fallback
        this.initializeLocalStorage();
        console.log('✓ localStorage fallback initialized (browser mode)');
      }
    } catch (err) {
      if (this.isNativePlatform) {
        console.error('SQLite initialization failed', err);
        throw err;
      }
      console.warn('Browser storage initialization failed', err);
      this.initializeLocalStorage();
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) return;

    const tables = `
      CREATE TABLE IF NOT EXISTS medications (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        strength TEXT NOT NULL,
        shape TEXT NOT NULL,
        color TEXT NOT NULL,
        doseQty REAL NOT NULL,
        unit TEXT NOT NULL,
        scheduleType TEXT NOT NULL,
        fixedTimes TEXT,
        intervalHours INTEGER,
        intervalAnchor TEXT,
        cooldownHours INTEGER,
        maxPerDay INTEGER,
        mealRequired TEXT NOT NULL,
        mealTiming TEXT,
        stockRemaining REAL NOT NULL,
        stockTotal REAL NOT NULL,
        lowStockThreshold REAL NOT NULL,
        instruction TEXT,
        mealTag TEXT,
        takenTodayCount INTEGER DEFAULT 0,
        cooldownRemainingSeconds INTEGER DEFAULT 0,
        createdAt TEXT,
        updatedAt TEXT
      );

      CREATE TABLE IF NOT EXISTS doses (
        id TEXT PRIMARY KEY,
        medId TEXT NOT NULL,
        scheduledMinutes INTEGER NOT NULL,
        scheduledDate TEXT,
        scheduledAt TEXT,
        originalMinutes INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        takenAtStr TEXT,
        shiftNote TEXT,
        createdAt TEXT,
        updatedAt TEXT,
        FOREIGN KEY(medId) REFERENCES medications(id)
      );

      CREATE TABLE IF NOT EXISTS vital_logs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        sys INTEGER,
        dia INTEGER,
        valueMgDl REAL,
        value REAL,
        date TEXT NOT NULL,
        dateLabel TEXT NOT NULL,
        context TEXT NOT NULL,
        note TEXT,
        createdAt TEXT,
        updatedAt TEXT
      );

      CREATE TABLE IF NOT EXISTS intake_history (
        id TEXT PRIMARY KEY,
        medId TEXT NOT NULL,
        medName TEXT NOT NULL,
        strength TEXT NOT NULL,
        doseQty REAL NOT NULL,
        unit TEXT NOT NULL,
        takenAt TEXT NOT NULL,
        date TEXT NOT NULL,
        timingStatus TEXT NOT NULL,
        scheduleType TEXT NOT NULL,
        createdAt TEXT
      );

      CREATE TABLE IF NOT EXISTS local_profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        name TEXT NOT NULL DEFAULT '',
        age INTEGER,
        sex TEXT NOT NULL DEFAULT 'Prefer not to say',
        photo TEXT NOT NULL DEFAULT '',
        updatedAt TEXT
      );

      CREATE TABLE IF NOT EXISTS generated_dose_days (
        medId TEXT NOT NULL,
        scheduledDate TEXT NOT NULL,
        PRIMARY KEY (medId, scheduledDate)
      );

      CREATE TABLE IF NOT EXISTS app_migrations (
        id TEXT PRIMARY KEY
      );

      CREATE INDEX IF NOT EXISTS idx_doses_scheduled ON doses(scheduledMinutes);
      CREATE INDEX IF NOT EXISTS idx_vitals_date ON vital_logs(date);
      CREATE INDEX IF NOT EXISTS idx_vitals_type ON vital_logs(type);
    `;

    for (const sql of tables.split(';')) {
      if (sql.trim()) {
        await this.db.run(sql);
      }
    }
    const medicationColumns = await this.db.query('PRAGMA table_info(medications)');
    if (!medicationColumns.values?.some((column: { name: string }) => column.name === 'intervalAnchor')) {
      await this.db.run('ALTER TABLE medications ADD COLUMN intervalAnchor TEXT');
    }
    const doseColumns = await this.db.query('PRAGMA table_info(doses)');
    const needsDoseDateMigration = !doseColumns.values?.some((column: { name: string }) => column.name === 'scheduledDate');
    if (needsDoseDateMigration) {
      await this.db.run('ALTER TABLE doses ADD COLUMN scheduledDate TEXT');
    }
    if (!doseColumns.values?.some((column: { name: string }) => column.name === 'scheduledAt')) {
      await this.db.run('ALTER TABLE doses ADD COLUMN scheduledAt TEXT');
    }
    await this.db.run(
      'UPDATE doses SET scheduledDate = ? WHERE scheduledDate IS NULL',
      [localDateKey(new Date())]
    );
    const backfill = await this.db.query(
      'SELECT 1 FROM app_migrations WHERE id = ?',
      ['dose-calendar-v1']
    );
    if (!backfill.values?.length) {
      await this.db.run(
        'INSERT OR IGNORE INTO generated_dose_days (medId, scheduledDate) SELECT DISTINCT medId, scheduledDate FROM doses'
      );
      await this.db.run('INSERT OR IGNORE INTO app_migrations (id) VALUES (?)', ['dose-calendar-v1']);
    }
  }

  private initializeLocalStorage(): void {
    // Initialize localStorage structure for browser fallback
    for (const key of ['medflow_medications', 'medflow_doses', 'medflow_vitalLogs', 'medflow_intakeHistory']) {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify([]));
    }
    const doses = JSON.parse(localStorage.getItem('medflow_doses') || '[]') as Dose[];
    const today = localDateKey(new Date());
    if (doses.some((dose) => !dose.scheduledDate)) {
      localStorage.setItem('medflow_doses', JSON.stringify(doses.map((dose) => ({
        ...dose,
        scheduledDate: dose.scheduledDate || today,
      }))));
    }
    if (localStorage.getItem('medflow_generated_dose_days') === null) {
      const generated = new Set(doses.map((dose) => `${dose.medId}|${dose.scheduledDate || today}`));
      localStorage.setItem('medflow_generated_dose_days', JSON.stringify([...generated]));
    }
    if (!localStorage.getItem('medflow_local_profile')) {
      localStorage.setItem('medflow_local_profile', JSON.stringify(EMPTY_LOCAL_PROFILE));
    }
  }

  // ======================= LOCAL PROFILE =======================
  async getLocalProfile(): Promise<LocalProfile> {
    if (this.db) {
      const result = await this.db.query(
        'SELECT name, age, sex, photo FROM local_profile WHERE id = 1'
      );
      const row = result.values?.[0];
      if (row) {
        return {
          name: String(row.name || ''),
          age: typeof row.age === 'number' ? row.age : null,
          sex: this.isProfileSex(row.sex) ? row.sex : 'Prefer not to say',
          photo: String(row.photo || ''),
        };
      }
      return { ...EMPTY_LOCAL_PROFILE };
    }

    try {
      const stored = JSON.parse(
        localStorage.getItem('medflow_local_profile') || '{}'
      ) as Partial<LocalProfile>;
      return {
        name: typeof stored.name === 'string' ? stored.name : '',
        age: typeof stored.age === 'number' ? stored.age : null,
        sex: this.isProfileSex(stored.sex) ? stored.sex : 'Prefer not to say',
        photo: typeof stored.photo === 'string' ? stored.photo : '',
      };
    } catch (error) {
      console.warn('Unable to read local profile; using an empty profile', error);
      return { ...EMPTY_LOCAL_PROFILE };
    }
  }

  async saveLocalProfile(profile: LocalProfile): Promise<void> {
    const normalized: LocalProfile = {
      name: profile.name.trim().slice(0, 80),
      age: profile.age,
      sex: this.isProfileSex(profile.sex) ? profile.sex : 'Prefer not to say',
      photo: profile.photo,
    };

    if (this.db) {
      await this.db.run(
        `INSERT OR REPLACE INTO local_profile
         (id, name, age, sex, photo, updatedAt)
         VALUES (1, ?, ?, ?, ?, ?)`,
        [
          normalized.name,
          normalized.age,
          normalized.sex,
          normalized.photo,
          new Date().toISOString(),
        ]
      );
      return;
    }

    localStorage.setItem('medflow_local_profile', JSON.stringify(normalized));
  }

  private isProfileSex(value: unknown): value is LocalProfile['sex'] {
    return value === 'Prefer not to say' ||
      value === 'Male' ||
      value === 'Female' ||
      value === 'Other';
  }

  // ======================= MEDICATIONS =======================
  async saveMedication(med: Medication): Promise<void> {
    if (this.db) {
      const sql = `
        INSERT OR REPLACE INTO medications
        (id, name, strength, shape, color, doseQty, unit, scheduleType, fixedTimes, intervalHours, intervalAnchor,
         cooldownHours, maxPerDay, mealRequired, mealTiming, stockRemaining, stockTotal, lowStockThreshold,
         instruction, mealTag, takenTodayCount, cooldownRemainingSeconds, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await this.db.run(sql, [
        med.id, med.name, med.strength, med.shape, med.color, med.doseQty, med.unit,
        med.scheduleType, JSON.stringify(med.fixedTimes || []), med.intervalHours, med.intervalAnchor || null,
        med.cooldownHours, med.maxPerDay, med.mealRequired, med.mealTiming,
        med.stockRemaining, med.stockTotal, med.lowStockThreshold,
        med.instruction, med.mealTag, med.takenTodayCount || 0,
        med.cooldownRemainingSeconds || 0, new Date().toISOString(), new Date().toISOString(),
      ]);
    } else {
      const meds = JSON.parse(localStorage.getItem('medflow_medications') || '[]');
      const idx = meds.findIndex((m: Medication) => m.id === med.id);
      if (idx >= 0) meds[idx] = med;
      else meds.push(med);
      localStorage.setItem('medflow_medications', JSON.stringify(meds));
    }
  }

  async getMedications(): Promise<Medication[]> {
    if (this.db) {
      const result = await this.db.query('SELECT * FROM medications ORDER BY name ASC');
      return result.values?.map((row: any) => ({
        ...row,
        fixedTimes: row.fixedTimes ? JSON.parse(row.fixedTimes) : [],
      })) || [];
    }
    return JSON.parse(localStorage.getItem('medflow_medications') || '[]');
  }

  async setIntervalAnchor(medId: string, anchor: string): Promise<void> {
    if (this.db) {
      await this.db.run('UPDATE medications SET intervalAnchor = ? WHERE id = ?', [anchor, medId]);
      return;
    }
    const medications = JSON.parse(localStorage.getItem('medflow_medications') || '[]') as Medication[];
    const medication = medications.find((item) => item.id === medId);
    if (!medication) throw new Error(`Medication ${medId} not found`);
    medication.intervalAnchor = anchor;
    localStorage.setItem('medflow_medications', JSON.stringify(medications));
  }

  async deleteMedication(medId: string): Promise<void> {
    if (this.db) {
      await this.db.run('DELETE FROM medications WHERE id = ?', [medId]);
      await this.db.run('DELETE FROM doses WHERE medId = ?', [medId]);
    } else {
      const meds = JSON.parse(localStorage.getItem('medflow_medications') || '[]');
      const doses = JSON.parse(localStorage.getItem('medflow_doses') || '[]');
      localStorage.setItem('medflow_medications', JSON.stringify(meds.filter((m: Medication) => m.id !== medId)));
      localStorage.setItem('medflow_doses', JSON.stringify(doses.filter((dose: Dose) => dose.medId !== medId)));
    }
  }

  async deleteDosesByMedication(medId: string): Promise<void> {
    if (this.db) {
      await this.db.run('DELETE FROM doses WHERE medId = ?', [medId]);
      return;
    }
    const doses = JSON.parse(localStorage.getItem('medflow_doses') || '[]');
    localStorage.setItem(
      'medflow_doses',
      JSON.stringify(doses.filter((dose: Dose) => dose.medId !== medId))
    );
  }

  async cancelFuturePendingDoses(medId: string, afterDate: string): Promise<void> {
    if (this.db) {
      await this.db.run(
        "UPDATE doses SET status = 'cancelled' WHERE medId = ? AND scheduledDate > ? AND status = 'pending'",
        [medId, afterDate]
      );
      return;
    }
    const doses = JSON.parse(localStorage.getItem('medflow_doses') || '[]') as Dose[];
    localStorage.setItem('medflow_doses', JSON.stringify(doses.map((dose) =>
      dose.medId === medId && dose.scheduledDate && dose.scheduledDate > afterDate && dose.status === 'pending'
        ? { ...dose, status: 'cancelled' }
        : dose
    )));
  }

  // ======================= DOSES =======================
  async saveDose(dose: Dose): Promise<void> {
    const scheduledDate = dose.scheduledDate || localDateKey(new Date());
    const scheduledAt = dose.scheduledAt || localDateAtMinutes(scheduledDate, dose.scheduledMinutes).toISOString();
    if (this.db) {
      const sql = `
        INSERT OR REPLACE INTO doses
        (id, medId, scheduledMinutes, scheduledDate, scheduledAt, originalMinutes, status, takenAtStr, shiftNote, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await this.db.run(sql, [
        dose.id, dose.medId, dose.scheduledMinutes, scheduledDate, scheduledAt, dose.originalMinutes, dose.status,
        dose.takenAtStr, dose.shiftNote, new Date().toISOString(), new Date().toISOString(),
      ]);
    } else {
      const doses = JSON.parse(localStorage.getItem('medflow_doses') || '[]');
      const idx = doses.findIndex((d: Dose) => d.id === dose.id);
      if (idx >= 0) doses[idx] = { ...dose, scheduledDate, scheduledAt };
      else doses.push({ ...dose, scheduledDate, scheduledAt });
      localStorage.setItem('medflow_doses', JSON.stringify(doses));
    }
  }

  async getDoses(date = localDateKey(new Date())): Promise<Dose[]> {
    if (this.db) {
      const result = await this.db.query(
        "SELECT * FROM doses WHERE scheduledDate = ? AND status != 'cancelled' ORDER BY scheduledMinutes ASC",
        [date]
      );
      return result.values || [];
    }
    const doses = JSON.parse(localStorage.getItem('medflow_doses') || '[]') as Dose[];
    return doses
      .filter((dose) => dose.scheduledDate === date && dose.status !== 'cancelled')
      .sort((a, b) => a.scheduledMinutes - b.scheduledMinutes);
  }

  async getDosesByMedication(medId: string): Promise<Dose[]> {
    if (this.db) {
      const result = await this.db.query(
        "SELECT * FROM doses WHERE medId = ? AND scheduledDate = ? AND status != 'cancelled' ORDER BY scheduledMinutes ASC",
        [medId, localDateKey(new Date())]
      );
      return result.values || [];
    }
    const doses = JSON.parse(localStorage.getItem('medflow_doses') || '[]');
    return doses.filter((d: Dose) => d.medId === medId && d.scheduledDate === localDateKey(new Date()) && d.status !== 'cancelled');
  }

  async hasGeneratedDoseDay(medId: string, date: string): Promise<boolean> {
    if (this.db) {
      const result = await this.db.query(
        'SELECT 1 FROM generated_dose_days WHERE medId = ? AND scheduledDate = ?',
        [medId, date]
      );
      return Boolean(result.values?.length);
    }
    const generated = JSON.parse(localStorage.getItem('medflow_generated_dose_days') || '[]') as string[];
    return generated.includes(`${medId}|${date}`);
  }

  async markDoseDayGenerated(medId: string, date: string): Promise<void> {
    if (this.db) {
      await this.db.run(
        'INSERT OR IGNORE INTO generated_dose_days (medId, scheduledDate) VALUES (?, ?)',
        [medId, date]
      );
      return;
    }
    const generated = JSON.parse(localStorage.getItem('medflow_generated_dose_days') || '[]') as string[];
    const key = `${medId}|${date}`;
    if (!generated.includes(key)) {
      generated.push(key);
      localStorage.setItem('medflow_generated_dose_days', JSON.stringify(generated));
    }
  }

  // ======================= VITAL LOGS =======================
  async saveVitalLog(log: VitalLog): Promise<void> {
    if (this.db) {
      const sql = `
        INSERT OR REPLACE INTO vital_logs
        (id, type, sys, dia, valueMgDl, value, date, dateLabel, context, note, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await this.db.run(sql, [
        log.id, log.type, log.sys, log.dia, log.valueMgDl, log.value,
        log.date, log.dateLabel, log.context, log.note,
        new Date().toISOString(), new Date().toISOString(),
      ]);
    } else {
      const logs = JSON.parse(localStorage.getItem('medflow_vitalLogs') || '[]');
      const idx = logs.findIndex((l: VitalLog) => l.id === log.id);
      if (idx >= 0) logs[idx] = log;
      else logs.push(log);
      localStorage.setItem('medflow_vitalLogs', JSON.stringify(logs));
    }
  }

  async getVitalLogs(type?: string, fromDate?: string, toDate?: string): Promise<VitalLog[]> {
    if (this.db) {
      let sql = 'SELECT * FROM vital_logs WHERE 1=1';
      const params: any[] = [];
      if (type) {
        sql += ' AND type = ?';
        params.push(type);
      }
      if (fromDate) {
        sql += ' AND date >= ?';
        params.push(fromDate);
      }
      if (toDate) {
        sql += ' AND date <= ?';
        params.push(toDate);
      }
      sql += ' ORDER BY date DESC';
      const result = await this.db.query(sql, params);
      return result.values || [];
    }
    let logs = JSON.parse(localStorage.getItem('medflow_vitalLogs') || '[]');
    if (type) logs = logs.filter((l: VitalLog) => l.type === type);
    if (fromDate) logs = logs.filter((l: VitalLog) => l.date >= fromDate);
    if (toDate) logs = logs.filter((l: VitalLog) => l.date <= toDate);
    return logs.sort((a: VitalLog, b: VitalLog) => b.date.localeCompare(a.date));
  }

  // ======================= INTAKE HISTORY =======================
  async saveIntakeHistory(entry: IntakeHistory): Promise<void> {
    if (this.db) {
      const sql = `
        INSERT INTO intake_history 
        (id, medId, medName, strength, doseQty, unit, takenAt, date, timingStatus, scheduleType, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await this.db.run(sql, [
        entry.id, entry.medId, entry.medName, entry.strength, entry.doseQty, 
        entry.unit, entry.takenAt, entry.date, entry.timingStatus, 
        entry.scheduleType, new Date().toISOString()
      ]);
    } else {
      const history = JSON.parse(localStorage.getItem('medflow_intakeHistory') || '[]');
      history.unshift(entry);
      localStorage.setItem('medflow_intakeHistory', JSON.stringify(history.slice(0, 500)));
    }
  }

  async addIntakeHistory(entry: IntakeHistory): Promise<void> {
    // Alias for backward compatibility
    await this.saveIntakeHistory(entry);
  }

  async getIntakeHistory(limit = 100): Promise<IntakeHistory[]> {
    if (this.db) {
      const result = await this.db.query('SELECT * FROM intake_history ORDER BY rowid DESC LIMIT ?', [limit]);
      return result.values || [];
    }
    return JSON.parse(localStorage.getItem('medflow_intakeHistory') || '[]').slice(0, limit);
  }

  // ======================= UTILITY =======================
  async clearDemoData(): Promise<void> {
    const medicationIds = ['med-amox', 'med-met', 'med-ibu'];
    const doseIds = ['dose-1', 'dose-2', 'dose-3', 'dose-4'];
    const vitalIds = ['v-1', 'v-2', 'v-3', 'v-4', 'v-5', 'v-6', 'v-7'];
    const historyIds = ['ih-1', 'ih-2', 'ih-3', 'ih-4', 'ih-5', 'ih-6', 'ih-7'];
    const medicationParams = medicationIds.map(() => '?').join(', ');
    const doseParams = doseIds.map(() => '?').join(', ');
    const vitalParams = vitalIds.map(() => '?').join(', ');
    const historyParams = historyIds.map(() => '?').join(', ');

    if (this.db) {
      await this.db.run(
        `DELETE FROM intake_history WHERE id IN (${historyParams}) OR medId IN (${medicationParams})`,
        [...historyIds, ...medicationIds]
      );
      await this.db.run(
        `DELETE FROM doses WHERE id IN (${doseParams}) OR medId IN (${medicationParams})`,
        [...doseIds, ...medicationIds]
      );
      await this.db.run(`DELETE FROM vital_logs WHERE id IN (${vitalParams})`, vitalIds);
      await this.db.run(`DELETE FROM medications WHERE id IN (${medicationParams})`, medicationIds);
      return;
    }

    const medications = JSON.parse(localStorage.getItem('medflow_medications') || '[]') as Medication[];
    const doses = JSON.parse(localStorage.getItem('medflow_doses') || '[]') as Dose[];
    const vitals = JSON.parse(localStorage.getItem('medflow_vitalLogs') || '[]') as VitalLog[];
    const history = JSON.parse(localStorage.getItem('medflow_intakeHistory') || '[]') as IntakeHistory[];
    localStorage.setItem(
      'medflow_medications',
      JSON.stringify(medications.filter((item) => !medicationIds.includes(item.id)))
    );
    localStorage.setItem(
      'medflow_doses',
      JSON.stringify(doses.filter((item) =>
        !doseIds.includes(item.id) && !medicationIds.includes(item.medId)
      ))
    );
    localStorage.setItem(
      'medflow_vitalLogs',
      JSON.stringify(vitals.filter((item) => !vitalIds.includes(item.id)))
    );
    localStorage.setItem(
      'medflow_intakeHistory',
      JSON.stringify(history.filter((item) =>
        !historyIds.includes(item.id) && !medicationIds.includes(item.medId)
      ))
    );
  }

  async clearAllData(): Promise<void> {
    if (this.db) {
      await this.db.run('DELETE FROM intake_history');
      await this.db.run('DELETE FROM vital_logs');
      await this.db.run('DELETE FROM doses');
      await this.db.run('DELETE FROM medications');
    } else {
      localStorage.setItem('medflow_medications', JSON.stringify([]));
      localStorage.setItem('medflow_doses', JSON.stringify([]));
      localStorage.setItem('medflow_vitalLogs', JSON.stringify([]));
      localStorage.setItem('medflow_intakeHistory', JSON.stringify([]));
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
}

// Global singleton instance
export const db = new MedFlowDatabase();
