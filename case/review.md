# Phase C review: CRA 5 + RR 5.2 → Vite 8 + RR 7

**Verdict: ACCEPT WITH FIXES**

## Reproduced (branch `migrate`, `f586522`)

- `sha256sum -c case/frozen.sha256`: 83/83 OK. The diff touches no frozen file and no screenshot.
- Build: 3 cold builds took 3.16, 3.32 and 3.57 s. The JS matches `metrics.md` byte for byte.
- `yarn test:char`: **127/127** in 62 s on an idle machine. Three later runs, while the desktop was busy, passed 124, 125 and 126, all failures 45 s `networkidle` or teardown timeouts. The old build failed the same way in the same window (122/127), so this is not a migration effect.
- `yarn test:e2e`: **19/19**. Unit tests: 0 files, exit 0. `npm audit`: 38 (production only 26).

## Findings

1. **Medium, real: a sub-path deploy shows a blank page at the bare base URL.** `src/index.jsx:26` passes `getBasename()` (`src/utils/helpers.js:94-99`) to the router unchanged; with `homepage: "https://example.com/conductor/"` it is `/conductor/`. history v4 stripped the trailing slash. RR7 does not, so for `/conductor` its `stripBasename` returns null and `<Router>` renders nothing. Reproduced by building old and new with that `homepage` and serving both under `/conductor/` with SPA fallback: on `GET /conductor` the old app shows the search page, the new one an empty `#root`. Fix: `basename={getBasename().replace(/\/+$/, "") || "/"}`.
2. **Low, real: repeated trailing slashes now match.** RR7 patterns end in `\/*$` (`src/App.jsx:107-148`); RR5 allowed one slash. `/workflowDefs//` used to show the bare app bar; now it shows Definitions and calls the API, and so does every other route. Old and new agree on the other 27 unpinned URLs I compared (encoded params, optional and extra segments, case). Record it in followups.
3. **Low, real, dev only: the dev server rejects non-localhost hosts.** `vite.config.mjs:72-80` sets no `allowedHosts`, so Vite 8 answers `Host: conductor-ui` with 403. CRA allowed all hosts here (`webpackDevServer.config.js:25,46`, no `proxy` in `package.json`). This breaks dev behind docker service names. Fix: `server.allowedHosts: true`, or document it.
4. **Low, spec deviation.** `package.json:99` raises `engines.node` to `^22.22.2` because of Vitest 5 and jsdom 30, which run zero tests; Vite 8 needs only `^20.19`. Yarn 1 enforces root `engines`, so `yarn install` fails on Node 20.
5. **Low, likely, not verified: browser support changed.** There is no `build.target` (`vite.config.mjs:84-89`), and `browserslist` no longer applies (followups #15). The screenshots cover Chromium only.
6. **Info: lint and type checks no longer run in the build** (followups #14).

## Numbers

The method matches the Baseline: cold build, median of 3, same audit command. Caveats:

- Dev cold start "48.9 s → 0.51 s" (`metrics.md:48`) compares CRA's response after compiling with Vite's before compiling. The 5.46 s to a rendered page is the user-facing figure, but it has no baseline.
- Audit: the like-for-like change is the control's 120 → 38, not 136 → 38. Both are npm locks; installs use `yarn.lock`.
- "0 flaky" holds only on an idle machine.

## Checked, fine

- `useRouteMatch` keeps RR5's undecoded params.
- The `useQueryState` adapter keeps `replace`, the hash and foreign params.
- No route patterns overlap, so route ranking cannot change.
- The errors-inspector flag build behaves the same in old and new.
- The `process.env` define and `PUBLIC_URL` are fine. The service worker still only unregisters.
- The Monaco loader version is unchanged. The `colors.js` rewrite is mechanical.
- `yarn.lock` bumps no runtime library except the router.
- I did not re-run the dev proxy.
