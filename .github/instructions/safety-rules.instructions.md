---
applyTo: "**"
---

# Safety Rules for MedFlow

## Local SQLite Database & Patient Data

**Existing patient records are protected.**

- **NEVER** casually delete/recreate the database
- **NEVER** drop tables or delete user records
- **NEVER** overwrite data during app updates/seeding
- **NEVER** alter migrations without checking impact on existing data

**Before any database change**:
1. Inspect current implementation
2. Determine effect on existing records
3. Explain risk
4. Propose an additive, backward-compatible solution

## Security & Supabase Guardian Sync

- **Never hardcode** Supabase URLs, anon keys, or secrets
- **Always read** from `.env`:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- **Personal tracking works 100% offline** without login
- **Guardian Mode tables** enforce strict Row Level Security (RLS) scoped to paired `MED-XXXX` invite codes
- **No unauthenticated access** to guardian data in Supabase

## Printing & Clinician Report Isolation

- Keep `@media print` and PDF export styles **strictly isolated** to:
  - Vitals Printable List View
  - Clinician Report export routines
- **Never mutate** global mobile viewport styles for print

## Android & Capacitor Guardrails

- **Preserve**:
  - Gradle configuration
  - Java/JDK setup
  - Android SDK configuration
  - `AndroidManifest.xml` alarm/camera permissions
  - `capacitor.config.ts`
- **Change only when explicitly required and approved**

## Regression Protection

- **Never fix one feature by breaking another**
- List what must be retested after shared-service changes
- Verify unrelated behavior is preserved
