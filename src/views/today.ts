/**
 * Today Tab View: Daily dose adherence & PRN tracking
 * Core MedFlow feature: Track scheduled meds, PRN cooldowns, interval-shifting
 */

import { db } from '../db/database';
import { SchedulerService } from '../services/scheduler';
import type { Dose } from '../db/schema';

export async function renderTodayTab(): Promise<HTMLElement> {
  const container = document.createElement('div');
  container.className = 'space-y-5';

  // Load medications and doses
  const medications = await db.getMedications();
  const doses = await db.getDoses();

  if (medications.length === 0 && doses.length === 0) {
    container.innerHTML = `
      <section class="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center shadow-sm">
        <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-2xl">💊</div>
        <p class="text-sm font-bold text-slate-800">No medications scheduled for today</p>
        <p class="mt-1 text-xs text-slate-500">Add your first medication to build today's regimen.</p>
        <button onclick="openAddMedModal()" class="mt-4 rounded-lg bg-teal-600 px-4 py-2.5 text-xs font-bold text-white">+ Add Medication</button>
      </section>
    `;
    return container;
  }

  // Group doses by time-of-day (Morning, Afternoon, Evening)
  const groups: { [key: string]: Dose[] } = { Morning: [], Afternoon: [], Evening: [] };
  doses.forEach((dose) => {
    const group = SchedulerService.getTimeOfDayGroup(dose.scheduledMinutes);
    groups[group].push(dose);
  });

  // Render adherence banner
  const takenCount = doses.filter((d) => d.status === 'taken').length;
  const totalCount = doses.length;
  const banner = document.createElement('div');
  banner.className = 'bg-teal-50 border border-teal-200 rounded-2xl p-3.5 flex items-center justify-between';
  banner.innerHTML = `
    <div>
      <p class="text-xs font-bold text-teal-700 uppercase tracking-wider">Today's Progress</p>
      <p class="text-sm font-extrabold text-teal-900 mt-0.5">${takenCount} / ${totalCount} Doses Taken</p>
    </div>
    <span class="text-3xl font-bold text-teal-600">${totalCount > 0 ? Math.round((takenCount / totalCount) * 100) : 100}%</span>
  `;
  container.appendChild(banner);

  // Render dose groups
  for (const [period, periodDoses] of Object.entries(groups)) {
    if (periodDoses.length === 0) continue;

    const section = document.createElement('section');
    section.className = 'space-y-2.5';

    const heading = document.createElement('h2');
    heading.className = 'text-xs font-bold uppercase tracking-wider text-slate-400 px-1';
    const icon = period === 'Morning' ? '🌅' : period === 'Afternoon' ? '☀️' : '🌙';
    heading.textContent = `${icon} ${period} (${periodDoses.length} dose${periodDoses.length > 1 ? 's' : ''})`;
    section.appendChild(heading);

    // Render each dose in period
    for (const dose of periodDoses) {
      const med = medications.find((m) => m.id === dose.medId);
      if (!med) continue;

      const doseCard = document.createElement('div');
      doseCard.className = `bg-white rounded-2xl p-4 border ${dose.status === 'taken' ? 'border-emerald-200' : 'border-slate-200'} shadow-sm`;
      doseCard.innerHTML = `
        <div class="flex items-start justify-between gap-2.5">
          <div class="flex-1 min-w-0">
            <h3 class="font-bold text-slate-900">${med.name} ${med.strength}</h3>
            <p class="text-xs text-slate-500 mt-0.5">Take ${med.doseQty} ${med.unit}${med.doseQty > 1 ? 's' : ''}</p>
          </div>
          <span class="text-xs font-bold px-2.5 py-1 rounded-xl shrink-0 ${dose.status === 'taken' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}">
            ${dose.status === 'taken' ? '✓ Taken' : 'Pending'}
          </span>
        </div>
      `;
      section.appendChild(doseCard);
    }

    container.appendChild(section);
  }

  return container;
}
