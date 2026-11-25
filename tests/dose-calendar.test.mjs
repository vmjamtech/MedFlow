import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';

let moduleId = 0;

async function loadModule(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    define: { 'import.meta.env': '{}' },
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${moduleId++}`);
}

async function loadReminderModules() {
  const result = await build({
    stdin: {
      contents: "export { NotificationService } from './src/services/notifications.ts'; export { SchedulerService } from './src/services/scheduler.ts'; export { db } from './src/db/database.ts'; export { LocalNotifications } from '@capacitor/local-notifications';",
      resolveDir: process.cwd(),
      sourcefile: 'reminder-test-entry.ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    define: { 'import.meta.env': '{}' },
    plugins: [{
      name: 'mock-notifications',
      setup(build) {
        build.onResolve({ filter: /^@capacitor\/local-notifications$/ }, () => ({ path: 'notifications', namespace: 'test' }));
        build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const LocalNotifications = {}', loader: 'js' }));
      },
    }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${moduleId++}`);
}

test('interval doses continue across midnight from the start or shifted anchor', async () => {
  const { SchedulerService } = await loadModule('src/services/scheduler.ts');
  const anchor = new Date(2026, 10, 25, 17, 35);
  const medication = {
    id: 'test-med',
    name: 'Test',
    scheduleType: 'interval',
    intervalHours: 1,
    fixedTimes: ['17:35'],
    intervalAnchor: anchor.toISOString(),
  };
  const today = await SchedulerService.calculateDayDoses(medication, '2026-11-25');
  const tomorrow = await SchedulerService.calculateDayDoses(medication, '2026-11-26');
  assert.equal(today.length, 7);
  assert.equal(today.at(-1).scheduledMinutes, 23 * 60 + 35);
  assert.equal(tomorrow.length, 24);
  assert.equal(tomorrow[0].scheduledMinutes, 35);
  assert.equal(new Set([...today, ...tomorrow].map((dose) => dose.id)).size, 31);

  medication.intervalAnchor = new Date(2026, 10, 25, 23, 50).toISOString();
  medication.intervalHours = 2;
  const shifted = await SchedulerService.calculateDayDoses(medication, '2026-11-26');
  assert.equal(shifted[0].scheduledMinutes, 1 * 60 + 50);
  assert.equal((await SchedulerService.calculateDayDoses(medication, '2026-11-24')).length, 0);
});

