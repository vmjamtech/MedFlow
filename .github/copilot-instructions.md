# MedFlow Copilot Instructions

**MedFlow** is an offline-first Android mobile app built with **Vite**, **Tailwind CSS**, **Capacitor**, and **Local SQLite**. It manages patient medications, vitals tracking, and clinical classification with optional **Supabase sync for Guardian Mode** (pairing codes and clinician access).

## Development Priority Order

1. **Protect** existing patient medication, vitals, and SQLite user data
2. **Preserve** existing functionality and 1:1 prototype parity
3. **Correctly solve** the requested problem
4. **Make the smallest safe change**
5. **Avoid unnecessary complexity**
6. **Optimize** token usage and response length

## Learning Rule

Before meaningful fixes, briefly explain:
- What caused the problem
- What you plan to change
- Why the change is safe

Skip unnecessary explanations for simple changes.

## Approval & Decision Points

- **New functions or new features**: Summarize the approach, present options, and ask for approval before implementing.
- **Small and basic changes**: Proceed directly and report results.
- **High-impact changes** (database migrations, existing user data, Supabase RLS, printing/PDF export, Android/Capacitor config, dependencies): Explain the proposed change and impact before implementing.

## Verification

Use repo-local scripts as appropriate:
- `npm run build`
- `npm test`
- `npm run lint`

Preserve the Capacitor/Android build setup.

Report concisely:
1. **What changed**
2. **Why**
3. **Files changed**
4. **What I should test**

## Referenced Rule Files

See also:
- [`.github/instructions/medflow-rules.instructions.md`](.github/instructions/medflow-rules.instructions.md)
- [`.github/instructions/safety-rules.instructions.md`](.github/instructions/safety-rules.instructions.md)
- [`.github/instructions/token-rules.instructions.md`](.github/instructions/token-rules.instructions.md)

-----
# MedFlow Release & Build Automation Workflows

## Trigger Command Safety

Trigger command names are case-insensitive, but a workflow runs only when the user issues the command with literal surrounding double-quote characters. An unquoted phrase is not a trigger. A quoted command mentioned in a question, example, or hypothetical is also not a trigger unless the user is asking to run it. For commands with arguments, the quotation marks must surround the entire command, such as `"update version 1.0.2"`; preserve the argument exactly as written.

When the user issues the trigger command **"Run"** (case-insensitive, so `"run"` also matches):
1. Check whether `http://localhost:5173/` is already responding. Reuse an existing MedFlow Vite server rather than starting a duplicate.
2. If the server is not running, ensure dependencies are installed (run `npm install` only if `node_modules/` is missing), then start `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort` in the integrated terminal and keep it running.
3. Wait for the local page to respond. If the server fails to start, report the error instead of opening a non-working page.
4. Open `http://localhost:5173/` in the integrated browser view, not the system default browser.
5. Leave the app in its normal mode. The user can unlock Developer Demo Mode through the existing in-app PIN flow; do not bypass the PIN or expose it in a URL or command.

When the user issues the trigger command **"check version"** (case-insensitive), inspect `package.json` and `android/app/build.gradle`, then report the current package `version`, Android `versionName`, and Android `versionCode`. If the package and Android versions differ, report the discrepancy rather than changing anything.

When the user issues the trigger command **"update version"** (case-insensitive, optionally followed by a target version with the entire command quoted, like `"update version 1.0.2"`), execute the following steps automatically in **Agent Mode**:
1. Inspect `package.json` and `android/app/build.gradle` to read the current `version` / `versionName` (e.g., `1.0.0`) and current integer `versionCode` (e.g., `1`).
2. If the user did not specify a version number, automatically increment the patch number by `+1` (e.g., `1.0.0` → `1.0.1`, or `1.0.1` → `1.0.2`).
3. Update `"version"` in `package.json` to the new version string.
4. Search the entire `src/` folder and `.env*` files for any hardcoded app version constants or strings matching the old version (such as `APP_VERSION`, `VITE_APP_VERSION`, or version labels used by the in-app update checker) and update them to the new version string.
5. In `android/app/build.gradle` inside `defaultConfig`:
   - Increment `versionCode` by `+1` (must remain a whole integer, e.g., `1` → `2`).
   - Update `versionName` to the new version string (e.g., `"1.0.1"`).
6. Save all modified files and summarize every file changed along with the old and new version values.

When the user issues the trigger command **"update android studio"** (case-insensitive), execute the following steps automatically in **Agent Mode**:
1. Run `npm run build` in the integrated terminal and verify there are zero TypeScript or Vite build errors.
2. Run `npx cap sync android` in the integrated terminal to copy the compiled `dist/` web assets and Capacitor plugins into `android/`.
3. Run `npx cap open android` to launch Android Studio with the updated project.
4. Remind the user of the final manual steps in Android Studio:
   - Click `≡` → **Build → Generate Signed Bundle / APK... → APK → Next** using `C:\VSC Projects\Projects.KeyStorePath\MedFlow\medflow-release` (alias `medflow`).
   - Copy `android\app\release\app-release.apk` to `C:\VSC Projects\Projects.KeyStorePath\MedFlow\Version\MedFlow-v<NEW_VERSION>.apk`.
   - Upload the `.apk` to the Supabase `apk-releases` Storage bucket and insert the new row in `app_releases`.