# Parity report: Conductor UI, Create React App + React Router 5 → Vite + React Router 7

**Result: PASS against the contract.** The frozen tests, written against the old app before the migration
started, pass unchanged on the migrated app. One defect that the tests could not see was found by an
independent review and fixed. Two small known differences remain and are listed below.

| | |
|---|---|
| App | [conductor-oss/conductor](https://github.com/conductor-oss/conductor) `ui/` at `4ed6f796` (2026-10-19), Apache-2.0 |
| Size | 17.7k non-blank lines of JS/TS/CSS, 160 source files; React 18, Material UI v4, Monaco editor |
| Scope | CRA 5 → Vite 8, React Router 5.2 → 7.18 (declarative mode), Jest → Vitest. Out of scope: MUI v4, React version, visuals ([SPEC](SPEC.md)) |
| Change | 7 commits on branch `migrate`; 20 source files, +380 / −348 lines, of which 484 lines are a mechanical CommonJS → ES module rewrite of one theme file |
| Date | 2026-10-22, one working session |

Note: upstream later chose to replace this UI with a rewrite (`ui-next`). This case shows the other path:
keep the app, change the stack, prove nothing moved.

## The judge

The migration was judged by tests it was not allowed to change.

1. **Phase A** wrote 127 characterization tests that pin how the *old* app behaves today: all 20 routes,
   navigation, query-string state, redirects, unknown URLs, back/forward, and 42 full-page screenshots. The
   API is mocked and the clock is frozen, so the suite runs without a backend. It passed 3 runs in a row on
   the old app, then every test file and screenshot was frozen by checksum ([`frozen.sha256`](frozen.sha256), 83 files).
2. **Phase B** migrated the app. It could not edit or re-record any frozen file; the checksums were checked
   before every commit.
3. **Phase C**, a different agent on a different model, reviewed the diff against the spec and re-ran every
   suite itself ([`review.md`](review.md)).
4. The orchestrator fixed the one real defect from the review and re-ran the suites.

The upstream maintainers' own Playwright e2e suite (19 tests) is a second judge that nobody in this case wrote.

## Tests

| Suite | Old app | Migrated app |
|---|---|---|
| Characterization, frozen (127) | 127/127, 3 runs in a row | **127/127**: 3 runs in a row (phase B), 1 run (phase C), 1 run after the fix |
| Screenshots inside it (42) | baseline | **42/42 match**: 0 pixels over the threshold (`maxDiffPixelRatio 0`, per-pixel `threshold 0.005`); 1 mask, the diff editor's overview ruler |
| Upstream e2e (19) | 19/19 | **19/19** |
| Upstream component tests (12) | 0/12 (broken upstream: "cannot be mounted") | 0/12, same error |
| Unit tests | 0 exist | 0 exist; Vitest is set up and exits 0 |
| Frozen files changed | — | **0 of 83** |

Two honest notes on stability, both true for the old app too:

- **One flaky screenshot.** Monaco's overview-ruler canvas sometimes paints a 1-pixel column (764 px). In 10
  alternating full runs each, the old build failed once and the new build failed once.
- **Timeouts under load.** On a busy desktop, full runs with 4 workers lose 1–3 tests to 45 s timeouts. The
  old build did the same in the same window (122/127). With 2 workers on the same busy machine: 127/127.

## What else changed, measured

Same machine, same method (cold build, nothing else running, median of 3).

| Measure | Old (CRA) | New (Vite) |
|---|---|---|
| Production build | 94.5 s | **3.15 s** (30× faster) |
| JS shipped, gzip | 1,323,087 B | 1,331,018 B (+0.6 %) |
| JS shipped, raw | 4,502,069 B | 4,424,287 B (−1.7 %) |
| Dev server: first page rendered in a browser | not measured | 5.46 s |
| Dev server: first HTTP 200 | 48.9 s (after full compile) | 0.51 s (before compile; not like-for-like) |
| `npm audit`, all dependencies | 120 (lock regenerated the same way) · 136 (committed lock) | **38** (1 critical, 19 high) |
| `npm audit`, production only | 118 · 120 | **26** |
| Upstream e2e command end to end | 69 s | 11.2 s |

## Known differences (not hidden)

| # | Difference | Who notices | Decision |
|---|---|---|---|
| 1 | A sub-path deploy (`homepage: …/conductor/`) showed a blank page at `/conductor`. Found by review, reproduced, **fixed**, checked before and after. | users of sub-path deploys | fixed in `8837a11` |
| 2 | `/workflowDefs//` (repeated trailing slash) now shows the page; before, only the app bar. | nobody in practice | kept |
| 3 | Dev server rejects host names other than localhost (Vite's DNS-rebinding guard). | developers using docker service names | kept; one-line opt-in documented |
| 4 | Node ≥ 22.22 is required (was ≥ 14.17), set by Vitest 5 and jsdom 30. | anyone on Node 20 | documented |
| 5 | Lint and type check no longer run inside the build; browser targets now come from Vite, not `browserslist`. | maintainers | documented |

Full list with file and line: [`followups.md`](followups.md).

## Time, tokens, cost

Tokens and cost are read from the agent transcripts with [`tools/usage_cost.py`](tools/usage_cost.py).
Cost is what the same tokens would cost on the Claude API (prices read 2026-10-22); the work itself ran on a
Claude Pro subscription. Most tokens are cache reads, which cost 5 % of normal input.

| Phase | Model | Wall clock | Tokens (output) | API-equivalent cost |
|---|---|---|---|---|
| A. Baseline + 127 characterization tests | Sonnet 5.5 | 97 min | 63.3M (0.22M) | $9.47 |
| B. Migration | Sonnet 5.5 | 78 min | 30.0M (0.13M) | $7.46 |
| C. Independent review | Opus 5.5 | 36 min | 11.3M (0.09M) | $5.95 |
| Orchestration, fix, re-runs, this report | Opus 5.5 | across the session | 14.2M (0.08M) | ≤ $5.69 |
| **Total** | | **≈ 4 h elapsed** | **118.8M (0.52M)** | **≤ $28.57** |

The orchestration line is an upper bound: the same session also prepared unrelated sales material.
Much of the wall clock is installs, builds and test runs, not model time.

## Limits

- Chromium only. Other browsers were not tested.
- The frozen suite mocks the API from fixtures. A manual smoke check against a real server
  (`conductoross/conductor:latest`, image of 2026-10-14) loaded 5 real executions and showed the execution list,
  an execution diagram, the definitions list and the definition editor with no uncaught errors. No automated
  suite runs against a real server.
- The frozen suite runs at `/`; the sub-path fix was checked separately.
- The operator reviewed and approved the full diff on 2026-10-22.

## Reproduce

```bash
npx playwright install chromium
git checkout characterized && npx yarn@1.22.22 install && npx yarn@1.22.22 build && npx yarn@1.22.22 test:char
git checkout migrate && sha256sum -c case/frozen.sha256 && npx yarn@1.22.22 install && npx yarn@1.22.22 build && npx yarn@1.22.22 test:char
```
