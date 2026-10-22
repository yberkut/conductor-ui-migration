# Metrics log

Append only. Times are local (UTC+03:00). Token counts and API-equivalent cost come from the agent
transcripts via `case/tools/usage_cost.py`. The orchestrator session also did partner research and
sales drafts that are not part of the migration, so its total is an upper bound for the migration.

| Phase | Agent model | Start | End | Wall clock | Tokens | Notes |
|---|---|---|---|---|---|---|
| 0. Setup and candidate choice | orchestrator (Opus 5.5) | 2026-10-22 16:46 | 2026-10-22 16:56 | 10 min | in orchestrator total | candidates probed with `gh`; spec written |
| A. Baseline and characterization | phase A agent (Sonnet 5.5) | 2026-10-22T16:53:40+03:00 | 2026-10-22T18:30:19+03:00 | ~97 min | see agent transcript | 127 characterization tests over 20 routes, frozen and tagged `characterized`; a large share was waiting on installs, builds and test runs |

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
