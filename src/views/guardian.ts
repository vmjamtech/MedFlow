import type { GuardianLink, MonitoredPatient } from '../db/schema';

interface GuardianWindowState {
  guardianSubView: 'monitoring' | 'mycode';
  guardianSyncEnabled: boolean;
  myPatientCode: string;
  myPatientName: string;
  incomingRequests: GuardianLink[];
  approvedGuardians: GuardianLink[];
  pendingLinkRequests: GuardianLink[];
  incomingRequestsOpen: boolean;
  monitoredPatients?: MonitoredPatient[];
}

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

export function renderGuardianTab(): HTMLElement {
  const state = (window as unknown as { state: GuardianWindowState }).state;
  const container = document.createElement('div');
  container.className = 'space-y-4';

  if (state.guardianSubView === 'mycode') {
    const incoming = state.incomingRequests.filter((request) => request.status === 'pending');
    container.innerHTML = `
      <section class="bg-gradient-to-br from-teal-600 via-teal-500 to-cyan-500 text-white rounded-2xl p-5 shadow-lg">
        <p class="text-xs font-bold uppercase tracking-widest opacity-90 mb-3">🔐 Your Patient Code</p>
        <div class="flex items-center gap-2">
          <p class="flex-1 bg-white/20 border border-white/30 rounded-xl px-4 py-3 text-xl font-black font-mono tracking-wider">${escapeHtml(state.myPatientCode)}</p>
          <button onclick="copyPatientCode()" class="bg-white/90 text-teal-600 px-4 py-3 rounded-lg text-xs font-black">Copy</button>
        </div>
        <p class="text-xs mt-3 opacity-95">Caregivers remain locked until you explicitly approve.</p>
        <div class="bg-white/10 border border-white/20 rounded-xl p-3 mt-4">
          <label for="my-patient-name-input" class="block text-xs font-bold uppercase tracking-wide opacity-90 mb-2">Your Name / Identifier</label>
          <input id="my-patient-name-input" type="text" maxlength="80" placeholder="E.g., Jimmy" value="${escapeHtml(state.myPatientName)}" class="w-full bg-white/20 border border-white/30 rounded-lg px-3 py-2.5 text-xs font-semibold text-white placeholder-white/60" />
          <p class="text-[10px] opacity-80 mt-2">Caregivers can confirm this identifier before requesting access.</p>
          <button onclick="saveMyPatientName()" class="w-full mt-3 bg-white/90 text-teal-600 text-xs font-bold py-2 rounded-lg">Save Name</button>
        </div>
      </section>
      <button onclick="openIncomingRequests()" class="w-full flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs font-bold text-amber-700">
        <span>🔔 Incoming Requests</span>
        <span class="bg-rose-600 text-white rounded-full px-2 py-0.5">${incoming.length}</span>
      </button>
      <button onclick="simulateIncomingRequest()" class="w-full bg-slate-100 text-slate-700 text-xs font-bold py-2.5 rounded-xl">Simulate Incoming Request</button>
      ${state.incomingRequestsOpen ? `
        <section class="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-black uppercase text-slate-900">Pending Caregiver Requests</h3>
            <button onclick="closeIncomingRequests()" class="text-xs font-bold text-slate-500">Close</button>
          </div>
          ${incoming.length ? incoming.map((request) => `
            <article class="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p class="text-xs font-bold text-slate-900">${escapeHtml(request.guardianName)}</p>
              <p class="text-[11px] text-slate-500">${escapeHtml(request.guardianCode)} • ${escapeHtml(new Date(request.timestamp).toLocaleString())}</p>
              <p class="text-[10px] text-amber-700 mt-1">Locked — no patient data shared</p>
              <div class="grid grid-cols-2 gap-2 mt-3">
                <button onclick="acceptGuardianRequest(this.dataset.id)" data-id="${escapeHtml(request.id)}" class="bg-teal-600 text-white text-xs font-bold py-2 rounded-lg">✓ Accept</button>
                <button onclick="declineGuardianRequest(this.dataset.id)" data-id="${escapeHtml(request.id)}" class="bg-rose-50 text-rose-700 text-xs font-bold py-2 rounded-lg">✕ Decline</button>
              </div>
            </article>
          `).join('') : '<p class="text-xs text-slate-500">No pending requests.</p>'}
        </section>
      ` : ''}
      <section class="bg-slate-50 border border-slate-200 rounded-2xl p-4">
        <h3 class="text-xs font-black uppercase text-slate-900 mb-3">✓ Approved Guardians</h3>
        ${state.approvedGuardians.length ? state.approvedGuardians.map((guardian) => `
          <article class="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-2">
            <div>
              <p class="text-sm font-bold text-slate-900">${escapeHtml(guardian.guardianName)}</p>
              <p class="text-[10px] text-slate-500">${escapeHtml(guardian.guardianCode)}</p>
            </div>
            <button onclick="removeGuardian(this.dataset.id)" data-id="${escapeHtml(guardian.id)}" class="bg-rose-100 text-rose-700 text-xs font-bold px-3 py-1.5 rounded-lg">Remove</button>
          </article>
        `).join('') : '<p class="text-xs text-slate-500">No approved guardians.</p>'}
      </section>
      <button onclick="setGuardianSubView('monitoring')" class="w-full bg-teal-50 text-teal-700 text-xs font-bold py-3 rounded-xl">← Back to Family</button>
    `;
    return container;
  }

  const approvedPatients = (state.monitoredPatients || []).filter(
    (patient) => (patient as MonitoredPatient & { linkStatus?: string }).linkStatus === 'approved'
  );
  container.innerHTML = `
    <div class="flex gap-2">
      <button onclick="toggleGuardianSync()" class="flex-1 ${state.guardianSyncEnabled ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-700'} text-xs font-bold py-3 rounded-lg">${state.guardianSyncEnabled ? '🛡️ Sync ON' : '⏸ Sync OFF'}</button>
      <button onclick="setGuardianSubView('mycode')" class="flex-1 bg-slate-100 text-slate-700 text-xs font-bold py-3 rounded-lg">My Code</button>
    </div>
    <section class="bg-slate-50 border border-slate-200 rounded-2xl p-4">
      <label class="block text-xs font-black uppercase text-slate-900 mb-2.5">+ Request Patient Access</label>
      <div class="flex gap-2">
        <input id="link-patient-code" type="text" placeholder="E.g., MED-7429" class="flex-1 bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-xs font-semibold text-slate-900" />
        <button onclick="requestPatientAccess()" class="bg-teal-600 text-white text-xs font-bold px-4 py-2.5 rounded-lg">Request</button>
      </div>
    </section>
    ${state.pendingLinkRequests.length ? `
      <section class="bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <h3 class="text-xs font-black uppercase text-amber-900 mb-3">⏳ Awaiting Owner Confirmation</h3>
        ${state.pendingLinkRequests.map((request) => `
          <div class="bg-white border border-amber-200 rounded-xl p-3 flex items-center justify-between">
            <div><p class="text-sm font-bold text-slate-900">${escapeHtml(request.patientCode)}</p><p class="text-[10px] text-amber-700">Locked — no medication data available</p></div>
            <button onclick="cancelPendingRequest(this.dataset.id)" data-id="${escapeHtml(request.id)}" class="text-xs font-bold text-rose-600">Cancel</button>
          </div>
        `).join('')}
      </section>
    ` : ''}
    <section>
      <h3 class="text-sm font-bold text-slate-900 mb-3">👥 Monitored Patients</h3>
      <div class="space-y-3">
        ${approvedPatients.length ? approvedPatients.map((patient) => `
          <article class="bg-white border border-slate-200 rounded-xl p-4">
            <div class="flex items-start justify-between gap-2">
              <div><p class="text-sm font-bold text-slate-900">${escapeHtml(patient.name)}</p><p class="text-xs text-slate-500">Code: ${escapeHtml(patient.code)}</p></div>
              <span class="text-sm font-black text-teal-600">${patient.adherence}% Adh.</span>
            </div>
            <button onclick="removeMonitoredPatient(this.dataset.id)" data-id="${escapeHtml(patient.id)}" class="w-full mt-3 bg-rose-50 text-rose-700 text-xs font-bold py-2 rounded-lg">Remove</button>
          </article>
        `).join('') : '<p class="text-xs text-slate-500">No approved monitored patients. Pending requests remain locked.</p>'}
      </div>
    </section>
  `;
  return container;
}
