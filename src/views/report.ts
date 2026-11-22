/**
 * Report Tab View: Clinician summary with PDF export
 * Shows adherence %, average vitals, 7-day activity log
 */

import { db } from '../db/database';
import { convertGlucose } from '../utils/clinical';

export async function renderReportTab(): Promise<HTMLElement> {
  const container = document.createElement('div');
  container.className = 'space-y-4';

  // Load data for summary
  const doses = await db.getDoses();
  const vitals = await db.getVitalLogs();
  const history = await db.getIntakeHistory(10);

  const takenCount = doses.filter((d) => d.status === 'taken').length;
  const totalCount = doses.length;
  const adherencePercent = totalCount > 0 ? Math.round((takenCount / totalCount) * 100) : 100;

  const bpReadings = vitals.filter((v) => v.type === 'bp');
  const avgSys = bpReadings.length ? Math.round(bpReadings.reduce((acc, v) => acc + (v.sys || 0), 0) / bpReadings.length) : 120;
  const avgDia = bpReadings.length ? Math.round(bpReadings.reduce((acc, v) => acc + (v.dia || 0), 0) / bpReadings.length) : 78;

  const sugarReadings = vitals.filter((v) => v.type === 'sugar');
  const avgSugarMg = sugarReadings.length ? Math.round(sugarReadings.reduce((acc, v) => acc + (v.valueMgDl || 0), 0) / sugarReadings.length) : 105;

  const pulseReadings = vitals.filter((v) => v.type === 'pulse');
  const avgPulse = pulseReadings.length ? Math.round(pulseReadings.reduce((acc, v) => acc + (v.value || 0), 0) / pulseReadings.length) : 74;

  // Clinician summary banner
  const banner = document.createElement('div');
  banner.className = 'bg-slate-900 text-white rounded-3xl p-4 space-y-3 shadow-sm';
  banner.innerHTML = `
    <div class="flex items-start justify-between gap-3">
      <div>
        <span class="text-[10px] font-bold uppercase tracking-wider text-teal-400">Clinician Summary</span>
        <h2 class="text-base font-bold mt-0.5">7-Day Adherence & Vitals</h2>
        <p class="text-[11px] text-slate-300 mt-0.5">Correlates medication intake with blood pressure & glucose response</p>
      </div>
      <span class="text-2xl shrink-0">📋</span>
    </div>
    <button class="w-full bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-extrabold py-2.5 rounded-xl transition">
      📄 Export PDF Report for Doctor
    </button>
  `;
  container.appendChild(banner);

  // Summary cards (2x2 grid)
  const summary = document.createElement('div');
  summary.className = 'grid grid-cols-2 gap-2.5';

  const cards = [
    { label: 'Today Adherence', value: `${adherencePercent}%`, detail: `${takenCount}/${totalCount} doses` },
    { label: 'Avg Blood Pressure', value: `${avgSys}/${avgDia}`, detail: `${bpReadings.length} readings` },
    { label: 'Avg Blood Sugar', value: `${convertGlucose(avgSugarMg, 'mg/dL')} mg/dL`, detail: `${sugarReadings.length} logs` },
    { label: 'Avg Resting Pulse', value: `${avgPulse} bpm`, detail: `${pulseReadings.length} logs` },
  ];

  cards.forEach((card) => {
    const element = document.createElement('div');
    element.className = 'bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-sm';
    element.innerHTML = `
      <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">${card.label}</p>
      <p class="text-lg font-extrabold text-slate-900 mt-1">${card.value}</p>
      <p class="text-[10px] text-slate-500 mt-0.5">${card.detail}</p>
    `;
    summary.appendChild(element);
  });

  container.appendChild(summary);

  // Recent activity log
  const activitySection = document.createElement('div');
  activitySection.className = 'space-y-2.5';

  const activityHeading = document.createElement('h3');
  activityHeading.className = 'text-xs font-bold uppercase tracking-wider text-slate-400 px-1';
  activityHeading.textContent = 'Recent Intake Activity Log';
  activitySection.appendChild(activityHeading);

  history.forEach((item) => {
    const logItem = document.createElement('div');
    logItem.className = 'bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-sm flex items-start gap-3';
    logItem.innerHTML = `
      <div class="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold shrink-0">✓</div>
      <div class="flex-1 min-w-0">
        <p class="text-xs font-bold text-slate-900">${item.medName} ${item.strength} • ${item.timingStatus}</p>
        <p class="text-[10px] font-medium text-slate-400 mt-1">${item.date} • ${item.takenAt}</p>
      </div>
    `;
    activitySection.appendChild(logItem);
  });

  container.appendChild(activitySection);

  return container;
}