test('SQLite date migration preserves existing medication, dose, and intake rows', async () => {
  const { MedFlowDatabase } = await loadModule('src/db/database.ts');
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE medications (id TEXT PRIMARY KEY, name TEXT, intervalHours INTEGER);
    CREATE TABLE doses (id TEXT PRIMARY KEY, medId TEXT, scheduledMinutes INTEGER, originalMinutes INTEGER, status TEXT);
    CREATE TABLE intake_history (id TEXT PRIMARY KEY, medId TEXT, medName TEXT);
    INSERT INTO medications VALUES ('med-1', 'Test', 1);
    INSERT INTO doses VALUES ('dose-1', 'med-1', 1055, 1055, 'taken');
    INSERT INTO intake_history VALUES ('history-1', 'med-1', 'Test');
  `);
  const database = new MedFlowDatabase();
  database.db = {
    run: async (sql, values = []) => sqlite.prepare(sql).run(...values),
    query: async (sql, values = []) => ({ values: sqlite.prepare(sql).all(...values) }),
  };
  await database.createTables();
  await database.createTables();
  const dose = sqlite.prepare('SELECT * FROM doses WHERE id = ?').get('dose-1');
  assert.equal(dose.status, 'taken');
  assert.equal(dose.scheduledDate, [
    new Date().getFullYear(),
    String(new Date().getMonth() + 1).padStart(2, '0'),
    String(new Date().getDate()).padStart(2, '0'),
  ].join('-'));
  assert.equal(sqlite.prepare('SELECT name FROM medications WHERE id = ?').get('med-1').name, 'Test');
  assert.equal(sqlite.prepare('SELECT medName FROM intake_history WHERE id = ?').get('history-1').medName, 'Test');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM generated_dose_days').get().count, 1);
  sqlite.close();
});

test('one-off reminders cover seven days and retain IDs when a dose is snoozed', async () => {
  const { NotificationService, db } = await loadReminderModules();
  const now = new Date(2026, 10, 25, 17, 0);
  const medication = {
    id: 'med-1',
    name: 'Test',
    strength: '500',
    doseQty: 1,
    unit: 'tablet',
    scheduleType: 'fixed',
    fixedTimes: ['17:35'],
  };
  const dose = {
    id: 'legacy-dose-1',
    medId: medication.id,
    scheduledDate: '2026-11-25',
    scheduledMinutes: 17 * 60 + 35,
    scheduledAt: new Date(2026, 10, 25, 17, 35).toISOString(),
    originalMinutes: 17 * 60 + 35,
    status: 'pending',
  };
  db.getDoses = async (date) => date === dose.scheduledDate ? [dose] : [];
  db.hasGeneratedDoseDay = async (_medId, date) => date === '2026-11-25';

  const initial = await NotificationService.upcoming([medication], now);
  assert.equal(initial.length, 7);
  assert.equal(initial[0].schedule.at.getTime(), new Date(2026, 10, 25, 17, 35).getTime());
  assert.ok(initial.every((item) => item.schedule.allowWhileIdle && !item.schedule.repeats));
  assert.ok(initial.every((item) => item.isExactMandatory));
  assert.equal(new Set(initial.map((item) => item.id)).size, initial.length);

  dose.scheduledMinutes += 15;
  dose.scheduledAt = new Date(2026, 10, 25, 17, 50).toISOString();
  const snoozed = await NotificationService.upcoming([medication], now);
  assert.equal(snoozed[0].id, initial[0].id);
  assert.equal(snoozed[0].schedule.at.getTime(), new Date(2026, 10, 25, 17, 50).getTime());

  dose.status = 'taken';
  const taken = await NotificationService.upcoming([medication], now);
  assert.equal(taken.length, 6);
  assert.ok(taken.every((item) => item.id !== initial[0].id));
});

test('daily rollover creates the next day once and preserves earlier doses and history', async () => {
  const { SchedulerService, db } = await loadReminderModules();
  const sqlite = new DatabaseSync(':memory:');
  db.db = {
    run: async (sql, values = []) => sqlite.prepare(sql).run(...values.map((value) => value ?? null)),
    query: async (sql, values = []) => ({ values: sqlite.prepare(sql).all(...values.map((value) => value ?? null)) }),
  };
  await db.createTables();
  const medication = {
    id: 'med-1', name: 'Test', strength: '500', shape: 'round', color: 'teal',
    doseQty: 1, unit: 'tablet', scheduleType: 'interval', intervalHours: 1,
    fixedTimes: ['17:35'], intervalAnchor: new Date(2026, 10, 25, 17, 35).toISOString(),
    mealRequired: 'no_meal', stockRemaining: 30, stockTotal: 30, lowStockThreshold: 3,
  };
  await db.saveMedication(medication);
  sqlite.prepare('INSERT INTO intake_history (id, medId, medName, strength, doseQty, unit, takenAt, date, timingStatus, scheduleType) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'history-1', 'med-1', 'Test', '500', 1, 'tablet', '17:35', '2026-11-25', 'On time', 'interval'
  );
  const today = await SchedulerService.reconcileDay([medication], '2026-11-25');
  assert.equal(today.length, 7);
  today[0].status = 'taken';
  await db.saveDose(today[0]);
  const tomorrow = await SchedulerService.reconcileDay([medication], '2026-11-26');
  assert.equal(tomorrow.length, 24);
  assert.equal(tomorrow[0].scheduledMinutes, 35);
  assert.equal((await SchedulerService.reconcileDay([medication], '2026-11-26')).length, 24);
  assert.equal((await db.getDoses('2026-11-25'))[0].status, 'taken');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM intake_history').get().count, 1);
  sqlite.close();
});

test('reminder synchronization cancels obsolete alarms and surfaces permissions and scheduling failures', async () => {
  const { NotificationService, LocalNotifications } = await loadReminderModules();
  NotificationService.isAvailable = () => true;
  const reminder = {
    id: 101, schedule: { at: new Date(2026, 10, 25, 17, 50), allowWhileIdle: true },
    extra: { source: 'medflow-medication-reminder', doseId: 'dose-1' },
  };
  NotificationService.upcoming = async () => [reminder];
  let pending = [
    { id: 101, extra: { source: 'medflow-medication-reminder', doseId: 'dose-1' } },
    { id: 102, extra: { source: 'medflow-medication-reminder', doseId: 'deleted-dose' } },
    { id: 103, extra: { source: 'unrelated' } },
  ];
  let cancelled = [];
  let scheduled = [];
  LocalNotifications.getPending = async () => ({ notifications: pending });
  LocalNotifications.cancel = async ({ notifications }) => { cancelled = notifications; };
  LocalNotifications.checkPermissions = async () => ({ display: 'granted' });
  LocalNotifications.checkExactNotificationSetting = async () => ({ exact_alarm: 'granted' });
  LocalNotifications.schedule = async ({ notifications }) => {
    scheduled = notifications;
    return { notifications };
  };
  await NotificationService.synchronize([], false);
  assert.deepEqual(cancelled, [{ id: 102 }]);
  assert.deepEqual(scheduled, [reminder]);

  pending = [{ id: 101, extra: { source: 'other-app-feature', doseId: 'other' } }];
  await assert.rejects(NotificationService.synchronize([], false), /conflicts/);

  pending = [];
  LocalNotifications.checkPermissions = async () => ({ display: 'denied' });
  await assert.rejects(NotificationService.synchronize([], false), /Enable MedFlow notifications/);
  LocalNotifications.checkPermissions = async () => ({ display: 'granted' });
  LocalNotifications.checkExactNotificationSetting = async () => ({ exact_alarm: 'denied' });
  await assert.rejects(NotificationService.synchronize([], false), /Allow alarms and reminders/);
  LocalNotifications.checkExactNotificationSetting = async () => ({ exact_alarm: 'granted' });
  LocalNotifications.schedule = async () => { throw new Error('Scheduling failed'); };
  await assert.rejects(NotificationService.synchronize([], false), /Scheduling failed/);
});
