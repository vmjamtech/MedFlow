# MedFlow Browser Runtime Error - Debug & Fix

## 🔴 Problem

Blank white screen on `localhost:5173` instead of showing the MedFlow interface.

**Cause:** JavaScript/TypeScript error during app initialization, most likely:
1. `@capacitor-community/sqlite` trying to initialize native SQLite in browser
2. Import mismatch or missing Capacitor platform detection

---

## ✅ Fixes Applied

### 1. **Database Layer** (`src/db/database.ts`)
- ✅ Added proper platform detection using `Capacitor.isNativePlatform()` and `Capacitor.getPlatform()`
- ✅ Only initializes SQLite connection if running on native (Android/iOS)
- ✅ Falls back to localStorage automatically in browser

**Before:**
```typescript
const db = await this.sqlite.createConnection(...);  // Throws error in browser
```

**After:**
```typescript
if (this.isNativePlatform) {
  const db = await this.sqlite.createConnection(...);  // Native only
} else {
  this.initializeLocalStorage();  // Browser fallback
}
```

---

### 2. **Main App Initialization** (`src/main.ts`)
- ✅ Added try-catch error handling
- ✅ Shows error message on screen instead of blank page
- ✅ Logs full error details to console

**Before:**
```typescript
await db.init();  // If this fails, app crashes silently
```

**After:**
```typescript
try {
  await db.init();
} catch (error) {
  // Display error on screen AND in console
  appRoot.innerHTML = `<div>Error: ${error.message}</div>`;
  console.error('MedFlow initialization failed:', error);
}
```

---

### 3. **Notifications Service** (`src/services/notifications.ts`)
- ✅ Added platform detection
- ✅ Skips LocalNotifications call in browser mode
- ✅ Returns false instead of throwing error

**Before:**
```typescript
const result = await LocalNotifications.requestPermissions();  // Throws in browser
```

**After:**
```typescript
if (!this.isNativePlatform) {
  console.log('Notifications not available in browser mode');
  return false;
}
const result = await LocalNotifications.requestPermissions();
```

---

## 🔧 How to Test

### Step 1: Clear Everything
```powershell
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -ErrorAction SilentlyContinue
```

### Step 2: Fresh Install
```powershell
npm install
```

### Step 3: Run Dev Server
```powershell
npm run dev
```

**Expected Output:**
```
VITE v5.4.21 ready in 724 ms
➜  Local:   http://localhost:5173/
```

### Step 4: Check Browser

Navigate to `http://localhost:5173/`

**Expected:** You should see MedFlow interface with:
- Header: "MedFlow"
- Subtitle: "Smart Medication & Inventory Management"
- Database ready message: "Database ready: 0 med(s)"

---

## 🐛 If Still Getting Blank Page

### Open Browser Console (F12)

1. Press **F12** in the browser
2. Click the **Console** tab
3. Look for a red error message

**Common Errors:**

**Error 1: "CapacitorSQLite plugin is not implemented on web"**
- Status: ✅ FIXED (platform detection added)
- If still appears: Clear browser cache (Ctrl+Shift+Delete)

**Error 2: "Cannot read properties of null"**
- Likely issue: Missing localStorage in app initialization
- Action: Check browser console and report full error

**Error 3: "ReferenceError: Capacitor is not defined"**
- Status: ✅ FIXED (import added to database.ts)
- Verify: `import { Capacitor } from '@capacitor/core';` exists in database.ts

---

## 📋 Files Updated

1. ✅ **src/db/database.ts**
   - Added: `import { Capacitor } from '@capacitor/core';`
   - Added: Platform detection logic
   - Changed: SQLite initialization to only run on native

2. ✅ **src/main.ts**
   - Added: try-catch error handling
   - Added: Error display on page (not just console)
   - Better console logging

3. ✅ **src/services/notifications.ts**
   - Added: `import { Capacitor } from '@capacitor/core';`
   - Added: Platform detection
   - Skips LocalNotifications in browser

---

## ✅ Verification Checklist

After `npm run dev` loads:

- [ ] No blank white page
- [ ] Browser shows MedFlow header and subtitle
- [ ] Browser console (F12) has no red errors
- [ ] Shows "Database ready: X med(s)" message
- [ ] Logs show "✓ MedFlow database initialized"
- [ ] Can open DevTools and see HTML rendered

---

## 🚀 Next Steps After Fix

Once the app renders:

```bash
# 1. Type check
npm run type-check

# 2. Build
npm run build

# 3. Sync Android
npx cap sync android

# 4. Build APK
npx cap open android
```

---

## 🆘 If You Still Get Errors

After opening browser console (F12), copy the full red error message and share it, then I can pinpoint the exact issue.

**Expected working state:**
```
✓ MedFlow database initialized
✓ Notifications disabled
✓ Guardian Sync offline (local-only mode)
✓ Loaded: 0 medications, 0 doses, 0 vital logs
✓ MedFlow app initialized and ready
```

---

**You're ready to test, Mr. VMJAM!** 🎯
