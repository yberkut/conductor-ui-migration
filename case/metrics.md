# Metrics log

Append only. Times are local (UTC+03:00). Token counts and API-equivalent cost come from the agent
transcripts via `case/tools/usage_cost.py`. The orchestrator session also did partner research and
sales drafts that are not part of the migration, so its total is an upper bound for the migration.

| Phase | Agent model | Start | End | Wall clock | Tokens | Notes |
|---|---|---|---|---|---|---|
| 0. Setup and candidate choice | orchestrator (Opus 5.5) | 2026-10-22 16:46 | 2026-10-22 16:56 | 10 min | in orchestrator total | candidates probed with `gh`; spec written |
| A. Baseline and characterization | phase A agent (Sonnet 5.5) | 2026-10-22T16:53:40+03:00 | 2026-10-22T18:30:19+03:00 | ~97 min | 63.3M (62.7M cache reads, 0.40M cache writes, 0.22M output); API-equivalent **$9.47** | 127 characterization tests over 20 routes, frozen and tagged `characterized`; a large share was waiting on installs, builds and test runs |
| B. Migration | phase B agent (Sonnet 5.5) | 2026-10-22T18:32:48+03:00 | 2026-10-22T19:51:16+03:00 | ~78 min | 30.0M (28.6M cache reads, 1.31M cache writes, 0.13M output); API-equivalent **$7.46** | CRA 5 -> Vite 8, RR 5.2 -> 7, Jest -> Vitest in 2 source commits; about 25 min of the wall clock were the old-vs-new flake comparison (old app installed and built in a scratch folder) |

## Baseline

Old app, unchanged (commit `f8a1d37`, upstream `conductor-oss/conductor@4ed6f796` `ui/`).
Machine: Windows 11 Pro, 20 logical CPUs, Node 24.18.0, yarn 1.22.22, npm 11.16.0, Playwright 1.60.0
(Chromium headless shell 148.0.7778.96). Measured 2026-10-22 between 16:53 and 18:30 (+03:00).

| Measure | Value | How |
|---|---|---|
| Install | 82 s | `yarn install --frozen-lockfile --network-timeout 600000 --network-concurrency 8`; the first attempt (default 30 s timeout) failed on `@material-ui/icons` |
| Production build, median of 3 | **94.5 s** (78.2, 94.5, 96.0) | `yarn build`, cold (`build/` and `node_modules/.cache` removed before each), machine otherwise idle; "Compiled successfully", no warnings |
| Production build, first triple | 152.4 s (383.1, 152.4, 99.6) | same command right after the install, with other work running and cold OS file caches; kept for the record, not the comparison value |
| JS in `build/static/js` | **4,502,069 B raw (4.29 MiB), 1,323,087 B gzip -9 (1.26 MiB)** | 3 files: main 4,081,510 B, chunks 390,456 B and 30,103 B (CRA prints main 1.22 MB, 97.87 kB, 8.62 kB gzipped); CSS 22,251 B raw |
| Dev server cold start, median of 3 | **48.9 s** (46.8, 48.9, 49.5) | `BROWSER=none PORT=5000 yarn start` after removing `node_modules/.cache`, to first HTTP 200 on `/` (the same moment as "Compiled successfully") |
| `npm audit --json` (package-lock.json) | **136 total: 7 critical, 49 high, 62 moderate, 18 low, 0 info** | production dependencies only (`--omit=dev`): 120 = 6 / 41 / 58 / 15 / 0 |
| Unit tests (`CI=true yarn test --watchAll=false`) | **0 found**: 0 pass / 0 fail / 0 skip, exit code 1 ("No tests found"), 12 s | Jest matches none of the 153 files; there are no unit tests to migrate |
| Upstream e2e (`yarn test:e2e`) | **19 tests: 19 pass, 0 fail, 0 skip** | 5.7 s of test time against a running server (10 workers); the stock command, which first runs `yarn build` (warm Babel cache) and `yarn preview`, took 69 s |
| Upstream component tests (`yarn test:ct`) | **12 tests: 0 pass, 12 fail, 0 skip**, 16 s | every test fails with `Component "WorkflowGraphTestBed" / "TimelineTestBed" cannot be mounted` (test beds defined inside the test files); recorded as is |
| Characterization (`yarn test:char`) | **127 tests: 127 pass, 0 fail, 0 flaky**, 66.7 s (4 workers) | 3 consecutive runs, identical; editors 11, execution 19, navigation 25, query-state 20, routes 34, shell 8, states 8, workbench 2; 42 screenshots; `maxDiffPixelRatio 0`, `threshold 0.005`; details in `routes.md` |
| Frozen files | 83 | `case/frozen.sha256`: 42 screenshots, 18 other files in `characterization/`, 22 in `e2e/`, `playwright.characterization.config.ts` |

