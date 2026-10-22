# Routes and characterization coverage (phase A)

The suite lives in `characterization/` (config: `playwright.characterization.config.ts`, script
`yarn test:char`). 127 tests in 8 files, 42 full-page screenshots. All of it runs against the
production build served statically with SPA fallback; every `/api` call is mocked.

## How to run

```
yarn build                      # old app: CRA -> ./build
yarn test:char                  # serves ./build on 127.0.0.1:5071
CHAR_BUILD_DIR=dist yarn test:char   # a Vite build in ./dist
```

`CHAR_BUILD_DIR` defaults to `build`. **Delete the old `build/` before testing a migrated app that
writes elsewhere**, or the old app is tested by mistake. `retries` is 0, so a flake is a failure.

## Routes declared by the router

`src/App.jsx` (`<Switch>` inside `<BrowserRouter basename={getBasename()}>` from `src/index.js:26`;
`getBasename()` is `"/"` because `package.json` has no `homepage`). `exact` unless noted.

| # | Path | Component | Declared at | Covered by |
|---|---|---|---|---|
| 1 | `/` | `WorkflowSearch` (`ErrorsInspector` when `REACT_APP_ENABLE_ERRORS_INSPECTOR=true`, see "not covered") | `src/App.jsx:108` | routes `workflow-search`; query-state (workflow search); navigation |
| 2 | `/executions` | `WorkflowSearch` | `src/App.jsx:115` | routes `workflow-search-executions`; navigation "no redirects" |
| 3 | `/search/tasks` | `TaskSearch` | `src/App.jsx:118` | routes `task-search`, `task-search-no-filter`; query-state (task search) |
| 4 | `/execution/:id/:taskId?` (**not exact**) | `Execution` | `src/App.jsx:121` | routes `execution-*` (7 states); execution.spec (19); navigation "not exact" |
| 5 | `/workflowDefs` | `WorkflowDefinitions` | `src/App.jsx:124` | routes `workflow-defs`; query-state (`?filter=`); navigation |
| 6 | `/workflowDef/:name?/:version?` | `WorkflowDefinition` | `src/App.jsx:127` | routes `workflow-def-new`, `-existing`, `-version`; editors.spec (7) |
| 7 | `/taskDefs` | `TaskDefinitions` | `src/App.jsx:130` | routes `task-defs`; navigation |
| 8 | `/taskDef/:name?` | `TaskDefinition` | `src/App.jsx:133` | routes `task-def-new`, `-existing`; editors.spec (2); navigation (param decoding) |
| 9 | `/eventHandlerDefs` | `EventHandlerDefinitions` | `src/App.jsx:136` | routes `event-handler-defs`; navigation |
| 10 | `/eventHandlerDef/:event?/:name?` | `EventHandlerDefinition` | `src/App.jsx:139` | routes `event-handler-def-new`, `-existing`; editors.spec; navigation |
| 11 | `/schedulerDefs` | `SchedulerDefinitions` | `src/App.jsx:142` | routes `scheduler-defs`, `scheduler-defs-disabled` (404 banner) |
| 12 | `/schedulerDef/:name?` | `SchedulerDefinition` | `src/App.jsx:145` | routes `scheduler-def-new`, `-existing`; editors.spec |
| 13 | `/schedulerExecs` | `SchedulerExecutions` | `src/App.jsx:148` | routes `scheduler-executions`; query-state; navigation |
| 14 | `/taskQueue/:name?` | `TaskQueue` | `src/App.jsx:151` | routes `task-queue`, `task-queue-selected`; navigation "task queue selection" |
| 15 | `/workbench` | `Workbench` | `src/App.jsx:154` | routes `workbench`; workbench.spec (2); states |
| 16 | `/kitchen` | `KitchenSink` | `src/App.jsx:157` | routes `kitchen`; navigation (Gantt link) |
| 17 | `/kitchen/diagram` | `DiagramTest` | `src/App.jsx:160` | routes `kitchen-diagram` |
| 18 | `/kitchen/examples` | `Examples` (renders nothing) | `src/App.jsx:163` | routes `kitchen-examples` |
| 19 | `/kitchen/gantt` | `Gantt` | `src/App.jsx:166` | routes `kitchen-gantt` (`Math.random` is seeded by the harness) |
| 20 | *(no path)* catch-all | `CustomRoutes` (`<></>`, `src/plugins/CustomRoutes.jsx`) | `src/App.jsx:169` | routes `unknown-route`; navigation "unknown paths" (8 URLs) |

