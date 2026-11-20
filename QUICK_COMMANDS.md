# MedFlow — Command Quick Reference

## 🚀 Setup & Build (Run These First)

```bash
cd C:\VSC Projects\MedFlow

# Option A: Run automated batch script
setup-and-build.bat

# Option B: Manual step-by-step
npm install
npm run type-check
npm run build
npx cap add android
npx cap sync android
```

---

## 🔄 Development Workflow

```bash
# Start local dev server (browser preview with HMR)
npm run dev
# Opens: http://localhost:5173
# Edit src/ files → changes appear instantly in browser

# Type check (before committing)
npm run type-check

# Lint (before committing)
npm run lint

# Build for production
npm run build
# Creates: dist/ (optimized Vite bundle)
```

---

## 🤖 Android Development

```bash
# Initial setup (only once)
npx cap add android

# After changing web code
npm run build
npx cap sync android

# Open Android Studio
npx cap open android

# Or manually open: C:\VSC Projects\MedFlow\android
# Then: Build > Build APKs (or Ctrl+Shift+B)

# After APK built in Android Studio
adb install -r android\app\build\outputs\apk\debug\app-debug.apk

# Launch app on connected device
adb shell am start -n com.medflow.app/.MainActivity

# View logs
adb logcat | grep medflow
```

---

## 🎯 Common Tasks

### Add a New Package
```bash
npm install @package-name
```

### Update All Dependencies
```bash
npm update
```

### Clean Build (if issues)
```bash
rmdir /s dist              # Delete build
rmdir /s node_modules      # Delete dependencies
del package-lock.json      # Delete lock file
npm install                # Reinstall
npm run build              # Rebuild
```

### Remove Android Directory (reset)
```bash
rmdir /s android           # Delete Android folder
npx cap add android        # Recreate from scratch
npx cap sync android       # Sync again
```

### Check Installed App Version
```bash
adb shell pm list packages | find "medflow"
# Output: com.medflow.app

adb shell dumpsys package com.medflow.app | find "versionName"
```

### Uninstall App from Device
```bash
adb uninstall com.medflow.app
```

---

## 📱 Testing on Device

### Prerequisites
- Android device (10+) or emulator
- USB debugging enabled
- USB cable or emulator running

### Install & Run
```bash
# Build APK
npm run build
npx cap sync android
# Then use Android Studio to build APK

# Install
adb install -r android\app\build\outputs\apk\debug\app-debug.apk

# Launch
adb shell am start -n com.medflow.app/.MainActivity

# View logs (in real-time)
adb logcat -s MedFlow
```

### Test Features
1. **Today Tab:** Add medication (FAB), mark doses taken
2. **Vitals Tab:** Log blood pressure, glucose, pulse
3. **Cabinet Tab:** Check inventory, refill medication
4. **Guardian Tab:** View invite code, link patient
5. **Report Tab:** View summary, export PDF

### Test Offline
```bash
# Disable internet on device
# Settings > Connections > Airplane Mode (ON)
# Or disable WiFi & mobile data

# App should continue working without internet
# Personal data (meds, doses, vitals) all load
# Guardian Sync will show "Offline" or disabled

# Re-enable internet to test sync
```

---

## 📚 Documentation Files

```
MedFlow/
├── README.md                 # Project overview & quick start
├── PLAN.md                   # 15-page implementation roadmap
├── PROJECT_SUMMARY.md        # Executive summary
├── VERIFICATION.md           # QA checklist
├── ANDROID_SETUP.md          # This setup guide
├── QUICK_COMMANDS.md         # Command reference (you are here)
└── docs/
    ├── architecture.md       # Technical design & data model
    └── changelog.md          # v0.1.0 release notes
```

---

## 🆘 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| `npm install` fails | Delete `node_modules/`, `package-lock.json`, retry |
| `npm run build` fails | Run `npm run type-check` to see errors |
| `npx cap add android` fails | Install Android SDK via Android Studio |
| APK not found after build | Build in Android Studio: Build > Build APKs |
| App crashes on launch | Check `AndroidManifest.xml` permissions |
| Offline mode fails | Expected if DB not implemented yet (uses localStorage) |
| Supabase not syncing | Check `.env` credentials, enable Guardian Sync toggle |

---

## 🎓 Key File Locations

```
C:\VSC Projects\MedFlow\

Configuration:
├── package.json              (dependencies)
├── capacitor.config.ts       (Android config)
├── vite.config.ts            (build config)
├── tsconfig.json             (TypeScript config)
├── tailwind.config.js        (design tokens)

Source Code (Ready to Implement):
├── src/
│   ├── db/                   (database layer)
│   ├── utils/                (clinical classifiers, pill SVG)
│   ├── services/             (scheduler, notifications, Guardian sync)
│   ├── views/                (5-tab UI: today, vitals, cabinet, guardian, report)
│   ├── modals/               (add medication, log vital)
│   ├── main.ts               (app initialization)
│   └── index.css             (Tailwind + mobile styles)

Built Output (Created by build):
├── dist/                     (Vite bundle → web assets)
├── android/                  (Capacitor Android project)

Documentation:
├── README.md
├── PLAN.md
├── docs/

Governance:
├── .github/copilot-instructions.md
├── .github/instructions/
├── .github/workflows/android-build.yml
```

---

## 🔗 Useful Links

- **Node.js:** https://nodejs.org/ (download LTS)
- **Android Studio:** https://developer.android.com/studio
- **Capacitor Docs:** https://capacitorjs.com/
- **Vite Docs:** https://vitejs.dev/
- **Tailwind CSS:** https://tailwindcss.com/
- **TypeScript:** https://www.typescriptlang.org/
- **Supabase:** https://supabase.com/

---

## ✨ Success Checklist

- [ ] `npm install` runs without errors
- [ ] `npm run build` creates `dist/`
- [ ] `npx cap add android` creates `android/`
- [ ] `npx cap sync` syncs without warnings
- [ ] Android Studio opens project
- [ ] `Build > Build APKs` completes successfully
- [ ] `adb install` succeeds
- [ ] App launches on device
- [ ] All 5 tabs load
- [ ] Offline mode works
- [ ] No console errors in Logcat

---

**Run `setup-and-build.bat` to get started, Mr. VMJAM! ⚡**
