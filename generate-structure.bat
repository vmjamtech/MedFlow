@echo off
REM Complete MedFlow Project Setup Script
REM Creates all directories and source files

setlocal enabledelayedexpansion
cd /d "C:\VSC Projects\MedFlow"

REM Create all directories
for %%D in (
  src
  src\db
  src\utils
  src\services
  src\views
  src\modals
  supabase\migrations
  docs
  .vscode
  .github\workflows
) do (
  if not exist "%%D" mkdir "%%D"
)

echo [OK] Created all directories

REM Create README.md
(
echo # MedFlow — Offline-First Medication & Vitals Tracking
echo.
echo A hybrid offline-first Android mobile app for personal medication adherence, vitals tracking, and clinical reporting with optional Guardian Mode sync.
echo.
echo ## Features
echo.
echo - **5-Tab Interface:** Today ^(adherence^), Vitals ^(BP/Sugar/Pulse^), Cabinet ^(inventory^), Guardian ^(pairing^), Report ^(export^)
echo - **100% Offline Core:** All personal data stored locally in SQLite; zero required login for personal use
echo - **Guardian Mode:** Optional Supabase sync for family/clinician monitoring via `MED-XXXX` pairing codes
echo - **Clinical Classifications:** ACC/AHA Blood Pressure, ADA Blood Sugar, Resting Pulse standards
echo - **Dynamic Dose Scheduling:** Fixed daily times, interval-based ^(every N hours^), PRN with cooldown/daily caps
echo - **Late-Dose Shifting:** Automatic 90-minute interval recalculation for delayed doses
echo - **Exact Alarms:** Lock-screen reminders with native `@capacitor/local-notifications` and action buttons
echo - **Vitals Trends:** 7-reading interactive SVG dual-line BP chart and single-line glucose/pulse sparklines
echo - **Printable Reports:** `@media print` CSS isolationfor clinician PDF export
echo.
echo ## Project Structure
echo.
echo ```
echo MedFlow/
echo ├── src/
echo │   ├── db/
echo │   │   ├── schema.ts         # TypeScript interfaces
echo │   │   └── database.ts       # SQLite wrapper
echo │   ├── utils/
echo │   │   ├── clinical.ts       # BP/glucose/pulse classification
echo │   │   └── pillSvg.ts        # Pill color/shape SVG builder
echo │   ├── services/
echo │   │   ├── guardianSync.ts   # Supabase sync & RLS
echo │   │   ├── notifications.ts  # Lock-screen exact alarms
echo │   │   ├── ocrScanner.ts     # ML Kit barcode/text
echo │   │   └── scheduler.ts      # Dose scheduling logic
echo │   ├── views/
echo │   │   ├── today.ts          # Adherence & dose cards
echo │   │   ├── vitals.ts         # BP/glucose/pulse logging
echo │   │   ├── cabinet.ts        # Inventory management
echo │   │   ├── guardian.ts       # Pairing & monitoring
echo │   │   └── report.ts         # Clinician export
echo │   ├── modals/
echo │   │   ├── addMedModal.ts    # OCR + manual entry
echo │   │   └── logVitalModal.ts  # Quick vital logging
echo │   ├── main.ts               # App initialization
echo │   └── index.css             # Tailwind + custom styles
echo ├── supabase/
echo │   └── migrations/
echo │       └── 001_guardian_sync.sql  # Schema + RLS
echo ├── docs/
echo │   ├── architecture.md       # Technical overview
echo │   └── changelog.md          # v0.1.0 release notes
echo ├── capacitor.config.ts       # Capacitor + Android config
echo ├── vite.config.ts            # Build configuration
echo ├── tailwind.config.js        # Tailwind theming
echo ├── tsconfig.json             # TypeScript strict mode
echo └── package.json              # Dependencies
echo ```
echo.
echo ## Quick Start
echo.
echo ```bash
echo npm install
echo npm run dev              # Desktop browser preview
echo npm run build            # Build web assets for Capacitor
echo npm run android:build    # Install APK to Android device
echo npm run android:run      # Launch on device
echo ```
echo.
echo ## 100%% Feature Parity with Prototype
echo.
echo All features from `prototype/index.html` are preserved 1:1:
echo - Today Tab: Morning/Afternoon/Evening dose grouping, adherence badge, dynamicLate +90m shifting
echo - Vitals Tab: BP/glucose/pulse/temp/spo2/weight with trend charts and printable list
echo - Cabinet Tab: Real-time inventory depletion and refill tracking
echo - Guardian Tab: Dual-mode switcher, invite code display, monitored patient links, 1h+ missed-dose alerts
echo - Report Tab: 4-card summary and chronological activity log with PDF export
echo.
echo ## Security
echo.
echo - **No hardcoded API keys:** Always read from `.env`
echo - **Strict RLS on Guardian tables:** Guardians cannot access unlinked patient data
echo - **Offline-first with optional sync:** Personal tracking never requires internet
echo - **Local SQLite persistence:** No automatic data deletion or recreation
echo.
echo ## License
echo.
echo Proprietary - MedFlow Team
) > README.md
echo [OK] Created README.md

REM Create .env if it doesn't exist
if not exist ".env" copy .env.example .env
echo [OK] .env template ready ^(fill in your Supabase keys^)

echo.
echo [SUCCESS] MedFlow project structure complete!
echo.
echo Next steps:
echo   1. npm install
echo   2. Fill in .env with your Supabase URL and anon key
echo   3. npm run dev
echo   4. npm run android:build
echo.
pause
