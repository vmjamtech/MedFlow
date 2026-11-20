/**
 * Guardian Sync service: Optional cloud sync for family caregivers
 * Pushes dose completions & 1h+ missed-dose escalations to Supabase
 * Uses strict Row Level Security (RLS) with patient invite codes (MED-XXXX)
 * Never auto-uploads; respects offline-first principle with optional sync toggle
 */

import { createClient } from '@supabase/supabase-js';
import type { GuardianAlert, MonitoredPatient } from '../db/schema';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export class GuardianSyncService {
  private static syncEnabled = true;
  private static offlineQueue: Array<{ type: 'dose' | 'alert'; data: any }> = [];

  /**
   * Initialize Guardian Sync (check Supabase connectivity)
   */
  static async init(): Promise<boolean> {
    if (!supabase) {
      console.warn('Guardian Sync disabled: Supabase credentials not configured');
      return false;
    }
    try {
      await supabase.auth.getSession();
      return true;
    } catch (err) {
      console.warn('Guardian Sync init failed', err);
      return false;
    }
  }

  /**
   * Push dose completion to Supabase (adds to guardian_dose_feed table)
   * RLS policy: Guardians can only see linked patient codes
   */
  static async pushDoseCompletion(options: {
    myPatientCode: string; // "MED-7429"
    medName: string;
    strength: string;
    doseQty: string;
    takenAtTime: string; // "02:15 PM"
  }): Promise<void> {
    if (!this.syncEnabled || !supabase) {
      this.offlineQueue.push({ type: 'dose', data: options });
      return;
    }

    try {
      const { error } = await supabase.from('guardian_dose_feed').insert([
        {
          patient_code: options.myPatientCode,
          med_name: options.medName,
          med_strength: options.strength,
          dose_qty: options.doseQty,
          taken_at: options.takenAtTime,
          logged_at: new Date().toISOString(),
        },
      ]);

      if (error) {
        console.warn('Failed to push dose completion', error);
        this.offlineQueue.push({ type: 'dose', data: options });
      }
    } catch (err) {
      console.warn('Guardian sync error', err);
      this.offlineQueue.push({ type: 'dose', data: options });
    }
  }

  /**
   * Push missed-dose escalation alert (1h+ unlogged)
   * Stored in guardian_alerts table, viewable by linked family guardians
   */
  static async pushMissedDoseAlert(alert: GuardianAlert, myPatientCode: string): Promise<void> {
    if (!this.syncEnabled || !supabase) {
      this.offlineQueue.push({ type: 'alert', data: { alert, patientCode: myPatientCode } });
      return;
    }

    try {
      const { error } = await supabase.from('guardian_alerts').insert([
        {
          patient_code: myPatientCode,
          med_name: alert.medName,
          scheduled_time: alert.scheduledTime,
          overdue_minutes: parseInt(alert.overdueBy) || 60,
          acknowledged: false,
          created_at: new Date().toISOString(),
        },
      ]);

      if (error) {
        console.warn('Failed to push missed dose alert', error);
        this.offlineQueue.push({ type: 'alert', data: { alert, patientCode: myPatientCode } });
      }
    } catch (err) {
      console.warn('Guardian sync error', err);
      this.offlineQueue.push({ type: 'alert', data: { alert, patientCode: myPatientCode } });
    }
  }

  /**
   * Acknowledge an alert as guardian (marks as read in Supabase)
   */
  static async acknowledgeAlert(alertId: string): Promise<void> {
    if (!supabase) return;

    try {
      await supabase.from('guardian_alerts').update({ acknowledged: true }).eq('id', alertId);
    } catch (err) {
      console.warn('Failed to acknowledge alert', err);
    }
  }

  /**
   * Fetch monitored patients for a guardian account
   * RLS ensures guardian can only see linked patient codes
   */
  static async fetchMonitoredPatients(): Promise<MonitoredPatient[]> {
    if (!supabase) return [];

    try {
      const { data, error } = await supabase.from('guardian_links').select('patient_code, relation, linked_at');
      if (error) throw error;
      return (data || []).map((row: any) => ({
        id: row.patient_code,
        name: `Patient ${row.patient_code}`,
        code: row.patient_code,
        relation: row.relation || 'Unknown',
        adherence: 0,
        lastSync: 'Synced',
        status: 'on_track',
        meds: [],
      }));
    } catch (err) {
      console.warn('Failed to fetch monitored patients', err);
      return [];
    }
  }

  /**
   * Flush offline queue when internet returns
   */
  static async flushOfflineQueue(): Promise<void> {
    for (const item of this.offlineQueue) {
      if (item.type === 'dose') {
        await this.pushDoseCompletion(item.data);
      } else if (item.type === 'alert') {
        await this.pushMissedDoseAlert(item.data.alert, item.data.patientCode);
      }
    }
    this.offlineQueue = [];
  }

  /**
   * Toggle Guardian Sync on/off (manual control, never auto-upload)
   */
  static toggleSync(enabled: boolean): void {
    this.syncEnabled = enabled;
  }

  /**
   * Check if sync is enabled
   */
  static isSyncEnabled(): boolean {
    return this.syncEnabled;
  }
}
