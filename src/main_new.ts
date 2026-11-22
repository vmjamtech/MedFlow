/**
 * MedFlow Main Application — Complete 5-Tab Medication & Vitals Management
 * 100% offline-first with optional Guardian family monitoring
 */

import './index.css';
import { db } from './db/database';
import type { Medication, Dose, VitalLog, IntakeHistory } from './db/schema';
import { 
  classifyBloodPressure, classifyBloodGlucose, classifyRestingPulse, 
  classifyTemperature, classifySpO2, getVitalStatus, convertGlucose
} from './utils/clinical';
import { renderPillSVG, getPillBgClass } from './utils/pillSvg';

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
  guardianSyncEnabled: boolean;
  guardianSubView: 'monitoring' | 'mycode';
  glucoseUnit: 'mg/dL' | 'mmol/L';
  vitalsHistoryFilter: 'all' | 'bp' | 'sugar' | 'pulse' | 'other';
  vitalsViewMode: 'cards' | 'printable';
  vitalsDateFrom: string;
  vitalsDateTo: string;
}

let state: AppState = {
  currentTab: 'today',
  medications: [],
  doses: [],
  vitalLogs: [],
  intakeHistory: [],
  myPatientCode: 'MED-7429',
  guardianSyncEnabled: true,
  guardianSubView: 'monitoring',
  glucoseUnit: 'mg/dL',
  vitalsHistoryFilter: 'all',
  vitalsViewMode: 'cards',
  vitalsDateFrom: '2026-11-12',
  vitalsDateTo: '2026-11-18',
};

let prnTimerInterval: NodeJS.Timeout | null = null;
let simulatedNowMinutes = 8 * 60; // Start at 08:00 AM
let guardianAlerts: Array<any> = [];
let monitoredPatients: Array<any> = [];

// ==========================================
// INITIALIZATION
// ==========================================

async function initializeApp() {
  try {
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

    monitoredPatients = [
      {
        id: 'pat-mom',
        name: 'Mom (Elena R.)',
        code: 'MED-3104',
        relation: 'Mother',
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
        name: 'Dad (Roberto R.)',
        code: 'MED-9921',
        relation: 'Father',
        adherence: 84,
        lastSync: 'Just now',
        status: 'overdue',
        meds: [
          { name: 'Insulin Glargine', qty: '12 units', time: '07:00 AM', status: 'missed_1h' },
          { name: 'Metformin 500mg', qty: '1 tablet', time: '12:30 PM', status: 'upcoming' }
        ]
      }
    ];

    guardianAlerts = [
      {
        id: 'galert-1',
        patientName: 'Dad (Roberto R.)',
        medName: 'Insulin Glargine (12 units)',
        scheduledTime: '07:00 AM',
        overdueBy: '1h 05m past window',
        acknowledged: false
      }
    ];

    console.log('✓ App initialized');
    renderApp();
  } catch (error) {
    console.error('❌ Init failed:', error);
  }
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
      mealTiming: 'With Meal',
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

  for (const med of medications) await db.saveMedication(med);
  for (const dose of doses) await db.saveDose(dose);
  for (const vital of vitalLogs) await db.saveVitalLog(vital);
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

function getTimeOfDayGroup(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  if (wrapped < 12 * 60) return 'Morning';
  if (wrapped < 17 * 60) return 'Afternoon';
  return 'Evening';
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
    ? 'bg-amber-900/95 text-amber-50 border-amber-700'
    : type === 'alert'
    ? 'bg-rose-900/95 text-rose-50 border-rose-700'
    : 'bg-slate-900/95 text-white border-slate-700';
  toast.className = `animate-toast ${bgClass} border px-3.5 py-2.5 rounded-2xl shadow-lg text-xs font-medium backdrop-blur-md`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

