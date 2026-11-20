# MedFlow Complete Project Generator
# Run this in PowerShell to create all source files and structure

$projectRoot = "C:\VSC Projects\MedFlow"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

Write-Host "🚀 MedFlow Project Generator" -ForegroundColor Cyan
Write-Host "Start time: $timestamp" -ForegroundColor Gray
Write-Host ""

# Create all directories
$directories = @(
  "src",
  "src\db",
  "src\utils",
  "src\services",
  "src\views",
  "src\modals",
  "supabase\migrations",
  "docs",
  ".vscode",
  ".github\workflows"
)

foreach ($dir in $directories) {
  $fullPath = Join-Path $projectRoot $dir
  if (-not (Test-Path $fullPath)) {
    New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
    Write-Host "✓ Created $dir" -ForegroundColor Green
  }
}

# Create PLAN.md
$planContent = @"
# MedFlow Implementation Plan

## Completed ✅
- [x] `.github/copilot-instructions.md` - Governance rules
- [x] `.github/instructions/*.md` - Core, safety, token rules
- [x] `.github/workflows/android-build.yml` - CI/CD pipeline
- [x] `capacitor.config.ts` - Capacitor + Android config
- [x] `vite.config.ts` - Build configuration
- [x] `tailwind.config.js` - Design tokens
- [x] `tsconfig.json` - TypeScript strict mode
- [x] `package.json` - Dependencies
- [x] `.env.example` - Environment template
- [x] `.gitignore` - Git excludes
- [x] `README.md` - Project overview
- [x] `docs/architecture.md` - Technical design
- [x] `docs/changelog.md` - v0.1.0 release notes

## In Progress 🔄
- [ ] `src/db/schema.ts` - TypeScript interfaces
- [ ] `src/db/database.ts` - SQLite wrapper
- [ ] `src/utils/clinical.ts` - Clinical classifiers
- [ ] `src/utils/pillSvg.ts` - Pill SVG builder
- [ ] `src/services/scheduler.ts` - Dose scheduling
- [ ] `src/services/notifications.ts` - Exact alarms
- [ ] `src/services/ocrScanner.ts` - OCR integration
- [ ] `src/services/guardianSync.ts` - Supabase sync
- [ ] `src/views/today.ts` - Today tab
- [ ] `src/views/vitals.ts` - Vitals tab
- [ ] `src/views/cabinet.ts` - Cabinet tab
- [ ] `src/views/guardian.ts` - Guardian tab
- [ ] `src/views/report.ts` - Report tab
- [ ] `src/modals/addMedModal.ts` - Add medication
- [ ] `src/modals/logVitalModal.ts` - Log vital
- [ ] `src/main.ts` - App initialization
- [ ] `src/index.css` - Tailwind + custom styles
- [ ] `supabase/migrations/001_guardian_sync.sql` - Schema + RLS