The build time varied by a factor of 4 between runs on the same machine (383 s, then 78 s). Compare the
migrated build against the idle-machine triple and repeat it three times.

## After

Migrated app, branch `migrate` (commits `b1c0b78` toolchain, `c9be486` routing; the commit that holds this section follows).
Same machine and method as the Baseline. Measured 2026-10-22 between 19:00 and 19:51 (+03:00), machine otherwise idle
(about 5 % CPU) for the build, dev and test timings. Versions: Vite 8.3.5, @vitejs/plugin-react 6.1.2, Vitest 5.0.5,
jsdom 30.1.3, react-router 7.18.4, sass 1.106.1 (was 1.53.0), qs 6.10.3, use-location-state 2.5.0; React 18.3.1, MUI v4, TypeScript 4.7.4 unchanged.

| Measure | Baseline | After | How |
|---|---|---|---|
| Production build, median of 3 | 94.5 s (78.2, 94.5, 96.0) | **3.15 s** (2.93, 3.15, 3.16) | `yarn build`, cold (`build/`, `node_modules/.cache`, `node_modules/.vite` removed before each), including source maps, which CRA also wrote; 30x faster. Only warning: Vite's chunk-size notice (main chunk over 500 kB), where CRA said "Compiled successfully" |
| JS in `build`, raw | 4,502,069 B (3 files) | **4,424,287 B** (2 files: main 4,016,916 B, lazy `ErrorsInspector` chunk 407,371 B), -1.7 % | CRA's third chunk (30,103 B) is gone; `build/assets/*.js` instead of `build/static/js` |
| JS in `build`, gzip -9 | 1,323,087 B | **1,331,018 B** (main 1,228,299 B, chunk 102,719 B), +0.6 % | `gzip -9 -c file | wc -c`; CSS 22,911 B raw (was 22,251 B) |
| Dev server cold start to first HTTP 200 on `/`, median of 3 | 48.9 s (46.8, 48.9, 49.5) | **0.51 s** (0.50, 0.51, 0.54) | `BROWSER=none PORT=5000 yarn start` after removing `node_modules/.vite` and `.cache`. Vite answers `/` before it has compiled anything, so this is not the same moment as CRA's "Compiled successfully"; see the next row |
| Dev server cold start to the app bar rendered in Chromium, median of 3 | not measured | **5.46 s** (5.36, 5.46, 5.59) | same start, then a page load; includes dependency pre-bundling and on-demand transforms. The dev page works (6 routes visited, no page errors; only React's dev-mode deprecation warnings and 502s from the missing backend) |
| Dev proxy | `setupProxy.js` | `server.proxy` | with `WF_SERVER=http://127.0.0.1:18080` a request for `/api/metadata/taskdefs/a%2Fb?x=1` reached the stub backend unchanged, `Host` rewritten (`changeOrigin`) |
| `npm audit --json` | 136 total: 7 critical, 49 high, 62 moderate, 18 low (committed upstream `package-lock.json`) | **38 total: 1 critical, 19 high, 17 moderate, 1 low, 0 info** | `package-lock.json` regenerated with `npm install --package-lock-only --legacy-peer-deps --ignore-scripts` (plain `npm install` fails on MUI v4's React peer range; `yarn.lock` moved aside, because npm 11 rewrites it). Production only (`--omit=dev`): 26 = 1 / 10 / 15 / 0 / 0 (was 120 = 6 / 41 / 58 / 15 / 0) |
| `npm audit` control: old `package.json`, same regeneration | n/a | 120 total: 6 / 43 / 57 / 14 / 0 (production 118) | regenerating the old lock alone already drops 136 to 120: about 16 of the 98 fewer findings come from fresher transitive versions, about 82 from removing `react-scripts`' tree |
| Unit tests (`yarn test` = `vitest run`, jsdom) | 0 found, exit 1 (Jest), 12 s | **0 found, exit 0** (`passWithNoTests`), about 0.5 s | there is nothing to port (same count: 0). The runner was checked with throwaway tests (jsdom present, `useRouteMatch` param cases), deleted afterwards |
| Upstream e2e (`yarn test:e2e`) | 19 pass, 5.7 s of tests; stock command 69 s | **19 pass, 0 fail**, 5.3 s against a running `serve -s build`; stock command (`yarn build && yarn preview`, then tests) 11.2 s | no difference |
| Upstream component tests (`yarn test:ct`) | 12 fail, 0 pass, 16 s | **12 fail, 0 pass**, 19 s | the same failure for all 12: `Component "WorkflowGraphTestBed" / "TimelineTestBed" cannot be mounted` (not a gate) |
| Characterization (`yarn test:char`, 4 workers) | 127 pass, 0 flaky, 66.7 s | **127 pass in each of 3 consecutive runs**, 0 flaky, about 63 s (63.2 s in the last), screenshots at the unchanged threshold (`maxDiffPixelRatio 0`, `threshold 0.005`), no console errors (the harness fails any) | see the flake note below |
| Frozen files | 83 | 83, `sha256sum -c case/frozen.sha256` passes (checked before every commit); no screenshot baseline touched | |

**Flake note (characterization).** On two of the first four full runs of an earlier revision of the migrated build, and once in each
of the later ten old/new runs, one screenshot test failed with the same signature: 764 pixels, one pixel column at x=471 from y=144 to the bottom
(Monaco's overview-ruler canvas in the plain editor, 220/255 grey where the baseline is white; same family as the diff-editor ruler flicker
phase A masked). Old and new builds were compared by alternating 10 full runs each on the same machine (old app installed
and built from tag `characterized` in a scratch folder, same harness, `CHAR_BUILD_DIR`): **old 1 of 10 runs failed (`workflow-def-version`),
new 1 of 10 failed (`workflow-def-existing`)**, both 764 pixels. The flake is therefore not introduced by the migration; the three
consecutive full runs reported above were all clean. A test is never retried (`retries: 0`).

**Source diff (`git diff --stat characterized..migrate -- src`)**

```
 src/App.jsx                                     | 109 +++---
 src/components/NavLink.jsx                      |   6 +-
 src/hooks/useQueryState.js                      |  32 ++
 src/hooks/useRouteMatch.js                      |  34 ++
 src/{index.js => index.jsx}                     |   4 +-
 src/pages/definition/EventHandlerDefinition.jsx |   4 +-
 src/pages/definition/SchedulerDefinition.jsx    |   4 +-
 src/pages/definition/TaskDefinition.jsx         |   4 +-
 src/pages/definition/WorkflowDefinition.jsx     |   4 +-
 src/pages/definitions/Workflow.jsx              |   2 +-
 src/pages/execution/Execution.jsx               |   6 +-
 src/pages/executions/SchedulerExecutions.jsx    |   2 +-
 src/pages/executions/TaskSearch.jsx             |   2 +-
 src/pages/executions/WorkflowSearch.jsx         |   2 +-
 src/pages/misc/TaskQueue.jsx                    |   4 +-
 src/react-app-env.d.ts                          |   1 -
 src/setupProxy.js                               |  13 -
 src/setupTests.js                               |   5 -
 src/theme/colors.js                             | 484 ++++++++++++------------
 src/vite-env.d.ts                               |   1 +
 20 files changed, 375 insertions(+), 348 deletions(-)
```

Without the mechanical `export const` conversion of `src/theme/colors.js` (242 lines): 19 files, 133 insertions, 106 deletions, of which the two new hooks are 66.
Outside `src`: `vite.config.mjs`, `index.html` (moved from `public/`), `package.json`, `yarn.lock`, `package-lock.json`, `README.md`, `case/followups.md`, this file.
