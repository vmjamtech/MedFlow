// ==========================================
// RENDER FUNCTIONS - VITALS TAB
// ==========================================

function renderVitalsTab(container: HTMLElement) {
  // Filter controls
  const filterDiv = document.createElement('div');
  filterDiv.className = 'flex gap-2 mb-4 pb-3 overflow-x-auto';
  
  const filters = ['all', 'bp', 'sugar', 'pulse', 'other'];
  const filterLabels = { all: 'All', bp: 'BP', sugar: 'Sugar', pulse: 'Pulse', other: 'Other' };
  
  for (const filter of filters) {
    const btn = document.createElement('button');
    btn.className = `text-xs px-3 py-1.5 rounded-full font-semibold whitespace-nowrap ${
      state.vitalsHistoryFilter === filter 
        ? 'bg-brand-600 text-white' 
        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
    }`;
    btn.textContent = (filterLabels as any)[filter];
    btn.onclick = () => {
      state.vitalsHistoryFilter = filter as any;
      renderApp();
    };
    filterDiv.appendChild(btn);
  }
  container.appendChild(filterDiv);

  // Log vital button
  const logBtn = document.createElement('button');
  logBtn.className = 'w-full mb-4 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 px-4 rounded-xl transition';
  logBtn.textContent = '+ Log Vital Sign';
  logBtn.onclick = openLogVitalModal;
  container.appendChild(logBtn);

  // Filter vitals
  let filtered = state.vitalLogs;
  if (state.vitalsHistoryFilter !== 'all') {
    if (state.vitalsHistoryFilter === 'other') {
      filtered = filtered.filter(v => !['bp', 'sugar', 'pulse'].includes(v.type));
    } else {
      filtered = filtered.filter(v => v.type === state.vitalsHistoryFilter);
    }
  }

  // Group by date
  const byDate: Record<string, VitalLog[]> = {};
  for (const log of filtered) {
    if (!byDate[log.date]) byDate[log.date] = [];
    byDate[log.date].push(log);
  }

  for (const date in byDate) {
    const logsForDate = byDate[date];
    
    const dateSection = document.createElement('div');
    dateSection.className = 'mb-4';
    
    const dateLabel = document.createElement('h4');
    dateLabel.className = 'text-xs font-semibold text-slate-500 uppercase mb-2';
    dateLabel.textContent = logsForDate[0].dateLabel || date;
    dateSection.appendChild(dateLabel);

    for (const log of logsForDate) {
      const status = getVitalStatus(log.type, log);
      
      const card = document.createElement('div');
      card.className = 'bg-white border border-slate-200 rounded-2xl p-3 mb-2';
      
      let valueText = '';
      if (log.type === 'bp' && log.sys) {
        valueText = `${log.sys}/${log.dia} mmHg`;
      } else if (log.type === 'sugar' && log.valueMgDl) {
        const displayVal = state.glucoseUnit === 'mmol/L' 
          ? (log.valueMgDl / 18.0182).toFixed(1)
          : Math.round(log.valueMgDl);
        valueText = `${displayVal} ${state.glucoseUnit}`;
      } else if (log.type === 'pulse' && log.value) {
        valueText = `${log.value} bpm`;
      } else if (log.type === 'temp' && log.value) {
        valueText = `${log.value}°C`;
      } else if (log.type === 'spo2' && log.value) {
        valueText = `${log.value}%`;
      } else if (log.type === 'weight' && log.value) {
        valueText = `${log.value} kg`;
      }

      card.innerHTML = `
        <div class="flex items-start justify-between">
          <div>
            <div class="text-sm font-semibold text-slate-900">${log.type.toUpperCase()}</div>
            <div class="text-sm text-slate-700 font-semibold mt-1">${valueText}</div>
            <div class="flex items-center gap-2 mt-2">
              <span class="text-xs px-2 py-1 rounded-full ${status.badge}">${status.label}</span>
              ${log.context ? `<span class="text-xs text-slate-500">${log.context}</span>` : ''}
            </div>
          </div>
        </div>
      `;
      
      dateSection.appendChild(card);
    }

    container.appendChild(dateSection);
  }
}

// ==========================================
// RENDER FUNCTIONS - CABINET TAB
// ==========================================

