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
