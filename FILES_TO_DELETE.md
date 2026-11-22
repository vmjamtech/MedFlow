# Files to Delete (Old Build Artifacts)

These files are obsolete build fragments and test files. They are **NOT** part of the final MedFlow app.

## From `src/` directory:
- `src/main_part2.ts` - old fragment
- `src/main_part3.ts` - old fragment  
- `src/main_new.ts` - old version
- `src/modals/` - entire folder (merged into main.ts)
- `src/services/` - entire folder (merged into main.ts)
- `src/views/` - entire folder (merged into main.ts)

## From root directory (keep only README.md, REBUILD_COMPLETE.md, .github/):
- `app.html` - not used (use `index.html` only)
- `generate-all.ps1` - old build script
- `generate-structure.bat` - old build script
- `setup-and-build.bat` - old build script
- `test-build.js` - old test file
- `verify-syntax.js` - old test file
- `verification-checklist.txt` - old checklist
- All other `.md` files except:
  - `README.md` ✓ KEEP
  - `REBUILD_COMPLETE.md` ✓ KEEP
  - Everything in `.github/` ✓ KEEP

## Important Notes:
- Keep all files in `src/db/`, `src/utils/`, `src/index.css`
- Keep `capacitor.config.ts`, `vite.config.ts`, `tailwind.config.js`, `tsconfig.json`
- Keep `package.json`, `package-lock.json`, `.env.example`, `.gitignore`

## Command to delete (PowerShell):
```powershell
# Remove old fragments from src/
Remove-Item -Force -Path C:\VSC\ Projects\MedFlow\src\main_part2.ts, `
  C:\VSC\ Projects\MedFlow\src\main_part3.ts, `
  C:\VSC\ Projects\MedFlow\src\main_new.ts, `
  C:\VSC\ Projects\MedFlow\src\modals, `
  C:\VSC\ Projects\MedFlow\src\services, `
  C:\VSC\ Projects\MedFlow\src\views -Recurse

# Remove old build files from root
Remove-Item -Force -Path C:\VSC\ Projects\MedFlow\app.html, `
  C:\VSC\ Projects\MedFlow\generate-*.ps1, `
  C:\VSC\ Projects\MedFlow\generate-*.bat, `
  C:\VSC\ Projects\MedFlow\setup-*.bat, `
  C:\VSC\ Projects\MedFlow\test-*.js, `
  C:\VSC\ Projects\MedFlow\verify-*.js, `
  C:\VSC\ Projects\MedFlow\*-checklist.txt, `
  C:\VSC\ Projects\MedFlow\ANDROID_SETUP.md, `
  C:\VSC\ Projects\MedFlow\BROWSER_ERROR_FIX.md, `
  ...etc (all old .md files except README.md, REBUILD_COMPLETE.md)
```

## After Cleanup:
- Run `npm install` to refresh
- Run `npm run dev` to start dev server  
- Navigate to `http://localhost:5173`
- Verify Report tab shows sample data immediately
- Verify clicking buttons works (Take, Snooze, +, tabs)