19 declared paths plus the catch-all: **20 of 20 covered** (route 1 only in its default form).
There is no `<Redirect>`: `/` renders the search page and keeps its URL (pinned).

## Router usage sites

Found with `grep -rnE "react-router|useHistory|useParams|useLocation|useRouteMatch|withRouter|<Prompt|<Redirect|<Link|<NavLink|history\.|window\.location|window\.history" src`.

| Site | What | Exercised by |
|---|---|---|
| `src/index.js:7,26` | `BrowserRouter basename` | every test (basename `/` only) |
| `src/App.jsx:3,107-169` | `Switch`, `Route` | routes.spec, navigation "URL matching rules" |
| `src/components/NavLink.jsx:2,24` | `Link as RouterLink` (every in-app link, tab and button) | navigation.spec (hrefs and clicks), execution.spec |
| `src/components/NavLink.jsx:34` | `newTab` anchors (`target=_blank`) | navigation (Query links, popups), execution (Definition, Parent, sub workflow), workbench |
| `src/components/NavLink.jsx:44,53` | `useHistory` + `history.push` (`usePushHistory`) | editors.spec, navigation "task queue selection" |
| `usePushHistory` in `definition/EventHandlerDefinition.jsx:39`, `SchedulerDefinition.jsx:42`, `TaskDefinition.jsx:37`, `WorkflowDefinition.jsx:106`, `misc/TaskQueue.jsx:33` | push after save / version change / task choice | editors.spec (4 save flows + version select), navigation (task queue) |
| `useRouteMatch` in `EventHandlerDefinition.jsx:38`, `SchedulerDefinition.jsx:41`, `TaskDefinition.jsx:36`, `WorkflowDefinition.jsx:105`, `execution/Execution.jsx:118`, `misc/TaskQueue.jsx:35` | route params | routes.spec (params), navigation (optional params, decoding, extra segments) |
| `useQueryState` (`react-router-use-location-state`) in `definitions/Workflow.jsx:75`, `execution/Execution.jsx:131-132`, `executions/SchedulerExecutions.jsx:39-47`, `executions/TaskSearch.jsx:39-54`, `executions/WorkflowSearch.jsx:37-50` | URL state, written with `history.replace` | query-state.spec (every param of every page: deep link and UI), execution.spec, navigation (back/forward) |
| `NavLink` consumers: `TaskLink.jsx:9`, `definitions/{Workflow:18,63; Task:15,37; EventHandler:16; Scheduler:49}.jsx`, `executions/{ResultsTable:27; TaskResultsTable:56; SchedulerExecutions:134,159}.jsx`, `execution/{Execution:217,226; ExecutionSummary:35; TaskSummary:99,111}.jsx`, `workbench/ExecutionHistory.jsx:69`, `kitchensink/KitchenSink.jsx:57`, `SearchTabs`, `definitions/Header` | links | navigation.spec, execution.spec, workbench.spec (each href asserted) |
| `withRouter`, `<Prompt>`, `<Redirect>`, `useParams`, `useLocation`, direct `history.replace/goBack/listen` | **no usage in `src/`** | n/a (the only `history.*` call is `history.push` in `NavLink.jsx:53`; the library above calls `history.replace` itself) |

### Not covered, and why

- `REACT_APP_ENABLE_ERRORS_INSPECTOR=true` (`src/App.jsx:38-45`, extra "Errors" nav button, `/` rendering
  `ErrorsInspector`): a build-time flag; the suite tests one build. `src/pages/errors/` has no router usage.
