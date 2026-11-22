// ==========================================
// EVENT HANDLERS - DOSE MANAGEMENT
// ==========================================

async function takeScheduledDose(doseId: string, lateOffsetMinutes = 0) {
  const dose = state.doses.find(d => d.id === doseId);
  if (!dose || dose.status === 'taken') return;

  const med = state.medications.find(m => m.id === dose.medId);
  if (!med || med.stockRemaining < med.doseQty) {
    showToast(`Not enough ${med?.name} in stock!`, 'warning');
    return;
  }

  dose.status = 'taken';
  dose.takenAtStr = formatMinutesTo12h(dose.scheduledMinutes + lateOffsetMinutes);
  med.stockRemaining = Math.max(0, med.stockRemaining - med.doseQty);

  if (med.scheduleType === 'interval' && lateOffsetMinutes > 0) {
    const nextDoses = state.doses.filter(
      d => d.medId === med.id && d.status === 'pending' && d.scheduledMinutes > dose.scheduledMinutes
    );
    nextDoses.forEach((nd, idx) => {
      nd.scheduledMinutes = dose.scheduledMinutes + (med.intervalHours! * 60 * (idx + 1));
      nd.shiftNote = `Auto-shifted to maintain ${med.intervalHours}h spacing`;
    });
  }

  await db.saveDose(dose);
  await db.saveMedication(med);
  
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

  await db.saveMedication(med);
  startPrnTimerLoop();
  showToast(`✓ Logged PRN ${med.name}. ${med.cooldownHours}h cooldown started.`);
  renderApp();
}

async function skipPrnCooldown(medId: string) {
  const med = state.medications.find(m => m.id === medId);
  if (med) {
    med.cooldownRemainingSeconds = 0;
    await db.saveMedication(med);
    showToast(`⏩ Cooldown reset for ${med.name}`);
    renderApp();
  }
}

async function refillMedication(medId: string, addQty = 30) {
  const med = state.medications.find(m => m.id === medId);
  if (!med) return;
  
  med.stockRemaining += addQty;
  med.stockTotal = Math.max(med.stockTotal, med.stockRemaining);
  
  await db.saveMedication(med);
  showToast(`📦 Refilled +${addQty} ${med.unit}s of ${med.name}`);
  renderApp();
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

function switchTab(tab: 'today' | 'vitals' | 'cabinet' | 'guardian' | 'report') {
  state.currentTab = tab;
  
  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('text-brand-600', btn.getAttribute('data-tab') === tab);
    btn.classList.toggle('text-slate-400', btn.getAttribute('data-tab') !== tab);
  });
  
  renderApp();
}

function openAddMedModal() {
  const backdrop = document.getElementById('modal-backdrop');
  if (backdrop) {
    backdrop.classList.remove('hidden');
    backdrop.style.zIndex = '50';
  }
}

function closeModal() {
  const backdrop = document.getElementById('modal-backdrop');
  if (backdrop) {
    backdrop.classList.add('hidden');
  }
}

function openLogVitalModal() {
  const backdrop = document.getElementById('modal-backdrop');
  if (backdrop) {
    backdrop.classList.remove('hidden');
  }
}

async function submitLogVital(type: string, data: any) {
  const vital: VitalLog = {
    id: 'v-' + Date.now(),
    type: type as any,
    date: new Date().toISOString().split('T')[0],
    dateLabel: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    context: data.context || '',
    note: data.note || '',
  };

  if (type === 'bp') {
    vital.sys = parseInt(data.sys);
    vital.dia = parseInt(data.dia);
  } else if (type === 'sugar') {
    vital.valueMgDl = parseInt(data.value);
  } else if (type === 'pulse' || type === 'temp' || type === 'spo2' || type === 'weight') {
    vital.value = parseFloat(data.value);
  }

  await db.saveVitalLog(vital);
  state.vitalLogs.unshift(vital);
  closeModal();
  showToast('✓ Vital sign logged');
  renderApp();
}

