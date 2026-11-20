@echo off
REM MedFlow Android Setup & Build Script
REM Run from: C:\VSC Projects\MedFlow
REM This script: installs dependencies, builds, and adds Android platform

setlocal enabledelayedexpansion
color 0A

cls
echo.
echo ═══════════════════════════════════════════════════════════════════
echo   MedFlow — Offline-First Mobile App Setup & Build
echo ═══════════════════════════════════════════════════════════════════
echo.
echo   This script will:
echo   1. Install npm dependencies
echo   2. Build Vite project (TypeScript + Tailwind)
echo   3. Add Android platform to Capacitor
echo   4. Sync web assets to android/ directory
echo.
echo   Prerequisites:
echo   - Node.js 18+ installed
echo   - Android SDK installed (via Android Studio)
echo   - Java JDK 11+ installed
echo   - .env file configured (or use defaults for offline mode)
echo.
echo ═══════════════════════════════════════════════════════════════════
echo.

cd /d "C:\VSC Projects\MedFlow"

if not exist "package.json" (
  echo ERROR: package.json not found. Are you in the MedFlow directory?
  pause
  exit /b 1
)

echo [STEP 1] Installing npm dependencies...
echo This may take 2-3 minutes...
echo.
call npm install
if errorlevel 1 (
  echo ERROR: npm install failed
  pause
  exit /b 1
)
echo ✓ Dependencies installed
echo.

echo [STEP 2] Running TypeScript type check...
call npm run type-check
if errorlevel 1 (
  echo WARNING: Type check failed, but continuing...
)
echo.

echo [STEP 3] Building Vite project (dist/)...
call npm run build
if errorlevel 1 (
  echo ERROR: npm run build failed
  pause
  exit /b 1
)
echo ✓ Build completed (dist/ folder created)
echo.

echo [STEP 4] Adding Android platform to Capacitor...
if exist "android" (
  echo Android directory already exists, skipping npx cap add android
) else (
  call npx cap add android
  if errorlevel 1 (
    echo ERROR: npx cap add android failed
    pause
    exit /b 1
  )
)
echo ✓ Android platform ready
echo.

echo [STEP 5] Syncing web assets to android/app/src/main/assets/public...
call npx cap sync android
if errorlevel 1 (
  echo ERROR: npx cap sync android failed
  pause
  exit /b 1
)
echo ✓ Sync completed
echo.

echo ═══════════════════════════════════════════════════════════════════
echo   ✅ SETUP COMPLETE!
echo ═══════════════════════════════════════════════════════════════════
echo.
echo   Next Steps:
echo.
echo   1. Open Android Studio:
echo      - File → Open → C:\VSC Projects\MedFlow\android
echo.
echo   2. Build APK:
echo      - Build → Build Bundle(s)/APK(s) → Build APKs
echo      - Wait for build to complete (~2-3 min)
echo.
echo   3. Install to Device:
echo      - Connect Android device via USB (or use emulator)
echo      - Device must have USB debugging enabled
echo      - Run: adb install -r android\app\build\outputs\apk\debug\app-debug.apk
echo.
echo   4. Test on Device:
echo      - All 5 tabs should load (Today, Vitals, Cabinet, Guardian, Report)
echo      - Try adding a medication (OCR will fallback to manual on device)
echo      - Log a vital sign
echo      - Verify offline mode works (disable internet, app still responds)
echo.
echo ═══════════════════════════════════════════════════════════════════
echo.
echo   Project Structure:
echo   - src/              ← Source code (ready to implement)
echo   - dist/             ← Built web assets (just created)
echo   - android/          ← Capacitor Android project (just created)
echo   - prototype/        ← Original HTML prototype (reference)
echo   - docs/             ← Architecture & changelog
echo.
echo   Documentation:
echo   - README.md         ← Quick start
echo   - PLAN.md           ← Implementation roadmap
echo   - PROJECT_SUMMARY.md ← Executive summary
echo   - VERIFICATION.md   ← QA checklist
echo.
echo ═══════════════════════════════════════════════════════════════════
echo.

pause
