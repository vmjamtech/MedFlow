---
applyTo: "**"
---

# MedFlow Core Rules

## Core Principle

Make the smallest safe change that correctly solves the requested problem.

## Existing Code & Prototype Parity

- **Inspect before creating**: Review existing code before creating new files.
- **Reuse existing services**: Use existing services, clinical classifiers, pill SVG builders, and UI patterns.
- **Never create unnecessary files or abstractions**: Avoid over-engineering.
- **Never rename working code without functional reason**: Preserve stability.
- **Preserve core MedFlow logic**:
  - Depleting-resource piece deduction
  - Late-dose dynamic interval shifting
  - PRN cooldowns and daily caps
  - Clinical vitals classification
  - Guardian pairing codes and sync

## Root Cause & Scope

- **Fix root causes, not workarounds**: Identify where behavior originates and all callers before changing code.
- **Stay strictly within requested scope**: Never fix unrelated bugs, redesign unrelated screens, or add unrequested features.
- **Mention other noticed issues briefly**: Report them instead of changing them automatically.

## Dependencies

- **Do not add or replace packages** when existing Vite, TypeScript, Tailwind, Capacitor, or Android APIs can solve the problem.
- **Explain justification** before adding any dependency.
- Prefer native platform capabilities over npm packages.
