# 🚀 MedFlow Android Setup & Build Guide

**Date:** November 20, 2026  
**Status:** Ready for Android Platform Setup  
**Next Command:** Run `setup-and-build.bat` from Windows CMD

---

## ⚡ Quick Start (5 Minutes)

### Step 1: Run Setup Script
In Windows CMD, navigate to MedFlow folder and execute:

```cmd
cd C:\VSC Projects\MedFlow
setup-and-build.bat
```

This will:
✅ Install npm dependencies (Capacitor, Supabase, Vite, Tailwind, TypeScript)  
✅ Type-check TypeScript strict mode  
✅ Build Vite project → `dist/` folder  
✅ Add Android platform to Capacitor  
✅ Sync web assets to `android/app/src/main/assets/public/`  

**Time:** ~3-5 minutes

---

## 🔧 Manual Steps (If Script Fails)

If the batch script encounters errors, run these commands one by one:

```bash
cd C:\VSC Projects\MedFlow

# 1. Install dependencies
npm install

# 2. Type check
npm run type-check

# 3. Build for web
npm run build

# 4. Add Android platform
npx cap add android

# 5. Sync to Android
npx cap sync android
```

---

## 📂 After Build: What's Created

```
MedFlow/
├── dist/                    ← Vite build output (web assets)
│   ├── index.html
│   ├── main.js (bundled)
│   └── style.css (Tailwind optimized)
│
└── android/                 ← Capacitor Android project
    ├── app/
    │   ├── src/main/
    │   │   ├── java/com/medflow/app/
    │   │   │   └── MainActivity.kt
    │   │   ├── res/
    │   │   │   ├── values/strings.xml
    │   │   │   └── drawable/ (icons)
    │   │   └── AndroidManifest.xml
    │   ├── build.gradle
    │   └── build/outputs/apk/
    │       └── debug/app-debug.apk (after Gradle build)
    ├── build.gradle (root)
    ├── gradle.properties
    └── gradlew / gradlew.bat (Gradle wrapper)
```

---

## 🏗️ Build APK in Android Studio

After running the setup script:

### 1. Open Android Studio
- **File** → **Open** → Select `C:\VSC Projects\MedFlow\android`
- Wait for Gradle sync (~1 minute)

### 2. Build APK
- **Build** → **Build Bundle(s)/APK(s)** → **Build APKs**
- Or use keyboard shortcut: **Ctrl + Shift + B**
- Wait for build to complete (shows "Build successful" in status bar)

### 3. Find Generated APK
```
MedFlow/android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 📱 Install to Android Device

### Prerequisites
- Android device running Android 10+ (or emulator)
- USB debugging enabled on device
- USB cable connected to computer
- adb (Android Debug Bridge) installed

### Installation Steps

#### Option A: Using adb (Command Line)
```cmd
cd C:\VSC Projects\MedFlow

# Install APK to connected device
adb install -r android\app\build\outputs\apk\debug\app-debug.apk

# Or use the memory flag to preserve app data
adb install -r --keep-data android\app\build\outputs\apk\debug\app-debug.apk
```

#### Option B: Android Studio
1. Connect device via USB
2. **Build** → **Deploy** → Select your device
3. App installs automatically

#### Option C: Drag & Drop
1. Build APK (steps above)
2. Connect device via USB
3. Drag `app-debug.apk` from `android\app\build\outputs\apk\debug\` to device file explorer
4. Tap to install

### Verify Installation
```cmd
# Check if app installed
adb shell pm list packages | find "medflow"

