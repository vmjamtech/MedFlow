/**
 * Cabinet Tab View: Medicine inventory tracking with low-stock warnings
 * Shows piece progress bars, consumption math, refill button
 */

import { db } from '../db/database';
import { getPillBgClass } from '../utils/pillSvg';
export async function renderCabinetTab(): Promise<HTMLElement> {
  const container = document.createElement('div');
  container.className = 'space-y-3.5';

  // Load medications
  const medications = await db.getMedications();

  // Render each medication card
  for (const med of medications) {
    const pct = Math.min(100, Math.round((med.stockRemaining / med.stockTotal) * 100));
    const dailyUsage =
      med.scheduleType === 'fixed'
        ? (med.fixedTimes?.length || 1) * med.doseQty
        : med.scheduleType === 'interval'
        ? Math.max(1, Math.floor(24 / (med.intervalHours || 8))) * med.doseQty
        : med.doseQty;
    const daysLeft = dailyUsage > 0 ? Math.floor(med.stockRemaining / dailyUsage) : 0;
    const isLow = med.stockRemaining <= med.lowStockThreshold || (med.scheduleType !== 'prn' && daysLeft <= 5);

    const card = document.createElement('div');
    card.className = `bg-white rounded-3xl p-4 border ${isLow ? 'border-amber-300 ring-2 ring-amber-500/10' : 'border-slate-200/80'} shadow-sm space-y-3`;

    // Header with med name and stock count
    const header = document.createElement('div');
    header.className = 'flex items-start justify-between gap-2.5';
    const bgClass = getPillBgClass(med.color as any);
    header.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-10 h-10 rounded-2xl ${bgClass} flex items-center justify-center shrink-0">
          💊
        </div>
        <div class="min-w-0">
          <h3 class="font-bold text-slate-900 text-sm truncate">${med.name} <span class="text-xs font-medium text-slate-500">${med.strength}</span></h3>
          <p class="text-xs font-semibold ${isLow ? 'text-amber-700' : 'text-slate-600'} mt-0.5">
            ${med.stockRemaining} / ${med.stockTotal} ${med.unit}s left
          </p>
        </div>
      </div>
      <button class="bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 text-xs font-bold px-2.5 py-1.5 rounded-xl transition shrink-0">
        + Refill
      </button>
    `;
    card.appendChild(header);

    // Progress bar
    const bar = document.createElement('div');
    bar.className = 'w-full h-2 bg-slate-100 rounded-full overflow-hidden';
    bar.innerHTML = `<div class="h-full ${isLow ? 'bg-amber-500' : 'bg-teal-500'} rounded-full transition-all" style="width: ${pct}%"></div>`;
    card.appendChild(bar);

    // Info footer
    const footer = document.createElement('div');
    footer.className = 'flex items-center justify-between text-[11px] gap-2';
    footer.innerHTML = `
      <span class="text-slate-400">Dose: ${med.doseQty} ${med.unit}${med.doseQty > 1 ? 's' : ''}</span>
      ${isLow ? `<span class="font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-lg">⚠️ Low (${daysLeft}d left)</span>` : `<span class="font-medium text-emerald-600">✓ ~${daysLeft} days left</span>`}
    `;
    card.appendChild(footer);

    container.appendChild(card);
  }

  if (medications.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'text-center py-8 text-slate-500';
    empty.innerHTML = `
      <p class="text-sm font-medium">No medications added yet</p>
      <p class="text-xs mt-1">Tap the + button to add your first medication</p>
    `;
    container.appendChild(empty);
  }

  return container;
}
