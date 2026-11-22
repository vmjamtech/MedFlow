/**
 * Database schema: TypeScript interfaces for all MedFlow entities
 * Fully offline-first with optional Supabase Guardian sync
 */

export interface Medication {
  id: string;
  name: string;
  strength: string; // e.g., "500mg", "10 IU"
  shape: 'round' | 'oval' | 'capsule';
  color: 'teal' | 'amber' | 'rose' | 'blue' | 'indigo';
  doseQty: number; // 1, 0.5, 2 tablets per intake
  unit: 'tablet' | 'capsule' | 'ml' | 'drop' | 'puff';
  scheduleType: 'fixed' | 'interval' | 'prn';
  
  // Fixed schedule (e.g., "08:00", "20:00")
  fixedTimes?: string[];
  
  // Interval-based (auto-shifts if taken late)
  intervalHours?: number; // 6, 8, 12 hours
  
  // As Needed (PRN) with safety cooldown
  cooldownHours?: number; // 4, 6, 8, 24 hour cooldown
  maxPerDay?: number; // Safety cap: max 3 intakes/day
  
  // Meal context
  mealRequired: 'with_meal' | 'no_meal';
  mealTiming?: 'Before Meal' | 'After Meal';
  
  // Inventory tracking
  stockRemaining: number;
  stockTotal: number;
  lowStockThreshold: number; // e.g., 5 pieces
  
  // User-facing display
  instruction?: string; // e.g., "With breakfast • 0.5 scored tablet"
  mealTag?: string; // Display-only: "With Meal", "After Meal", etc.
  
  // PRN tracking (runtime)
  takenTodayCount?: number;
  cooldownRemainingSeconds?: number;
  
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Dose {
  id: string;
  medId: string; // Foreign key to Medication
  scheduledMinutes: number; // Minutes since midnight (0-1440)
  originalMinutes: number; // Original time before late-dose shifts
  status: 'pending' | 'taken' | 'skipped' | 'missed';
  takenAtStr?: string; // e.g., "02:15 PM"
  shiftNote?: string; // e.g., "Auto-shifted +90m to keep 8h spacing"
  createdAt?: Date;
  updatedAt?: Date;
}

export interface VitalLog {
  id: string;
  type: 'bp' | 'sugar' | 'pulse' | 'temp' | 'spo2' | 'weight';
  
  // Blood pressure (mmHg)
  sys?: number; // Systolic
  dia?: number; // Diastolic
  
  // Blood sugar (always stored as mg/dL internally)
  valueMgDl?: number;
  
  // Pulse, temperature, SpO2, weight
  value?: number;
  
  date: string; // ISO 8601: "2026-11-18"
  dateLabel: string; // User-facing: "Today, 07:45 AM"
  context: string; // "Resting", "Fasting", "After Meal", "With BP reading"
  note?: string; // Optional user annotation
  
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IntakeHistory {
  id: string;
  medId: string;
  medName: string;
  strength: string;
  doseQty: number;
  unit: string;
  takenAt: string; // User-facing: "Nov 18 · 07:30 AM"
  date: string; // ISO 8601: "2026-11-18"
  timingStatus: string; // "On time", "PRN", "Late"
  scheduleType: 'fixed' | 'interval' | 'prn';
  createdAt?: Date;
}

/**
 * Guardian Mode: Optional cloud sync for family caregivers
 * Guardians receive 1h+ missed-dose escalations via Supabase real-time
 */
export interface GuardianAlert {
  id: string;
  patientName: string; // Name of monitored patient
  medName: string; // Medication name + strength
  scheduledTime: string; // "08:00 AM"
  overdueBy: string; // "1h 05m unlogged", "2h 30m past window"
  acknowledged: boolean;
  createdAt?: Date;
}

export interface MonitoredPatient {
  id: string;
  name: string; // e.g., "Mom (Elena R.)"
  code: string; // "MED-3104" - unique patient invite code
  relation: string; // "Mother", "Father", "Sibling"
  adherence: number; // 0-100%
  lastSync: string; // "2 mins ago"
  status: 'on_track' | 'overdue' | 'offline';
  meds: MonitoredMedication[];
  createdAt?: Date;
}

export interface MonitoredMedication {
  name: string;
  qty: string; // "1 tablet", "12 units"
  time: string; // "08:00 AM"
  status: 'taken' | 'upcoming' | 'missed_1h' | 'missed_2h';
}

export interface GuardianLink {
  id: string;
  patientUserId: string;
  guardianUserId: string;
  patientCode: string;
  guardianCode: string;
  guardianName: string;
  status: 'pending' | 'approved' | 'revoked';
  timestamp: string;
}

export const PILL_COLORS = {
  teal: { fill: '#0d9488', accent: '#99f6e4', bg: 'bg-teal-50' },
  amber: { fill: '#d97706', accent: '#fde68a', bg: 'bg-amber-50' },
  rose: { fill: '#e11d48', accent: '#fecdd3', bg: 'bg-rose-50' },
  blue: { fill: '#0284c7', accent: '#bae6fd', bg: 'bg-sky-50' },
  indigo: { fill: '#4f46e5', accent: '#c7d2fe', bg: 'bg-indigo-50' },
};

export const OCR_SAMPLE_BOTTLES = [
  {
    rawText: 'LOSARTAN POTASSIUM 50MG TAB\nTAKE 1 TABLET BY MOUTH EVERY MORNING\nQTY: 30 TABS • REFILLS: 2',
    name: 'Losartan',
    strength: '50mg',
    shape: 'round' as const,
    color: 'blue' as const,
    doseQty: 1,
    unit: 'tablet' as const,
    scheduleType: 'fixed' as const,
    fixedTime: '08:00',
    stock: 30,
    mealRequired: 'no_meal' as const,
    mealTiming: 'Before Meal',
  },
  {
    rawText: 'AZITHROMYCIN 500MG CAPSULES\nTAKE 1 CAPSULE EVERY 12 HOURS WITH FOOD\nQTY: 14 CAPS',
    name: 'Azithromycin',
    strength: '500mg',
    shape: 'capsule' as const,
    color: 'teal' as const,
    doseQty: 1,
    unit: 'capsule' as const,
    scheduleType: 'interval' as const,
    intervalHours: 12,
    startTime: '09:00',
    stock: 14,
    mealRequired: 'with_meal' as const,
    mealTiming: 'After Meal',
  },
  {
    rawText: 'CETIRIZINE HCL 10MG TABLET\nTAKE 1 TABLET AS NEEDED FOR ALLERGY (MAX 1/DAY)\nQTY: 20 TABS',
    name: 'Cetirizine',
    strength: '10mg',
    shape: 'oval' as const,
    color: 'indigo' as const,
    doseQty: 1,
    unit: 'tablet' as const,
    scheduleType: 'prn' as const,
    cooldown: 24,
    maxDay: 1,
    stock: 20,
    mealRequired: 'no_meal' as const,
    mealTiming: 'Before Meal',
  },
];