## Next Steps
1. Run: \`npm install\`
2. Fill in \`.env\` with Supabase credentials (optional for Guardian Mode)
3. Implement source files in this order:
   - Database layer: schema.ts → database.ts
   - Utils: clinical.ts → pillSvg.ts
   - Services: scheduler.ts → notifications.ts → ocrScanner.ts → guardianSync.ts
   - Views: today.ts → vitals.ts → cabinet.ts → guardian.ts → report.ts
   - Modals: addMedModal.ts → logVitalModal.ts
   - Main: main.ts → index.css
4. Run: \`npm run dev\` to preview in browser
5. Run: \`npm run build && npm run android:build\` for APK

## 100% Feature Parity Checklist

### Today Tab
- [ ] Adherence badge (X / Y Taken)
- [ ] Morning Check-In banner (dismissible)
- [ ] Dose cards by time period (Morning/Afternoon/Evening)
- [ ] Take Now, Late (+90m), Snooze +15m actions
- [ ] PRN cards with countdown timer
- [ ] Dynamic interval recalculation for late doses (+90min)

### Vitals Tab
- [ ] + Log Vital Sign modal
- [ ] Blood Pressure (Systolic/Diastolic) with ACC/AHA classification
- [ ] Blood Sugar with mg/dL ↔ mmol/L toggle
- [ ] Fasting vs. Post-Meal context selector
- [ ] Pulse, Temperature, SpO2, Weight fields
- [ ] Secondary vitals quick strip
- [ ] 7-reading SVG dual-line BP chart
- [ ] Single-line glucose and pulse sparklines
- [ ] Date range filter (From/To + quick filters)
- [ ] Category filter pills
- [ ] Cards ↔ Printable list toggle
- [ ] @media print CSS isolation

### Cabinet Tab
- [ ] Piece progress bars
- [ ] Daily consumption & ~X days left math
- [ ] + Refill (+30) button
- [ ] Low-stock warning dot on nav icon

### Guardian Tab
- [ ] Dual-mode switcher (Family / My Patient Code)
- [ ] MED-XXXX invite code display with copy
- [ ] + Link Patient via Code form
- [ ] Monitored patient adherence cards
- [ ] 1h+ overdue alert cards
- [ ] ✓ Acknowledge Alert button
- [ ] Escalate All Missed Meds toggle
- [ ] Guardian Sync enabled/disabled toggle

### Report Tab
- [ ] Clinician Summary banner
- [ ] 4-card summary (Today %, Avg BP, Avg Sugar, Avg Pulse)
- [ ] Chronological Recent Intake Activity Log
- [ ] PDF export (MedFlow_Clinician_Report_[Date].pdf)

### Add Medication Modal
- [ ] On-Device OCR Scanner for Rx labels
- [ ] Medication name & strength inputs
- [ ] Pill shape selector (round, oval, capsule)
- [ ] Pill color selector (5 colors with preview)
- [ ] Meal requirement dropdowns (2-step conditional)
- [ ] Schedule type selection (Fixed / Interval / PRN)
- [ ] Conditional fields per schedule type
- [ ] Initial stock & low-stock threshold
- [ ] Submit → adds medication, shows toast

## Testing Checklist

### Unit Tests
- [ ] Clinical classifiers (BP, glucose, pulse)
- [ ] Dose scheduling (fixed, interval, PRN)
- [ ] Late-dose recalculation (+90min shift)
- [ ] PRN cooldown enforcement

### Integration Tests
- [ ] SQLite CRUD operations
- [ ] Supabase Guardian sync with RLS
- [ ] Offline fallback (localStorage)
- [ ] OCR scanner with fallback regex

### Manual Tests
- [ ] Desktop browser preview (npm run dev)
- [ ] Android emulator with Capacitor
- [ ] Real device APK installation
- [ ] Guardian Mode linking
- [ ] PDF export & print

## Build & Deployment

- [ ] npm run build (optimize dist/)
- [ ] npx cap sync (copy to android/)
- [ ] ./gradlew assembleDebug (create APK)
- [ ] adb install -r app-debug.apk (deploy to device)
- [ ] Test all 5 tabs on device
- [ ] Verify exact alarms trigger on lock screen
- [ ] Confirm offline functionality without internet

---

**MedFlow v0.1.0 Target:** Complete, testable, production-ready offline-first medication tracker with optional Guardian Mode.
"@

Set-Content -Path (Join-Path $projectRoot "PLAN.md") -Value $planContent -Encoding UTF8
Write-Host "✓ Created PLAN.md" -ForegroundColor Green

# Create .vscode/settings.json
$vscodeSetting = @"
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "files.exclude": {
    "**/node_modules": true,
    "dist": true,
    ".gradle": true
  }
}
"@

$vscodePath = Join-Path $projectRoot ".vscode"
New-Item -ItemType Directory -Path $vscodePath -Force | Out-Null
Set-Content -Path (Join-Path $vscodePath "settings.json") -Value $vscodeSetting -Encoding UTF8
Write-Host "✓ Created .vscode/settings.json" -ForegroundColor Green

# Create docs
$docsPath = Join-Path $projectRoot "docs"
New-Item -ItemType Directory -Path $docsPath -Force | Out-Null
Write-Host "✓ Created docs directory" -ForegroundColor Green

# Create .github/workflows
$workflowPath = Join-Path $projectRoot ".github\workflows"
New-Item -ItemType Directory -Path $workflowPath -Force | Out-Null
Write-Host "✓ Created .github/workflows directory" -ForegroundColor Green

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ MedFlow project structure created successfully!" -ForegroundColor Green
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. npm install" -ForegroundColor White
Write-Host "2. Fill in .env with Supabase credentials (optional)" -ForegroundColor White
Write-Host "3. Implement source files in src/ (see PLAN.md for order)" -ForegroundColor White
Write-Host "4. npm run dev" -ForegroundColor White
Write-Host "5. npm run build && npm run android:build" -ForegroundColor White
Write-Host ""
Write-Host "Generated at: $timestamp" -ForegroundColor Gray