# Output should show: com.medflow.app
```

---

## ✅ First Run Checklist

After installing APK to device:

- [ ] App launches without crash
- [ ] Status bar shows time and battery
- [ ] Bottom navigation shows 5 tabs: Today, Vitals, Cabinet, Guardian, Report
- [ ] **Today Tab:**
  - [ ] Adherence badge visible ("0 / 0 Taken" if no meds added)
  - [ ] Morning Check-In banner visible
  - [ ] + FAB (floating action button) visible bottom-right
  - [ ] + Refill visible in navigation bar
  
- [ ] **Click + FAB** to open Add Medication modal
  - [ ] Modal appears as bottom sheet
  - [ ] Modal has form fields (name, strength, etc.)
  - [ ] Pill shape/color selector visible
  - [ ] "Snap Rx" button visible (may show camera permission request)
  
- [ ] **Vitals Tab:**
  - [ ] + Log Vital Sign button visible
  - [ ] Empty state message (no readings yet)
  
- [ ] **Cabinet Tab:**
  - [ ] Empty state (no medications added yet)
  
- [ ] **Guardian Tab:**
  - [ ] Invite code displayed (MED-XXXX format)
  - [ ] Copy button next to code
  - [ ] Mode switcher visible (Family / My Patient Code)
  
- [ ] **Report Tab:**
  - [ ] Empty state (no data yet)
  - [ ] Export PDF button visible

---

## 🧪 Testing: Add First Medication

### Manual Entry (Without OCR)
1. Tap + FAB on Today tab
2. Modal opens at bottom
3. Fill in fields:
   - **Name:** Aspirin
   - **Strength:** 325mg
   - **Shape:** Round
   - **Color:** Teal (observe SVG preview)
   - **Dose Qty:** 1
   - **Unit:** Tablet
   - **Meal:** No Meal Necessary
   - **Schedule:** Fixed Daily Time → 08:00 AM
   - **Stock:** 30 tablets
   - **Low-stock threshold:** 5
4. Tap `+ Add Medication`
5. Modal closes, toast shows "✓ Added Aspirin 325mg to regimen!"
6. Today tab now shows dose card at 08:00 AM

### Test Dose Actions
- Tap `Take Now` → Dose marked taken, adherence updates to "1 / 1"
- Tap `Late (+90m)` → Interval recalculation message
- Tap `Snooze +15m` → Dose reminder deferred

---

## 🔐 Offline Mode Test

1. **Disable Internet:**
   - Android: Settings → Connections → Airplane Mode (ON)
   - Or disable WiFi & mobile data

2. **Restart App:**
   - Force close: Settings → Apps → MedFlow → Force Stop
   - Reopen app

3. **Verify Offline Functionality:**
   - [ ] All data still visible (medications, doses, vitals)
   - [ ] Can add new medication
   - [ ] Can log vital
   - [ ] Can mark doses taken
   - [ ] Bottom navigation works
   - [ ] No "Network Error" messages

4. **Re-Enable Internet:**
   - Disable Airplane Mode / enable WiFi
   - App should work normally

---

## 🚨 Troubleshooting

### "npm install" Fails
**Problem:** Module not found, permission denied  
**Solution:**
1. Delete `node_modules/` folder
2. Delete `package-lock.json`
3. Run `npm install` again
4. If still fails, check Node.js version: `node --version` (should be 18+)

### "npm run build" Fails
**Problem:** TypeScript errors, missing module  
**Solution:**
1. Run `npm run type-check` to see specific errors
2. Check `.env` file exists and has correct format
3. Run `npm install` again to ensure all packages installed
4. Clear Vite cache: `rmdir /s dist` then rebuild

### "npx cap add android" Fails
**Problem:** Android SDK not installed, platform not found  
**Solution:**
1. Install Android SDK via Android Studio:
   - Open Android Studio
   - Settings → Appearance & Behavior → System Settings → Android SDK
   - SDK Platforms tab: Select "Android 10" (API 29) or higher
   - Click "Apply" and wait for download
2. Set ANDROID_HOME environment variable:
   - Windows: Set to `C:\Users\[YourUsername]\AppData\Local\Android\sdk`
3. Run `npx cap add android` again

### APK Installation Fails ("app-debug.apk" not found)
**Problem:** Build not completed  
**Solution:**
1. Open Android Studio: **File** → **Open** → `C:\VSC Projects\MedFlow\android`
2. Wait for Gradle sync (bottom status bar: "Gradle sync completed")
3. **Build** → **Build APKs** → Wait until "Build successful"
4. APK should now appear in `android\app\build\outputs\apk\debug\app-debug.apk`

### App Crashes on Launch
**Problem:** Capacitor plugin not initialized, missing permissions  
**Solution:**
1. Check `AndroidManifest.xml` for required permissions:
   - CAMERA (for OCR scanner)
   - SCHEDULE_EXACT_ALARM (for notifications)
   - POST_NOTIFICATIONS (for lock-screen alerts)
2. If using emulator, ensure emulator is Android 10+
3. Clear app data: `adb shell pm clear com.medflow.app`
4. Reinstall: `adb install -r android\app\build\outputs\apk\debug\app-debug.apk`

### SQLite Database Not Working
**Problem:** "Database initialization failed"  
**Solution:**
1. This is expected in first build (no migration run yet)
2. App should fallback to `localStorage` automatically
3. Check browser console (if running in dev mode) for errors
4. After implementing `src/db/database.ts`, re-run `npm run build && npx cap sync`

### Guardian Mode Not Syncing (Supabase)
**Problem:** "No connection to Supabase", offline  
**Solution:**
1. Verify `.env` has correct credentials:
   - `VITE_SUPABASE_URL` (should be https://your-project.supabase.co)
   - `VITE_SUPABASE_ANON_KEY` (should be ~40 character string)
2. Check internet connection: `adb shell ping 8.8.8.8`
3. If Guardian Tab shows "Sync Disabled", toggle it on
4. For offline testing, leave Guardian Mode disabled (personal data works 100% offline)

---

## 📊 Build Output Examples

### Successful `npm install`
```
added 342 packages in 2m 15s
```

### Successful `npm run build`
```
vite v4.4.0 building for production...
✓ 1234 modules transformed.
dist/index.html         0.45 kB
dist/main.js          245.67 kB
dist/style.css         120.34 kB

