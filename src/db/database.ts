/**
 * Database layer: SQLite + localStorage fallback for 100% offline operation
 * No internet required for personal medication & vitals tracking
 */

import { CapacitorSQLite, SQLiteDBConnection, SQLiteConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import type { Medication, Dose, VitalLog, IntakeHistory } from './schema';

export class MedFlowDatabase {
  private db: SQLiteDBConnection | null = null;
  private dbName = 'medflow.db';
  private sqlite: SQLiteConnection | null = null;
  private isNativePlatform = false;

  async init(): Promise<void> {
    // Detect if running on native platform (Android/iOS)
    this.isNativePlatform = !Capacitor.isNativePlatform || Capacitor.getPlatform() !== 'web';

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
      // Fallback to localStorage if SQLite fails
      console.warn('SQLite initialization failed, using localStorage fallback', err);
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

      CREATE INDEX IF NOT EXISTS idx_doses_scheduled ON doses(scheduledMinutes);
      CREATE INDEX IF NOT EXISTS idx_vitals_date ON vital_logs(date);
      CREATE INDEX IF NOT EXISTS idx_vitals_type ON vital_logs(type);
    `;

    for (const sql of tables.split(';')) {
      if (sql.trim()) {
        await this.db.run(sql);
      }
    }
  }

  private initializeLocalStorage(): void {
    // Initialize localStorage structure for browser fallback
    if (!localStorage.getItem('medflow_medications')) {
      localStorage.setItem('medflow_medications', JSON.stringify([]));
      localStorage.setItem('medflow_doses', JSON.stringify([]));
      localStorage.setItem('medflow_vitalLogs', JSON.stringify([]));
      localStorage.setItem('medflow_intakeHistory', JSON.stringify([]));
    }
  }

  // ======================= MEDICATIONS =======================
  async saveMedication(med: Medication): Promise<void> {
    if (this.db) {
      const sql = `
        INSERT OR REPLACE INTO medications
        (id, name, strength, shape, color, doseQty, unit, scheduleType, fixedTimes, intervalHours,
         cooldownHours, maxPerDay, mealRequired, mealTiming, stockRemaining, stockTotal, lowStockThreshold,
         instruction, mealTag, takenTodayCount, cooldownRemainingSeconds, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await this.db.run(sql, [
        med.id, med.name, med.strength, med.shape, med.color, med.doseQty, med.unit,
        med.scheduleType, JSON.stringify(med.fixedTimes || []), med.intervalHours,
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

  // ======================= DOSES =======================
  async saveDose(dose: Dose): Promise<void> {
    if (this.db) {
      const sql = `
        INSERT OR REPLACE INTO doses
        (id, medId, scheduledMinutes, originalMinutes, status, takenAtStr, shiftNote, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await this.db.run(sql, [
        dose.id, dose.medId, dose.scheduledMinutes, dose.originalMinutes, dose.status,
        dose.takenAtStr, dose.shiftNote, new Date().toISOString(), new Date().toISOString(),
      ]);
    } else {
      const doses = JSON.parse(localStorage.getItem('medflow_doses') || '[]');
      const idx = doses.findIndex((d: Dose) => d.id === dose.id);
      if (idx >= 0) doses[idx] = dose;
      else doses.push(dose);
      localStorage.setItem('medflow_doses', JSON.stringify(doses));
    }
  }

  async getDoses(): Promise<Dose[]> {
    if (this.db) {
      const result = await this.db.query('SELECT * FROM doses ORDER BY scheduledMinutes ASC');
      return result.values || [];
    }
    return JSON.parse(localStorage.getItem('medflow_doses') || '[]');
  }

  async getDosesByMedication(medId: string): Promise<Dose[]> {
    if (this.db) {
      const result = await this.db.query('SELECT * FROM doses WHERE medId = ? ORDER BY scheduledMinutes ASC', [medId]);
      return result.values || [];
    }
    const doses = JSON.parse(localStorage.getItem('medflow_doses') || '[]');
    return doses.filter((d: Dose) => d.medId === medId);
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
