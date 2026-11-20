/**
 * Main application entry point
 * Initializes database, notifications, and renders the app
 */

import './index.css';
import { db } from './db/database';
import { NotificationService } from './services/notifications';
import { GuardianSyncService } from './services/guardianSync';

async function main() {
  // 1. Initialize database (SQLite or localStorage fallback)
  await db.init();
  console.log('✓ MedFlow database initialized');

  // 2. Request notification permissions (Android 13+)
  const notifEnabled = await NotificationService.requestPermissions();
  console.log('✓ Notifications', notifEnabled ? 'enabled' : 'disabled');

  // 3. Initialize Guardian Sync (optional cloud sync)
  const guardianReady = await GuardianSyncService.init();
  console.log('✓ Guardian Sync', guardianReady ? 'ready' : 'offline (local-only mode)');

  // 4. Load initial data from database
  const medications = await db.getMedications();
  const doses = await db.getDoses();
  const vitals = await db.getVitalLogs();
  console.log(`✓ Loaded: ${medications.length} medications, ${doses.length} doses, ${vitals.length} vital logs`);

  // 5. Render app UI (replace this with your framework's render call)
  const appRoot = document.getElementById('app');
  if (appRoot) {
    appRoot.innerHTML = `
      <div class="text-center py-8">
        <h1 class="text-2xl font-bold text-brand-600">MedFlow</h1>
        <p class="text-slate-500 mt-2">Smart Medication & Inventory Management</p>
        <p class="text-xs text-slate-400 mt-4">Database ready: ${medications.length} med(s)</p>
      </div>
    `;
  }

  console.log('✓ MedFlow app initialized and ready');
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}

export { main };