function renderCabinetTab(container: HTMLElement) {
  for (const med of state.medications) {
    const isLowStock = med.stockRemaining <= med.lowStockThreshold;
    const daysLeft = calculateDaysRemaining(med);

    const card = document.createElement('div');
    card.className = `${getPillBgClass(med.color as any)} border border-slate-200 rounded-2xl p-4 mb-3`;
    
    card.innerHTML = `
      <div class="flex items-start justify-between mb-3">
        <div class="flex-1">
          <h3 class="font-semibold text-slate-900">${med.name} ${med.strength}</h3>
          <p class="text-xs text-slate-600 mt-1">${formatQuantity(med.doseQty, med.unit)} • ${med.instruction || 'As directed'}</p>
        </div>
        ${isLowStock ? '<span class="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-semibold">Low Stock</span>' : ''}
      </div>
      
      <div class="mb-3">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs font-semibold text-slate-700">${med.stockRemaining} ${med.unit}s</span>
          <span class="text-xs text-slate-500">${daysLeft} left</span>
        </div>
        <div class="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
          <div class="bg-brand-600 h-full rounded-full" style="width: ${Math.min(100, (med.stockRemaining / med.stockTotal) * 100)}%"></div>
        </div>
      </div>

      <div class="flex gap-2">
        <button class="flex-1 text-xs bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2 px-3 rounded-lg transition" onclick="refillMedication('${med.id}', 30)">
          + Refill (+30)
        </button>
        <button class="flex-1 text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2 px-3 rounded-lg transition" onclick="refillMedication('${med.id}', 60)">
          + Refill (+60)
        </button>
      </div>
    `;
    
    container.appendChild(card);
  }
}

// ==========================================
// RENDER FUNCTIONS - GUARDIAN TAB
// ==========================================

function renderGuardianTab(container: HTMLElement) {
  const toggle = document.createElement('div');
  toggle.className = 'flex gap-3 mb-4 p-3 bg-brand-50 border border-brand-200 rounded-2xl';
  toggle.innerHTML = `
    <button class="flex-1 text-xs font-semibold py-2 px-3 rounded-lg transition ${
      state.guardianSubView === 'monitoring' 
        ? 'bg-brand-600 text-white' 
        : 'bg-transparent text-brand-700 hover:bg-brand-100'
    }" onclick="setGuardianSubView('monitoring')">
      👨‍👩‍👧 Monitoring
    </button>
    <button class="flex-1 text-xs font-semibold py-2 px-3 rounded-lg transition ${
      state.guardianSubView === 'mycode' 
        ? 'bg-brand-600 text-white' 
        : 'bg-transparent text-brand-700 hover:bg-brand-100'
    }" onclick="setGuardianSubView('mycode')">
      📋 My Code
    </button>
  `;
  container.appendChild(toggle);

  if (state.guardianSubView === 'mycode') {
    // My Patient Code section
    const codeCard = document.createElement('div');
    codeCard.className = 'bg-brand-50 border border-brand-200 rounded-2xl p-4 mb-4';
    codeCard.innerHTML = `
      <p class="text-xs font-semibold text-brand-700 mb-2">Your Unique Patient Code</p>
      <div class="flex items-center gap-2">
        <div class="text-2xl font-bold text-brand-900 font-mono tracking-widest">${state.myPatientCode}</div>
        <button class="text-xs bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 rounded-lg font-semibold" onclick="copyPatientCode()">
          Copy
        </button>
      </div>
      <p class="text-xs text-slate-600 mt-3">Share this code with family members or caregivers to let them monitor your medication adherence.</p>
    `;
    container.appendChild(codeCard);

    const syncToggle = document.createElement('div');
    syncToggle.className = 'flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl mb-4';
    syncToggle.innerHTML = `
      <span class="text-sm font-semibold text-slate-900">Cloud Sync ${state.guardianSyncEnabled ? '🟢' : '🔴'}</span>
      <button class="text-xs font-semibold px-3 py-1.5 rounded-lg ${
        state.guardianSyncEnabled 
          ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' 
          : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
      }" onclick="toggleGuardianSync()">
        ${state.guardianSyncEnabled ? 'Pause' : 'Enable'}
      </button>
    `;
    container.appendChild(syncToggle);
  } else {
    // Monitoring section
    if (guardianAlerts.length > 0 && guardianAlerts.some((a: any) => !a.acknowledged)) {
      const alertsSection = document.createElement('div');
      alertsSection.className = 'mb-4';
      
      const alertTitle = document.createElement('h4');
      alertTitle.className = 'text-xs font-semibold text-slate-500 uppercase mb-2';
      alertTitle.textContent = '⚠️ Overdue Alerts';
      alertsSection.appendChild(alertTitle);

      for (const alert of guardianAlerts) {
        if (alert.acknowledged) continue;
        
        const alertCard = document.createElement('div');
        alertCard.className = 'bg-rose-50 border border-rose-200 rounded-2xl p-3 mb-2';
        alertCard.innerHTML = `
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <p class="font-semibold text-sm text-rose-900">${alert.patientName}</p>
              <p class="text-xs text-rose-700 mt-1">${alert.medName} at ${alert.scheduledTime}</p>
              <p class="text-xs text-rose-600 mt-1">${alert.overdueBy}</p>
            </div>
            <button class="text-xs bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1.5 rounded-lg font-semibold whitespace-nowrap" 
              onclick="acknowledgeGuardianAlert('${alert.id}')">
              Acknowledge
            </button>
          </div>
        `;
        alertsSection.appendChild(alertCard);
      }

      container.appendChild(alertsSection);
    }

    if (monitoredPatients.length > 0) {
      const patsSection = document.createElement('div');
      patsSection.className = 'mb-4';
      
      const patsTitle = document.createElement('h4');
      patsTitle.className = 'text-xs font-semibold text-slate-500 uppercase mb-2';
      patsTitle.textContent = 'Monitored Patients';
      patsSection.appendChild(patsTitle);

      for (const patient of monitoredPatients) {
        const patCard = document.createElement('div');
        patCard.className = 'bg-white border border-slate-200 rounded-2xl p-3 mb-2';
        
        const statusColor = patient.status === 'on_track' ? 'text-emerald-700' : patient.status === 'overdue' ? 'text-rose-700' : 'text-slate-500';
        
        patCard.innerHTML = `
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <p class="font-semibold text-sm text-slate-900">${patient.name}</p>
              <p class="text-xs text-slate-500 mt-1">${patient.relation} • Adherence: ${patient.adherence}%</p>
              <p class="text-xs ${statusColor} mt-1 font-semibold">${patient.status.replace('_', ' ').toUpperCase()}</p>
            </div>
          </div>
        `;
        patsSection.appendChild(patCard);
      }

      container.appendChild(patsSection);
    }
  }
}

