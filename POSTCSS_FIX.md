# PostCSS Error Fix - npm run dev

## 🔴 Problem

When running `npm run dev`, you got this error:

```
Failed to load PostCSS config: Cannot find module 'autoprefixer'
Error Loading PostCSS Plugin failed: Cannot find module 'autoprefixer'
```

**Browser Error:** `localhost refused to connect` (ERR_CONNECTION_REFUSED)

**Cause:** `postcss.config.js` requires `autoprefixer`, but the packages were not installed.

---

## ✅ Solution Applied

Updated `package.json` to include missing PostCSS dependencies:

```json
{
  "devDependencies": {
    "autoprefixer": "^10.4.20",  // ✅ ADDED
    "postcss": "^8.4.47",        // ✅ ADDED
    "tailwindcss": "^3.4.17",
    "vite": "^5.4.17"
  }
}
```

Also updated:
- ✅ **OCR Package**: Changed `@capacitor-mlkit/barcode-scanning` → `@capacitor-mlkit/text-recognition`

---

## 🚀 Next Steps

```powershell
# 1. Clear node_modules and package-lock
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -ErrorAction SilentlyContinue

# 2. Fresh install
npm install

# 3. Start dev server
npm run dev
```

**Expected Output:**
```
✓ installed X packages in Xs
VITE v5.4.21 ready in 724 ms
➜  Local:   http://localhost:5173/
➜  press h to show help
```

---

## ✅ Files Updated

1. ✅ **package.json**
   - Added: `autoprefixer@^10.4.20`
   - Added: `postcss@^8.4.47`
   - Changed: `@capacitor-mlkit/barcode-scanning` → `@capacitor-mlkit/text-recognition`

---

## Why This Happened

The original `package.json` had:
1. PostCSS config that requires `autoprefixer`
2. But `autoprefixer` and `postcss` were never listed in devDependencies

npm install was missing these critical CSS build tools, causing PostCSS to fail when Vite tried to process CSS/Tailwind.

---

## Verification

After install, verify everything works:

```powershell
# Check versions
npm list autoprefixer postcss tailwindcss

# Type check
npm run type-check

# Build
npm run build

# Dev server
npm run dev
```

---

## If Still Having Issues

```powershell
# 1. Check npm version (should be 10+)
npm --version

# 2. Clear npm cache
npm cache clean --force

# 3. Remove locks and try again
rm node_modules package-lock.json -Force
npm install

# 4. If postcss still fails, check the error
npm run dev
```

---

**You're ready to go, Mr. VMJAM!** 🎯
