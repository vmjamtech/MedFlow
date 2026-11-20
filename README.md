# MedFlow — Offline-First Medication 

A hybrid offline-first Android mobile app for personal medication adherence, vitals tracking, and clinical reporting with optional Guardian Mode sync.

## Features

- **5-Tab Interface:** Today (adherence), Vitals (BP/Sugar/Pulse), Cabinet (inventory), Guardian (pairing), Report (export)
- **100** All personal data stored locally in SQLite; zero required login for personal use
- **Guardian Mode:** Optional Supabase sync for family/clinician monitoring via `MED-XXXX` pairing codes
- **Clinical Classifications:** ACC/AHA Blood Pressure, ADA Blood Sugar, Resting Pulse standards
- **Dynamic Dose Scheduling:** Fixed daily times, interval-based (every N hours), PRN with cooldown/daily caps
- **Late-Dose Shifting:** Automatic 90-minute interval recalculation for delayed doses
- **Exact Alarms:** Lock-screen reminders with native `@capacitor/local-notifications` and action buttons
- **Vitals Trends:** 7-reading interactive SVG dual-line BP chart and single-line glucose/pulse sparklines
- **Printable Reports:** `@media print` CSS isolationfor clinician PDF export

## Project Structure

```
MedFlow/
├── src/
│   ├── db/
│   │   ├── schema.ts         # TypeScript interfaces
│   │   └── database.ts       # SQLite wrapper
│   ├── utils/
│   │   ├── clinical.ts       # BP/glucose/pulse classification
│   │   └── pillSvg.ts        # Pill color/shape SVG builder
│   ├── services/
│   │   ├── guardianSync.ts   # Supabase sync 
│   │   ├── notifications.ts  # Lock-screen exact alarms
│   │   ├── ocrScanner.ts     # ML Kit barcode/text
│   │   └── scheduler.ts      # Dose scheduling logic
│   ├── views/
│   │   ├── today.ts          # Adherence 
│   │   ├── vitals.ts         # BP/glucose/pulse logging
│   │   ├── cabinet.ts        # Inventory management
│   │   ├── guardian.ts       # Pairing 
│   │   └── report.ts         # Clinician export
│   ├── modals/
│   │   ├── addMedModal.ts    # OCR + manual entry
│   │   └── logVitalModal.ts  # Quick vital logging
│   ├── main.ts               # App initialization
│   └── index.css             # Tailwind + custom styles
├── supabase/
│   └── migrations/
│       └── 001_guardian_sync.sql  # Schema + RLS
├── docs/
│   ├── architecture.md       # Technical overview
│   └── changelog.md          # v0.1.0 release notes
├── capacitor.config.ts       # Capacitor + Android config
├── vite.config.ts            # Build configuration
├── tailwind.config.js        # Tailwind theming
├── tsconfig.json             # TypeScript strict mode
└── package.json              # Dependencies
```

## Quick Start

```bash
npm install
npm run dev              # Desktop browser preview
npm run build            # Build web assets for Capacitor
npm run android:build    # Install APK to Android device
npm run android:run      # Launch on device
```

## 100% Feature Parity with Prototype

All features from `prototype/index.html` are preserved 1:1:
- Today Tab: Morning/Afternoon/Evening dose grouping, adherence badge, dynamicLate +90m shifting
- Vitals Tab: BP/glucose/pulse/temp/spo2/weight with trend charts and printable list
- Cabinet Tab: Real-time inventory depletion and refill tracking
- Guardian Tab: Dual-mode switcher, invite code display, monitored patient links, 1h+ missed-dose alerts
- Report Tab: 4-card summary and chronological activity log with PDF export

## Security

- **No hardcoded API keys:** Always read from `.env`
- **Strict RLS on Guardian tables:** Guardians cannot access unlinked patient data
- **Offline-first with optional sync:** Personal tracking never requires internet
- **Local SQLite persistence:** No automatic data deletion or recreation

## License

Proprietary - MedFlow Team
