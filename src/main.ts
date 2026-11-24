/**
 * MedFlow Main Application — Complete 5-Tab Medication & Vitals Management
 * 100% offline-first with optional Guardian family monitoring
 * This replicates the prototype/index.html functionality exactly
 */

import './index.css';
import { Capacitor } from '@capacitor/core';
import { db } from './db/database';
import type { Medication, Dose, VitalLog, IntakeHistory } from './db/schema';
import { SchedulerService } from './services/scheduler';
import { GuardianSyncService } from './services/guardianSync';
import { getVitalStatus } from './utils/clinical';
import { renderPillSVG, getPillBgClass } from './utils/pillSvg';

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// ==========================================
// STATE & INITIALIZATION
// ==========================================

interface AppState {
  currentTab: 'today' | 'vitals' | 'cabinet' | 'guardian' | 'report';
  medications: Medication[];
  doses: Dose[];
  vitalLogs: VitalLog[];
  intakeHistory: IntakeHistory[];
  myPatientCode: string;
  myPatientName: string;
  guardianSyncEnabled: boolean;
  guardianSubView: 'monitoring' | 'mycode';
  glucoseUnit: 'mg/dL' | 'mmol/L';
  vitalsHistoryFilter: 'all' | 'bp' | 'sugar' | 'pulse' | 'other';
  vitalsViewMode: 'cards' | 'printable';
  vitalsDateFrom: string;
  vitalsDateTo: string;
  reportDateFrom: string;
  reportDateTo: string;
  showMorningBanner: boolean;
  escalateMissedMeds: boolean;
}

let state: AppState = {
  currentTab: 'today',
  medications: [],
  doses: [],
  vitalLogs: [],
  intakeHistory: [],
  myPatientCode: localStorage.getItem('medflow_patient_code') || '',
  myPatientName: '',
  guardianSyncEnabled: true,
  guardianSubView: 'monitoring',
  glucoseUnit: 'mg/dL',
  vitalsHistoryFilter: 'all',
  vitalsViewMode: 'cards',
  vitalsDateFrom: '2026-11-12',
  vitalsDateTo: '2026-11-18',
  reportDateFrom: '',
  reportDateTo: '',
  showMorningBanner: true,
  escalateMissedMeds: localStorage.getItem('medflow_escalate_missed_meds') !== 'false',
};

let prnTimerInterval: NodeJS.Timeout | null = null;
let guardianAlerts: Array<any> = [];
let monitoredPatients: Array<any> = [];
let linkingPatientCode: string | null = null;
let linkingPatientFound: any = null;
let patientCodeLookup: Record<string, any> = {};
let calendarTargetField: string | null = null; // Track which field is being edited
let calendarDisplayDate: string = '2026-11-18'; // Current month being displayed
let guardianEvaluationInterval: number | null = null;

function toRuntimeGuardianLink(link: {
  id: string;
  patient_code: string;
  guardian_code: string;
  guardian_name: string;
  status: 'pending' | 'approved' | 'revoked';
  created_at?: string;
}) {
  return {
    id: link.id,
    patientCode: link.patient_code,
    guardianCode: link.guardian_code,
    guardianName: link.guardian_name,
    status: link.status,
    timestamp: link.created_at || new Date().toISOString(),
  };
}

async function initializeGuardianSyncState() {
  (state as any).guardianOnline = await GuardianSyncService.init();
  (state as any).guardianDemoMode =
    !GuardianSyncService.isConfigured() || !navigator.onLine;
  if ((state as any).guardianOnline) {
    const profile = GuardianSyncService.getProfile();
    if (profile) {
      state.myPatientCode = profile.patient_code;
      state.myPatientName = profile.display_name || localStorage.getItem('medflow_myPatientName') || '';
      state.escalateMissedMeds = profile.sync_enabled;
      localStorage.setItem('medflow_escalate_missed_meds', String(profile.sync_enabled));
      localStorage.setItem('medflow_patient_code', profile.patient_code);
    }
    await refreshGuardianSyncState();
  } else {
    state.myPatientCode = GuardianSyncService.getOrCreateLocalPatientCode();
  }
}

async function refreshGuardianSyncState() {
  if (!GuardianSyncService.isOnline()) return;
  const previouslyPendingIds = new Set(
    ((state as any).pendingLinkRequests || []).map((request: any) => request.id)
  );
  const pushed = await syncCurrentGuardianDoseFeed();
  if (!pushed) {
    console.warn('Guardian refresh continued without a successful local dose feed push');
  }
  await syncOverdueGuardianAlerts();
  const [incoming, approved, pending, monitored, alerts] = await Promise.all([
    GuardianSyncService.fetchIncomingRequests(),
    GuardianSyncService.fetchApprovedGuardians(),
    GuardianSyncService.fetchPendingRequests(),
    GuardianSyncService.fetchMonitoredPatients(),
    GuardianSyncService.fetchGuardianAlerts(),
  ]);
  if (monitored.some((patient) => patient.meds.length === 0)) {
    console.warn('Guardian feed refresh retained a patient with no dose rows; retrying once', {
      patientCount: monitored.length,
    });
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    const retryMonitored = await GuardianSyncService.fetchMonitoredPatients();
    monitored.splice(0, monitored.length, ...retryMonitored);
  }
  const previousPatients = new Map(
    (((state as any).monitoredPatients || []) as any[]).map((patient) => [patient.id, patient])
  );
  const mergedMonitored = monitored.map((patient) => {
    const previous = previousPatients.get(patient.id);
    if (patient.meds.length === 0 && previous?.meds?.length > 0) {
      return {
        ...patient,
        adherence: previous.adherence,
        meds: previous.meds,
      };
    }
    return patient;
  });
  (state as any).incomingRequests = incoming.map(toRuntimeGuardianLink);
  (state as any).approvedGuardians = approved.map(toRuntimeGuardianLink);
  (state as any).pendingLinkRequests = pending.map(toRuntimeGuardianLink);
  const nicknames = JSON.parse(localStorage.getItem('medflow_guardian_nicknames') || '{}');
  (state as any).monitoredPatients = mergedMonitored.map((patient) => ({
    ...patient,
    nickname: nicknames[patient.id] || undefined,
  }));
  guardianAlerts = alerts;
  (state as any).guardianAlerts = alerts;
  (window as any).secureMonitoredPatients = mergedMonitored.map((patient) => ({
    id: patient.id,
    patientName: patient.name,
    patientCode: patient.code,
    status: 'approved',
    guardianName: patient.relation,
    adherence: patient.adherence,
    lastSync: patient.lastSync === 'Synced' ? 'just now' : patient.lastSync.replace(/^Synced\s+/i, ''),
    meds: patient.meds.map((med: { name: string; qty: string; time: string; status: string; takenAt?: string; takenCount?: number }) => ({
      name: `${med.name} ${med.qty}`.trim(),
      time: med.time,
      status: med.status,
      takenAt: med.takenAt,
      takenCount: med.takenCount,
    })),
  }));
  if (state.currentTab === 'guardian') {
    (window as any).renderRestoredGuardian?.();
  }
  const newlyApproved = mergedMonitored.find((patient) => previouslyPendingIds.has(patient.id));
  if (newlyApproved) {
    window.setTimeout(() => {
      (window as any).promptPatientNickname?.(newlyApproved.id, true);
    }, 50);
  }
  updateGuardianAlertDot();
}

async function syncCurrentGuardianDoseFeed() {
  if (!GuardianSyncService.isOnline() || !state.guardianSyncEnabled) return false;
  const [medications, doses] = await Promise.all([
    db.getMedications(),
    db.getDoses(),
  ]);
  return GuardianSyncService.syncPatientDoseFeedToSupabase(
    medications,
    doses
  );
}

async function syncOverdueGuardianAlerts() {
  const now = new Date();
  await GuardianSyncService.evaluateAndEscalateMissedDoses(
    state.medications,
    state.doses,
    now.getHours() * 60 + now.getMinutes()
  );
}

// ==========================================
// INITIALIZATION
// ==========================================

