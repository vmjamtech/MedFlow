# MedFlow Project History

## 2026-11-22 — Restore app runtime and complete Guardian approval security

### What was fixed today

- Recovered the browser app after a Git reset restored an older scaffold entry point by reconnecting the root page to the preserved MedFlow bundle.
- Restored all scheduled doses to a clean `0/4` pending state in browser-local test data without deleting medication, vitals, or other patient records.
- Restored the Vitals experience with:
  - functional Log Vital Sign drawer for BP, glucose, pulse, temperature, SpO2, and weight;
  - clinical summary cards and secondary-vital tiles;
  - seven-reading interactive trend charts;
  - mg/dL and mmol/L glucose display toggle;
  - date-range inputs and Today, Last 3d, and 7 Days presets;
  - category filters;
  - Cards and Printable List views;
  - Print/PDF action;
  - improved date-control and general text contrast.
- Expanded the Add Medication interval schedule options to 1, 2, 3, 4, 6, 8, 12, and 24 hours, retaining 8 hours as the default.
- Moved Guardian `Sync ON/OFF` and `My Code` controls above the patient-code request area.
- Implemented the two-step Guardian approval flow:
  - patient-code requests begin as `pending`;
  - pending requests expose no medication schedules, adherence, or alert data;
  - invalid patient codes are rejected;
  - My Patient Code includes Incoming Requests with a live badge;
  - prototype-only request simulation supports Accept and Decline testing;
  - approved Guardians receive a Remove action;
  - monitored patient cards receive a Remove/disconnect action;
  - local Guardian link state persists across reloads;
  - rendered caregiver and patient identifiers are HTML-escaped.
- Restored the My Code patient name/identifier input, local persistence, and Save Name action.
- Added anonymous Supabase profile initialization and collision-safe `MED-XXXXXXXX` profile creation.
- Added secure patient-name synchronization and a server-side `request_guardian_access` RPC that returns only `{ found, patient_name }` while inserting a pending link.
- Reworked Guardian dose/alert RLS so SELECT access requires an approved Guardian link and updates are constrained to allowed columns.
- Replaced destructive legacy Guardian migration behavior with additive/backward-compatible schema alignment.
- Browser-tested request, pending-lock, approval, decline, patient-side revoke, guardian-side disconnect, interval options, Vitals logging, filters, persistence, and contrast. Test-created browser records were removed afterward.

### Files modified

- `index.html`
- `src/db/schema.ts`
- `src/services/guardianSync.ts`
- `src/views/guardian.ts`
- `supabase/migrations/001_guardian_sync.sql`
- `project-history.md`

### Open issue queue

- Apply and validate `supabase/migrations/001_guardian_sync.sql` in the live Supabase project, then run two-account end-to-end RLS tests with pending, approved, declined, and revoked states.
- Integrate the working runtime recovery logic currently hosted in `index.html` into the modular TypeScript source and restore a full `src/main.ts`; the reverted `src/main.ts` remains a scaffold and would otherwise replace the complete app on a normal source rebuild.
- Remove or gate production demo Guardian patients and simulated request controls from release builds.
- Run `npm run build`, `npm test` if test scripts are restored, and `npm run lint` outside the current Windows sandbox and resolve any TypeScript, lint, or bundle errors before producing a release build.
- Verify Android/Capacitor behavior after a clean `npm run build && npx cap sync`, including anonymous Supabase authentication, local SQLite preservation, notifications, PDF/print export, and safe-area layout.
- Add automated tests for the Guardian state transitions and approved-only dose/alert access.
- Confirm and migrate any legacy Guardian rows whose earlier schema lacks `patient_user_id` before relying on live production Guardian reads.

### Safety notes

- No local medication, vital, dose, intake-history, SQLite, or Supabase production records were intentionally deleted.
- The Supabase migration has not been applied to the live database.
- `npm run build` could not be executed in the agent environment because the Windows session lacks a supported BaseContainer sandbox backend; browser runtime verification was completed.
