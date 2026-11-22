/**
 * Opt-in Guardian sync backed by Supabase.
 * Pending links have no access to dose or alert data; RLS checks approval server-side.
 */

import { createClient } from '@supabase/supabase-js';
import type { GuardianAlert, MonitoredPatient } from '../db/schema';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export type GuardianLinkStatus = 'pending' | 'approved' | 'revoked';

export interface GuardianLink {
  id: string;
  patient_user_id: string;
  guardian_user_id: string;
  patient_code: string;
  guardian_code: string;
  guardian_name: string;
  status: GuardianLinkStatus;
  created_at?: string;
}

interface GuardianProfile {
  user_id: string;
  patient_code: string;
  display_name: string | null;
  sync_enabled: boolean;
}

export class GuardianSyncService {
  private static syncEnabled = true;
  private static profile: GuardianProfile | null = null;
  private static offlineQueue: Array<{ type: 'dose' | 'alert'; data: unknown }> = [];

  static async init(): Promise<boolean> {
    if (!supabase) {
      console.warn('Guardian Sync disabled: Supabase credentials not configured');
      return false;
    }

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      if (!sessionData.session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
      }

      this.profile = await this.ensureProfile();
      return this.profile !== null;
    } catch (error) {
      console.warn('Guardian Sync init failed; using offline local-only mode', error);
      return false;
    }
  }

  static getProfile(): GuardianProfile | null {
    return this.profile;
  }

  static async savePatientName(displayName: string): Promise<boolean> {
    const profile = await this.requireProfile();
    if (!profile) return false;
    const normalizedName = displayName.trim().slice(0, 80);
    const { data, error } = await supabase!
      .from('guardian_profiles')
      .update({ display_name: normalizedName })
      .eq('user_id', profile.user_id)
      .select('user_id, patient_code, display_name, sync_enabled')
      .single();
    if (error) {
      console.warn('Unable to save patient identifier', error);
      return false;
    }
    this.profile = data as GuardianProfile;
    return true;
  }

  static async requestPatientAccess(
    patientCode: string,
    guardianName: string
  ): Promise<{ success: boolean; status?: GuardianLinkStatus; patientName?: string; error?: string }> {
    const profile = await this.requireProfile();
    if (!profile) return { success: false, error: 'Guardian sync is offline' };

    const normalizedCode = patientCode.trim().toUpperCase();
    if (!/^MED-[A-Z0-9]{4,12}$/.test(normalizedCode)) {
      return { success: false, error: 'Invalid patient code' };
    }

    if (normalizedCode === profile.patient_code) {
      return { success: false, error: 'You cannot request access to your own code' };
    }

    const { data, error } = await supabase!.rpc('request_guardian_access', {
      target_patient_code: normalizedCode,
      requested_guardian_name: guardianName.trim(),
    });
    if (error) return { success: false, error: error.message };
    const result = data as { found?: boolean; patient_name?: string } | null;
    if (!result?.found) return { success: false, error: 'Patient code not found' };
    return {
      success: true,
      status: 'pending',
      patientName: result.patient_name || normalizedCode,
    };
  }

  static async fetchIncomingRequests(): Promise<GuardianLink[]> {
    const profile = await this.requireProfile();
    if (!profile) return [];
    const { data, error } = await supabase!
      .from('guardian_links')
      .select('id, patient_user_id, guardian_user_id, patient_code, guardian_code, guardian_name, status, created_at')
      .eq('patient_user_id', profile.user_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('Unable to load Guardian requests', error);
      return [];
    }
    return (data || []) as GuardianLink[];
  }

  static async acceptRequest(linkId: string): Promise<boolean> {
    return this.updateOwnedLink(linkId, 'approved');
  }

  static async declineRequest(linkId: string): Promise<boolean> {
    const profile = await this.requireProfile();
    if (!profile) return false;
    const { error } = await supabase!
      .from('guardian_links')
      .delete()
      .eq('id', linkId)
      .eq('patient_user_id', profile.user_id);
    if (error) {
      console.warn('Unable to decline Guardian request', error);
      return false;
    }
    return true;
  }

  static async revokeLink(linkId: string): Promise<boolean> {
    const profile = await this.requireProfile();
    if (!profile) return false;
    const { error } = await supabase!.from('guardian_links').delete().eq('id', linkId);
    if (error) {
      console.warn('Unable to revoke Guardian link', error);
      return false;
    }
    return true;
  }

  static async fetchApprovedGuardians(): Promise<GuardianLink[]> {
    const profile = await this.requireProfile();
    if (!profile) return [];
    const { data, error } = await supabase!
      .from('guardian_links')
      .select('id, patient_user_id, guardian_user_id, patient_code, guardian_code, guardian_name, status, created_at')
      .eq('patient_user_id', profile.user_id)
      .eq('status', 'approved');
    if (error) {
      console.warn('Unable to load approved guardians', error);
      return [];
    }
    return (data || []) as GuardianLink[];
  }

  static async fetchMonitoredPatients(): Promise<MonitoredPatient[]> {
    const profile = await this.requireProfile();
    if (!profile) return [];

    const { data: links, error: linksError } = await supabase!
      .from('guardian_links')
      .select('id, patient_user_id, patient_code, guardian_name, status')
      .eq('guardian_user_id', profile.user_id)
      .eq('status', 'approved');
    if (linksError || !links?.length) return [];

    const { data: feed } = await supabase!
      .from('guardian_dose_feed')
      .select('id, patient_user_id, med_name, dose_qty, scheduled_time, status, adherence_pct, updated_at')
      .in('patient_user_id', links.map((link) => (link as { patient_user_id?: string }).patient_user_id).filter(Boolean))
      .order('updated_at', { ascending: false });

    return links.map((link) => {
      const patientFeed = (feed || []).filter((row) =>
        row.patient_user_id === link.patient_user_id
      );
      return {
        id: link.id,
        name: `Patient ${link.patient_code}`,
        code: link.patient_code,
        relation: link.guardian_name || 'Guardian',
        adherence: patientFeed[0]?.adherence_pct || 0,
        lastSync: 'Synced',
        status: 'on_track' as const,
        meds: patientFeed.slice(0, 4).map((row) => ({
          name: row.med_name,
          qty: row.dose_qty,
          time: row.scheduled_time,
          status: row.status === 'taken' ? 'taken' as const : row.status === 'missed' ? 'missed_1h' as const : 'upcoming' as const,
        })),
      };
    });
  }

  static async pushDoseCompletion(options: {
    medName: string;
    doseQty: string;
    scheduledTime: string;
    status: 'taken' | 'missed' | 'upcoming';
    adherencePct: number;
  }): Promise<void> {
    const payload = { ...options, updated_at: new Date().toISOString() };
    if (!this.syncEnabled || !supabase) {
      this.offlineQueue.push({ type: 'dose', data: payload });
      return;
    }
    const profile = await this.requireProfile();
    if (!profile) {
      this.offlineQueue.push({ type: 'dose', data: payload });
      return;
    }
    const { error } = await supabase.from('guardian_dose_feed').insert({
      patient_user_id: profile.user_id,
      med_name: options.medName,
      dose_qty: options.doseQty,
      scheduled_time: options.scheduledTime,
      status: options.status,
      adherence_pct: options.adherencePct,
      updated_at: payload.updated_at,
    });
    if (error) {
      this.offlineQueue.push({ type: 'dose', data: payload });
      console.warn('Failed to sync Guardian dose feed', error);
    }
  }

  static async pushMissedDoseAlert(alert: GuardianAlert): Promise<void> {
    const payload = { alert };
    if (!this.syncEnabled || !supabase) {
      this.offlineQueue.push({ type: 'alert', data: payload });
      return;
    }
    const profile = await this.requireProfile();
    if (!profile) {
      this.offlineQueue.push({ type: 'alert', data: payload });
      return;
    }
    const { error } = await supabase.from('guardian_alerts').insert({
      patient_user_id: profile.user_id,
      patient_name: alert.patientName,
      med_name: alert.medName,
      scheduled_time: alert.scheduledTime,
      overdue_by: alert.overdueBy,
      acknowledged: false,
    });
    if (error) {
      this.offlineQueue.push({ type: 'alert', data: payload });
      console.warn('Failed to sync Guardian alert', error);
    }
  }

  static async acknowledgeAlert(alertId: string): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase.from('guardian_alerts')
      .update({ acknowledged: true })
      .eq('id', alertId);
    if (error) {
      console.warn('Failed to acknowledge Guardian alert', error);
      return false;
    }
    return true;
  }

  static async flushOfflineQueue(): Promise<void> {
    const queue = [...this.offlineQueue];
    this.offlineQueue = [];
    for (const item of queue) {
      if (item.type === 'dose') {
        await this.pushDoseCompletion(item.data as Parameters<typeof this.pushDoseCompletion>[0]);
      } else {
        const { alert } = item.data as { alert: GuardianAlert };
        await this.pushMissedDoseAlert(alert);
      }
    }
  }

  static toggleSync(enabled: boolean): void {
    this.syncEnabled = enabled;
  }

  static isSyncEnabled(): boolean {
    return this.syncEnabled;
  }

  private static async updateOwnedLink(linkId: string, status: GuardianLinkStatus): Promise<boolean> {
    const profile = await this.requireProfile();
    if (!profile) return false;
    const { error } = await supabase!
      .from('guardian_links')
      .update({ status })
      .eq('id', linkId)
      .eq('patient_user_id', profile.user_id)
      .eq('status', 'pending');
    if (error) {
      console.warn('Unable to approve Guardian request', error);
      return false;
    }
    return true;
  }

  private static async requireProfile(): Promise<GuardianProfile | null> {
    if (!supabase) return null;
    if (this.profile) return this.profile;
    this.profile = await this.ensureProfile();
    return this.profile;
  }

  private static async ensureProfile(): Promise<GuardianProfile | null> {
    const { data: userData, error: userError } = await supabase!.auth.getUser();
    if (userError || !userData.user) return null;

    const { data: existing } = await supabase!
      .from('guardian_profiles')
      .select('user_id, patient_code, display_name, sync_enabled')
      .eq('user_id', userData.user.id)
      .maybeSingle();
    if (existing) return existing as GuardianProfile;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const suffix = crypto.getRandomValues(new Uint8Array(4))
        .reduce((value, byte) => value + byte.toString(16).padStart(2, '0'), '')
        .toUpperCase();
      const candidate = `MED-${suffix}`;
      const { data, error } = await supabase!
        .from('guardian_profiles')
        .insert({
          user_id: userData.user.id,
          patient_code: candidate,
          display_name: '',
          sync_enabled: true,
        })
        .select('user_id, patient_code, display_name, sync_enabled')
        .single();
      if (!error && data) return data as GuardianProfile;
      if (!error?.message.includes('duplicate')) throw error;
    }
    return null;
  }
}
