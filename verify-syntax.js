#!/usr/bin/env node
/**
 * Quick syntax verification for main.ts
 * Checks for basic structure and exports
 */

const fs = require('fs');
const path = require('path');

const mainTsPath = path.join(__dirname, 'src', 'main.ts');
const content = fs.readFileSync(mainTsPath, 'utf-8');

console.log('🔍 Verifying main.ts syntax...\n');

const checks = [
  { name: 'Has initializeApp function', pattern: /function initializeApp\(\)/ },
  { name: 'Has renderApp function', pattern: /function renderApp\(\)/ },
  { name: 'Has renderTodayTab function', pattern: /function renderTodayTab\(\)/ },
  { name: 'Has renderVitalsTab function', pattern: /function renderVitalsTab\(\)/ },
  { name: 'Has renderCabinetTab function', pattern: /function renderCabinetTab\(\)/ },
  { name: 'Has renderGuardianTab function', pattern: /function renderGuardianTab\(\)/ },
  { name: 'Has renderReportTab function', pattern: /function renderReportTab\(\)/ },
  { name: 'Has openAddMedModal function', pattern: /function openAddMedModal\(\)/ },
  { name: 'Has openLogVitalModal function', pattern: /function openLogVitalModal\(\)/ },
  { name: 'Has closeModal function', pattern: /function closeModal\(\)/ },
  { name: 'Has takeScheduledDose function', pattern: /function takeScheduledDose\(/ },
  { name: 'Has snoozeDose function', pattern: /function snoozeDose\(/ },
  { name: 'Has takePrnDose function', pattern: /function takePrnDose\(/ },
  { name: 'Has switchTab function', pattern: /function switchTab\(/ },
  { name: 'Has handleLogVitalFormSubmit function', pattern: /function handleLogVitalFormSubmit\(/ },
  { name: 'Calls initializeApp at end', pattern: /initializeApp\(\);$/ },
  { name: 'Has showToast function', pattern: /function showToast\(/ },
  { name: 'Has formatMinutesTo12h function', pattern: /function formatMinutesTo12h\(/ },
  { name: 'Has formatQuantity function', pattern: /function formatQuantity\(/ },
];

let passed = 0;
let failed = 0;

checks.forEach(check => {
  if (check.pattern.test(content)) {
    console.log(`✅ ${check.name}`);
    passed++;
  } else {
    console.log(`❌ ${check.name}`);
    failed++;
  }
});

console.log(`\n📊 Results: ${passed}/${checks.length} checks passed`);

if (failed === 0) {
  console.log('✨ All syntax checks passed!');
  process.exit(0);
} else {
  console.log(`⚠️  ${failed} check(s) failed`);
  process.exit(1);
}
