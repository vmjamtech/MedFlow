/**
 * Guardian Tab View: Family monitoring and patient code pairing
 * Dual-mode: Family monitoring vs. My Patient Code
 * Escalate 1h+ missed-dose alerts to guardians
 */

export async function renderGuardianTab(): Promise<HTMLElement> {
  const container = document.createElement('div');
  container.className = 'space-y-3.5';

  // Dual-mode switcher
  const switcher = document.createElement('div');
  switcher.className = 'bg-slate-200/80 p-1 rounded-2xl grid grid-cols-2 gap-1 text-[11px] font-bold';
  switcher.innerHTML = `
    <button class="py-2 px-2 rounded-xl bg-white text-slate-900 shadow-xs">
      Family (0)
    </button>
    <button class="py-2 px-2 rounded-xl text-slate-600">
      My Patient Code
    </button>
  `;
  container.appendChild(switcher);

  // Patient code display
  const codeSection = document.createElement('div');
  codeSection.className = 'bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm space-y-4';
  codeSection.innerHTML = `
    <div class="text-center space-y-1.5">
      <span class="inline-block text-[10px] font-bold uppercase tracking-wider bg-teal-50 text-teal-700 px-2.5 py-1 rounded-full">Patient Sharing Mode</span>
      <h3 class="text-base font-extrabold text-slate-900">Your Pairing Invite Code</h3>
      <p class="text-xs text-slate-500">Share with family so they receive alerts if meds go unlogged 1h past window</p>
    </div>

    <div class="bg-slate-900 text-white rounded-2xl p-4 text-center">
      <p class="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Unique Device Sync Code</p>
      <p class="text-2xl font-mono font-extrabold tracking-widest text-teal-400 mt-1">MED-7429</p>
      <button class="mt-3 bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-4 py-2 rounded-xl transition">
        📋 Copy Invite Code
      </button>
    </div>

    <div class="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
      <div class="min-w-0">
        <p class="text-xs font-bold text-slate-800">Escalate All Missed Meds</p>
        <p class="text-[11px] text-slate-500">Notify Guardians 1h after any unlogged dose</p>
      </div>
      <button class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-teal-600">
        <span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs translate-x-5"></span>
      </button>
    </div>
  `;
  container.appendChild(codeSection);

  return container;
}
