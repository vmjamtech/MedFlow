const TERMS_ACCEPTED_KEY = 'medflow_terms_accepted_v1';
const TERMS_ACCEPTED_AT_KEY = 'medflow_terms_accepted_at';
const TERMS_MODAL_ID = 'medflow-terms-modal';

const termsContent = `
  <div class="space-y-4 text-xs leading-5 text-slate-700">
    <div>
      <h2 class="text-sm font-black text-slate-900">MEDFLOW TERMS OF USE, BETA NOTICE &amp; MEDICAL DISCLAIMER</h2>
      <p class="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Last Updated: November 2026</p>
    </div>
    <section>
      <h3 class="font-black text-slate-900">1. Acceptance of Terms &amp; Sole Risk</h3>
      <p>By checking the box below and tapping "Proceed," you acknowledge that you have read, understood, and agreed to be bound by these Terms of Use and Disclaimers. Your use of the MedFlow mobile application ("the Application") is strictly voluntary and <strong>at your own sole risk</strong>.</p>
    </section>
    <section>
      <h3 class="font-black text-slate-900">2. No Medical Advice or Doctor-Patient Relationship</h3>
      <p>MedFlow is a personal organization, reminder, and tracking tool only. <strong>The Application does not provide medical advice, diagnosis, treatment, or clinical recommendations.</strong> Nothing in this Application—including vital sign status indicators, adherence percentages, or OCR label scan outputs—should be relied upon as a substitute for professional medical judgment. Always verify scanned medication labels against your physical prescription bottle and consult a licensed physician or pharmacist before starting, stopping, or changing any medication. In a medical emergency, contact emergency services immediately.</p>
    </section>
    <section>
      <h3 class="font-black text-slate-900">3. Beta Software &amp; "As-Is" / "As-Available" Disclaimer</h3>
      <p>You acknowledge that MedFlow is currently provided as <strong>pre-release / beta software</strong> on an <strong>"AS-IS" and "AS-AVAILABLE"</strong> basis, without warranties of any kind, whether express or implied. The Application may contain bugs, notification delays, calculation errors, or interruptions, and may be modified, suspended, or discontinued at any time without prior notice.</p>
    </section>
    <section>
      <h3 class="font-black text-slate-900">4. Service Availability &amp; Your Responsibility to Back Up Data</h3>
      <p>We do not guarantee uninterrupted uptime or permanent cloud storage. Servers, third-party cloud infrastructure, or local device storage may experience outages, resets, or data loss at any time. <strong>You are solely responsible for maintaining independent backups of your medication schedules, vital logs, and clinician reports</strong> (such as exporting your PDF reports regularly).</p>
    </section>
    <section>
      <h3 class="font-black text-slate-900">5. Data Privacy, Guardian Sharing &amp; Security Limitations</h3>
      <p>Local profile details (such as your photo, age, and sex) are stored locally on your device, while optional Guardian Mode syncing transmits medication names, schedules, and alert statuses over third-party cloud services so your approved caregivers can view them. While reasonable technical safeguards are implemented, <strong>no digital system or internet transmission is 100% immune from unauthorized access, bugs, or data leakage</strong>. By enabling Guardian Mode or entering personal health information, you expressly accept this inherent risk and take full responsibility for whom you approve via your Patient Invite Code.</p>
    </section>
    <section>
      <h3 class="font-black text-slate-900">6. Limitation of Liability &amp; Hold Harmless</h3>
      <p>To the maximum extent permitted by applicable law, the developer, owner, and contributors of MedFlow shall <strong>not be liable</strong> for any direct, indirect, incidental, consequential, special, or punitive damages—including, without limitation, missed medication doses, adverse drug events, health complications, emotional distress, data loss, or unauthorized data exposure—arising out of or related to your use or inability to use the Application. You agree to indemnify and hold harmless the developer from any claims, lawsuits, or liabilities resulting from your use of the Application.</p>
    </section>
  </div>
`;

export function areTermsAccepted(): boolean {
  return localStorage.getItem(TERMS_ACCEPTED_KEY) === 'true';
}

export function showTermsAcceptanceGate(): Promise<void> {
  return new Promise((resolve) => {
    renderTermsModal('accept', () => {
      const acceptedAt = new Date().toISOString();
      localStorage.setItem(TERMS_ACCEPTED_KEY, 'true');
      localStorage.setItem(TERMS_ACCEPTED_AT_KEY, acceptedAt);
      removeTermsModal();
      resolve();
    });
  });
}

export function showTermsReview(): void {
  renderTermsModal('review', removeTermsModal);
}

function renderTermsModal(mode: 'accept' | 'review', onPrimary: () => void): void {
  removeTermsModal();
  const acceptedAt = localStorage.getItem(TERMS_ACCEPTED_AT_KEY);
  const acceptedDate = acceptedAt
    ? new Date(acceptedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'a previous session';

  const overlay = document.createElement('div');
  overlay.id = TERMS_MODAL_ID;
  overlay.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'medflow-terms-title');
  overlay.innerHTML = `
    <section class="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
      <header class="border-b border-slate-200 px-5 py-4">
        <p class="text-[10px] font-black uppercase tracking-widest text-teal-700">MedFlow legal notice</p>
        <h1 id="medflow-terms-title" class="mt-1 text-xl font-black text-slate-900">Terms of Use &amp; Medical Disclaimer</h1>
        ${mode === 'review' ? `<p class="mt-1 text-[11px] font-semibold text-slate-500">Accepted on ${acceptedDate}</p>` : ''}
      </header>
      <div class="p-5">
        <div class="max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
          ${termsContent}
        </div>
        ${mode === 'accept' ? `
          <label class="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <input id="medflow-terms-checkbox" type="checkbox" class="mt-0.5 h-4 w-4 shrink-0 accent-teal-600" />
            <span class="text-xs font-semibold leading-5 text-slate-700">I have read and agree to the Terms of Use, Beta Notice, and Medical Disclaimer, and I understand that I use MedFlow at my own risk.</span>
          </label>
          <button id="medflow-terms-proceed" type="button" disabled class="mt-3 w-full rounded-xl bg-teal-600 py-3.5 text-xs font-black text-white opacity-50 pointer-events-none">Proceed to MedFlow</button>
        ` : `
          <button id="medflow-terms-close" type="button" class="mt-4 w-full rounded-xl bg-slate-900 py-3.5 text-xs font-black text-white">Close</button>
        `}
      </div>
    </section>
  `;
  document.body.appendChild(overlay);

  if (mode === 'accept') {
    const checkbox = overlay.querySelector<HTMLInputElement>('#medflow-terms-checkbox');
    const proceed = overlay.querySelector<HTMLButtonElement>('#medflow-terms-proceed');
    checkbox?.addEventListener('change', () => {
      if (!proceed || !checkbox) return;
      proceed.disabled = !checkbox.checked;
      proceed.classList.toggle('opacity-50', !checkbox.checked);
      proceed.classList.toggle('pointer-events-none', !checkbox.checked);
    });
    proceed?.addEventListener('click', () => {
      if (checkbox?.checked) onPrimary();
    });

    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
      }
    });
  } else {
    overlay.querySelector<HTMLButtonElement>('#medflow-terms-close')?.addEventListener('click', onPrimary);
  }
}

function removeTermsModal(): void {
  document.getElementById(TERMS_MODAL_ID)?.remove();
}