// ==========================================
// RENDER FUNCTIONS - REPORT TAB
// ==========================================

function renderReportTab(container: HTMLElement) {
  const adherence = getAdherencePercentage();
  const bpReadings = state.vitalLogs.filter(v => v.type === 'bp').slice(0, 7);
  const sugarReadings = state.vitalLogs.filter(v => v.type === 'sugar').slice(0, 7);
  const pulseReadings = state.vitalLogs.filter(v => v.type === 'pulse').slice(0, 7);

  const avgBpSys = bpReadings.length > 0 
    ? Math.round(bpReadings.reduce((sum, v) => sum + (v.sys || 0), 0) / bpReadings.length)
    : 0;
  const avgBpDia = bpReadings.length > 0 
    ? Math.round(bpReadings.reduce((sum, v) => sum + (v.dia || 0), 0) / bpReadings.length)
    : 0;
  const avgSugar = sugarReadings.length > 0 
    ? Math.round(sugarReadings.reduce((sum, v) => sum + (v.valueMgDl || 0), 0) / sugarReadings.length)
    : 0;
  const avgPulse = pulseReadings.length > 0 
    ? Math.round(pulseReadings.reduce((sum, v) => sum + (v.value || 0), 0) / pulseReadings.length)
    : 0;

  // Summary banner
  const banner = document.createElement('div');
  banner.className = 'bg-gradient-to-r from-brand-600 to-brand-700 text-white rounded-2xl p-4 mb-4';
  banner.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <h2 class="text-sm font-bold">Clinician Summary</h2>
      <button class="text-xs bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-lg font-semibold">
        📄 PDF Export
      </button>
    </div>
    <p class="text-xs opacity-90">Last 7 days • Based on ${state.doses.length} scheduled doses</p>
  `;
  container.appendChild(banner);

  // Summary cards grid
  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-2 gap-3 mb-4';
  
  const cards = [
    { label: 'Today Adherence', value: `${adherence}%`, color: 'brand' },
    { label: 'Avg BP', value: `${avgBpSys}/${avgBpDia}`, color: 'sky' },
    { label: 'Avg Sugar', value: avgSugar > 0 ? `${avgSugar} mg/dL` : 'N/A', color: 'amber' },
    { label: 'Avg Pulse', value: avgPulse > 0 ? `${avgPulse} bpm` : 'N/A', color: 'rose' },
  ];

  for (const card of cards) {
    const el = document.createElement('div');
    const bgClass = `bg-${card.color}-50 border-${card.color}-200`;
    el.className = `border rounded-2xl p-3 ${bgClass}`;
    el.innerHTML = `
      <p class="text-xs font-semibold text-slate-600 mb-1">${card.label}</p>
      <p class="text-lg font-bold text-slate-900">${card.value}</p>
    `;
    grid.appendChild(el);
  }
  container.appendChild(grid);

  // Activity log
  const logTitle = document.createElement('h3');
  logTitle.className = 'text-xs font-semibold text-slate-500 uppercase mb-2';
  logTitle.textContent = 'Recent Activity';
  container.appendChild(logTitle);

  const activityItems = state.intakeHistory.slice(0, 10);
  for (const item of activityItems) {
    const logItem = document.createElement('div');
    logItem.className = 'bg-white border border-slate-200 rounded-xl p-2.5 mb-2 text-xs';
    logItem.innerHTML = `
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <p class="font-semibold text-slate-900">${item.text}</p>
          <p class="text-slate-500 mt-0.5">${item.time} • ${item.date}</p>
        </div>
      </div>
    `;
    container.appendChild(logItem);
  }
}

// ==========================================
// APP STARTUP
// ==========================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

export { initializeApp, switchTab, takeScheduledDose, snoozeDose, takePrnDose, refillMedication, openAddMedModal, closeModal };

