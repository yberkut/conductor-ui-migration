You are phase B of a public migration case study. Work only in `C:\Users\yberkut\code\conductor-ui-migration` (local git repo; Git Bash and PowerShell; Windows 11; Node 24). Never push, never add a remote, never publish anything.

Read `case/SPEC.md` (the contract), `case/routes.md`, `case/metrics.md` (baseline) and `case/followups.md`. Phase A froze `characterization/`, `e2e/` and `playwright.characterization.config.ts`; their checksums are in `case/frozen.sha256`. You must not edit, move, regenerate or delete any frozen file, and you must not update screenshot baselines. If a frozen test fails, fix the app, never the test. Verify with `sha256sum -c case/frozen.sha256` before every commit.

Be token-efficient (limited plan): grep and read excerpts; pipe long output through `tail`; don't paste large files back.

## Work

Create branch `migrate` from `main` (tag `characterized` plus the orchestrator's `case/briefs` and `case/tools`). Commit in small steps with clear messages.

Phase A findings you must act on:
- There are **no unit tests** (Jest finds 0 files). Replace `react-scripts test` with Vitest configured to pass with no tests, and say so; there is nothing to port.
- Upstream component tests fail 12/12 at baseline ("cannot be mounted"). Not a gate; report the after count.
- `react-router-use-location-state` depends on RR5 context. 20 frozen tests pin its URL format and `replace` semantics. Replace it with a small local hook that keeps both exactly.
- RR7 decodes `%2F` in params; RR5 does not. `/taskDef/a%2Fb` must still reach the API as `a%2Fb`.
- Monaco's CDN version is baked into the loader; the harness intercepts it offline. Keep the loader behaviour.
- `qs` and `@mui/icons-material` are imported but not declared. Declare them at the versions now resolved in `node_modules`; do not upgrade.
- The characterization server serves `build/` by default. If Vite writes elsewhere, run with `CHAR_BUILD_DIR=<dir>`, and delete the old CRA `build/` first so the old app is never tested by mistake.
- Baseline build time is the idle-machine triple (94.5 s). Measure yours the same way, three times, with nothing else running.

1. **CRA → Vite** (current stable Vite and `@vitejs/plugin-react`): move `index.html` to the root with the module entry; port `setupProxy.js` (`WF_SERVER`, `/api`) to `server.proxy`; keep the dev port; keep the `homepage` / relative-base behaviour (`base`); keep `REACT_APP_*` variables working (Vite `envPrefix` or a `define`, your call, documented); `PUBLIC_URL` and `public/` assets; SVG/asset imports; `process.env.NODE_ENV`; the service worker file as it behaves today; `build/` as the output folder unless the frozen configs need otherwise. Remove `react-scripts`.
2. **React Router 5.2 → 7** (declarative mode, `react-router` v7 package): `Switch`→`Routes`, `Route` render/component props → `element`, `Redirect`→`Navigate`, `useHistory`→`useNavigate`, `useRouteMatch`/`matchPath` semantics, `withRouter`, `NavLink` active styling, `Prompt`/`history.block` if used, query-string handling, nested routes and relative links. Watch the v6+ behaviour changes: exact matching by default, relative link resolution, ranking, trailing slashes. Every URL must behave as before.
3. **Jest → Vitest** for unit tests (jsdom). Change test bodies only where the runner API forces it; keep the count.
4. TypeScript or other tool upgrades only if the new toolchain needs them. Material UI v4 and React stay as they are. Anything else you notice goes to `case/followups.md`.

## Done means

- `sha256sum -c case/frozen.sha256` passes.
- Characterization suite: 100 % pass, screenshots within the phase A threshold. Run it 3 times; report flakes.
- Upstream e2e and component tests: same or better than baseline (list any difference with the reason).
- Unit tests: same count, all pass.
- `yarn build` works; no new console errors on any route (the characterization run can tell you).
- Dev server starts and proxies `/api` to `WF_SERVER`.

## Measure (same machine, same method as baseline)

Production build time (median of 3), JS in the build output raw and gzip, dev cold start to first HTTP 200, `npm audit` counts by severity (regenerate `package-lock.json` the same way baseline did), test counts and run times. Write an `## After` section in `case/metrics.md` in the same shape as `## Baseline`, and append a phase B row with start and end from `date -Iseconds` (take the start now). Write the full source diff stat (`git diff --stat characterized..migrate -- src`) into the After section.

## Final reply (under 250 words)

Pass/fail per item of "Done means" with numbers, the after-measurements next to baseline, anything you could not make pass and why, and the 3 riskiest changes a reviewer should check first (file:line).
