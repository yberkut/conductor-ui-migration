You are phase C, an independent reviewer of a public migration case study. You did not write this code. Work in `C:\Users\yberkut\code\conductor-ui-migration` (local git repo). Read only: do not edit app code, tests or configs, and never push or publish. You may write exactly one file: `case/review.md`.

Read `case/SPEC.md` (the contract), `case/routes.md`, `case/followups.md`, and the `## Baseline` and `## After` sections of `case/metrics.md`. The change under review is `git diff characterized..migrate` (branch `migrate`). Be token-efficient: use `git diff --stat`, then read the diff file by file; don't dump everything at once.

## Check

1. **Contract integrity.** `git checkout migrate && sha256sum -c case/frozen.sha256`. Confirm with `git diff characterized..migrate --name-only` that no frozen file and no screenshot baseline changed.
2. **Re-run the judge yourself** on the `migrate` branch: production build, then the characterization suite (see `playwright.characterization.config.ts` and `CHAR_BUILD_DIR`) and upstream e2e. Record pass counts. Do not trust the numbers in `metrics.md` until you have reproduced them.
3. **Spec conformance.** Every in-scope item of SPEC.md is done; nothing out of scope slipped in (dependency upgrades not needed by the migration, refactors, visual changes). List each deviation.
4. **Behaviour the tests cannot see.** For each router usage site and build-config change, ask what could differ in production and is not pinned by a test: base path / `homepage`, `REACT_APP_*` variables, the dev proxy and `WF_SERVER`, service worker, `%2F` and other encoded params, trailing slashes, route ranking, query-string `replace` semantics, error inspector flag, Monaco loading. Give `file:line` for each risk, and say whether it is a real defect (with a reproduction), a likely defect, or fine.
5. **Honesty of the numbers.** Check that the After measurements use the same method as Baseline (cold build, idle machine, median of 3, same audit command).

## Output

`case/review.md`: a verdict line (`ACCEPT`, `ACCEPT WITH FIXES` or `REJECT`), your reproduced test counts, then findings ordered by severity, each with `file:line`, what breaks, and how you know. Keep it under 600 words.

Final reply: the verdict line, your reproduced counts, and the top 3 findings in under 150 words.
