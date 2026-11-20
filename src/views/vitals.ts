/**
 * Vitals Tab View: Blood pressure, glucose, pulse tracking with trend graphs
 * Includes ACC/AHA & ADA clinical classifications + date range filtering
 */

import { db } from '../db/database';
import { getVitalStatus, convertGlucose } from '../utils/clinical';
import type { VitalLog } from '../db/schema';

export async function renderVitalsTab(): Promise<HTMLElement> {
  const container = document.createElement('div');
  container.className = 'space-y-4';

  // Load vital logs
  const vitals = await db.getVitalLogs();
  const latestBp = vitals.find((v) => v.type === 'bp');
  const latestSugar = vitals.find((v) => v.type === 'sugar');
  const latestPulse = vitals.find((v) => v.type === 'pulse');

  // Render primary vitals summary cards
  const summary = document.createElement('div');
  summary.className = 'grid grid-cols-1 gap-2.5';

  // Blood Pressure card
  const bpStatus = getVitalStatus('bp', { sys: latestBp?.sys, dia: latestBp?.dia });
  const bpCard = document.createElement('div');
  bpCard.className = 'bg-white rounded-2xl p-4 border border-slate-200 shadow-sm';
  bpCard.innerHTML = `
    <div class="flex items-center justify-between">
      <div>
        <p class="text-xs font-bold text-slate-400 uppercase">Blood Pressure</p>
        <p class="text-lg font-extrabold text-slate-900 mt-1">${latestBp ? `${latestBp.sys}/${latestBp.dia}` : '--/--'} mmHg</p>
      </div>
      <span class="${bpStatus.badge} text-[10px] font-bold px-2 py-1 rounded-full">${bpStatus.label}</span>
    </div>
  `;
  summary.appendChild(bpCard);

  // Blood Sugar card
  const sugarStatus = getVitalStatus('sugar', { valueMgDl: latestSugar?.valueMgDl, context: latestSugar?.context });
  const sugarCard = document.createElement('div');
  sugarCard.className = 'bg-white rounded-2xl p-4 border border-slate-200 shadow-sm';
  sugarCard.innerHTML = `
    <div class="flex items-center justify-between">
      <div>
        <p class="text-xs font-bold text-slate-400 uppercase">Blood Sugar</p>
        <p class="text-lg font-extrabold text-slate-900 mt-1">${latestSugar ? `${convertGlucose(latestSugar.valueMgDl, 'mg/dL')} mg/dL` : '--'}</p>
      </div>
      <span class="${sugarStatus.badge} text-[10px] font-bold px-2 py-1 rounded-full">${sugarStatus.label}</span>
    </div>
  `;
  summary.appendChild(sugarCard);

  // Pulse card
  const pulseStatus = getVitalStatus('pulse', { value: latestPulse?.value });
  const pulseCard = document.createElement('div');
  pulseCard.className = 'bg-white rounded-2xl p-4 border border-slate-200 shadow-sm';
  pulseCard.innerHTML = `
    <div class="flex items-center justify-between">
      <div>
        <p class="text-xs font-bold text-slate-400 uppercase">Resting Pulse</p>
        <p class="text-lg font-extrabold text-slate-900 mt-1">${latestPulse ? `${latestPulse.value} bpm` : '--'}</p>
      </div>
      <span class="${pulseStatus.badge} text-[10px] font-bold px-2 py-1 rounded-full">${pulseStatus.label}</span>
    </div>
  `;
  summary.appendChild(pulseCard);

  container.appendChild(summary);

  // Vital logs list
  const logsList = document.createElement('div');
  logsList.className = 'space-y-2';
  const heading = document.createElement('h3');
  heading.className = 'text-xs font-bold uppercase tracking-wider text-slate-400 px-1';
  heading.textContent = `Recent Readings (${vitals.length})`;
  logsList.appendChild(heading);

  vitals.slice(0, 10).forEach((log) => {
    const logItem = document.createElement('div');
    logItem.className = 'bg-white rounded-2xl p-3 border border-slate-200 shadow-sm';
    
    let valueStr = '';
    if (log.type === 'bp') valueStr = `${log.sys}/${log.dia} mmHg`;
    else if (log.type === 'sugar') valueStr = `${convertGlucose(log.valueMgDl || 0, 'mg/dL')} mg/dL`;
    else valueStr = `${log.value}${log.type === 'temp' ? '°C' : log.type === 'spo2' ? '%' : log.type === 'weight' ? ' kg' : ''}`;

    logItem.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <div class="flex-1 min-w-0">
          <p class="text-xs font-bold text-slate-900">${log.dateLabel}</p>
          <p class="text-xs text-slate-500 mt-0.5">${valueStr} • ${log.context}</p>
        </div>
        <span class="text-[10px] font-bold px-2 py-1 rounded-full shrink-0 bg-slate-100 text-slate-600">${log.type.toUpperCase()}</span>
      </div>
    `;
    logsList.appendChild(logItem);
  });

  container.appendChild(logsList);

  return container;
}
