# Migration spec: Conductor UI, CRA + React Router 5 → Vite + React Router 7

Upstream: `conductor-oss/conductor@4ed6f796` (2026-10-19), folder `ui/`, Apache-2.0. Copied unchanged
in commit `f8a1d37`. About 17.7k non-blank lines of JS/TS/CSS in 160 source files.

## Goal

The same app on a supported toolchain. A user must not see any change.

## In scope

1. Build: Create React App 5 (`react-scripts`) → Vite (current stable). Dev proxy (`setupProxy.js`,
   `WF_SERVER`), `homepage` / relative base path, `REACT_APP_*` variables, `public/` assets.
2. Routing: React Router 5.2 (`react-router-dom` v5) → React Router 7 (declarative mode). Every URL,
   redirect, query string and back-button behaviour stays the same.
3. Unit tests: Jest via `react-scripts test` → Vitest. Test bodies change only where the runner API forces it.
4. TypeScript and other tool versions only where the new toolchain needs them.

## Out of scope

Material UI v4 → v5, the React version, visual or feature changes, refactors, and dependency upgrades
that the migration does not need. Write each one down in `case/followups.md` instead.

## The contract (outside judge)

- `characterization/` (written against the old app) and upstream `e2e/` are frozen once phase A ends.
  Phase B must not edit them. `case/frozen.sha256` holds their checksums.
- Pass = all of these on the migrated app, with the frozen tests unchanged:
  - 100 % of characterization tests and upstream e2e tests pass.
  - Every screenshot assertion passes at the threshold set in phase A.
  - All unit tests pass (same count as baseline or a documented reason).
  - Production build succeeds. No new console errors on any route.
- Any failure is reported with numbers. A failure is never hidden by changing a frozen test.

## Measurements (baseline and after, same machine)

Production build time (median of 3), total JS size raw and gzip, dev server cold start to first page,
`npm audit` counts by severity, unit / e2e / characterization test counts and run time, and per phase:
wall-clock time and tokens, from the agent run records in `case/metrics.md`.