function createShell() {
  const app = document.getElementById('app');
  if (!app) {
    console.error('❌ #app container not found!');
    return;
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
  const dayStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const demoControls = import.meta.env.DEV ? `
    <div class="w-full max-w-md mb-2 flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm">
      <div class="min-w-0">
        <p class="text-[10px] font-black uppercase tracking-wider text-teal-700">Interactive Demo Controls</p>
        <p class="text-[9px] text-slate-500">Development only</p>
      </div>
      <button onclick="triggerLockScreenNotification('MedFlow missed-dose alert', 'Medication is overdue by at least one hour')" class="shrink-0 rounded-xl bg-teal-600 px-3 py-2 text-[10px] font-bold text-white shadow-sm">🔔 Test Missed Alert</button>
      <button onclick="resetDemoData()" class="shrink-0 rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-700">Reset Data</button>
    </div>
  ` : '';

  app.innerHTML = `
    <div class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center justify-start p-2">
    ${demoControls}
    <div class="${import.meta.env.DEV ? 'h-[calc(100dvh-4.25rem)]' : 'h-[100dvh]'} w-full max-w-md mx-auto flex flex-col overflow-hidden bg-slate-50 relative shadow-xl rounded-none md:rounded-3xl">
        
        <!-- Header with Time & Date (Pinned Top, Safe-Area Aware) -->
        <header class="shrink-0 bg-white border-b border-slate-200/60 shadow-sm" style="padding-top: max(0.75rem, env(safe-area-inset-top));">
          <div class="px-5 py-4 flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-1.5 mb-0.5">
                <span class="text-sm font-black text-slate-900">${timeStr}</span>
                <span class="text-xs font-semibold text-slate-500">•</span>
                <span class="text-xs font-semibold text-slate-600">${dayStr}</span>
              </div>
              <h1 id="header-title" class="text-lg font-black text-slate-900 tracking-tight">Today's Regimen</h1>
            </div>
            <div class="text-right flex-shrink-0">
              <span id="adherence-pill" class="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-xs font-bold px-2.5 py-1.5 rounded-full border border-emerald-300">
                <span class="text-green-600">✓</span>
                <span id="adherence-count">0/0</span>
              </span>
            </div>
          </div>
        </header>

        <!-- Main Content (Sole Scrollable Region) -->
        <main class="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide phone-scroll px-4 pt-4 pb-28" data-pull-scroll>
          <div id="pull-refresh-indicator" class="pull-refresh-indicator" aria-live="polite">↓ Pull to refresh</div>
          <div id="main-content" class="space-y-4 w-full"></div>
        </main>

        <!-- Floating Add Button (Safe-Area Offset) -->
        <button onclick="openAddMedModal()" class="fixed z-25 bg-teal-500 hover:bg-teal-600 active:bg-teal-700 text-white rounded-full shadow-lg shadow-teal-500/30 flex items-center justify-center text-3xl active:scale-90 transition duration-200 font-bold border-0" style="bottom: calc(5rem + max(0.5rem, env(safe-area-inset-bottom))); right: 1.25rem; width: 4rem; height: 4rem;" title="Add Medication">
          +
        </button>

        <!-- Toast Container -->
        <div id="toast-container" class="fixed bottom-32 left-0 right-0 flex flex-col gap-2 items-center pointer-events-none z-40 px-4 max-w-md mx-auto left-1/2 transform -translate-x-1/2"></div>

        <!-- Bottom Navigation (Pinned Bottom, Safe-Area Aware) -->
        <nav class="shrink-0 z-30 bg-white border-t border-slate-200/60 flex justify-around items-center h-20 shadow-lg shadow-slate-900/5" style="padding-bottom: max(0.5rem, env(safe-area-inset-bottom));">
          <button data-tab="today" onclick="switchTab('today')" class="nav-btn flex flex-col items-center justify-center gap-1.5 py-3 text-teal-600 transition hover:bg-slate-50 flex-1 group">
            <span class="text-2xl group-hover:scale-110 transition">📋</span>
            <span class="text-[11px] font-bold">Today</span>
          </button>
          <button data-tab="vitals" onclick="switchTab('vitals')" class="nav-btn flex flex-col items-center justify-center gap-1.5 py-3 text-slate-400 hover:text-slate-600 transition hover:bg-slate-50 flex-1 group">
            <span class="text-2xl group-hover:scale-110 transition">📊</span>
            <span class="text-[11px] font-bold">Vitals</span>
          </button>
          <button data-tab="cabinet" onclick="switchTab('cabinet')" class="nav-btn flex flex-col items-center justify-center gap-1.5 py-3 text-slate-400 hover:text-slate-600 transition hover:bg-slate-50 flex-1 relative group">
            <span class="text-2xl group-hover:scale-110 transition">💊</span>
            <span id="low-stock-dot" class="hidden absolute top-2 right-2 w-2.5 h-2.5 bg-rose-500 rounded-full border border-white shadow-sm"></span>
            <span class="text-[11px] font-bold">Cabinet</span>
          </button>
          <button data-tab="guardian" onclick="switchTab('guardian')" class="nav-btn flex flex-col items-center justify-center gap-1.5 py-3 text-slate-400 hover:text-slate-600 transition hover:bg-slate-50 flex-1 relative group">
            <span class="text-2xl group-hover:scale-110 transition">🛡️</span>
            <span id="guardian-alert-dot" class="hidden absolute top-2 right-2 w-2.5 h-2.5 bg-rose-500 rounded-full border border-white shadow-sm"></span>
            <span class="text-[11px] font-bold">Guardian</span>
          </button>
          <button data-tab="report" onclick="switchTab('report')" class="nav-btn flex flex-col items-center justify-center gap-1.5 py-3 text-slate-400 hover:text-slate-600 transition hover:bg-slate-50 flex-1 group">
            <span class="text-2xl group-hover:scale-110 transition">📄</span>
            <span class="text-[11px] font-bold">Report</span>
          </button>
        </nav>

        <!-- Modal Backdrop -->
        <div id="modal-backdrop" class="hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end" onclick="if(event.target === this) closeModal()">
          <div class="w-full max-w-md mx-auto bg-white rounded-t-3xl max-h-[88vh] overflow-y-auto p-6 pb-8 shadow-2xl">
            <div id="modal-title" class="text-2xl font-black text-slate-900 mb-1"></div>
            <div id="modal-subtitle" class="text-xs font-medium text-slate-500 mb-6 uppercase tracking-wide"></div>
            <div id="modal-body"></div>
          </div>
        </div>
      </div>
    </div>
    </div>
  `;

  setupPullToRefresh();
  console.log('✓ Shell created with refined mobile layout');
}

async function initializeApp() {
  try {
    // Ensure DOM is ready before creating shell
    if (!document.getElementById('app')) {
      setTimeout(() => initializeApp(), 100);
      return;
    }

    createShell();
    
    await db.init();
    console.log('✓ Database initialized');

    const existing = await db.getMedications();
    if (existing.length === 0) {
      await seedSampleData();
      console.log('✓ Sample data seeded');
    }

    state.medications = await db.getMedications();
    state.doses = await db.getDoses();
    state.vitalLogs = await db.getVitalLogs();
    state.intakeHistory = await db.getIntakeHistory(100);
    await reconcileMissingMedicationSchedules();
    await initializeGuardianSyncState();
    startGuardianEvaluationInterval();

    monitoredPatients = [
      {
        id: 'pat-mom',
        patientName: 'Elena R.',
        guardianId: 'Mother',
        code: 'MED-3104',
        adherence: 96,
        lastSync: '2 mins ago',
        status: 'on_track',
        meds: [
          { name: 'Losartan 50mg', qty: '1 tablet', time: '08:00 AM', status: 'taken' },
          { name: 'Atorvastatin 20mg', qty: '1 tablet', time: '08:00 PM', status: 'upcoming' }
        ]
      },
      {
        id: 'pat-dad',
        patientName: 'Roberto R.',
        guardianId: 'Father',
        code: 'MED-9921',
        adherence: 84,
        lastSync: 'Just now',
        status: 'overdue',
        meds: [
          { name: 'Insulin Glargine', qty: '12 units', time: '07:00 AM', status: 'missed_1h' },
          { name: 'Metformin 500mg', qty: '1 tablet', time: '12:30 PM', status: 'upcoming' }
        ]
      }
    ];

    // Create lookup map for patient codes
    patientCodeLookup = {};
    for (const patient of monitoredPatients) {
      patientCodeLookup[patient.code] = patient;
    }
    guardianAlerts = [
      {
        id: 'galert-1',
        patientName: 'Dad (Roberto R.)',
        medName: 'Insulin Glargine',
        medStrength: '12 units',
        doseQty: 12,
        unit: 'units',
        scheduledTime: '07:00 AM',
        overdueBy: '11h 05m past window',
        acknowledged: false
      }
    ];

    console.log('✓ App initialized');
    renderApp();
  } catch (error) {
    console.error('❌ Init failed:', error);
  }
}

function startGuardianEvaluationInterval() {
  if (guardianEvaluationInterval !== null) {
    window.clearInterval(guardianEvaluationInterval);
  }
  guardianEvaluationInterval = window.setInterval(() => {
    void syncOverdueGuardianAlerts().then(() => updateGuardianAlertDot());
  }, 60_000);
}

function setupPullToRefresh() {
  const scrollContainer = document.querySelector<HTMLElement>('[data-pull-scroll]');
  const indicator = document.getElementById('pull-refresh-indicator');
  if (!scrollContainer || !indicator) return;

  let startY: number | null = null;
  let pullDistance = 0;
  let dragging = false;

  const reset = () => {
    startY = null;
    pullDistance = 0;
    dragging = false;
    indicator.classList.remove('is-visible', 'is-ready', 'is-syncing');
    indicator.textContent = '↓ Pull to refresh';
    indicator.style.transform = 'translateY(-120%)';
  };

  scrollContainer.addEventListener('pointerdown', (event) => {
    const target = event.target as HTMLElement;
    if (scrollContainer.scrollTop > 0 || target.closest('button, input, select, textarea, a')) return;
    startY = event.clientY;
    dragging = true;
  });

  scrollContainer.addEventListener('pointermove', (event) => {
    if (!dragging || startY === null || scrollContainer.scrollTop > 0) return;
    pullDistance = Math.max(0, Math.min(90, (event.clientY - startY) * 0.55));
    if (pullDistance <= 8) return;
    event.preventDefault();
    indicator.classList.add('is-visible');
    indicator.style.transform = `translateY(${pullDistance - 42}px)`;
    indicator.classList.toggle('is-ready', pullDistance >= 60);
    indicator.textContent = pullDistance >= 60 ? '↻ Release to sync' : '↓ Pull to refresh';
  });

  const finish = async () => {
    if (!dragging) return;
    const shouldRefresh = pullDistance >= 60;
    if (!shouldRefresh) {
      reset();
      return;
    }
    indicator.classList.add('is-syncing');
    indicator.classList.remove('is-ready');
    indicator.textContent = '↻ Syncing with Supabase...';
    try {
      await refreshAllGuardianData();
    } finally {
      window.setTimeout(reset, 250);
    }
  };

  scrollContainer.addEventListener('pointerup', () => void finish());
  scrollContainer.addEventListener('pointercancel', reset);
}

async function refreshAllGuardianData() {
  const [medications, doses] = await Promise.all([
    db.getMedications(),
    db.getDoses(),
  ]);
  state.medications = medications;
  state.doses = doses;
  await syncCurrentGuardianDoseFeed();
  await syncOverdueGuardianAlerts();
  await refreshGuardianSyncState();
  renderApp();
}

async function toggleEscalateMissedMeds() {
  const enabled = !state.escalateMissedMeds;
  state.escalateMissedMeds = enabled;
  localStorage.setItem('medflow_escalate_missed_meds', String(enabled));
  const saved = await GuardianSyncService.setEscalationEnabled(enabled);
  if (!saved) {
    state.escalateMissedMeds = !enabled;
    localStorage.setItem('medflow_escalate_missed_meds', String(!enabled));
    showToast('Unable to update missed-med escalation', 'warning');
    renderApp();
    return;
  }
  if (enabled) await syncOverdueGuardianAlerts();
  showToast(enabled ? '✓ Missed-med alerts enabled' : 'Missed-med alerts paused');
  renderApp();
}

async function seedSampleData() {
  const medications: Medication[] = [
    {
      id: 'med-amox',
      name: 'Amoxicillin',
      strength: '500mg',
      shape: 'capsule',
      color: 'amber',
      doseQty: 1,
      unit: 'capsule',
      scheduleType: 'interval',
      intervalHours: 8,
      mealRequired: 'with_meal',
      mealTiming: 'After Meal',
      mealTag: 'After Meal',
      instruction: 'Every 8 hours',
      stockRemaining: 14,
      stockTotal: 21,
      lowStockThreshold: 5,
      takenTodayCount: 0,
      cooldownRemainingSeconds: 0,
    },
    {
      id: 'med-met',
      name: 'Metformin',
      strength: '850mg',
      shape: 'oval',
      color: 'teal',
      doseQty: 0.5,
      unit: 'tablet',
      scheduleType: 'fixed',
      fixedTimes: ['08:00', '20:00'],
      mealRequired: 'with_meal',
      mealTiming: 'After Meal',
      mealTag: 'With Meal',
      instruction: '0.5 tablet with breakfast & dinner',
      stockRemaining: 4,
      stockTotal: 30,
      lowStockThreshold: 5,
      takenTodayCount: 0,
      cooldownRemainingSeconds: 0,
    },
    {
      id: 'med-ibu',
      name: 'Ibuprofen',
      strength: '400mg',
      shape: 'round',
      color: 'rose',
      doseQty: 1,
      unit: 'tablet',
      scheduleType: 'prn',
      cooldownHours: 4,
      maxPerDay: 3,
      mealRequired: 'with_meal',
      mealTiming: 'After Meal',
      mealTag: 'After Meal',
      instruction: 'Max 3/day • 4h cooldown',
      stockRemaining: 18,
      stockTotal: 20,
      lowStockThreshold: 4,
      takenTodayCount: 0,
      cooldownRemainingSeconds: 0,
    }
  ];

  const doses: Dose[] = [
    { id: 'dose-1', medId: 'med-amox', scheduledMinutes: 8*60, originalMinutes: 8*60, status: 'pending' },
    { id: 'dose-2', medId: 'med-met', scheduledMinutes: 8*60+30, originalMinutes: 8*60+30, status: 'pending' },
    { id: 'dose-3', medId: 'med-amox', scheduledMinutes: 16*60, originalMinutes: 16*60, status: 'pending' },
    { id: 'dose-4', medId: 'med-met', scheduledMinutes: 20*60, originalMinutes: 20*60, status: 'pending' },
  ];

  const vitalLogs: VitalLog[] = [
    { id: 'v-1', type: 'bp', sys: 122, dia: 78, date: '2026-11-18', dateLabel: 'Today, 07:45 AM', context: 'Resting' },
    { id: 'v-2', type: 'sugar', valueMgDl: 104, date: '2026-11-18', dateLabel: 'Today, 07:40 AM', context: 'Fasting' },
    { id: 'v-3', type: 'pulse', value: 72, date: '2026-11-18', dateLabel: 'Today, 07:45 AM', context: 'Resting' },
    { id: 'v-4', type: 'temp', value: 36.7, date: '2026-11-18', dateLabel: 'Today, 07:35 AM', context: 'Oral' },
    { id: 'v-5', type: 'spo2', value: 98, date: '2026-11-17', dateLabel: 'Nov 17, 08:15 PM', context: 'Resting' },
    { id: 'v-6', type: 'weight', value: 68.4, date: '2026-11-17', dateLabel: 'Nov 17, 07:10 AM', context: 'Morning' },
    { id: 'v-7', type: 'bp', sys: 128, dia: 82, date: '2026-11-17', dateLabel: 'Nov 17, 08:00 AM', context: 'Morning' },
  ];

  const intakeHistory: IntakeHistory[] = [
    // Sample intake history from past 7 days to show report data immediately
    { id: 'ih-1', medId: 'med-amox', medName: 'Amoxicillin', strength: '500mg', doseQty: 1, unit: 'capsule', takenAt: 'Today, 08:30 AM', date: '2026-11-18', timingStatus: 'On time', scheduleType: 'interval' },
    { id: 'ih-2', medId: 'med-met', medName: 'Metformin', strength: '850mg', doseQty: 0.5, unit: 'tablet', takenAt: 'Today, 08:45 AM', date: '2026-11-18', timingStatus: 'On time', scheduleType: 'fixed' },
    { id: 'ih-3', medId: 'med-ibu', medName: 'Ibuprofen', strength: '400mg', doseQty: 1, unit: 'tablet', takenAt: 'Today, 10:15 AM', date: '2026-11-18', timingStatus: 'PRN', scheduleType: 'prn' },
    { id: 'ih-4', medId: 'med-amox', medName: 'Amoxicillin', strength: '500mg', doseQty: 1, unit: 'capsule', takenAt: 'Today, 04:30 PM', date: '2026-11-18', timingStatus: 'On time', scheduleType: 'interval' },
    { id: 'ih-5', medId: 'med-met', medName: 'Metformin', strength: '850mg', doseQty: 0.5, unit: 'tablet', takenAt: 'Nov 17, 08:30 AM', date: '2026-11-17', timingStatus: 'On time', scheduleType: 'fixed' },
    { id: 'ih-6', medId: 'med-met', medName: 'Metformin', strength: '850mg', doseQty: 0.5, unit: 'tablet', takenAt: 'Nov 17, 08:15 PM', date: '2026-11-17', timingStatus: 'On time', scheduleType: 'fixed' },
    { id: 'ih-7', medId: 'med-ibu', medName: 'Ibuprofen', strength: '400mg', doseQty: 1, unit: 'tablet', takenAt: 'Nov 16, 02:30 PM', date: '2026-11-16', timingStatus: 'PRN', scheduleType: 'prn' },
  ];

  for (const med of medications) await db.saveMedication(med);
  for (const dose of doses) await db.saveDose(dose);
  for (const vital of vitalLogs) await db.saveVitalLog(vital);
  for (const history of intakeHistory) await db.saveIntakeHistory(history);
}

async function reconcileMissingMedicationSchedules() {
  const scheduledMedicationIds = new Set(state.doses.map((dose) => dose.medId));
  const recoveredDoses: Dose[] = [];

  for (const med of state.medications) {
    if (med.scheduleType === 'prn' || scheduledMedicationIds.has(med.id)) continue;
    const doses = await SchedulerService.calculateDayDoses(med);
    for (const dose of doses) {
      await db.saveDose(dose);
      recoveredDoses.push(dose);
    }
  }

  if (recoveredDoses.length > 0) {
    state.doses.push(...recoveredDoses);
    state.doses.sort((a, b) => a.scheduledMinutes - b.scheduledMinutes);
  }
}

// ==========================================
// HELPERS
// ==========================================

function formatMinutesTo12h(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const mins = wrapped % 60;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${String(h12).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${ampm}`;
}

function formatLateDuration(minutes: number): string {
  const capped = Math.max(0, Math.min(minutes, 1439));
  const hours = Math.floor(capped / 60);
  const remainder = capped % 60;
  return `${String(hours).padStart(2, '0')}hr ${String(remainder).padStart(2, '0')}m`;
}

function getTimeOfDayGroup(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  if (wrapped < 12 * 60) return 'Morning';
  if (wrapped < 17 * 60) return 'Afternoon';
  return 'Evening';
}

function parse24hToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  const hours = parseInt(parts[0], 10) || 0;
  const mins = parseInt(parts[1], 10) || 0;
  return hours * 60 + mins;
}

function formatQuantity(qty: number, unit: string): string {
  const plural = qty > 1 && !unit.endsWith('s') && unit !== 'ml' ? unit + 's' : unit;
  return `${qty} ${plural}`;
}

function formatSeconds(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getAdherencePercentage(): number {
  const today = state.doses.filter(d => d.status !== 'skipped');
  if (today.length === 0) return 0;
  const taken = today.filter(d => d.status === 'taken').length;
  return Math.round((taken / today.length) * 100);
}

function calculateDaysRemaining(med: Medication): string {
  if (med.stockRemaining === 0) return '0 days';
  let dailyUsage = 0;
  if (med.scheduleType === 'fixed' && med.fixedTimes) {
    dailyUsage = (med.fixedTimes.length * med.doseQty) || 1;
  } else if (med.scheduleType === 'interval' && med.intervalHours) {
    dailyUsage = (24 / med.intervalHours) * med.doseQty;
  } else if (med.scheduleType === 'prn' && med.maxPerDay) {
    dailyUsage = med.maxPerDay * med.doseQty;
  }
  if (dailyUsage === 0) dailyUsage = 1;
  const days = Math.floor(med.stockRemaining / dailyUsage);
  return days > 0 ? `~${days}d` : '<1d';
}

function groupDosesByTimeOfDay(doses: Dose[]): Record<string, Dose[]> {
  const groups: Record<string, Dose[]> = { Morning: [], Afternoon: [], Evening: [] };
  for (const dose of doses) {
    const group = getTimeOfDayGroup(dose.scheduledMinutes);
    if (!groups[group]) groups[group] = [];
    groups[group].push(dose);
  }
  return groups;
}

function showToast(message: string, type: 'success' | 'warning' | 'alert' = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  
  const bgClass = type === 'warning' 
    ? 'bg-amber-900/95 text-amber-50 border-amber-700/50'
    : type === 'alert'
    ? 'bg-rose-900/95 text-rose-50 border-rose-700/50'
    : 'bg-slate-900/95 text-white border-slate-700/50';
  
  toast.className = `${bgClass} border backdrop-blur-xl px-4 py-3 rounded-2xl shadow-xl text-xs font-semibold tracking-tight animate-slideup`;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ==========================================
// EVENT HANDLERS - DOSE MANAGEMENT
// ==========================================

async function takeScheduledDose(doseId: string, simulatedLateMinutes?: number) {
  const dose = state.doses.find(d => d.id === doseId);
  if (!dose || dose.status === 'taken') return;

  const med = state.medications.find(m => m.id === dose.medId);
  if (!med || med.stockRemaining < med.doseQty) {
    showToast(`Not enough ${med?.name} in stock!`, 'warning');
    return;
  }

  const now = new Date();
  const actualMinutesNow = now.getHours() * 60 + now.getMinutes();
  const takenAtMinutes = simulatedLateMinutes === undefined
    ? actualMinutesNow
    : dose.scheduledMinutes + simulatedLateMinutes;
  const lateOffsetMinutes = Math.max(0, takenAtMinutes - dose.scheduledMinutes);

  dose.status = 'taken';
  dose.takenAtStr = formatMinutesTo12h(takenAtMinutes);
  med.stockRemaining = Math.max(0, med.stockRemaining - med.doseQty);

  if (med.scheduleType === 'interval' && lateOffsetMinutes > 0) {
    const nextDoses = state.doses.filter(
      d => d.medId === med.id && d.status === 'pending' && d.scheduledMinutes > dose.scheduledMinutes
    );
    for (const [index, nextDose] of nextDoses.entries()) {
      const proposedMinutes =
        takenAtMinutes + (med.intervalHours || 8) * 60 * (index + 1);
      nextDose.scheduledMinutes = Math.min(proposedMinutes, 1439);
      nextDose.shiftNote = proposedMinutes > 1439
        ? `Shift capped at 23:59 for today`
        : `Auto-shifted +${formatLateDuration(lateOffsetMinutes)} to maintain ${med.intervalHours}h spacing`;
      await db.saveDose(nextDose);
    }
  }

  // Create intake history entry
  const dateStr = now.toISOString().split('T')[0];
  const dateLabel = `${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${dose.takenAtStr}`;
  const timingStatus = lateOffsetMinutes > 0
    ? `Late (+${formatLateDuration(lateOffsetMinutes)})`
    : 'On time';
  
  const historyEntry: IntakeHistory = {
    id: 'ih-' + Date.now(),
    medId: med.id,
    medName: med.name,
    strength: med.strength,
    doseQty: med.doseQty,
    unit: med.unit,
    takenAt: dateLabel,
    date: dateStr,
    timingStatus,
    scheduleType: med.scheduleType,
  };
  
  state.intakeHistory.unshift(historyEntry);
  await db.saveIntakeHistory(historyEntry);

  await db.saveDose(dose);
  await db.saveMedication(med);
  await syncCurrentGuardianDoseFeed();
  await syncOverdueGuardianAlerts();
  
  showToast(
    `✓ Logged ${formatQuantity(med.doseQty, med.unit)} of ${med.name}. ${med.stockRemaining} left.`,
    med.stockRemaining <= med.lowStockThreshold ? 'warning' : 'success'
  );
  renderApp();
}

async function snoozeDose(doseId: string) {
  const dose = state.doses.find(d => d.id === doseId);
  if (!dose || dose.status !== 'pending') return;
  
  const med = state.medications.find(m => m.id === dose.medId);
  dose.scheduledMinutes += 15;
  dose.shiftNote = 'Snoozed +15 mins';
  
  await db.saveDose(dose);
  await syncCurrentGuardianDoseFeed();
  showToast(`⏰ Snoozed ${med?.name} to ${formatMinutesTo12h(dose.scheduledMinutes)}`);
  renderApp();
}

async function takePrnDose(medId: string) {
  const med = state.medications.find(m => m.id === medId);
  if (!med || med.scheduleType !== 'prn') return;

  if (med.cooldownRemainingSeconds! > 0) {
    showToast(`Cooldown active! Wait ${formatSeconds(med.cooldownRemainingSeconds!)}`, 'warning');
    return;
  }
  if ((med.takenTodayCount || 0) >= (med.maxPerDay || 1)) {
    showToast(`Daily limit (${med.maxPerDay}/day) reached for ${med.name}!`, 'alert');
    return;
  }
  if (med.stockRemaining < med.doseQty) {
    showToast(`Out of stock for ${med.name}!`, 'warning');
    return;
  }

  med.takenTodayCount = (med.takenTodayCount || 0) + 1;
  med.stockRemaining -= med.doseQty;
  med.cooldownRemainingSeconds = (med.cooldownHours || 4) * 3600;

  // Create intake history entry
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const dateLabel = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  
  const historyEntry: IntakeHistory = {
    id: 'ih-' + Date.now(),
    medId: med.id,
    medName: med.name,
    strength: med.strength,
    doseQty: med.doseQty,
    unit: med.unit,
    takenAt: dateLabel,
    date: dateStr,
    timingStatus: 'PRN',
    scheduleType: 'prn',
  };
  
  state.intakeHistory.unshift(historyEntry);
  await db.saveIntakeHistory(historyEntry);

  await db.saveMedication(med);
  await syncCurrentGuardianDoseFeed();
  startPrnTimerLoop();
  showToast(`✓ Logged PRN ${med.name}. ${med.cooldownHours}h cooldown started.`);
  renderApp();
}

async function skipPrnCooldown(medId: string) {
  const med = state.medications.find(m => m.id === medId);
  if (med) {
    med.cooldownRemainingSeconds = 0;
    await db.saveMedication(med);
    await syncCurrentGuardianDoseFeed();
    showToast(`⏩ Cooldown reset for ${med.name}`);
    renderApp();
  }
}

async function refillMedication(medId: string) {
  const med = state.medications.find(m => m.id === medId);
  if (!med) return;
  
  // Ask user for quantity
  const quantity = prompt(`How many ${med.unit}s to add to ${med.name}?`, '30');
  if (!quantity || isNaN(Number(quantity))) {
    return;
  }
  
  const addQty = parseInt(quantity);
  med.stockRemaining += addQty;
  med.stockTotal = Math.max(med.stockTotal, med.stockRemaining);
  
  await db.saveMedication(med);
  await syncCurrentGuardianDoseFeed();
  showToast(`📦 Refilled +${addQty} ${med.unit}s of ${med.name}`);
  renderApp();
}

async function editMedication(medId: string) {
  const med = state.medications.find(m => m.id === medId);
  if (!med) return;

  openAddMedModal();

  const nameInput = document.getElementById('add-med-name') as HTMLInputElement;
  const strengthInput = document.getElementById('add-med-strength') as HTMLInputElement;
  const qtyInput = document.getElementById('add-med-qty') as HTMLInputElement;
  const unitSelect = document.getElementById('add-med-unit') as HTMLSelectElement;
  const stockInput = document.getElementById('add-med-stock') as HTMLInputElement;
  const shapeSelect = document.getElementById('add-med-shape') as HTMLSelectElement;
  const colorSelect = document.getElementById('add-med-color') as HTMLSelectElement;
  const mealRequired = document.getElementById('add-meal-required') as HTMLSelectElement;
  const mealTiming = document.getElementById('add-meal-timing') as HTMLSelectElement;
  const scheduleType = document.getElementById('add-schedule-type') as HTMLSelectElement;

  if (nameInput) nameInput.value = med.name;
  if (strengthInput) strengthInput.value = med.strength;
  if (qtyInput) qtyInput.value = String(med.doseQty);
  if (unitSelect) unitSelect.value = med.unit;
  if (stockInput) stockInput.value = String(med.stockRemaining);
  if (shapeSelect) shapeSelect.value = med.shape;
  if (colorSelect) colorSelect.value = med.color;
  if (mealRequired) mealRequired.value = med.mealRequired;
  if (mealTiming && med.mealTiming) mealTiming.value = med.mealTiming;
  if (scheduleType) {
    scheduleType.value = med.scheduleType;
    toggleScheduleFields();
  }
  toggleMealTimingField();

  if (med.scheduleType === 'fixed') {
    const fixedTime = document.getElementById('add-fixed-time') as HTMLInputElement;
    if (fixedTime) fixedTime.value = med.fixedTimes?.[0] || '09:00';
  } else if (med.scheduleType === 'interval') {
    const intervalStart = document.getElementById('add-interval-start') as HTMLInputElement;
    const intervalHours = document.getElementById('add-interval-hours') as HTMLSelectElement;
    if (intervalStart) intervalStart.value = med.fixedTimes?.[0] || '08:00';
    if (intervalHours) intervalHours.value = String(med.intervalHours || 8);
  } else {
    const cooldown = document.getElementById('add-cooldown') as HTMLInputElement;
    const maxDay = document.getElementById('add-maxday') as HTMLInputElement;
    if (cooldown) cooldown.value = String(med.cooldownHours || 4);
    if (maxDay) maxDay.value = String(med.maxPerDay || 4);
  }

  const form = document.getElementById('add-medication-form') as HTMLFormElement;
  if (form) {
    form.setAttribute('data-edit-id', medId);
    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    if (submitBtn) submitBtn.textContent = 'Update Medication & Schedule';
  }
}

async function deleteMedication(medId: string) {
  const med = state.medications.find(m => m.id === medId);
  if (!med) return;
  
  const confirm = prompt(`Type "${med.name}" to delete this medication:`, '');
  if (confirm === med.name) {
    state.medications = state.medications.filter(m => m.id !== medId);
    state.doses = state.doses.filter(d => d.medId !== medId);
    await db.deleteMedication(medId);
    await syncCurrentGuardianDoseFeed();
    showToast(`🗑️ Deleted ${med.name}`);
    renderApp();
  } else if (confirm !== null) {
    showToast('❌ Name did not match', 'alert');
  }
}

function simulateOcrBottleScan() {
  // Simulate OCR scanning of a prescription/bottle label
  // Opens add medication modal with pre-filled sample data
  
  const backdrop = document.getElementById('modal-backdrop');
  if (!backdrop) return;
  
  const shapeSelect = document.getElementById('add-pill-shape') as HTMLSelectElement;
  const colorSelect = document.getElementById('add-pill-color') as HTMLSelectElement;

  fillFormWithOcrData(parseOcrText(
    'LISINOPRIL 10MG\nTAKE 1 TABLET BY MOUTH EVERY MORNING\nQTY: 30 TABLETS'
  ));
  if (shapeSelect) shapeSelect.value = 'tablet';
  if (colorSelect) colorSelect.value = 'white';
  
  showToast('📱 OCR scan complete: Lisinopril 10mg detected', 'success');
  backdrop.classList.remove('hidden');
  openAddMedModal();
}

async function scanBottleOcr() {
  // Real OCR scanner using device camera + ML Kit text recognition
  // Falls back to simulation if running in browser (no camera/OCR APIs)
  
  // For now, always use simulation until @capacitor/camera is installed
  // This prevents any import resolution issues
  simulateOcrBottleScan();
}

interface ExtractedMedData {
  name: string;
  strength: string;
  quantity: number;
  unit: string;
  frequency: string;
  instructions: string;
}

function parseOcrText(text: string): ExtractedMedData {
  const data: ExtractedMedData = {
    name: '',
    strength: '',
    quantity: 1,
    unit: 'tablet',
    frequency: '',
    instructions: '',
  };

  // Normalize text for easier parsing
  const cleanText = text.toUpperCase();

  // Extract Medication Strength (e.g., "500mg", "10 ml", "5 mcg")
  const strengthMatch = cleanText.match(/\b(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|iu|units?)\b/i);
  if (strengthMatch) {
    data.strength = `${strengthMatch[1]}${strengthMatch[2].toLowerCase()}`;
  }

  // Extract Quantity per dose (e.g., "Take 1 tablet", "2 capsules")
  const qtyMatch = cleanText.match(/(?:take|dose|give)\s+(\d+(?:\.\d+)?)\s*(tablet|capsule|tab|cap|pill|ml|drop|puff)/i);
  if (qtyMatch) {
    data.quantity = parseFloat(qtyMatch[1]);
    const unitMap: Record<string, string> = {
      tablet: 'tablet',
      tab: 'tablet',
      pill: 'tablet',
      capsule: 'capsule',
      cap: 'capsule',
      ml: 'ml',
      drop: 'drop',
      puff: 'puff',
    };
    data.unit = unitMap[qtyMatch[2].toLowerCase()] || 'tablet';
  }

  // Extract Frequency (e.g., "every 8 hours", "twice daily", "BID", "once a day")
  const freqMatch = cleanText.match(
    /(?:every\s+(\d+)\s*hours?|(?:twice|three|four|one)\s*daily|bid|tid|qid|od|qd|once|twice|thrice)/i
  );
  if (freqMatch) {
    if (freqMatch[1]) {
      data.frequency = `Every ${freqMatch[1]} hours`;
    } else {
      const freqMap: Record<string, string> = {
        'TWICE': 'Twice daily',
        'THREE': 'Three times daily',
        'FOUR': 'Four times daily',
        'ONE': 'Once daily',
        'BID': 'Twice daily',
        'TID': 'Three times daily',
        'QID': 'Four times daily',
        'OD': 'Once daily',
        'QD': 'Once daily',
        'ONCE': 'Once daily',
        'THRICE': 'Three times daily',
      };
      data.frequency = freqMap[freqMatch[0]] || '';
    }
  }

  // Extract Medication Name (longest word before strength or at start)
  // Look for common drug names or first capitalized phrase
  const nameMatch = text.match(/^([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)/m);
  if (nameMatch) {
    data.name = nameMatch[1].trim();
  }

  // Extract instructions (look for keywords like "with", "after", "before", "without", "do not")
  const instructionMatch = text.match(
    /(?:with\s+food|after\s+meal|before\s+meal|without\s+food|do\s+not\s+crush|swallow\s+whole|chew|dissolve)/i
  );
  if (instructionMatch) {
    data.instructions = instructionMatch[0];
  }

  return data;
}

function fillFormWithOcrData(data: ExtractedMedData) {
  // Auto-fill the form with extracted OCR data
  const nameInput = document.getElementById('add-med-name') as HTMLInputElement;
  const strengthInput = document.getElementById('add-med-strength') as HTMLInputElement;
  const qtyInput = document.getElementById('add-med-qty') as HTMLInputElement;
  const unitSelect = document.getElementById('add-med-unit') as HTMLSelectElement;
  const stockInput = document.getElementById('add-med-stock') as HTMLInputElement;

  if (nameInput) nameInput.value = data.name;
  if (strengthInput) strengthInput.value = data.strength;
  if (qtyInput) qtyInput.value = String(data.quantity);
  if (unitSelect) unitSelect.value = data.unit;
  if (stockInput) stockInput.value = '30'; // Default stock

  // Clear edit mode
  const form = document.getElementById('add-medication-form') as HTMLFormElement;
  if (form) {
    form.removeAttribute('data-edit-id');
    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    if (submitBtn) submitBtn.textContent = 'Save & Schedule';
  }
}

function startPrnTimerLoop() {
  if (prnTimerInterval) clearInterval(prnTimerInterval);
  prnTimerInterval = setInterval(() => {
    let anyActive = false;
    for (const med of state.medications) {
      if (med.scheduleType === 'prn' && med.cooldownRemainingSeconds! > 0) {
        med.cooldownRemainingSeconds! -= 1;
        anyActive = true;
      }
    }
    if (anyActive && state.currentTab === 'today') {
      renderApp();
    } else if (!anyActive && prnTimerInterval) {
      clearInterval(prnTimerInterval);
      prnTimerInterval = null;
    }
  }, 1000);
}

// ==========================================
// EVENT HANDLERS - UI NAVIGATION
// ==========================================

async function switchTab(tab: 'today' | 'vitals' | 'cabinet' | 'guardian' | 'report') {
  state.currentTab = tab;
  if (tab === 'guardian') {
    if (!GuardianSyncService.isOnline()) {
      await initializeGuardianSyncState();
    } else {
      await refreshGuardianSyncState();
    }
  }
  
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('text-teal-600', btn.getAttribute('data-tab') === tab);
    btn.classList.toggle('text-slate-400', btn.getAttribute('data-tab') !== tab);
  });
  
  renderApp();
}

function openAddMedModal() {
  const backdrop = document.getElementById('modal-backdrop');
  const modalBody = document.getElementById('modal-body');
  if (!backdrop || !modalBody) return;

  document.getElementById('modal-subtitle')!.textContent = 'Smart Regimen Setup';
  document.getElementById('modal-title')!.textContent = 'Add Medication';

  modalBody.innerHTML = `
    <form id="add-medication-form" onsubmit="handleAddMedicationSubmit(event)" class="space-y-4">
      <div class="grid grid-cols-3 gap-2">
        <div class="col-span-2">
          <label class="block text-xs font-bold text-slate-900 mb-1.5 uppercase tracking-wide">Medicine Name</label>
          <input id="add-med-name" type="text" required placeholder="e.g., Vitamin D3" class="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-xs font-semibold text-slate-900 placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20" />
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-900 mb-1.5 uppercase tracking-wide">Strength</label>
          <input id="add-med-strength" type="text" required placeholder="1000 IU" class="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-xs font-semibold text-slate-900 placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20" />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-xs font-bold text-slate-900 mb-1.5 uppercase tracking-wide">Shape</label>
          <select id="add-med-shape" class="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20">
            <option value="round">Round Tablet</option>
            <option value="oval">Oval Scored</option>
            <option value="capsule">Capsule</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-900 mb-1.5 uppercase tracking-wide">Color</label>
          <select id="add-med-color" class="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20">
            <option value="teal">Teal</option>
            <option value="amber">Amber</option>
            <option value="rose">Coral Red</option>
            <option value="blue">Sky Blue</option>
            <option value="indigo">Indigo</option>
          </select>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-2">
        <div>
          <label class="block text-xs font-bold text-slate-900 mb-1.5 uppercase tracking-wide">Qty</label>
          <input id="add-med-qty" type="number" step="0.25" min="0.25" required value="1" class="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20" />
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-900 mb-1.5 uppercase tracking-wide">Unit</label>
          <select id="add-med-unit" class="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20">
            <option value="tablet">tablet</option>
            <option value="capsule">capsule</option>
            <option value="ml">ml</option>
            <option value="drop">drop</option>
            <option value="puff">puff</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-900 mb-1.5 uppercase tracking-wide">Stock</label>
          <input id="add-med-stock" type="number" min="1" required value="30" class="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20" />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-xs font-bold text-slate-900 mb-1.5 uppercase tracking-wide">With Meal</label>
          <select id="add-meal-required" onchange="toggleMealTimingField()" class="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20">
            <option value="with_meal">Yes</option>
            <option value="no_meal">No</option>
          </select>
        </div>
        <div id="meal-timing-wrapper">
          <label class="block text-xs font-bold text-slate-900 mb-1.5 uppercase tracking-wide">Timing</label>
          <select id="add-meal-timing" class="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20">
            <option value="Before Meal">Before Meal</option>
            <option value="After Meal">After Meal</option>
          </select>
        </div>
      </div>

      <div>
        <label class="block text-xs font-bold text-slate-900 mb-1.5 uppercase tracking-wide">Schedule Type</label>
        <select id="add-schedule-type" onchange="toggleScheduleFields()" class="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20">
          <option value="fixed">Fixed Daily Time</option>
          <option value="interval">Interval-Based (Auto-Shifts if taken late)</option>
          <option value="prn">As Needed (PRN with Cooldown)</option>
        </select>
      </div>

      <div id="schedule-dynamic-fields"></div>

      <button type="submit" class="w-full bg-teal-500 hover:bg-teal-600 active:bg-teal-700 text-white font-bold text-xs py-3.5 rounded-lg shadow-lg shadow-teal-500/30 transition active:scale-95 uppercase tracking-wide">
        Save & Schedule
      </button>
    </form>
  `;

  toggleScheduleFields();
  toggleMealTimingField();
  backdrop.classList.remove('hidden');
}

function toggleScheduleFields() {
  const type = (document.getElementById('add-schedule-type') as HTMLSelectElement)?.value;
  const container = document.getElementById('schedule-dynamic-fields');
  if (!container) return;

  if (type === 'fixed') {
    container.innerHTML = `
      <div>
        <label class="block text-xs font-bold text-slate-900 mb-1.5 uppercase tracking-wide">Daily Time</label>
        <input id="add-fixed-time" type="time" value="09:00" class="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20" />
      </div>
    `;
  } else if (type === 'interval') {
    container.innerHTML = `
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-xs font-bold text-slate-900 mb-1.5 uppercase tracking-wide">Start Time</label>
          <input id="add-interval-start" type="time" value="08:00" class="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20" />
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-900 mb-1.5 uppercase tracking-wide">Every (Hours)</label>
          <select id="add-interval-hours" class="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20">
            <option value="6">Every 6 hours</option>
            <option value="8" selected>Every 8 hours</option>
            <option value="12">Every 12 hours</option>
          </select>
        </div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-xs font-bold text-slate-900 mb-1.5 uppercase tracking-wide">Cooldown (Hrs)</label>
          <input id="add-cooldown" type="number" min="1" max="24" value="4" class="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20" />
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-900 mb-1.5 uppercase tracking-wide">Max/Day</label>
          <input id="add-maxday" type="number" min="1" max="12" value="4" class="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20" />
        </div>
      </div>
    `;
  }
}

function toggleMealTimingField() {
  const mealReq = (document.getElementById('add-meal-required') as HTMLSelectElement)?.value;
  const wrapper = document.getElementById('meal-timing-wrapper');
  if (wrapper) {
    wrapper.classList.toggle('hidden', mealReq !== 'with_meal');
  }
}

function handleAddMedicationSubmit(e: Event) {
  e.preventDefault();
  const form = e.currentTarget as HTMLFormElement;
  const editingId = form.dataset.editId;
  const existingMed = editingId
    ? state.medications.find((medication) => medication.id === editingId)
    : undefined;
  const name = (document.getElementById('add-med-name') as HTMLInputElement).value.trim();
  const strength = (document.getElementById('add-med-strength') as HTMLInputElement).value.trim();
  const shape = (document.getElementById('add-med-shape') as HTMLSelectElement).value;
  const color = (document.getElementById('add-med-color') as HTMLSelectElement).value;
  const doseQty = parseFloat((document.getElementById('add-med-qty') as HTMLInputElement).value) || 1;
  const unit = (document.getElementById('add-med-unit') as HTMLSelectElement).value as Medication['unit'];
  const stockTotal = parseFloat((document.getElementById('add-med-stock') as HTMLInputElement).value) || 30;
  const mealRequired = (document.getElementById('add-meal-required') as HTMLSelectElement).value;
  const mealTiming = ((document.getElementById('add-meal-timing') as HTMLSelectElement)?.value || 'Before Meal') as Medication['mealTiming'];
  const mealTag = mealRequired === 'with_meal' ? mealTiming : 'No Meal Necessary';
  const scheduleType = (document.getElementById('add-schedule-type') as HTMLSelectElement).value;

  const med: Medication = {
    id: existingMed?.id || 'med-' + Date.now(),
    name,
    strength,
    shape: shape as any,
    color: color as any,
    doseQty,
    unit,
    scheduleType: scheduleType as any,
    mealRequired: mealRequired as any,
    mealTiming,
    mealTag,
    instruction: `${mealTag} • ${formatQuantity(doseQty, unit)}`,
    stockRemaining: stockTotal,
    stockTotal,
    lowStockThreshold: Math.max(3, Math.round(stockTotal * 0.2)),
  };

  if (scheduleType === 'fixed') {
    const timeStr = (document.getElementById('add-fixed-time') as HTMLInputElement)?.value || '09:00';
    med.fixedTimes = [timeStr];
  } else if (scheduleType === 'interval') {
    const startTime = (document.getElementById('add-interval-start') as HTMLInputElement)?.value || '08:00';
    med.intervalHours = parseInt((document.getElementById('add-interval-hours') as HTMLSelectElement)?.value || '8', 10);
    med.fixedTimes = [startTime];
  } else if (scheduleType === 'prn') {
    med.cooldownHours = parseInt((document.getElementById('add-cooldown') as HTMLInputElement)?.value || '4', 10);
    med.maxPerDay = parseInt((document.getElementById('add-maxday') as HTMLInputElement)?.value || '4', 10);
    med.takenTodayCount = 0;
    med.cooldownRemainingSeconds = 0;
  }

  void submitAddMedication(med, Boolean(existingMed));
}

function closeModal() {
  const backdrop = document.getElementById('modal-backdrop');
  if (backdrop) {
    backdrop.classList.add('hidden');
  }
}

async function submitAddMedication(med: Medication, isEdit: boolean) {
  const existingDoses = state.doses.filter((dose) => dose.medId === med.id);
  const generatedDoses = await SchedulerService.calculateDayDoses(med);
  const matchedDoseIds = new Set<string>();
  const scheduledDoses = generatedDoses.map((generated) => {
    const existing = existingDoses.find(
      (dose) =>
        !matchedDoseIds.has(dose.id) &&
        dose.originalMinutes === generated.originalMinutes
    );
    if (!existing) return generated;
    matchedDoseIds.add(existing.id);
    return { ...generated, status: existing.status, takenAtStr: existing.takenAtStr, shiftNote: existing.shiftNote };
  });
  for (const existing of existingDoses) {
    if (existing.status === 'taken' && !matchedDoseIds.has(existing.id)) {
      scheduledDoses.push(existing);
    }
  }

  await db.saveMedication(med);
  await db.deleteDosesByMedication(med.id);
  for (const dose of scheduledDoses) await db.saveDose(dose);

  if (isEdit) {
    state.medications = state.medications.map((medication) =>
      medication.id === med.id ? med : medication
    );
  } else {
    state.medications.push(med);
  }
  state.doses = state.doses
    .filter((dose) => dose.medId !== med.id)
    .concat(scheduledDoses)
    .sort((a, b) => a.scheduledMinutes - b.scheduledMinutes);
  await syncCurrentGuardianDoseFeed();

  closeModal();
  showToast(`✓ ${isEdit ? 'Updated' : 'Added'} ${med.name}`);
  renderApp();
}

// ==========================================
// EVENT HANDLERS - GUARDIAN MODE
// ==========================================

function setGuardianSubView(view: 'monitoring' | 'mycode') {
  state.guardianSubView = view;
  renderApp();
}

async function toggleGuardianSync() {
  state.guardianSyncEnabled = !state.guardianSyncEnabled;
  GuardianSyncService.toggleSync(state.guardianSyncEnabled);
  if (state.guardianSyncEnabled) {
    await refreshGuardianSyncState();
  }
  showToast(state.guardianSyncEnabled ? '🛡️ Guardian Sync enabled' : 'Guardian Sync paused');
  renderApp();
}

function copyPatientCode() {
  const code = state.myPatientCode;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code).then(() => {
      showToast(`📋 Copied: ${code}`);
    });
  } else {
    showToast(`Patient Code: ${code}`, 'success');
  }
}

function saveMyPatientName() {
  const nameInput = document.getElementById('my-patient-name-input') as HTMLInputElement;
  const name = nameInput?.value?.trim();
  if (!name) {
    showToast('Please enter your name', 'warning');
    return;
  }
  state.myPatientName = name;
  if (GuardianSyncService.isOnline()) {
    void GuardianSyncService.savePatientName(name).then((saved) => {
      if (!saved) showToast('Name saved locally; cloud sync failed', 'warning');
    });
  }
  showToast(`✓ Saved: "${name}"`);
  renderApp();
}

function validatePatientCode(code: string) {
  const cleanCode = code.trim().toUpperCase();
  if (!/^MED-[A-HJ-NP-Z2-9]{8}$/.test(cleanCode)) {
    showToast('Enter a valid MED-XXXXXXXX patient code', 'warning');
    return;
  }

  const foundPatient = patientCodeLookup[cleanCode];
  if (!foundPatient) {
    showToast(`❌ Patient code "${cleanCode}" not found`, 'alert');
    return;
  }

  // Check if already linked
  if (monitoredPatients.some((p: any) => p.code === cleanCode)) {
    showToast(`✓ Already monitoring ${foundPatient.patientName}`, 'warning');
    return;
  }

  linkingPatientCode = cleanCode;
  linkingPatientFound = foundPatient;
  renderApp();
}

function confirmPatientLink() {
  if (!linkingPatientCode || !linkingPatientFound) return;

  const guardianIdInput = document.getElementById('guardian-identifier') as HTMLInputElement;
  const guardianId = guardianIdInput?.value?.trim();
  
  if (!guardianId) {
    showToast('Please enter your identifier (e.g., DAD, MOM)', 'warning');
    return;
  }

  const newPatient = {
    id: 'pat-' + Date.now(),
    patientName: linkingPatientFound.patientName,
    guardianId: guardianId.toUpperCase(),
    code: linkingPatientCode,
    adherence: 100,
    lastSync: 'Just now',
    status: 'on_track',
    meds: linkingPatientFound.meds || []
  };

  monitoredPatients.push(newPatient);
  showToast(`✓ Linked ${linkingPatientFound.patientName} (${guardianId})`);
  
  linkingPatientCode = null;
  linkingPatientFound = null;
  renderApp();
}

function cancelPatientLink() {
  linkingPatientCode = null;
  linkingPatientFound = null;
  renderApp();
}

async function linkNewPatientByCode(code: string) {
  const cleanCode = code.trim().toUpperCase();
  if (!/^MED-[A-HJ-NP-Z2-9]{8}$/.test(cleanCode)) {
    showToast('Enter a valid MED-XXXXXXXX patient code', 'warning');
    return;
  }
  if (monitoredPatients.some((p: any) => p.code === cleanCode)) {
    showToast(`Already monitoring ${cleanCode}`, 'warning');
    return;
  }

  monitoredPatients.push({
    id: 'pat-' + Date.now(),
    patientName: `Patient`,
    guardianId: 'Guardian',
    code: cleanCode,
    adherence: 100,
    lastSync: 'Just now',
    status: 'on_track',
    meds: []
  });

  showToast(`✓ Linked patient ${cleanCode}`);
  renderApp();
}

async function acknowledgeGuardianAlert(alertId: string) {
  const alert = guardianAlerts.find((a: any) => a.id === alertId);
  if (alert) {
    if (GuardianSyncService.isOnline()) {
      const acknowledged = await GuardianSyncService.acknowledgeAlert(alertId);
      if (!acknowledged) {
        showToast('Unable to acknowledge alert in Supabase', 'warning');
        return;
      }
    }
    guardianAlerts = guardianAlerts.filter((item: any) => item.id !== alertId);
    (state as any).guardianAlerts = guardianAlerts;
    showToast(`✓ Acknowledged alert`);
    renderApp();
    updateGuardianAlertDot();
  }
}

// ==========================================
// RENDERING - MAIN APP CONTROLLER
// ==========================================

function renderApp() {
  updateHeader();
  renderMainContent();
  updateLowStockDot();
  updateGuardianAlertDot();
}

function updateHeader() {
  const today = state.doses.filter(d => d.status !== 'skipped');
  const taken = today.filter(d => d.status === 'taken').length;
  const headerTitle = document.getElementById('header-title');
  const adherencePill = document.getElementById('adherence-pill');
  const adherenceCount = document.getElementById('adherence-count');

  const tabTitles: Record<string, string> = {
    today: 'Today\'s Regimen',
    vitals: 'Vital Signs',
    cabinet: 'Medicine Cabinet',
    guardian: 'Guardian',
    report: 'Health Report',
  };

  if (headerTitle) headerTitle.textContent = tabTitles[state.currentTab] || 'Today\'s Regimen';
  
  // Only show adherence pill on Today tab
  if (adherencePill) {
    if (state.currentTab === 'today') {
      adherencePill.classList.remove('hidden');
      if (adherenceCount) adherenceCount.textContent = `${taken}/${today.length}`;
    } else {
      adherencePill.classList.add('hidden');
    }
  }
}

function renderMainContent() {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) return;

  mainContent.innerHTML = '';

  if (state.currentTab === 'today') {
    mainContent.innerHTML = renderTodayTab();
  } else if (state.currentTab === 'vitals') {
    mainContent.innerHTML = renderVitalsTab();
  } else if (state.currentTab === 'cabinet') {
    mainContent.innerHTML = renderCabinetTab();
  } else if (state.currentTab === 'guardian') {
    mainContent.innerHTML = renderGuardianTab();
  } else if (state.currentTab === 'report') {
    mainContent.innerHTML = renderReportTab();
  }
}

function updateLowStockDot() {
  const dot = document.getElementById('low-stock-dot');
  if (!dot) return;
  const hasLowStock = state.medications.some(m => m.stockRemaining <= m.lowStockThreshold);
  if (hasLowStock) {
    dot.classList.remove('hidden');
  } else {
    dot.classList.add('hidden');
  }
}

function updateGuardianAlertDot() {
  const dot = document.getElementById('guardian-alert-dot');
  if (!dot) return;
  const activeAlerts = (state as any).guardianAlerts || guardianAlerts;
  const hasUnacknowledgedAlerts = activeAlerts.some((a: any) => !a.acknowledged);
  if (hasUnacknowledgedAlerts) {
    dot.classList.remove('hidden');
  } else {
    dot.classList.add('hidden');
  }
}

// ==========================================
// TAB RENDER - TODAY
// ==========================================

function renderTodayTab(): string {
  const fixedDoses = state.doses.filter(d => d.status !== 'skipped');
  const grouped = groupDosesByTimeOfDay(fixedDoses);
  const prnMeds = state.medications.filter(m => m.scheduleType === 'prn');

  let html = '';

  // Morning Check-In Banner (dismissible)
  if (state.showMorningBanner) {
    html += `
      <div class="bg-gradient-to-r from-teal-600 via-teal-500 to-cyan-500 text-white rounded-2xl p-4 mb-4 shadow-lg shadow-teal-500/20">
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <p class="text-xs font-bold uppercase tracking-widest opacity-90">🌅 Good Morning!</p>
            <p class="text-sm font-black mt-2 leading-tight">Check In On Your Regimen</p>
            <p class="text-xs font-medium mt-1.5 opacity-90">${fixedDoses.filter(d => d.status !== 'taken').length} doses today • Let's stay on track!</p>
          </div>
          <button onclick="dismissMorningBanner()" class="text-white/80 hover:text-white text-lg flex-shrink-0 font-bold">×</button>
        </div>
      </div>
    `;
  }

  // Render each time-of-day group
  for (const timeGroup of ['Morning', 'Afternoon', 'Evening']) {
    const doses = grouped[timeGroup] || [];
    if (doses.length === 0) continue;

    html += `
      <div class="mt-5 first:mt-0">
        <h3 class="text-xs font-black text-slate-900 uppercase tracking-widest mb-3">${timeGroup}</h3>
        <div class="space-y-2.5">
    `;

    for (const dose of doses) {
      const med = state.medications.find(m => m.id === dose.medId);
      if (!med) continue;

      const currentTime = new Date();
      const actualMinutesNow = currentTime.getHours() * 60 + currentTime.getMinutes();
      const lateMinutes = Math.max(0, actualMinutesNow - dose.scheduledMinutes);
      const isOverdue = dose.status === 'pending' && lateMinutes > 0;
      const doseStatusClass = dose.status === 'taken' 
        ? 'bg-emerald-50/60 border-emerald-200/50 opacity-70' 
        : isOverdue 
        ? 'border-rose-400/60 bg-rose-50/30 ring-1 ring-rose-500/40' 
        : 'bg-gradient-to-br from-white to-slate-50/50 border-slate-200/80 hover:border-slate-300/80';
      const timeStr = formatMinutesTo12h(dose.scheduledMinutes);
      
      // Stock warning badge
      const isLowStock = med.stockRemaining <= med.lowStockThreshold;
      const stockBadge = isLowStock 
        ? `<span class="inline-flex items-center gap-1 bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded-full border border-amber-300 mt-1">⚠️ Low: ${med.stockRemaining} left</span>`
        : '';

      html += `
        <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition ${doseStatusClass}">
          <div class="flex items-start gap-3 mb-3">
            <div class="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${getPillBgClass(med.color)} shadow-sm">
              ${renderPillSVG(med.shape, med.color)}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <div>
                  <p class="text-sm font-bold text-slate-900">${med.name}</p>
                  <p class="text-xs font-semibold text-slate-500 mt-0.5">${med.strength}</p>
                </div>
                <p class="text-xs font-bold text-slate-600 whitespace-nowrap">${timeStr}</p>
              </div>
              <p class="text-[11px] text-slate-700 font-medium mt-1.5">Take ${formatQuantity(med.doseQty, med.unit)}</p>
              ${med.mealTiming ? `<p class="text-[10px] text-teal-600 font-semibold mt-0.5">📌 ${med.mealTiming}</p>` : ''}
              <p class="text-[10px] text-slate-600 mt-1">${med.scheduleType === 'interval' ? `Every ${med.intervalHours}h • Auto-shifts if taken late` : med.scheduleType === 'fixed' ? `Fixed time schedule` : `As needed (PRN)`}</p>
              ${isOverdue ? `<span class="inline-flex bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-1 rounded-full border border-rose-300 mt-1">${formatLateDuration(lateMinutes)} late</span>` : ''}
              ${stockBadge}
            </div>
          </div>
          
          <div class="flex items-center gap-2 mt-4">
            ${dose.status === 'taken'
              ? `<div class="flex-1 bg-emerald-100 border border-emerald-300 px-4 py-2 rounded-lg text-center">
                   <span class="text-xs font-bold text-emerald-700">✓ Taken</span>
                 </div>`
              : `<button onclick="takeScheduledDose('${dose.id}')" class="flex-1 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs font-bold py-2.5 rounded-lg transition active:scale-95">
                   ✅ Take Now
                 </button>
                 ${import.meta.env.DEV && med.scheduleType === 'interval' ? `<button onclick="takeScheduledDose('${dose.id}', 90)" class="bg-amber-400 hover:bg-amber-500 active:bg-amber-600 text-white text-xs font-bold px-3 py-2.5 rounded-lg transition active:scale-95" title="Development-only simulation">
                   Simulate +90m
                 </button>` : ''}
                 <button onclick="snoozeDose('${dose.id}')" class="bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold px-3 py-2.5 rounded-lg transition active:scale-95" title="Snooze 15 minutes">
                   Snooze
                 </button>`
            }
          </div>
        </div>
      `;
    }

    html += `</div></div>`;
  }

  // PRN Medications Section
  if (prnMeds.length > 0) {
    html += `
      <div class="mt-5">
        <h3 class="text-xs font-black text-slate-900 uppercase tracking-widest mb-3">As-Needed (PRN)</h3>
        <div class="space-y-2.5">
    `;

    for (const med of prnMeds) {
      const cooldownActive = (med.cooldownRemainingSeconds || 0) > 0;
      const dailyLimitReached = (med.takenTodayCount || 0) >= (med.maxPerDay || 1);
      const outOfStock = med.stockRemaining < med.doseQty;
      const takenCount = med.takenTodayCount || 0;
      const maxDaily = med.maxPerDay || 1;

      let statusClass = '';
      let isDisabled = false;

      if (outOfStock) {
        statusClass = 'opacity-60 ring-1 ring-rose-400/40';
        isDisabled = true;
      } else if (dailyLimitReached) {
        statusClass = 'opacity-60 ring-1 ring-slate-400/40';
        isDisabled = true;
      } else if (cooldownActive) {
        isDisabled = true;
      }

      html += `
        <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition ${statusClass}">
          <div class="flex items-start gap-3 mb-3">
            <div class="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${getPillBgClass(med.color)} shadow-sm">
              ${renderPillSVG(med.shape, med.color)}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2 mb-0.5">
                <div>
                  <p class="text-sm font-bold text-slate-900">${med.name}</p>
                  <p class="text-xs font-semibold text-slate-500 mt-0.5">${med.strength}</p>
                </div>
                <span class="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-full">${takenCount} / ${maxDaily} today</span>
              </div>
              <p class="text-[11px] text-slate-700 font-medium mt-1.5">Take ${formatQuantity(med.doseQty, med.unit)}</p>
              <p class="text-[10px] text-slate-600 mt-0.5">Max ${maxDaily} tablet${maxDaily !== 1 ? 's' : ''}/day • ${med.cooldownHours}h safety cooldown</p>
            </div>
          </div>
          
          ${cooldownActive ? `
            <div class="bg-slate-800 text-white rounded-xl p-3 mb-3 flex items-center justify-between">
              <div>
                <p class="text-[11px] font-bold uppercase tracking-wide mb-1">Safety Cooldown Active</p>
                <p class="text-sm font-mono font-bold">${formatSeconds(med.cooldownRemainingSeconds || 0)}</p>
              </div>
              <button onclick="skipPrnCooldown('${med.id}')" class="bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold px-3 py-2 rounded-lg transition active:scale-95 whitespace-nowrap ml-2">
                Skip Timer
              </button>
            </div>
          ` : ''}
          
          <div class="flex items-center gap-2 mt-3">
            ${!cooldownActive ? `
              <button onclick="takePrnDose('${med.id}')" ${isDisabled ? 'disabled' : ''} class="flex-1 ${isDisabled ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700 text-white'} text-xs font-bold py-2.5 rounded-lg transition active:scale-95">
                Take Now
              </button>
              ${dailyLimitReached ? `<span class="text-[10px] text-slate-600 font-semibold">Daily limit reached</span>` : outOfStock ? `<span class="text-[10px] text-rose-600 font-semibold">Out of stock</span>` : ''}
            ` : ''}
          </div>
        </div>
      `;
    }

    html += `</div></div>`;
  }

  if (html === '') {
    html = `
      <div class="text-center py-16">
        <p class="text-sm font-medium text-slate-600">No medications scheduled for today</p>
        <button onclick="openAddMedModal()" class="mt-4 text-xs font-bold text-teal-600 hover:text-teal-700 bg-teal-50 hover:bg-teal-100 px-4 py-2 rounded-lg transition">+ Add Medication</button>
      </div>
    `;
  }

  return html;
}

// ==========================================
// TAB RENDER - VITALS
// ==========================================

function renderVitalsTab(): string {
  let html = '';

  // Log Vital Sign button + Glucose unit selector + View Mode Toggle
  html += `
    <div class="mb-4">
      <div class="flex gap-2 mb-3">
        <button onclick="openLogVitalModal()" class="flex-1 bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-300/60 hover:border-teal-400/80 text-teal-700 text-xs font-bold py-3.5 rounded-xl transition shadow-sm hover:shadow-md">
          + Log Vital Sign
        </button>
        <select onchange="toggleGlucoseUnit()" class="bg-white border border-slate-200 rounded-xl px-2 py-2 text-[9px] font-bold text-slate-700 focus:outline-none focus:border-teal-500 w-24">
          <option value="mg/dL">Glucose: mg/dL</option>
          <option value="mmol/L">Glucose: mmol/L</option>
        </select>
      </div>

      <!-- View Mode Toggle -->
      <div class="flex gap-2 items-center justify-between">
        <div class="text-xs font-bold text-slate-600 uppercase tracking-wide">Vital Sign Logs (${state.vitalLogs.length})</div>
        <div class="flex gap-1.5">
          <button onclick="setVitalsViewMode('cards')" class="text-[10px] font-bold ${state.vitalsViewMode === 'cards' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'} px-3 py-1.5 rounded-full transition">
            Cards
          </button>
          <button onclick="setVitalsViewMode('printable')" class="text-[10px] font-bold ${state.vitalsViewMode === 'printable' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'} px-3 py-1.5 rounded-full transition">
            Printable List
          </button>
        </div>
      </div>
    </div>
  `;

  // Get latest vitals for summary cards
  const getLatestVital = (type: string) => {
    return state.vitalLogs.filter(v => v.type === type).sort((a, b) => b.date.localeCompare(a.date))[0];
  };

  const latestBP = getLatestVital('bp');
  const latestSugar = getLatestVital('sugar');
  const latestPulse = getLatestVital('pulse');
  const latestTemp = getLatestVital('temp');
  const latestSpO2 = getLatestVital('spo2');
  const latestWeight = getLatestVital('weight');

  // Blood Pressure Summary Card (Large, Prominent)
  if (latestBP) {
    const bpStatus = getVitalStatus(latestBP);
    html += `
      <div class="bg-white border-2 border-teal-300/60 rounded-2xl p-4 shadow-sm mb-4 relative overflow-hidden">
        <div class="absolute top-0 right-0 w-24 h-24 bg-teal-50/40 rounded-full -mr-12 -mt-12"></div>
        <div class="flex items-start justify-between gap-3 relative z-10">
          <div class="flex-1">
            <p class="text-xs uppercase font-bold text-slate-600 tracking-widest mb-1">Blood Pressure</p>
            <p class="text-2xl font-black text-slate-900">${latestBP.sys}/${latestBP.dia}</p>
            <p class="text-[10px] text-slate-500 mt-0.5">mmHg</p>
            <p class="text-[9px] text-slate-500 mt-1">Today, ${latestBP.dateLabel}</p>
          </div>
          <div class="text-right">
            <span class="inline-block bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-1 rounded-full border border-emerald-300">${bpStatus.label}</span>
          </div>
        </div>
      </div>
    `;
  }

  // Blood Sugar, Pulse, Temp/SpO2/Weight in grid
  html += `<div class="grid grid-cols-2 gap-3 mb-4">`;

  // Blood Sugar
  if (latestSugar) {
    const sugarStatus = getVitalStatus(latestSugar);
    const displayVal = state.glucoseUnit === 'mg/dL' 
      ? latestSugar.valueMgDl 
      : Math.round((latestSugar.valueMgDl! / 18.0182) * 10) / 10;
    const sugarStatusColors: Record<string, string> = {
      normal: 'bg-emerald-100 text-emerald-700 border-emerald-300',
      elevated: 'bg-amber-100 text-amber-700 border-amber-300',
      abnormal: 'bg-rose-100 text-rose-700 border-rose-300',
    };
    html += `
      <div class="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
        <div class="flex items-start justify-between gap-2 mb-1">
          <p class="text-[9px] uppercase font-bold text-slate-600 tracking-widest">Blood Sugar</p>
          <span class="text-xs font-bold px-1.5 py-0.5 rounded-full border ${sugarStatusColors[sugarStatus.status]}">${sugarStatus.label}</span>
        </div>
        <p class="text-xl font-black text-slate-900">${displayVal}</p>
        <p class="text-[9px] text-slate-500">mg/dL</p>
      </div>
    `;
  }

  // Pulse Rate
  if (latestPulse) {
    const pulseStatus = getVitalStatus(latestPulse);
    const pulseStatusColors: Record<string, string> = {
      normal: 'bg-emerald-100 text-emerald-700 border-emerald-300',
      elevated: 'bg-amber-100 text-amber-700 border-amber-300',
      abnormal: 'bg-rose-100 text-rose-700 border-rose-300',
    };
    html += `
      <div class="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
        <div class="flex items-start justify-between gap-2 mb-1">
          <p class="text-[9px] uppercase font-bold text-slate-600 tracking-widest">Pulse Rate</p>
          <span class="text-xs font-bold px-1.5 py-0.5 rounded-full border ${pulseStatusColors[pulseStatus.status]}">${pulseStatus.label}</span>
        </div>
        <p class="text-xl font-black text-slate-900">${latestPulse.value}</p>
        <p class="text-[9px] text-slate-500">bpm</p>
      </div>
    `;
  }

  html += `</div>`;

  // Temp, SpO2, Weight row
  html += `<div class="grid grid-cols-3 gap-2 mb-4">`;
  
  if (latestTemp) {
    html += `
      <div class="bg-white border border-slate-200 rounded-xl p-2.5 shadow-sm text-center">
        <p class="text-[8px] uppercase font-bold text-slate-600 tracking-widest mb-1">Temp</p>
        <p class="text-lg font-black text-slate-900">${latestTemp.value}°C</p>
      </div>
    `;
  }

  if (latestSpO2) {
    html += `
      <div class="bg-white border border-slate-200 rounded-xl p-2.5 shadow-sm text-center">
        <p class="text-[8px] uppercase font-bold text-slate-600 tracking-widest mb-1">SpO2</p>
        <p class="text-lg font-black text-slate-900">${latestSpO2.value}%</p>
      </div>
    `;
  }

  if (latestWeight) {
    html += `
      <div class="bg-white border border-slate-200 rounded-xl p-2.5 shadow-sm text-center">
        <p class="text-[8px] uppercase font-bold text-slate-600 tracking-widest mb-1">Weight</p>
        <p class="text-lg font-black text-slate-900">${latestWeight.value}</p>
        <p class="text-[8px] text-slate-500">kg</p>
      </div>
    `;
  }

  html += `</div>`;

  // Blood Pressure Trend (simple chart)
  const bpLogs = state.vitalLogs.filter(v => v.type === 'bp').sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
  if (bpLogs.length > 0) {
    const maxSys = Math.max(...bpLogs.map(v => v.sys!));
    const minSys = Math.min(...bpLogs.map(v => v.sys!));
    const rangeSys = maxSys - minSys || 1;
    
    html += `
      <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm mb-4">
        <div class="flex items-center justify-between mb-3">
          <p class="text-xs font-bold text-slate-900 uppercase">Blood Pressure Trend</p>
          <p class="text-[9px] text-slate-500">Last 7</p>
        </div>
        <div class="h-24 flex items-end justify-around gap-1 bg-gradient-to-t from-slate-50 to-transparent p-2 rounded-lg">
          ${bpLogs.map((bp) => {
            const heightSys = ((bp.sys! - minSys) / rangeSys) * 100;
            return `<div class="flex-1 flex flex-col items-center justify-end">
              <div class="w-full bg-gradient-to-t from-rose-400 to-rose-300 rounded-t-sm" style="height: ${heightSys}%; min-height: 2px;" title="${bp.sys}/${bp.dia}"></div>
              <p class="text-[8px] text-slate-500 mt-1">${bp.sys}</p>
            </div>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  // Date range and preset buttons
  html += `
    <div class="bg-slate-50 rounded-2xl p-3 border border-slate-200/80 space-y-2 mb-4">
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-[9px] font-bold uppercase text-slate-600 mb-0.5">From Date</label>
          <button onclick="openDatePicker('vitalsDateFrom')" class="w-full text-left bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-slate-700 hover:border-teal-500 focus:outline-none focus:border-teal-500 transition">
            📅 ${state.vitalsDateFrom}
          </button>
        </div>
        <div>
          <label class="block text-[9px] font-bold uppercase text-slate-600 mb-0.5">To Date</label>
          <button onclick="openDatePicker('vitalsDateTo')" class="w-full text-left bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-slate-700 hover:border-teal-500 focus:outline-none focus:border-teal-500 transition">
            📅 ${state.vitalsDateTo}
          </button>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
        <button onclick="applyVitalsDatePreset(1)" class="text-[10px] font-semibold ${state.vitalsDateFrom === state.vitalsDateTo ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-700 border-slate-200'} border px-2 py-0.5 rounded-md transition">Today</button>
        <button onclick="applyVitalsDatePreset(3)" class="text-[10px] font-semibold bg-white border border-slate-200 hover:border-teal-400 text-slate-700 px-2 py-0.5 rounded-md transition">Last 3d</button>
        <button onclick="applyVitalsDatePreset(7)" class="text-[10px] font-semibold bg-white border border-slate-200 hover:border-teal-400 text-slate-700 px-2 py-0.5 rounded-md transition">7 Days</button>
      </div>
    </div>
  `;

  // Filter buttons
  html += `
    <div class="flex gap-1.5 pb-3 overflow-x-auto -mx-4 px-4 mb-4">
      <button onclick="setVitalsHistoryFilter('all')" class="shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold transition whitespace-nowrap ${state.vitalsHistoryFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
        All
      </button>
      <button onclick="setVitalsHistoryFilter('bp')" class="shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold transition whitespace-nowrap ${state.vitalsHistoryFilter === 'bp' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
        BP
      </button>
      <button onclick="setVitalsHistoryFilter('sugar')" class="shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold transition whitespace-nowrap ${state.vitalsHistoryFilter === 'sugar' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
        Sugar
      </button>
      <button onclick="setVitalsHistoryFilter('pulse')" class="shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold transition whitespace-nowrap ${state.vitalsHistoryFilter === 'pulse' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
        Pulse
      </button>
      <button onclick="setVitalsHistoryFilter('other')" class="shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold transition whitespace-nowrap ${state.vitalsHistoryFilter === 'other' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
        Other
      </button>
    </div>
  `;

  // Get filtered vitals
  const filtered = state.vitalLogs.filter(v => {
    const vDate = v.date;
    if (vDate < state.vitalsDateFrom || vDate > state.vitalsDateTo) return false;
    if (state.vitalsHistoryFilter === 'all') return true;
    if (state.vitalsHistoryFilter === 'bp') return v.type === 'bp';
    if (state.vitalsHistoryFilter === 'sugar') return v.type === 'sugar';
    if (state.vitalsHistoryFilter === 'pulse') return v.type === 'pulse';
    return ['temp', 'spo2', 'weight'].includes(v.type);
  });

  // ===== VIEW MODE: CARDS (default) =====
  if (state.vitalsViewMode === 'cards') {
    if (filtered.length === 0) {
      html += `<div class="text-center py-12"><p class="text-xs font-medium text-slate-600">No vital readings in this date range</p></div>`;
    } else {
      html += `<div class="space-y-2.5">`;
      for (const vital of filtered) {
        const statusBadge = getVitalStatus(vital);
        const statusColors: Record<string, string> = {
          normal: 'bg-emerald-50 text-emerald-700 border-emerald-300',
          elevated: 'bg-amber-50 text-amber-700 border-amber-300',
          abnormal: 'bg-rose-50 text-rose-700 border-rose-300',
        };

        let readingText = '';
        let vitalIcon = '';
        if (vital.type === 'bp') {
          readingText = `${vital.sys}/${vital.dia}`;
          vitalIcon = '🩸';
        } else if (vital.type === 'sugar') {
          const displayVal = state.glucoseUnit === 'mg/dL' 
            ? vital.valueMgDl 
            : Math.round((vital.valueMgDl! / 18.0182) * 10) / 10;
          readingText = `${displayVal} ${state.glucoseUnit}`;
          vitalIcon = '🩸';
        } else if (vital.type === 'pulse') {
          readingText = `${vital.value} bpm`;
          vitalIcon = '❤️';
        } else if (vital.type === 'temp') {
          readingText = `${vital.value}°C`;
          vitalIcon = '🌡️';
        } else if (vital.type === 'spo2') {
          readingText = `${vital.value}%`;
          vitalIcon = '💨';
        } else if (vital.type === 'weight') {
          readingText = `${vital.value} kg`;
          vitalIcon = '⚖️';
        }

        html += `
          <div class="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-sm hover:shadow-md transition flex items-start justify-between gap-2">
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="text-base shrink-0">${vitalIcon}</span>
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <p class="text-xs font-bold text-slate-900">${readingText}</p>
                  <span class="text-[9px] font-bold px-2 py-0.5 rounded-full border ${statusColors[statusBadge.status]}">${statusBadge.label}</span>
                </div>
                <p class="text-[10px] text-slate-500 mt-0.5">${vital.dateLabel} • ${vital.context}</p>
                ${vital.note ? `<p class="text-[10px] text-slate-700 mt-0.5">📝 ${vital.note}</p>` : ''}
              </div>
            </div>
          </div>
        `;
      }
      html += `</div>`;
    }
  } 
  // ===== VIEW MODE: PRINTABLE LIST =====
  else if (state.vitalsViewMode === 'printable') {
    html += `
      <div class="mb-4 flex gap-2 no-print">
        <button onclick="exportVitalsCsv()" class="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold py-3 rounded-lg transition flex items-center justify-center gap-2">
          📊 Export Excel / CSV
        </button>
        <button onclick="copyVitalsCsv()" class="flex-1 bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold py-3 rounded-lg transition flex items-center justify-center gap-2">
          Copy CSV
        </button>
      </div>
    `;

    if (filtered.length === 0) {
      html += `<div class="text-center py-12"><p class="text-xs font-medium text-slate-600">No vital readings in this date range</p></div>`;
    } else {
      html += `
        <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm vitals-print-report">
          <div class="vitals-print-heading print-only">
            <h1>MedFlow Vital Signs</h1>
            <p>Date range: ${state.vitalsDateFrom} to ${state.vitalsDateTo}</p>
            <p>Filtered readings: ${filtered.length}</p>
          </div>
          <table class="w-full text-sm vitals-print-table">
            <thead class="bg-slate-900 text-white">
              <tr>
                <th class="text-left px-4 py-3 font-bold text-xs uppercase tracking-wide">Date</th>
                <th class="text-left px-4 py-3 font-bold text-xs uppercase tracking-wide">Vital</th>
                <th class="text-left px-4 py-3 font-bold text-xs uppercase tracking-wide">Reading</th>
                <th class="text-left px-4 py-3 font-bold text-xs uppercase tracking-wide">Context</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map((vital, idx) => {
                let readingText = '';
                let vitalType = '';
                if (vital.type === 'bp') {
                  readingText = `${vital.sys}/${vital.dia} mmHg`;
                  vitalType = 'Blood Pressure';
                } else if (vital.type === 'sugar') {
                  const displayVal = state.glucoseUnit === 'mg/dL' 
                    ? vital.valueMgDl 
                    : Math.round((vital.valueMgDl! / 18.0182) * 10) / 10;
                  readingText = `${displayVal} ${state.glucoseUnit}`;
                  vitalType = 'Blood Sugar';
                } else if (vital.type === 'pulse') {
                  readingText = `${vital.value} bpm`;
                  vitalType = 'Pulse Rate';
                } else if (vital.type === 'temp') {
                  readingText = `${vital.value}°C`;
                  vitalType = 'Temperature';
                } else if (vital.type === 'spo2') {
                  readingText = `${vital.value}%`;
                  vitalType = 'SpO2';
                } else if (vital.type === 'weight') {
                  readingText = `${vital.value} kg`;
                  vitalType = 'Weight';
                }

                const contextAndNote = vital.context ? vital.context : '';
                const noteText = vital.note ? ` | ${vital.note}` : '';

                return `
                  <tr class="border-t border-slate-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}">
                    <td class="px-4 py-3 text-xs font-semibold text-slate-900">${vital.dateLabel}</td>
                    <td class="px-4 py-3 text-xs font-semibold text-slate-700">${vitalType}</td>
                    <td class="px-4 py-3 text-xs font-bold text-slate-900">${readingText}</td>
                    <td class="px-4 py-3 text-[11px] text-slate-700">${contextAndNote}${noteText}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  }

  return html;
}

// ==========================================
// TAB RENDER - CABINET
// ==========================================

function renderCabinetTab(): string {
  let html = '';

  if (state.medications.length === 0) {
    html = `
      <div class="text-center py-16">
        <p class="text-sm font-medium text-slate-600 mb-4">No medications in your cabinet yet</p>
        <button onclick="openAddMedModal()" class="bg-teal-500 hover:bg-teal-600 text-white text-xs font-bold px-5 py-2.5 rounded-lg transition shadow-lg shadow-teal-500/20">
          + Add Medication
        </button>
      </div>
    `;
    return html;
  }

  // Scan Label Button (prominent at top)
  html += `
    <button onclick="scanBottleOcr()" class="w-full bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white rounded-2xl p-4 mb-4 shadow-md hover:shadow-lg transition font-bold flex items-center justify-center gap-2">
      📱 Scan Label
      <span class="text-xs font-normal opacity-90">(Rx or Bottle)</span>
    </button>
  `;

  html += `<div class="space-y-3">`;

  for (const med of state.medications) {
    const isLowStock = med.stockRemaining <= med.lowStockThreshold;
    const daysLeft = calculateDaysRemaining(med);
    const stockPercent = Math.min(100, Math.round((med.stockRemaining / med.stockTotal) * 100));

    const stockStatusClass = isLowStock ? 'ring-1 ring-amber-400/50 bg-amber-50/40' : 'hover:border-slate-300';
    const stockBarColor = isLowStock ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gradient-to-r from-teal-500 to-cyan-500';

    html += `
      <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition ${stockStatusClass}">
        <div class="flex items-start gap-3 mb-3">
          <div class="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${getPillBgClass(med.color)} shadow-sm">
            ${renderPillSVG(med.shape, med.color)}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2 mb-0.5">
              <div class="flex-1">
                <p class="text-sm font-bold text-slate-900 truncate">${med.name}</p>
                <p class="text-xs font-semibold text-teal-700 mt-0.5">${med.strength}</p>
              </div>
              ${isLowStock ? `<span class="bg-amber-100 border border-amber-300 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">⚠️ LOW</span>` : ''}
            </div>
          </div>
        </div>

        <div class="mb-3 space-y-1.5">
          <div class="flex items-center justify-between text-xs">
            <span class="font-bold text-slate-900">${med.stockRemaining} ${med.unit}${med.stockRemaining !== 1 ? 's' : ''} remaining</span>
            <span class="font-semibold text-slate-700">${daysLeft} left</span>
          </div>
          <div class="w-full bg-slate-200/60 rounded-full h-2 overflow-hidden shadow-inner">
            <div class="${stockBarColor} h-full rounded-full transition-all duration-300" style="width: ${stockPercent}%"></div>
          </div>
        </div>

        <div class="text-xs text-slate-800 font-semibold mb-3 p-2 bg-slate-50/80 rounded-lg border border-slate-200/50">
          <p class="font-bold text-slate-900">${med.instruction || 'No instructions'}</p>
          <p class="text-slate-700 mt-0.5">${med.mealTag || ''}</p>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <button onclick="refillMedication('${med.id}')" class="bg-teal-100 hover:bg-teal-200 text-teal-700 text-xs font-bold py-2.5 rounded-lg transition">
            📦 Refill
          </button>
          <button onclick="editMedication('${med.id}')" class="bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs font-bold py-2.5 rounded-lg transition">
            ✏️ Edit
          </button>
        </div>
        <button onclick="deleteMedication('${med.id}')" class="w-full bg-rose-100 hover:bg-rose-200 text-rose-700 text-xs font-bold py-2.5 rounded-lg transition mt-2">
          🗑️ Delete
        </button>
      </div>
    `;
  }

  html += `</div>`;
  return html;
}

// ==========================================
// TAB RENDER - GUARDIAN
// ==========================================

function renderGuardianTab(): string {
  let html = '';

  if (state.guardianSubView === 'mycode') {
    html += `
      <div class="bg-gradient-to-br from-teal-600 via-teal-500 to-cyan-500 text-white rounded-2xl p-5 mb-5 shadow-lg shadow-teal-500/20">
        <p class="text-xs font-bold uppercase tracking-widest opacity-90 mb-3">🔐 Your Patient Code</p>
        <div class="flex items-center gap-2 mb-3">
          <div class="flex-1 bg-white/20 backdrop-blur border border-white/30 rounded-xl px-4 py-3">
            <p class="text-xl font-black text-white font-mono tracking-wider">${state.myPatientCode}</p>
          </div>
          <button onclick="copyPatientCode()" class="bg-white/90 hover:bg-white text-teal-600 px-4 py-3 rounded-lg text-xs font-black transition shadow-lg">
            Copy
          </button>
        </div>
        <p class="text-xs font-medium opacity-95 mb-4">Share this code with family members so they can monitor your medication adherence 🛡️</p>
        
        <div class="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-3">
          <label class="block text-xs font-bold uppercase tracking-wide opacity-90 mb-2">Your Name / Identifier</label>
          <input 
            id="my-patient-name-input" 
            type="text" 
            placeholder="E.g., Jimmy" 
            value="${state.myPatientName}" 
            class="w-full bg-white/20 border border-white/30 rounded-lg px-3 py-2.5 text-xs font-semibold text-white placeholder-white/60 focus:outline-none focus:border-white/60 focus:ring-1 focus:ring-white/20"
          />
          <p class="text-[10px] opacity-80 mt-2">When they scan your code, they'll see this name so they know it's you</p>
          <button onclick="saveMyPatientName()" class="w-full mt-3 bg-white/90 hover:bg-white text-teal-600 text-xs font-bold py-2 rounded-lg transition">
            Save Name
          </button>
        </div>
      </div>

      <button onclick="setGuardianSubView('monitoring')" class="w-full text-xs font-bold text-teal-600 hover:text-teal-700 py-3 mb-4 bg-teal-50 hover:bg-teal-100 rounded-lg transition">
        ← Back to Monitoring
      </button>
    `;
  } else {
    // === MISSED MED ESCALATIONS ALERT ===
    if (guardianAlerts.length > 0) {
      const alert = guardianAlerts[0]; // Show first alert prominently
      html += `
        <div class="mb-5 bg-gradient-to-br from-rose-600 to-rose-700 text-white rounded-2xl p-4 shadow-lg shadow-rose-500/30 border border-rose-500/50">
          <div class="flex items-center justify-between mb-3">
            <p class="text-xs font-black uppercase tracking-widest">⚠️ Missed Med Escalation</p>
            <span class="text-sm font-black">${guardianAlerts.length} Alert${guardianAlerts.length > 1 ? 's' : ''}</span>
          </div>
          
          <div class="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-3 mb-3">
            <p class="text-sm font-bold text-white mb-1">${alert.patientName}</p>
            <div class="space-y-1">
              <div class="flex items-center justify-between">
                <p class="text-sm font-bold">${alert.medName} ${alert.medStrength || ''}</p>
                <span class="text-xs font-semibold opacity-90">${alert.doseQty}${alert.unit || 'unit'}</span>
              </div>
              <p class="text-xs font-semibold opacity-90">Scheduled ${alert.scheduledTime} (${alert.overdueBy})</p>
            </div>
          </div>
          
          ${!alert.acknowledged ? `
            <button onclick="acknowledgeGuardianAlert('${alert.id}')" class="w-full bg-white hover:bg-slate-100 text-rose-600 text-xs font-black py-2.5 rounded-lg transition">
              ✓ Acknowledge Alert
            </button>
          ` : `
            <div class="w-full bg-white/20 text-white text-xs font-bold py-2.5 rounded-lg text-center">
              ✓ Acknowledged
            </div>
          `}
        </div>
      `;
    }

    // === LINK PATIENT SECTION ===
    html += `
      <div class="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-5">
        <label class="block text-xs font-black text-slate-900 uppercase tracking-wide mb-2.5">Link Patient via Code</label>
    `;

    if (linkingPatientFound) {
      // STEP 2: Patient found, ask for guardian identifier
      html += `
        <div class="bg-white border-2 border-teal-500 rounded-xl p-3.5 mb-3">
          <div class="flex items-center justify-between mb-2">
            <div>
              <p class="text-xs font-bold text-slate-600 uppercase tracking-wide">✓ Patient Found</p>
              <p class="text-sm font-black text-slate-900 mt-1">${linkingPatientFound.patientName}</p>
            </div>
            <span class="text-2xl">✓</span>
          </div>
          <p class="text-[10px] text-slate-700">Code: <span class="font-mono font-bold">${linkingPatientFound.code}</span></p>
        </div>

        <label class="block text-xs font-bold text-slate-900 uppercase tracking-wide mb-2">Your Identifier (e.g., DAD, MOM)</label>
        <div class="flex gap-2">
          <input 
            id="guardian-identifier" 
            type="text" 
            placeholder="E.g., DAD" 
            class="flex-1 bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-xs font-semibold text-slate-900 placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20"
          />
          <button onclick="confirmPatientLink()" class="bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition active:scale-95">
            Confirm
          </button>
        </div>
        <button onclick="cancelPatientLink()" class="w-full mt-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 rounded-lg transition">
          Cancel
        </button>
      `;
    } else {
      // STEP 1: Waiting for code input
      html += `
        <div class="flex gap-2 mb-3">
          <input 
            id="link-patient-code" 
            type="text" 
            maxlength="12"
            placeholder="E.g., MED-ABCDEFGH" 
            class="flex-1 bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-xs font-semibold text-slate-900 placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20"
          />
          <button onclick="validatePatientCode(document.getElementById('link-patient-code').value)" class="bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition active:scale-95">
            Check
          </button>
        </div>
        <button onclick="showToast('📋 Enter a shared MED-XXXXXXXX code')" class="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 rounded-lg transition">
          Code Help
        </button>
      `;
    }

    html += `</div>`;


    // === MONITORED PATIENTS LIST ===
    html += `
      <h3 class="text-xs font-black text-slate-900 uppercase tracking-widest mb-3">👥 Monitored Patients</h3>
    `;

    if (monitoredPatients.length === 0) {
      html += `
        <div class="text-center py-12 bg-slate-50 rounded-2xl border border-slate-200/80">
          <p class="text-sm font-semibold text-slate-600">No patients linked yet</p>
          <p class="text-xs text-slate-500 mt-1">Link a family member to monitor their medication adherence</p>
        </div>
      `;
    } else {
      html += `<div class="space-y-3">`;

      for (const patient of monitoredPatients) {
        html += `
          <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition">
            <!-- Patient Header Row -->
            <div class="flex items-start justify-between gap-2 mb-3">
              <div class="flex-1">
                <p class="text-sm font-bold text-slate-900">${patient.patientName} <span class="text-slate-500 font-semibold">(${patient.guardianId})</span></p>
                <p class="text-[11px] text-slate-700 font-mono font-bold mt-1">Code: ${patient.code}</p>
                <p class="text-[10px] text-slate-500 mt-0.5">Synced ${patient.lastSync}</p>
              </div>
              <span class="text-xs font-black px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${
                patient.adherence >= 90 ? 'bg-teal-100 text-teal-700' :
                patient.adherence >= 75 ? 'bg-amber-100 text-amber-700' :
                'bg-rose-100 text-rose-700'
              }">
                ${patient.adherence}% Adh.
              </span>
            </div>

            <!-- Medications List -->
            ${patient.meds && patient.meds.length > 0 ? `
              <div class="space-y-1.5 mb-0">
                ${patient.meds.map((med: any) => {
                  const isMissed = med.status === 'missed_1h' || med.status === 'missed_2h';
                  const statusColor = isMissed ? 'text-rose-600' : med.status === 'taken' ? 'text-teal-600' : 'text-slate-600';
                  const statusIcon = isMissed ? '⚠️' : med.status === 'taken' ? '✓' : '⏱';
                  
                  return `
                    <div class="flex items-center justify-between text-[11px]">
                      <span class="font-semibold text-slate-900">${med.name} ${med.qty ? `(${med.qty})` : ''}</span>
                      <span class="font-bold ${statusColor}">${statusIcon} ${med.time}</span>
                    </div>
                  `;
                }).join('')}
              </div>
            ` : `
              <p class="text-xs text-slate-600 font-medium">No medications scheduled</p>
            `}
          </div>
        `;
      }

      html += `</div>`;
    }

    html += `
      <div class="mt-5 pt-4 border-t border-slate-200 flex gap-2">
        <button onclick="toggleGuardianSync()" class="flex-1 ${state.guardianSyncEnabled ? 'bg-teal-600 text-white shadow-lg shadow-teal-500/20' : 'bg-slate-100 text-slate-700'} text-xs font-bold py-3 rounded-lg transition">
          ${state.guardianSyncEnabled ? '🛡️ Sync ON' : '⏸ Sync OFF'}
        </button>
        <button onclick="setGuardianSubView('mycode')" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-3 rounded-lg transition">
          My Code
        </button>
      </div>
    `;
  }

  return html;
}

// ==========================================
// TAB RENDER - REPORT
// ==========================================

function renderReportTab(): string {
  const adherencePercent = getAdherencePercentage();
  const takenDoses = state.doses.filter(d => d.status === 'taken').length;
  const totalScheduledDoses = state.doses.filter(d => d.status !== 'skipped').length;

  // Vital Statistics
  const bpLogs = state.vitalLogs.filter(v => v.type === 'bp');
  const avgSys = bpLogs.length > 0 ? Math.round(bpLogs.reduce((sum, v) => sum + (v.sys || 0), 0) / bpLogs.length) : 0;
  const avgDia = bpLogs.length > 0 ? Math.round(bpLogs.reduce((sum, v) => sum + (v.dia || 0), 0) / bpLogs.length) : 0;

  const sugarLogs = state.vitalLogs.filter(v => v.type === 'sugar');
  const avgSugarMg = sugarLogs.length > 0 ? Math.round(sugarLogs.reduce((sum, v) => sum + (v.valueMgDl || 0), 0) / sugarLogs.length) : 0;

  const pulseLogs = state.vitalLogs.filter(v => v.type === 'pulse');
  const avgPulse = pulseLogs.length > 0 ? Math.round(pulseLogs.reduce((sum, v) => sum + (v.value || 0), 0) / pulseLogs.length) : 0;

  let html = '';

  // Clinician Summary Banner
  html += `
    <div class="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-5 mb-5 shadow-lg flex items-start justify-between gap-3 border border-slate-700/50">
      <div>
        <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">📋 Doctor Visit Summary</p>
        <h2 class="text-sm font-bold mt-0.5">Health Report</h2>
        <p class="text-[11px] text-slate-300 mt-0.5">Correlates medication intake with vitals response.</p>
      </div>
      <span class="text-2xl shrink-0">📋</span>
    </div>

    <button onclick="openExportDateRangeModal()" class="w-full bg-teal-500 hover:bg-teal-600 text-white text-xs font-extrabold py-3 rounded-xl transition mb-5 shadow-lg shadow-teal-500/20">
      📄 Export PDF Report for Doctor
    </button>
  `;

  // 4-Card Summary Grid
  html += `
    <div class="grid grid-cols-2 gap-2.5 mb-5">
      <div class="bg-white rounded-3xl p-3.5 border border-slate-200/80 shadow-sm">
        <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Today Adherence</p>
        <p class="text-2xl font-extrabold text-teal-600 mt-1">${adherencePercent}%</p>
        <p class="text-[10px] text-slate-500 mt-0.5">${takenDoses}/${totalScheduledDoses} doses taken</p>
      </div>
      <div class="bg-white rounded-3xl p-3.5 border border-slate-200/80 shadow-sm">
        <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Avg Blood Pressure</p>
        <p class="text-2xl font-extrabold text-slate-900 mt-1">${avgSys}/${avgDia}</p>
        <p class="text-[10px] text-slate-500 mt-0.5">${bpLogs.length} readings (mmHg)</p>
      </div>
      <div class="bg-white rounded-3xl p-3.5 border border-slate-200/80 shadow-sm">
        <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Avg Blood Sugar</p>
        <p class="text-2xl font-extrabold text-slate-900 mt-1">${avgSugarMg}</p>
        <p class="text-[10px] text-slate-500 mt-0.5">${sugarLogs.length} glucose logs</p>
      </div>
      <div class="bg-white rounded-3xl p-3.5 border border-slate-200/80 shadow-sm">
        <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Avg Resting Pulse</p>
        <p class="text-2xl font-extrabold text-slate-900 mt-1">${avgPulse}</p>
        <p class="text-[10px] text-slate-500 mt-0.5">${pulseLogs.length} pulse logs</p>
      </div>
    </div>
  `;

  // Date Range Filter for Activity Log
  html += `
    <div class="bg-slate-50 rounded-2xl p-3 border border-slate-200/80 space-y-2 mb-4">
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-[9px] font-bold uppercase text-slate-600 mb-0.5">From Date</label>
          <button onclick="openDatePicker('reportDateFrom')" class="w-full text-left bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-slate-700 hover:border-teal-500 focus:outline-none focus:border-teal-500 transition">
            📅 ${state.reportDateFrom || '2026-11-11'}
          </button>
        </div>
        <div>
          <label class="block text-[9px] font-bold uppercase text-slate-600 mb-0.5">To Date</label>
          <button onclick="openDatePicker('reportDateTo')" class="w-full text-left bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-slate-700 hover:border-teal-500 focus:outline-none focus:border-teal-500 transition">
            📅 ${state.reportDateTo || '2026-11-18'}
          </button>
        </div>
      </div>
    </div>
  `;

  // Filter intake history by date range
  const reportDateFrom = state.reportDateFrom || '2026-11-11';
  const reportDateTo = state.reportDateTo || '2026-11-18';
  const filteredIntakeHistory = state.intakeHistory.filter(item => {
    const itemDate = item.takenAt.split(' ')[0]; // Extract date portion (YYYY-MM-DD)
    return itemDate >= reportDateFrom && itemDate <= reportDateTo;
  });

  // Recent Intake Activity Log
  html += `
    <div class="space-y-2.5">
      <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">Recent Intake Activity Log</h3>
      ${filteredIntakeHistory.length === 0 ? `
        <div class="text-center py-8 bg-slate-50 rounded-2xl border border-slate-200">
          <p class="text-xs font-medium text-slate-600">No medications taken in this date range</p>
        </div>
      ` : `
        ${filteredIntakeHistory.slice(0, 10).map(item => `
          <div class="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-sm flex items-start gap-3">
            <div class="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold shrink-0 flex-shrink-0">✓</div>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-bold text-slate-900">
                Logged ${item.medName} ${item.strength}
              </p>
              <p class="text-[10px] font-medium text-slate-400 mt-1">
                ${item.takenAt} • ${item.scheduleType === 'prn' ? 'PRN' : 'On time'}
              </p>
            </div>
          </div>
        `).join('')}
      `}
    </div>
  `;

  return html;
}

// ==========================================
// MODAL RENDERING
// ==========================================

function openLogVitalModal() {
  const backdrop = document.getElementById('modal-backdrop');
  const modalBody = document.getElementById('modal-body');
  if (!backdrop || !modalBody) return;

  document.getElementById('modal-subtitle')!.textContent = 'Quick Entry';
  document.getElementById('modal-title')!.textContent = 'Log Vital Sign';

  modalBody.innerHTML = `
    <form onsubmit="handleLogVitalFormSubmit(event)" class="space-y-4">
      <div>
        <label class="block text-xs font-bold text-slate-900 mb-1.5 uppercase tracking-wide">Vital Type</label>
        <select id="vital-type-select" onchange="renderVitalInputFields()" required class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs font-medium focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20">
          <option value="bp">Blood Pressure</option>
          <option value="sugar">Blood Sugar / Glucose</option>
          <option value="pulse">Resting Pulse</option>
          <option value="temp">Temperature</option>
          <option value="spo2">Oxygen Saturation (SpO2)</option>
          <option value="weight">Weight</option>
        </select>
      </div>

      <div id="vital-dynamic-fields"></div>

      <div>
        <label class="block text-xs font-bold text-slate-900 mb-1.5 uppercase tracking-wide">Note (Optional)</label>
        <input id="vital-note-input" type="text" placeholder="e.g., After medication, feeling better" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs font-medium focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20" />
      </div>

      <button type="submit" class="w-full bg-teal-500 hover:bg-teal-600 active:bg-teal-700 text-white font-bold text-xs py-3.5 rounded-lg shadow-lg shadow-teal-500/30 transition active:scale-95 uppercase tracking-wide">
        Save Reading
      </button>
    </form>
  `;

  renderVitalInputFields();
  backdrop.classList.remove('hidden');
}

function renderVitalInputFields() {
  const typeSelect = document.getElementById('vital-type-select') as HTMLSelectElement;
  const type = typeSelect?.value || 'bp';
  const container = document.getElementById('vital-dynamic-fields');
  if (!container) return;

  if (type === 'bp') {
    container.innerHTML = `
      <div class="grid grid-cols-3 gap-2">
        <div>
          <label class="block text-[11px] font-bold text-slate-900 mb-1 uppercase tracking-wide">Systolic</label>
          <input id="vital-bp-sys" type="number" required min="60" max="250" value="120" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20" />
        </div>
        <div>
          <label class="block text-[11px] font-bold text-slate-900 mb-1 uppercase tracking-wide">Diastolic</label>
          <input id="vital-bp-dia" type="number" required min="40" max="150" value="78" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20" />
        </div>
        <div>
          <label class="block text-[11px] font-bold text-slate-900 mb-1 uppercase tracking-wide">Pulse (opt)</label>
          <input id="vital-bp-pulse" type="number" min="35" max="220" placeholder="72" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20" />
        </div>
      </div>
      <div>
        <label class="block text-[11px] font-bold text-slate-900 mb-1 uppercase tracking-wide">Posture</label>
        <select id="vital-context-input" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs font-medium focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20">
          <option value="Resting • Sitting">Resting • Sitting</option>
          <option value="Morning (Before Meds)">Morning (Before Meds)</option>
          <option value="Evening">Evening</option>
        </select>
      </div>
    `;
  } else if (type === 'sugar') {
    container.innerHTML = `
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-[11px] font-bold text-slate-900 mb-1 uppercase tracking-wide">Value</label>
          <input id="vital-sugar-val" type="number" step="0.1" required min="20" max="600" value="102" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20" />
        </div>
        <div>
          <label class="block text-[11px] font-bold text-slate-900 mb-1 uppercase tracking-wide">Unit</label>
          <select id="vital-sugar-unit" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-xs font-semibold focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20">
            <option value="mg/dL" selected>mg/dL</option>
            <option value="mmol/L">mmol/L</option>
          </select>
        </div>
      </div>
      <div>
        <label class="block text-[11px] font-bold text-slate-900 mb-1 uppercase tracking-wide">Context</label>
        <select id="vital-context-input" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs font-medium focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20">
          <option value="Fasting">Fasting (8+ hrs no food)</option>
          <option value="Before Meal">Before Meal</option>
          <option value="2h After Meal">2 Hours After Meal</option>
          <option value="Bedtime">Bedtime</option>
        </select>
      </div>
    `;
  } else {
    const configs: Record<string, any> = {
      pulse: { label: 'Heart Rate (bpm)', defaultVal: '74', step: '1', ctx: ['Resting', 'After Walk', 'Morning'] },
      temp: { label: 'Temperature (°C)', defaultVal: '36.8', step: '0.1', ctx: ['Oral', 'Forehead', 'Ear'] },
      spo2: { label: 'Oxygen Saturation (%)', defaultVal: '98', step: '1', ctx: ['Resting', 'Post-Exercise'] },
      weight: { label: 'Weight (kg)', defaultVal: '68.2', step: '0.1', ctx: ['Morning Fasting', 'Evening'] }
    };
    const cfg = configs[type];
    container.innerHTML = `
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-[11px] font-bold text-slate-900 mb-1 uppercase tracking-wide">${cfg.label}</label>
          <input id="vital-single-val" type="number" step="${cfg.step}" required value="${cfg.defaultVal}" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20" />
        </div>
        <div>
          <label class="block text-[11px] font-bold text-slate-900 mb-1 uppercase tracking-wide">Context</label>
          <select id="vital-context-input" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-xs font-medium focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20">
            ${cfg.ctx.map((c: string) => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
      </div>
    `;
  }
}

function handleLogVitalFormSubmit(e: Event) {
  e.preventDefault();
  const typeSelect = document.getElementById('vital-type-select') as HTMLSelectElement;
  const type = typeSelect.value;
  const contextInput = document.getElementById('vital-context-input') as HTMLSelectElement;
  const noteInput = document.getElementById('vital-note-input') as HTMLInputElement;
  const context = contextInput?.value || 'Resting';
  const note = noteInput?.value.trim() || '';

  const dateStr = new Date().toISOString().split('T')[0];
  const dateLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  if (type === 'bp') {
    const sysInput = document.getElementById('vital-bp-sys') as HTMLInputElement;
    const diaInput = document.getElementById('vital-bp-dia') as HTMLInputElement;
    const pulseInput = document.getElementById('vital-bp-pulse') as HTMLInputElement;
    const sys = parseInt(sysInput.value, 10);
    const dia = parseInt(diaInput.value, 10);
    const pulseOpt = parseInt(pulseInput.value, 10);

    const vital: VitalLog = {
      id: 'v-' + Date.now(),
      type: 'bp',
      sys,
      dia,
      date: dateStr,
      dateLabel,
      context,
      note
    };
    state.vitalLogs.unshift(vital);
    if (!isNaN(pulseOpt)) {
      state.vitalLogs.unshift({
        id: 'v-p-' + Date.now(),
        type: 'pulse',
        value: pulseOpt,
        date: dateStr,
        dateLabel,
        context: 'With BP reading',
        note
      });
    }
    showToast(`❤️ Logged BP: ${sys}/${dia} mmHg`);
  } else if (type === 'sugar') {
    const valInput = document.getElementById('vital-sugar-val') as HTMLInputElement;
    const unitInput = document.getElementById('vital-sugar-unit') as HTMLSelectElement;
    const rawVal = parseFloat(valInput.value);
    const unit = unitInput.value;
    const valueMgDl = unit === 'mmol/L' ? Math.round(rawVal * 18.0182) : rawVal;

    const vital: VitalLog = {
      id: 'v-' + Date.now(),
      type: 'sugar',
      valueMgDl,
      date: dateStr,
      dateLabel,
      context,
      note
    };
    state.vitalLogs.unshift(vital);
    showToast(`🩸 Logged Blood Sugar: ${rawVal} ${unit}`);
  } else {
    const valInput = document.getElementById('vital-single-val') as HTMLInputElement;
    const val = parseFloat(valInput.value);
    const vital: VitalLog = {
      id: 'v-' + Date.now(),
      type: type as any,
      value: val,
      date: dateStr,
      dateLabel,
      context,
      note
    };
    state.vitalLogs.unshift(vital);
    showToast(`✓ Logged ${type.toUpperCase()}: ${val}`);
  }

  closeModal();
  renderApp();
}

function setVitalsHistoryFilter(filter: 'all' | 'bp' | 'sugar' | 'pulse' | 'other') {
  state.vitalsHistoryFilter = filter;
  renderApp();
}

function openDatePicker(fieldName: string) {
  calendarTargetField = fieldName;
  
  // Get current date value from state
  let currentDate = '';
  if (fieldName === 'vitalsDateFrom') currentDate = state.vitalsDateFrom;
  else if (fieldName === 'vitalsDateTo') currentDate = state.vitalsDateTo;
  else if (fieldName === 'reportDateFrom') currentDate = state.reportDateFrom || '2026-11-11';
  else if (fieldName === 'reportDateTo') currentDate = state.reportDateTo || '2026-11-18';
  else if (fieldName === 'exportDateFrom') currentDate = (document.getElementById('export-date-from') as HTMLInputElement)?.value || '2026-11-11';
  else if (fieldName === 'exportDateTo') currentDate = (document.getElementById('export-date-to') as HTMLInputElement)?.value || '2026-11-18';

  calendarDisplayDate = currentDate || '2026-11-18';
  renderCalendarModal();
}

function renderCalendarModal() {
  const backdrop = document.getElementById('modal-backdrop');
  const modalBody = document.getElementById('modal-body');
  if (!backdrop || !modalBody) return;

  document.getElementById('modal-title')!.textContent = 'Select Date';
  document.getElementById('modal-subtitle')!.textContent = '';

  const [year, month] = calendarDisplayDate.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfMonth = new Date(year, month - 1, 1).getDay();

  // Generate calendar days
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let daysHtml = '';
  for (const d of days) {
    if (d === null) {
      daysHtml += '<div></div>';
    } else {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isSelected = dateStr === calendarDisplayDate;
      const bgClass = isSelected ? 'bg-teal-600 text-white' : 'bg-slate-50 text-slate-900 hover:bg-slate-100';
      daysHtml += `<button onclick="selectCalendarDate('${dateStr}')" class="text-xs font-bold py-2 rounded-lg transition ${bgClass}">${d}</button>`;
    }
  }

  modalBody.innerHTML = `
    <div class="space-y-4">
      <!-- Month/Year Navigation -->
      <div class="flex items-center justify-between gap-2 mb-4">
        <button onclick="shiftCalendarMonth(-1)" class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-xs font-bold transition">◀</button>
        <div class="text-xs font-bold text-slate-900 uppercase tracking-wide">${monthNames[month - 1]} ${year}</div>
        <button onclick="shiftCalendarMonth(1)" class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-xs font-bold transition">▶</button>
      </div>

      <!-- Calendar Grid -->
      <div class="grid grid-cols-7 gap-1">
        <!-- Day headers -->
        <div class="text-center text-[9px] font-bold text-slate-500 uppercase py-1.5">Su</div>
        <div class="text-center text-[9px] font-bold text-slate-500 uppercase py-1.5">Mo</div>
        <div class="text-center text-[9px] font-bold text-slate-500 uppercase py-1.5">Tu</div>
        <div class="text-center text-[9px] font-bold text-slate-500 uppercase py-1.5">We</div>
        <div class="text-center text-[9px] font-bold text-slate-500 uppercase py-1.5">Th</div>
        <div class="text-center text-[9px] font-bold text-slate-500 uppercase py-1.5">Fr</div>
        <div class="text-center text-[9px] font-bold text-slate-500 uppercase py-1.5">Sa</div>

        <!-- Date cells -->
        ${daysHtml}
      </div>

      <!-- Action buttons -->
      <div class="flex gap-2 pt-4">
        <button onclick="confirmCalendarDate()" class="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold py-3 rounded-lg transition">
          Select
        </button>
        <button onclick="closeModal()" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-3 rounded-lg transition">
          Cancel
        </button>
      </div>
    </div>
  `;

  backdrop.classList.remove('hidden');
}

function shiftCalendarMonth(direction: number) {
  const [year, month, day] = calendarDisplayDate.split('-').map(Number);
  let newMonth = month + direction;
  let newYear = year;

  if (newMonth > 12) {
    newMonth = 1;
    newYear++;
  } else if (newMonth < 1) {
    newMonth = 12;
    newYear--;
  }

  calendarDisplayDate = `${newYear}-${String(newMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  renderCalendarModal();
}

function selectCalendarDate(dateStr: string) {
  calendarDisplayDate = dateStr;
  renderCalendarModal();
}

function confirmCalendarDate() {
  if (!calendarTargetField) return;

  if (calendarTargetField === 'vitalsDateFrom') {
    state.vitalsDateFrom = calendarDisplayDate;
  } else if (calendarTargetField === 'vitalsDateTo') {
    state.vitalsDateTo = calendarDisplayDate;
  } else if (calendarTargetField === 'reportDateFrom') {
    state.reportDateFrom = calendarDisplayDate;
  } else if (calendarTargetField === 'reportDateTo') {
    state.reportDateTo = calendarDisplayDate;
  } else if (calendarTargetField === 'exportDateFrom') {
    const input = document.getElementById('export-date-from') as HTMLInputElement;
    const button = document.querySelector('[onclick="openDatePicker(\'exportDateFrom\')"]') as HTMLButtonElement;
    if (input) input.value = calendarDisplayDate;
    if (button) button.textContent = `📅 ${calendarDisplayDate}`;
  } else if (calendarTargetField === 'exportDateTo') {
    const input = document.getElementById('export-date-to') as HTMLInputElement;
    const button = document.querySelector('[onclick="openDatePicker(\'exportDateTo\')"]') as HTMLButtonElement;
    if (input) input.value = calendarDisplayDate;
    if (button) button.textContent = `📅 ${calendarDisplayDate}`;
  }

  calendarTargetField = null;
  closeModal();
  
  // Re-render if vitals or report tab
  if (['vitalsDateFrom', 'vitalsDateTo', 'reportDateFrom', 'reportDateTo'].includes(calendarTargetField || '')) {
    renderApp();
  }
}

function setVitalsViewMode(mode: 'cards' | 'printable') {
  state.vitalsViewMode = mode;
  renderApp();
}

function printVitalsList() {
  state.vitalsViewMode = 'printable';
  renderApp();
  requestAnimationFrame(() => window.print());
}

function getVitalsCsv(): string {
  const filtered = state.vitalLogs.filter((vital) => {
    if (vital.date < state.vitalsDateFrom || vital.date > state.vitalsDateTo) return false;
    if (state.vitalsHistoryFilter === 'all') return true;
    if (state.vitalsHistoryFilter === 'other') {
      return ['temp', 'spo2', 'weight'].includes(vital.type);
    }
    return vital.type === state.vitalsHistoryFilter;
  });

  const rows = [
    ['Date', 'Vital', 'Reading', 'Context'],
    ...filtered.map((vital) => {
      let vitalName = '';
      let reading = '';
      if (vital.type === 'bp') {
        vitalName = 'Blood Pressure';
        reading = `${vital.sys}/${vital.dia} mmHg`;
      } else if (vital.type === 'sugar') {
        vitalName = 'Blood Sugar';
        const value = state.glucoseUnit === 'mg/dL'
          ? vital.valueMgDl
          : Math.round(((vital.valueMgDl || 0) / 18.0182) * 10) / 10;
        reading = `${value} ${state.glucoseUnit}`;
      } else if (vital.type === 'pulse') {
        vitalName = 'Pulse Rate';
        reading = `${vital.value} bpm`;
      } else if (vital.type === 'temp') {
        vitalName = 'Temperature';
        reading = `${vital.value} °C`;
      } else if (vital.type === 'spo2') {
        vitalName = 'SpO2';
        reading = `${vital.value}%`;
      } else {
        vitalName = 'Body Weight';
        reading = `${vital.value} kg`;
      }
      return [
        vital.dateLabel,
        vitalName,
        reading,
        vital.note ? `${vital.context} | ${vital.note}` : vital.context,
      ];
    }),
  ];

  const escapeCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return '\uFEFF' + rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

function exportVitalsCsv() {
  const csv = getVitalsCsv();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `medflow-vitals-${state.vitalsDateFrom}-to-${state.vitalsDateTo}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  const rowCount = csv.split(/\r?\n/).length - 1;
  showToast(`✓ Exported ${rowCount} vital readings`);
}

async function copyVitalsCsv() {
  const csv = getVitalsCsv();
  try {
    await navigator.clipboard.writeText(csv);
    showToast('✓ CSV copied to clipboard');
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = csv;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    showToast(copied ? '✓ CSV copied to clipboard' : 'Unable to copy CSV', copied ? 'success' : 'alert');
  }
}

function toggleGlucoseUnit() {
  state.glucoseUnit = state.glucoseUnit === 'mg/dL' ? 'mmol/L' : 'mg/dL';
  renderApp();
}

function dismissMorningBanner() {
  state.showMorningBanner = false;
  renderApp();
}

function updateVitalsDateRange(fromVal: string | null, toVal: string | null) {
  if (fromVal) state.vitalsDateFrom = fromVal;
  if (toVal) state.vitalsDateTo = toVal;
  renderApp();
}

function updateReportDateRange(fromVal: string | null, toVal: string | null) {
  if (fromVal) state.reportDateFrom = fromVal;
  if (toVal) state.reportDateTo = toVal;
  renderApp();
}

function applyVitalsDatePreset(days: number) {
  const toDate = '2026-11-18';
  state.vitalsDateTo = toDate;
  if (days === 1) {
    state.vitalsDateFrom = '2026-11-18';
  } else if (days === 3) {
    state.vitalsDateFrom = '2026-11-16';
  } else if (days === 7) {
    state.vitalsDateFrom = '2026-11-12';
  }
  renderApp();
}

function openExportDateRangeModal() {
  const backdrop = document.getElementById('modal-backdrop');
  const modalBody = document.getElementById('modal-body');
  if (!backdrop || !modalBody) return;

  document.getElementById('modal-title')!.textContent = 'Export Health Report';
  document.getElementById('modal-subtitle')!.textContent = 'Select date range';

  const today = '2026-11-18';
  const sevenDaysAgo = '2026-11-11';

  modalBody.innerHTML = `
    <form onsubmit="handleExportReport(event)" class="space-y-4">
      <div class="bg-slate-50 border border-slate-200 rounded-xl p-3">
        <label class="block text-xs font-bold text-slate-900 uppercase tracking-wide mb-2.5">From Date</label>
        <button onclick="openDatePicker('exportDateFrom')" type="button" class="w-full text-left bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-xs font-semibold text-slate-900 hover:border-teal-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20 transition">
          📅 ${sevenDaysAgo}
        </button>
        <input 
          id="export-date-from" 
          type="hidden" 
          value="${sevenDaysAgo}" 
        />
      </div>

      <div class="bg-slate-50 border border-slate-200 rounded-xl p-3">
        <label class="block text-xs font-bold text-slate-900 uppercase tracking-wide mb-2.5">To Date</label>
        <button onclick="openDatePicker('exportDateTo')" type="button" class="w-full text-left bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-xs font-semibold text-slate-900 hover:border-teal-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20 transition">
          📅 ${today}
        </button>
        <input 
          id="export-date-to" 
          type="hidden" 
          value="${today}" 
        />
      </div>

      <div class="flex gap-2 pt-2">
        <button type="submit" class="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold py-3 rounded-lg transition active:scale-95">
          📄 Export Report
        </button>
        <button type="button" onclick="closeModal()" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-3 rounded-lg transition">
          Cancel
        </button>
      </div>
    </form>
  `;

  backdrop.classList.remove('hidden');
}

function handleExportReport(event: Event) {
  event.preventDefault();
  
  const dateFromInput = document.getElementById('export-date-from') as HTMLInputElement;
  const dateToInput = document.getElementById('export-date-to') as HTMLInputElement;
  
  const dateFrom = dateFromInput?.value;
  const dateTo = dateToInput?.value;
  
  if (!dateFrom || !dateTo) {
    showToast('Please select both dates', 'warning');
    return;
  }

  if (dateFrom > dateTo) {
    showToast('From date must be before To date', 'warning');
    return;
  }

  state.reportDateFrom = dateFrom;
  state.reportDateTo = dateTo;
  
  closeModal();
  showToast(`📄 Health Report exported (${dateFrom} to ${dateTo})`);
  renderApp();
}


function dismissVitalsPrompt() {
  renderApp();
}

// ==========================================
// ADDITIONAL EVENT HANDLERS
// ==========================================

function triggerLockScreenNotification(title: string = 'MedFlow Reminder', message: string = 'Time to take your medication!') {
  if (import.meta.env.DEV && GuardianSyncService.isOnline()) {
    const dose = state.doses.find((item) => item.status === 'pending');
    const med = dose ? state.medications.find((item) => item.id === dose.medId) : state.medications[0];
    if (med) {
      const scheduledMinutes = dose?.scheduledMinutes || 0;
      const alert = {
        id: 'galert-' + Date.now(),
        patientName: state.myPatientName || 'MedFlow Patient',
        medName: `${med.name} ${med.strength}`.trim(),
        scheduledTime: formatMinutesTo12h(scheduledMinutes),
        overdueBy: '1h 00m past window',
        acknowledged: false,
      };
      guardianAlerts.unshift(alert);
      void GuardianSyncService.pushMissedDoseAlert(alert).then((insertedId) => {
        if (insertedId) alert.id = insertedId;
        showToast(insertedId ? '✓ Test missed alert synced to Supabase' : 'Unable to sync missed alert', insertedId ? 'success' : 'warning');
        renderApp();
      });
    }
  }

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body: message,
      icon: '💊',
      tag: 'medflow-reminder',
      requireInteraction: true,
    });
  } else if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(registration => {
      registration.showNotification(title, {
        body: message,
        icon: '💊',
        tag: 'medflow-reminder',
        requireInteraction: true,
      });
    }).catch(err => console.log('Notification error:', err));
  } else {
    showToast(message, 'alert');
  }
}

function dismissPushBanner() {
  renderApp();
}

async function resetDemoData() {
  if (!import.meta.env.DEV) return;
  if (!confirm('Reset all MedFlow browser demo medications, doses, vitals, intake history, and Guardian requests?')) {
    return;
  }

  try {
    if (!Capacitor.isNativePlatform()) {
      [
        'medflow_medications',
        'medflow_doses',
        'medflow_vitalLogs',
        'medflow_intakeHistory',
        'medflow_guardian_incoming',
        'medflow_guardian_approved',
        'medflow_guardian_pending',
        'medflow_guardian_monitored',
        'medflow_myPatientName',
        'medflow_guardian_nicknames',
        'medflow_guardian_nickname_prompted',
      ].forEach((key) => localStorage.removeItem(key));
    } else {
      showToast('Demo reset is browser-only', 'warning');
      return;
    }

    state.medications = [];
    state.doses = [];
    state.vitalLogs = [];
    state.intakeHistory = [];
    state.showMorningBanner = true;
    
    await seedSampleData();
    
    state.medications = await db.getMedications();
    state.doses = await db.getDoses();
    state.vitalLogs = await db.getVitalLogs();
    state.intakeHistory = await db.getIntakeHistory(100);
    (state as any).incomingRequests = [];
    (state as any).approvedGuardians = [];
    (state as any).pendingLinkRequests = [];
    (state as any).incomingRequestsOpen = false;
    await syncCurrentGuardianDoseFeed();
    
    showToast('✓ Demo data reset');
    renderApp();
  } catch (error) {
    console.error('Reset failed:', error);
    showToast('Reset failed', 'alert');
  }
}

// ==========================================
// WINDOW EXPORTS - Make handlers accessible from inline onclick
// ==========================================

(window as any).switchTab = switchTab;
(window as any).openAddMedModal = openAddMedModal;
(window as any).closeModal = closeModal;
(window as any).openLogVitalModal = openLogVitalModal;
(window as any).takeScheduledDose = takeScheduledDose;
(window as any).snoozeDose = snoozeDose;
(window as any).takePrnDose = takePrnDose;
(window as any).skipPrnCooldown = skipPrnCooldown;
(window as any).refillMedication = refillMedication;
(window as any).editMedication = editMedication;
(window as any).deleteMedication = deleteMedication;
(window as any).simulateOcrBottleScan = simulateOcrBottleScan;
(window as any).scanBottleOcr = scanBottleOcr;
(window as any).handleAddMedicationSubmit = handleAddMedicationSubmit;
(window as any).toggleScheduleFields = toggleScheduleFields;
(window as any).toggleMealTimingField = toggleMealTimingField;
(window as any).renderVitalInputFields = renderVitalInputFields;
(window as any).handleLogVitalFormSubmit = handleLogVitalFormSubmit;
(window as any).setVitalsHistoryFilter = setVitalsHistoryFilter;
(window as any).openDatePicker = openDatePicker;
(window as any).renderCalendarModal = renderCalendarModal;
(window as any).shiftCalendarMonth = shiftCalendarMonth;
(window as any).selectCalendarDate = selectCalendarDate;
(window as any).confirmCalendarDate = confirmCalendarDate;
(window as any).setVitalsViewMode = setVitalsViewMode;
(window as any).printVitalsList = printVitalsList;
(window as any).exportVitalsCsv = exportVitalsCsv;
(window as any).copyVitalsCsv = copyVitalsCsv;
(window as any).toggleGlucoseUnit = toggleGlucoseUnit;
(window as any).dismissMorningBanner = dismissMorningBanner;
(window as any).updateVitalsDateRange = updateVitalsDateRange;
(window as any).updateReportDateRange = updateReportDateRange;
(window as any).applyVitalsDatePreset = applyVitalsDatePreset;
(window as any).openExportDateRangeModal = openExportDateRangeModal;
(window as any).handleExportReport = handleExportReport;
(window as any).dismissVitalsPrompt = dismissVitalsPrompt;
(window as any).setGuardianSubView = setGuardianSubView;
(window as any).toggleGuardianSync = toggleGuardianSync;
(window as any).toggleEscalateMissedMeds = toggleEscalateMissedMeds;
(window as any).copyPatientCode = copyPatientCode;
(window as any).saveMyPatientName = saveMyPatientName;
(window as any).validatePatientCode = validatePatientCode;
(window as any).confirmPatientLink = confirmPatientLink;
(window as any).cancelPatientLink = cancelPatientLink;
(window as any).linkNewPatientByCode = linkNewPatientByCode;
(window as any).acknowledgeGuardianAlert = acknowledgeGuardianAlert;
(window as any).showToast = showToast;
(window as any).__MEDFLOW_DEV__ = import.meta.env.DEV;
(window as any).GuardianSyncService = GuardianSyncService;
(window as any).state = state;
(window as any).getVitalStatus = getVitalStatus;
(window as any).renderApp = renderApp;
(window as any).renderTodayTab = renderTodayTab;
(window as any).renderVitalsTab = renderVitalsTab;
(window as any).renderCabinetTab = renderCabinetTab;
(window as any).renderGuardianTab = renderGuardianTab;
(window as any).renderReportTab = renderReportTab;
(window as any).triggerLockScreenNotification = triggerLockScreenNotification;
(window as any).dismissPushBanner = dismissPushBanner;
(window as any).resetDemoData = resetDemoData;
(window as any).parse24hToMinutes = parse24hToMinutes;

initializeApp();
