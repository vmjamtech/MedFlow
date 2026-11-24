/**
 * Opt-in Guardian sync backed by Supabase.
 * Pending links have no access to dose or alert data; RLS checks approval server-side.
 */

import { createClient } from '@supabase/supabase-js';
import type { Dose, GuardianAlert, Medication, MonitoredPatient } from '../db/schema';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
const PATIENT_CODE_KEY = 'medflow_patient_code';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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
  private static doseFeedSyncPromise: Promise<boolean> | null = null;

  static async init(): Promise<boolean> {
    if (!supabase) {
      console.warn('Guardian Sync disabled: Supabase credentials not configured');
      return false;
    }

    try {
      if (!navigator.onLine) {
        return false;
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      if (!sessionData.session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
      }

      const { data: currentSession, error: currentSessionError } = await supabase.auth.getSession();
      if (currentSessionError || !currentSession.session) {
        throw currentSessionError || new Error('Anonymous Supabase session unavailable');
      }

      this.profile = await this.ensureProfile(currentSession.session.user.id);
      if (this.profile) {
        localStorage.setItem(PATIENT_CODE_KEY, this.profile.patient_code);
      }
      return this.profile !== null;
    } catch (error) {
      console.warn('Guardian Sync init failed; using offline local-only mode', error);
      return false;
    }
  }

  static getProfile(): GuardianProfile | null {
    return this.profile;
  }

  static getEscalationEnabled(): boolean {
    return this.profile?.sync_enabled ?? false;
  }

  static async setEscalationEnabled(enabled: boolean): Promise<boolean> {
    localStorage.setItem('medflow_escalate_missed_meds', String(enabled));
    const profile = await this.requireProfile();
    if (!profile) return !navigator.onLine || !this.isConfigured();
    const { data, error } = await supabase!
      .from('guardian_profiles')
      .update({ sync_enabled: enabled })
      .eq('user_id', profile.user_id)
      .select('user_id, patient_code, display_name, sync_enabled')
      .single();
    if (error) {
      console.error('Unable to update missed-dose escalation setting', error);
      return false;
    }
    this.profile = data as GuardianProfile;
    return true;
  }

  static isOnline(): boolean {
    return Boolean(this.profile && supabase && navigator.onLine);
  }

  static isConfigured(): boolean {
    return Boolean(supabase);
  }

  static getOrCreateLocalPatientCode(): string {
    const existing = localStorage.getItem(PATIENT_CODE_KEY);
    if (existing && /^MED-[A-HJ-NP-Z2-9]{8}$/.test(existing)) return existing;
    const generated = this.generatePatientCode();
    localStorage.setItem(PATIENT_CODE_KEY, generated);
    return generated;
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
    if (!/^MED-[A-HJ-NP-Z2-9]{8}$/.test(normalizedCode)) {
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

  static async fetchPendingRequests(): Promise<GuardianLink[]> {
    const profile = await this.requireProfile();
    if (!profile) return [];
    const { data, error } = await supabase!
      .from('guardian_links')
      .select('id, patient_user_id, guardian_user_id, patient_code, guardian_code, guardian_name, status, created_at')
      .eq('guardian_user_id', profile.user_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('Unable to load outgoing Guardian requests', error);
      return [];
    }
    const requests = (data || []) as GuardianLink[];
    const names = await this.fetchProfileNames(requests.map((request) => request.patient_user_id));
    return requests.map((request) => ({
      ...request,
      guardian_name: names.get(request.patient_user_id) || request.guardian_name,
    }));
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
    const names = await this.fetchProfileNames(links.map((link) => link.patient_user_id));

    return links.map((link) => {
      const patientFeed = (feed || []).filter((row) =>
        row.patient_user_id === link.patient_user_id
      );
      const latestAdherence = patientFeed.find(
        (row) => typeof row.adherence_pct === 'number'
      )?.adherence_pct;
      return {
        id: link.id,
        name: names.get(link.patient_user_id) || link.patient_code,
        code: link.patient_code,
        relation: link.guardian_name || 'Guardian',
        adherence: Number(latestAdherence || 0),
        lastSync: 'Synced',
        status: 'on_track' as const,
        meds: patientFeed.map((row) => ({
          name: row.med_name,
          qty: row.dose_qty,
          time: row.scheduled_time,
          status: row.status === 'taken' ? 'taken' as const : row.status === 'missed_1h' ? 'missed_1h' as const : 'upcoming' as const,
          takenAt: row.status === 'taken' ? row.scheduled_time : undefined,
          takenCount: row.status === 'taken' ? 1 : 0,
        })),
      };
    });
  }

  static async syncPatientDoseFeedToSupabase(
    medications: Medication[],
    doses: Dose[]
  ): Promise<boolean> {
    if (this.doseFeedSyncPromise) return this.doseFeedSyncPromise;
    this.doseFeedSyncPromise = this.performPatientDoseFeedSync(medications, doses);
    try {
      return await this.doseFeedSyncPromise;
    } finally {
      this.doseFeedSyncPromise = null;
    }
  }

  private static async performPatientDoseFeedSync(
    medications: Medication[],
    doses: Dose[]
  ): Promise<boolean> {
    if (!this.syncEnabled || !supabase || !navigator.onLine) {
      console.warn('Guardian dose feed sync skipped', {
        syncEnabled: this.syncEnabled,
        configured: Boolean(supabase),
        online: navigator.onLine,
      });
      return false;
    }
    const profile = await this.requireProfile();
    if (!profile) {
      console.error('Guardian dose feed sync failed: no authenticated profile');
      return false;
    }

    const medicationById = new Map(medications.map((medication) => [medication.id, medication]));
    const scheduledDoses = doses.filter((dose) => medicationById.has(dose.medId));
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const taken = scheduledDoses.filter((dose) => dose.status === 'taken').length;
    const adherencePct = scheduledDoses.length
      ? Math.round((taken / scheduledDoses.length) * 10000) / 100
      : 0;
    const updatedAt = new Date().toISOString();
    const rows: Array<{
      patient_user_id: string;
      med_name: string;
      dose_qty: string;
      scheduled_time: string;
      status: string;
      adherence_pct: number;
      updated_at: string;
    }> = [];

    for (const dose of scheduledDoses) {
      const medication = medicationById.get(dose.medId)!;
      rows.push({
        patient_user_id: profile.user_id,
        med_name: `${medication.name} ${medication.strength}`.trim(),
        dose_qty: `${medication.doseQty} ${medication.unit}`,
        scheduled_time: this.formatScheduledTime(dose.scheduledMinutes),
        status: dose.status === 'taken'
          ? 'taken'
          : dose.status === 'missed' || nowMinutes - dose.scheduledMinutes >= 60
          ? 'missed_1h'
          : 'upcoming',
        adherence_pct: adherencePct,
        updated_at: updatedAt,
      });
    }

    for (const medication of medications.filter((item) => item.scheduleType === 'prn')) {
      rows.push({
        patient_user_id: profile.user_id,
        med_name: `${medication.name} ${medication.strength}`.trim(),
        dose_qty: `${medication.doseQty} ${medication.unit}`,
        scheduled_time: 'As needed',
        status: (medication.takenTodayCount || 0) > 0 ? 'taken' : 'upcoming',
        adherence_pct: adherencePct,
        updated_at: updatedAt,
      });
    }

    for (const medication of medications.filter(
      (item) => item.scheduleType !== 'prn' &&
        !scheduledDoses.some((dose) => dose.medId === item.id)
    )) {
      rows.push({
        patient_user_id: profile.user_id,
        med_name: `${medication.name} ${medication.strength}`.trim(),
        dose_qty: `${medication.doseQty} ${medication.unit}`,
        scheduled_time: 'As Needed',
        status: 'upcoming',
        adherence_pct: adherencePct,
        updated_at: updatedAt,
      });
    }

    const { error: deleteError } = await supabase!
      .from('guardian_dose_feed')
      .delete()
      .eq('patient_user_id', profile.user_id);
    if (deleteError) {
      console.error('Guardian dose feed delete failed', {
        operation: 'delete-current-feed',
        patientUserId: profile.user_id,
        error: deleteError,
      });
      return false;
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabase!
        .from('guardian_dose_feed')
        .insert(rows);
      if (insertError) {
        console.error('Guardian dose feed insert failed', {
          operation: 'insert-current-feed',
          patientUserId: profile.user_id,
          rowCount: rows.length,
          error: insertError,
        });
        return false;
      }
    }
    return true;
  }

  static async evaluateAndEscalateMissedDoses(
    medications: Medication[],
    doses: Dose[],
    currentMinutes: number
  ): Promise<GuardianAlert[]> {
    if (!this.syncEnabled || !this.isOnline() || !this.getEscalationEnabled()) return [];
    const profile = this.profile!;
    const medicationById = new Map(medications.map((medication) => [medication.id, medication]));
    const today = new Date().toISOString().slice(0, 10);
    const { data: existingRows, error: existingError } = await supabase!
      .from('guardian_alerts')
      .select('med_name, scheduled_time')
      .eq('patient_user_id', profile.user_id)
      .eq('acknowledged', false)
      .gte('created_at', `${today}T00:00:00.000Z`)
      .lte('created_at', `${today}T23:59:59.999Z`);
    if (existingError) {
      console.error('Own missed-dose alert lookup failed', {
        operation: 'evaluate-missed-doses',
        patientUserId: profile.user_id,
        error: existingError,
      });
      return [];
    }
    const existingAlerts = (existingRows || []).map((row) => ({
      medName: row.med_name,
      scheduledTime: row.scheduled_time,
    }));
    const existingSignatures = new Set(
      existingAlerts.map((alert) =>
        `${alert.medName}|${alert.scheduledTime}`
      )
    );
    const sentKeys = new Set<string>(
      JSON.parse(localStorage.getItem('medflow_guardian_alerts_sent') || '[]')
    );
    const inserted: GuardianAlert[] = [];

    for (const dose of doses) {
      if (dose.status !== 'pending') continue;
      const overdueMinutes = currentMinutes - dose.scheduledMinutes;
      if (overdueMinutes < 60) continue;

      const medication = medicationById.get(dose.medId);
      if (!medication) continue;
      const medName = `${medication.name} ${medication.strength}`.trim();
      const scheduledTime = this.formatScheduledTime(dose.scheduledMinutes);
      const signature = `${medName}|${scheduledTime}`;
      const sentKey = `${today}:${dose.id}`;
      if (sentKeys.has(sentKey) || existingSignatures.has(signature)) continue;

      const alert: GuardianAlert = {
        id: sentKey,
        patientName: profile.display_name || profile.patient_code,
        medName,
        scheduledTime,
        overdueBy: `${this.formatDuration(overdueMinutes)} past window`,
        acknowledged: false,
      };
      const alertId = await this.pushMissedDoseAlert(alert);
      if (!alertId) continue;
      sentKeys.add(sentKey);
      existingSignatures.add(signature);
      inserted.push({ ...alert, id: alertId });
    }

    localStorage.setItem(
      'medflow_guardian_alerts_sent',
      JSON.stringify([...sentKeys])
    );
    return inserted;
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

  static async pushMissedDoseAlert(alert: GuardianAlert): Promise<string | null> {
    const payload = { alert };
    if (!this.syncEnabled || !supabase) {
      this.offlineQueue.push({ type: 'alert', data: payload });
      return null;
    }
    const profile = await this.requireProfile();
    if (!profile) {
      this.offlineQueue.push({ type: 'alert', data: payload });
      return null;
    }
    const { data, error } = await supabase
      .from('guardian_alerts')
      .insert({
        patient_user_id: profile.user_id,
        patient_name: alert.patientName,
        med_name: alert.medName,
        scheduled_time: alert.scheduledTime,
        overdue_by: alert.overdueBy,
        acknowledged: false,
      })
      .select('id')
      .single();
    if (error) {
      this.offlineQueue.push({ type: 'alert', data: payload });
      console.error('Guardian alert insert failed', {
        operation: 'insert-missed-dose-alert',
        patientUserId: profile.user_id,
        alert,
        error,
      });
      return null;
    }
    return data.id as string;
  }

  static async fetchGuardianAlerts(): Promise<GuardianAlert[]> {
    const profile = await this.requireProfile();
    if (!profile) return [];
    const { data: links, error: linksError } = await supabase!
      .from('guardian_links')
      .select('patient_user_id')
      .eq('guardian_user_id', profile.user_id)
      .eq('status', 'approved');
    if (linksError) {
      console.error('Guardian approved-link fetch failed for alerts', {
        operation: 'fetch-alert-links',
        patientUserId: profile.user_id,
        error: linksError,
      });
      return [];
    }
    const patientUserIds = [
      ...new Set(
        (links || [])
          .map((link) => link.patient_user_id)
          .filter((userId) => userId && userId !== profile.user_id)
      ),
    ];
    if (patientUserIds.length === 0) return [];

    const { data, error } = await supabase!
      .from('guardian_alerts')
      .select('id, patient_name, med_name, scheduled_time, overdue_by, acknowledged')
      .in('patient_user_id', patientUserIds)
      .eq('acknowledged', false)
      .order('id', { ascending: false });
    if (error) {
      console.error('Guardian alert fetch failed', {
        operation: 'fetch-alerts',
        patientUserId: profile.user_id,
        error,
      });
      return [];
    }
    return (data || []).map((row) => ({
      id: row.id,
      patientName: row.patient_name,
      medName: row.med_name,
      scheduledTime: row.scheduled_time,
      overdueBy: row.overdue_by,
      acknowledged: row.acknowledged,
    }));
  }

  static async acknowledgeAlert(alertId: string): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase.from('guardian_alerts')
      .update({ acknowledged: true })
      .eq('id', alertId);
    if (error) {
      console.error('Guardian alert acknowledgement failed', {
        operation: 'acknowledge-alert',
        alertId,
        error,
      });
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
    const initialized = await this.init();
    return initialized ? this.profile : null;
  }

  private static async fetchProfileNames(userIds: string[]): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    if (!uniqueIds.length) return new Map();
    const { data, error } = await supabase!.rpc('guardian_profile_summaries', {
      requested_user_ids: uniqueIds,
    });
    if (error) {
      console.warn('Unable to load linked Guardian profile names', error);
      return new Map();
    }
    return new Map(
      (data || []).map((profile: { user_id: string; display_name?: string; patient_code: string }) => [
        profile.user_id,
        profile.display_name || profile.patient_code,
      ])
    );
  }

  private static formatScheduledTime(minutes: number): string {
    const capped = Math.max(0, Math.min(1439, minutes));
    const hours = Math.floor(capped / 60);
    const mins = capped % 60;
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    return `${String(displayHour).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${suffix}`;
  }

  private static formatDuration(minutes: number): string {
    const capped = Math.max(60, Math.min(1439, minutes));
    const hours = Math.floor(capped / 60);
    const remainder = capped % 60;
    return `${hours}h ${String(remainder).padStart(2, '0')}m`;
  }

  private static async ensureProfile(userId: string): Promise<GuardianProfile | null> {
    const { data: existing, error: existingError } = await supabase!
      .from('guardian_profiles')
      .select('user_id, patient_code, display_name, sync_enabled')
      .eq('user_id', userId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return existing as GuardianProfile;

    const locallyStored = localStorage.getItem(PATIENT_CODE_KEY);
    const candidates = locallyStored ? [locallyStored] : [];
    while (candidates.length < 12) candidates.push(this.generatePatientCode());

    for (const candidate of candidates) {
      const { data, error } = await supabase!
        .from('guardian_profiles')
        .insert({
          user_id: userId,
          patient_code: candidate,
          display_name: '',
          sync_enabled: true,
        })
        .select('user_id, patient_code, display_name, sync_enabled')
        .single();
      if (!error && data) return data as GuardianProfile;
      if (error?.code === '42501') {
        const { data: registered, error: registrationError } = await supabase!
          .rpc('register_guardian_profile', {
            requested_patient_code: candidate,
          });
        if (registrationError) throw registrationError;
        if (registered) return registered as GuardianProfile;
        throw error;
      }
      if (error && error.code !== '23505') throw error;

      const { data: concurrentProfile } = await supabase!
        .from('guardian_profiles')
        .select('user_id, patient_code, display_name, sync_enabled')
        .eq('user_id', userId)
        .maybeSingle();
      if (concurrentProfile) return concurrentProfile as GuardianProfile;
    }
    return null;
  }

  private static generatePatientCode(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const suffix = Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
    return `MED-${suffix}`;
  }
}