async function submitAddMedication(formData: any) {
  const med: Medication = {
    id: 'med-' + Date.now(),
    name: formData.name || 'Untitled',
    strength: formData.strength || '',
    shape: formData.shape || 'round',
    color: formData.color || 'teal',
    doseQty: parseFloat(formData.qty) || 1,
    unit: formData.unit || 'tablet',
    scheduleType: formData.scheduleType || 'fixed',
    mealRequired: formData.mealRequired || 'no_meal',
    mealTiming: formData.mealTiming,
    mealTag: formData.mealTiming,
    instruction: formData.instruction || '',
    stockRemaining: parseFloat(formData.stock) || 10,
    stockTotal: parseFloat(formData.stock) || 10,
    lowStockThreshold: 5,
  };

  if (med.scheduleType === 'fixed') {
    med.fixedTimes = formData.fixedTimes || ['08:00', '20:00'];
  } else if (med.scheduleType === 'interval') {
    med.intervalHours = parseInt(formData.intervalHours) || 8;
  } else if (med.scheduleType === 'prn') {
    med.cooldownHours = parseInt(formData.cooldownHours) || 4;
    med.maxPerDay = parseInt(formData.maxPerDay) || 3;
    med.takenTodayCount = 0;
    med.cooldownRemainingSeconds = 0;
  }

  await db.saveMedication(med);
  state.medications.push(med);
  closeModal();
  showToast(`✓ Added ${med.name}`);
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

async function linkNewPatientByCode(code: string) {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode || cleanCode.length < 4) {
    showToast('Enter a valid patient code (e.g., MED-5518)', 'warning');
    return;
  }
  if (monitoredPatients.some((p: any) => p.code === cleanCode)) {
    showToast(`Already monitoring ${cleanCode}`, 'warning');
    return;
  }

  monitoredPatients.push({
    id: 'pat-' + Date.now(),
    name: `Patient (${cleanCode})`,
    code: cleanCode,
    relation: 'Guardian',
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
    alert.acknowledged = true;
    showToast(`✓ Acknowledged alert`);
    renderApp();
  }
}

// ==========================================
// RENDER FUNCTIONS - MAIN APP SHELL
// ==========================================

function renderApp() {
  const app = document.getElementById('app');
  if (!app) return;

  const header = document.getElementById('app-header');
  const headerTitle = document.getElementById('header-title');
  const headerSubtitle = document.getElementById('header-subtitle');
  const adherenceBadge = document.getElementById('adherence-pill');
  const mainContent = document.getElementById('main-content');

  if (headerTitle) headerTitle.textContent = 'Today\'s Regimen';
  if (headerSubtitle) headerSubtitle.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  if (adherenceBadge) adherenceBadge.textContent = `${state.doses.filter(d => d.status === 'taken').length} / ${state.doses.filter(d => d.status !== 'skipped').length} Taken`;

  if (mainContent) {
    mainContent.innerHTML = '';
    switch (state.currentTab) {
      case 'today': renderTodayTab(mainContent); break;
      case 'vitals': renderVitalsTab(mainContent); break;
      case 'cabinet': renderCabinetTab(mainContent); break;
      case 'guardian': renderGuardianTab(mainContent); break;
      case 'report': renderReportTab(mainContent); break;
    }
  }

  updateLowStockIndicator();
  updateGuardianAlertIndicator();
}

function updateLowStockIndicator() {
  const dot = document.getElementById('low-stock-dot');
  const hasLowStock = state.medications.some(m => m.stockRemaining <= m.lowStockThreshold);
  if (dot) {
    if (hasLowStock) dot.classList.remove('hidden');
    else dot.classList.add('hidden');
  }
}

function updateGuardianAlertIndicator() {
  const dot = document.getElementById('guardian-alert-dot');
  const hasAlerts = guardianAlerts.some((a: any) => !a.acknowledged);
  if (dot) {
    if (hasAlerts) dot.classList.remove('hidden');
    else dot.classList.add('hidden');
  }
}

// ==========================================
// RENDER FUNCTIONS - TODAY TAB
// ==========================================

function renderTodayTab(container: HTMLElement) {
  const dosesByTime = groupDosesByTimeOfDay(state.doses.filter(d => d.status !== 'skipped'));
  
  for (const timeGroup of ['Morning', 'Afternoon', 'Evening']) {
    const doses = (dosesByTime as any)[timeGroup] || [];
    if (doses.length === 0) continue;

    const section = document.createElement('div');
    section.className = 'space-y-2';
    
    const title = document.createElement('h3');
    title.className = 'text-xs font-semibold text-slate-500 uppercase px-2 mt-4 mb-2';
    title.textContent = timeGroup;
    section.appendChild(title);

    for (const dose of doses) {
      const med = state.medications.find(m => m.id === dose.medId);
      if (!med) continue;

      const card = document.createElement('div');
      card.className = `${getPillBgClass(med.color as any)} border border-slate-200 rounded-2xl p-3 flex items-start justify-between`;
      
      const info = document.createElement('div');
      info.className = 'flex-1';
      info.innerHTML = `
        <div class="flex items-center gap-2 mb-1">
          <span class="font-semibold text-sm text-slate-900">${med.name} ${med.strength}</span>
          ${dose.status === 'taken' ? '<span class="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">✓ Taken</span>' : ''}
        </div>
        <div class="text-xs text-slate-500">
          ${formatQuantity(med.doseQty, med.unit)} • ${formatMinutesTo12h(dose.scheduledMinutes)}
          ${med.mealTag ? ` • ${med.mealTag}` : ''}
        </div>
      `;
      card.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'flex gap-2 ml-2';

      if (dose.status === 'pending') {
        const takeBtn = document.createElement('button');
        takeBtn.className = 'text-xs bg-brand-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-brand-700 font-semibold';
        takeBtn.textContent = 'Take';
        takeBtn.onclick = () => takeScheduledDose(dose.id, 0);
        actions.appendChild(takeBtn);

        const snoozeBtn = document.createElement('button');
        snoozeBtn.className = 'text-xs bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg hover:bg-slate-300 font-semibold';
        snoozeBtn.textContent = 'Snooze';
        snoozeBtn.onclick = () => snoozeDose(dose.id);
        actions.appendChild(snoozeBtn);
      }

      card.appendChild(actions);
      section.appendChild(card);
    }

    container.appendChild(section);
  }

  // PRN Medications
  const prnMeds = state.medications.filter(m => m.scheduleType === 'prn');
  if (prnMeds.length > 0) {
    const prnSection = document.createElement('div');
    prnSection.className = 'space-y-2 mt-6';
    
    const prnTitle = document.createElement('h3');
    prnTitle.className = 'text-xs font-semibold text-slate-500 uppercase px-2 mb-2';
    prnTitle.textContent = 'As Needed (PRN)';
    prnSection.appendChild(prnTitle);

    for (const med of prnMeds) {
      const card = document.createElement('div');
      card.className = `${getPillBgClass(med.color as any)} border border-slate-200 rounded-2xl p-3`;
      
      let statusText = 'Available';
      if (med.cooldownRemainingSeconds! > 0) {
        statusText = `Cooldown: ${formatSeconds(med.cooldownRemainingSeconds!)}`;
      } else if ((med.takenTodayCount || 0) >= (med.maxPerDay || 1)) {
        statusText = `Daily limit reached (${med.takenTodayCount}/${med.maxPerDay})`;
      }

      card.innerHTML = `
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <div class="font-semibold text-sm text-slate-900">${med.name} ${med.strength}</div>
            <div class="text-xs text-slate-500 mt-1">
              Max ${med.maxPerDay}/day • ${formatQuantity(med.doseQty, med.unit)} • ${statusText}
            </div>
          </div>
          <div class="flex gap-2">
            ${med.cooldownRemainingSeconds! > 0 ? `<button class="text-xs bg-slate-200 px-2 py-1 rounded text-slate-600" onclick="skipPrnCooldown('${med.id}')">Test Reset</button>` : ''}
            <button class="text-xs ${med.stockRemaining >= med.doseQty && med.cooldownRemainingSeconds! === 0 && (med.takenTodayCount || 0) < (med.maxPerDay || 1) ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-slate-300 text-slate-500 cursor-not-allowed'} px-2 py-1 rounded font-semibold" 
              onclick="takePrnDose('${med.id}')" ${med.stockRemaining < med.doseQty || med.cooldownRemainingSeconds! > 0 || (med.takenTodayCount || 0) >= (med.maxPerDay || 1) ? 'disabled' : ''}>
              Take
            </button>
          </div>
        </div>
      `;

      prnSection.appendChild(card);
    }

    container.appendChild(prnSection);
  }
}

