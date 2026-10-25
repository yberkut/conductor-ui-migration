# Case: migrating a real React app's stack, proved by tests it could not change

This repository is a worked example of an AI-agent-run frontend migration, judged by a fixed test suite.

**The app:** the Conductor workflow UI ([conductor-oss/conductor](https://github.com/conductor-oss/conductor) `ui/`
at commit `4ed6f796`, 2026-10-19). 17.7k lines, 160 source files, React 18, Material UI v4, Monaco editor.

**The migration:** Create React App 5 → Vite 8, React Router 5.2 → 7.18, Jest → Vitest.
Visuals, MUI and the React version stayed the same on purpose ([scope](case/SPEC.md)).

## Result

| | |
|---|---|
| Frozen characterization tests (written on the old app first) | **127/127** pass on the migrated app |
| Full-page screenshots inside them | **42/42** match the old app |
| Upstream maintainers' own e2e suite | **19/19** |
| Frozen test files changed during the migration | **0 of 83** (checked by checksum) |
| Production build | 94.5 s → **3.15 s** |
| `npm audit` findings, production dependencies (2026-10-22; [drifts](case/parity-report.md#what-else-changed-measured)) | 118 → **26** |
| Defects found by the independent review | 1 (sub-path deploy), **fixed** |

Known differences are listed, not hidden: [parity report, "Known differences"](case/parity-report.md#known-differences-not-hidden).

## How it was judged

1. **Pin the old behaviour.** One agent wrote 127 tests against the *old* app: all 20 routes, navigation,
   query-string state, redirects, back/forward, 42 screenshots. Then every test file was frozen by checksum.
2. **Migrate.** A second agent changed the stack. It could not edit any frozen file.
3. **Review.** A third agent, on a different model, reviewed the diff against the spec and re-ran every suite.
4. **Fix and re-run.** The one real defect from the review was fixed. All suites were run again.
5. **Human sign-off.** The operator reviewed the full diff and ran the UI against a real Conductor server.

## Read more

- [Parity report](case/parity-report.md): all numbers, limits, how to reproduce
- [Independent review](case/review.md)
- [Contract / spec](case/SPEC.md) and [follow-ups](case/followups.md)
- [Measurements](case/metrics.md)
- [Agent briefs](case/briefs/) and the [token/cost tool](case/tools/usage_cost.py): the method, in the open

## Git map

- `characterized` (tag): the old app plus the frozen tests. This is the baseline.
- `main`: the migrated app and the case files.

## License and changes

The app code is from [conductor-oss/conductor](https://github.com/conductor-oss/conductor), `ui/` at
`4ed6f796`, under the Apache License 2.0 ([LICENSE](LICENSE)). **Files in this repository were modified**
from that source: the build setup, routing, tests and the files under `case/`, `characterization/` were
changed or added. The first commit (`f8a1d37`) is the unchanged upstream copy; every change after it is in the git history.
This is not an official Conductor project.