✓ built in 12.34s
```

### Successful `npx cap add android`
```
✔ Created native Android project
```

### Successful `npx cap sync android`
```
✔ Synced Android native project
✔ sync complete
```

### Successful Gradle Build (Android Studio)
```
BUILD SUCCESSFUL in 2m 34s
app-debug.apk created: android\app\build\outputs\apk\debug\app-debug.apk
```

---

## 📋 Development vs. Production

### Development Mode (Browser Preview)
```bash
npm run dev
# Opens http://localhost:5173
# Hot Module Reload (HMR) — changes reflect instantly
# Browser DevTools console shows logs
# Uses localStorage fallback (no SQLite needed)
```

### Production Mode (Android APK)
```bash
npm run build           # Create dist/ bundle
npx cap sync android    # Copy to android/
# Android Studio builds APK
# adb installs to device
# No browser console, check Logcat in Android Studio
```

---

## 🎯 Next: Implementation

After verifying the app runs on Android, begin implementing source files in this order:

1. `src/db/schema.ts` → `src/db/database.ts` (SQLite)
2. `src/utils/clinical.ts` → `src/utils/pillSvg.ts`
3. `src/services/scheduler.ts` → `src/services/guardianSync.ts`
4. `src/views/today.ts` → `src/views/report.ts` (5 tabs)
5. `src/modals/addMedModal.ts` → `src/modals/logVitalModal.ts`
6. `src/main.ts` → `src/index.css`

See `PLAN.md` for detailed implementation checklist.

---

## ✅ Success Indicators

✅ `npm install` completes without errors  
✅ `npm run build` creates `dist/` folder  
✅ `npx cap add android` creates `android/` folder  
✅ `npx cap sync` syncs without warnings  
✅ Android Studio opens project without sync errors  
✅ APK builds successfully  
✅ APK installs to device  
✅ App launches without crashes  
✅ All 5 tabs load and respond to taps  
✅ FAB opens Add Medication modal  
✅ Offline mode works (no internet needed)  

---

**Mr. VMJAM, run `setup-and-build.bat` to set up Android platform. Then open Android Studio to build the APK.**

**Estimated time:** 5 minutes for script + 2 minutes to build APK in Android Studio = **7 minutes total** until app is on your device.