- A non-root base path (`homepage` in `package.json`; `getBasename()` in `src/utils/helpers.js:94`, used by
  `src/plugins/fetch.js`, `NavLink.jsx:36`, `src/App.jsx:178`): also build-time. Pinned instead: no
  `homepage` means base `/`, `/api/...` single slash, and the absolute `/diagramDotBg.svg` (followups #7).
- The `stack` query param (`NavLink.jsx:19-21,46-48`): `src/plugins/env.js` always returns
  `stack === defaultStack`, so the branch cannot run in the shipped app.
- Bulk actions in the search table (`executions/BulkActionModule.jsx`), scheduler pause/resume/delete
  buttons, `TaskHuman` forms: feature behaviour with no router involvement.
- Dev server proxy (`src/setupProxy.js`, `WF_SERVER`): dev server only; measured, not characterized.

## Determinism and the harness

`characterization/support/harness.ts` (all of it applies to every test):

- **Clock**: `page.clock.setFixedTime("2026-03-15T12:00:00.000Z")`. `Date` is frozen, timers still run
  (react-query retries and debounces need them). Timezone UTC, locale en-US, viewport 1440x900, 1x scale,
  `reducedMotion: reduce`, an injected style turns off CSS transitions and animations.
- **Randomness**: `Math.random` is replaced by a seeded PRNG (only `kitchen/gantt` uses it).
- **API**: every `/api/**` call is answered from fixtures (upstream `e2e/fixtures/*` reused where they fit,
  generated ones in `characterization/fixtures/`, provenance in `_generate.mjs`). Requests are recorded and
  asserted (query strings, bodies). An unmocked `/api` call fails the test.
- **Network**: everything that is not the local server is aborted and fails the test, except
  (a) the app bar logo (`https://assets.conductor-oss.org/logo.png`, hard-coded in `AppLogo.jsx`), answered
  with a local SVG, and (b) **Monaco**. The old app loads Monaco from
  `https://cdn.jsdelivr.net/npm/monaco-editor@0.43.0/min/vs/*` by default; the harness answers exactly those
  URLs from `node_modules/monaco-editor/min/vs` (0.44.0, same layout). Not used: the app's own switch
  `REACT_APP_MONACO_EDITOR_USING_CDN=false`, because it needs a build-time variable and a manual copy of
  `vs/` into the build, which would make the old and the migrated app differ in setup. Interception works on
  any build and leaves the app's loading code untouched.
- **Console**: any `console.error` or uncaught page error fails the test unless the test declares it
  (`expectedConsoleErrors`, each must occur). Two messages are tolerated as intermittent (`maybeConsoleErrors`):
  Monaco's "Failed trying to load default language strings" (a worker killed while loading) and, in one
  test only, the diagram's "Layout Error ... An edge must have a target node" (followups #8).
- After each test the page is given network idle plus 300 ms, so late errors are not missed.

## Screenshots

42 full-page `toHaveScreenshot` assertions (34 route states in `routes.spec.ts`, 8 interaction states in
`states.spec.ts`), stored in `characterization/__screenshots__/` (committed; not ignored). Taken on
Windows 11, Chromium headless shell 148.0.7778.96 (Playwright 1.60.0), `fullPage: true`,
`animations: "disabled"`, `caret: "hide"`.

**Masks: one.** `state-workflow-def-save-dialog`: the diff editor's overview ruler
(`.monaco-diff-editor canvas.decorationsOverviewRuler`), a canvas painted asynchronously that flickered by
one pixel column in 3 of 20 and 1 of 30 repeated runs (829 pixels). Nothing else is masked.

**Threshold: `maxDiffPixelRatio: 0`, `threshold: 0.005`** (Playwright/pixelmatch colour distance; this lets a
pixel differ by about 1-2 levels of 255 per channel, nothing more, and no pixel may exceed it).
Why this value, from runs on the old build:

| `threshold` | result |
|---|---|
| 0 (exact) | failed 3 of 3 full runs: 2 to 6 pixels differed, in a different test each run (1-level anti-aliasing noise from parallel rendering) |
| 0.05 | 2 of 3 full runs clean; the failure was the diff-editor ruler flicker above (fixed with the mask, then 30 of 30) |
| 0.02, 0.01 | 168 of 168 (routes + states, 4 repeats) |
| **0.005** | 168 of 168 (4 repeats) and **127 of 127 in 3 consecutive full `yarn test:char` runs, 0 flakes** |

Sensitivity, measured by editing the built bundle: changing the root background `#efefef` to `#ececec`
(3 levels) fails 41 screenshot tests; to `#eeeeee` (1 level, invisible) is not detected.
Behaviour sensitivity: switching `history.replace` to `push` in `useQueryState` fails 8 tests; changing one
page title fails 3.
