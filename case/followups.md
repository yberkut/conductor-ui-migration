# Follow-ups (not fixed, out of scope of the migration)

Found while characterizing the old app (phase A). Each one is pinned as current behaviour by a
characterization test, so the migration must reproduce it. Do not fix these inside the migration.
Add phase B findings below this line.

## Bugs and quirks in the old app

| # | What | Where | Pinned by |
|---|---|---|---|
| 1 | `/workflowDefs?filter=<not JSON>` crashes the whole app (blank page, no error boundary): `JSON.parse` runs during render. | `src/pages/definitions/Workflow.jsx:76` | query-state.spec: "an unparsable filter crashes the whole page" |
| 2 | "New Schedule" opens an empty editor. `useSchedulerDef` passes `{ enabled: !!name }`, so for a new schedule the query is disabled and the default template (`NEW_SCHEDULER_TEMPLATE`) is never applied. | `src/data/scheduler.js:16-22` | routes.spec: `scheduler-def-new` (screenshot shows empty editor) |
| 3 | Choosing "Latest Version" in the workflow editor pushes `/workflowDef/<name>/` (trailing slash): the select value is `""`, not `undefined`. | `src/pages/definition/WorkflowDefinition.jsx` (`changeVersionOrReset`) | editors.spec: "version select" |
| 4 | The "Query" link in the Task definitions list opens `/search/by-tasks?tasks=<name>`, a route that is declared nowhere (shows the bare app bar). | `src/pages/definitions/Task.jsx:37` | navigation.spec: "task definitions: ... Query points at a route that does not exist" |
| 5 | Stale `document.title`: only pages with a `<Helmet>` set it, so after leaving one (Definitions, Execution, Workbench, Task Queue) the title stays until another Helmet page is shown. Search pages, Scheduler Executions and Kitchen never set it. | pages without `<Helmet>` | navigation.spec: "Helmet titles change on push and on back" |
| 6 | The app bar logo is hard-coded to `https://assets.conductor-oss.org/logo.png`: broken image on air-gapped installs; the logo is not a link. | `src/plugins/AppLogo.jsx:13` | shell.spec |
| 7 | The diagram canvas background is `url('/diagramDotBg.svg')`, an absolute path that ignores `homepage` / a non-root base path. | `src/components/diagram/PanAndZoomWrapper.jsx:35` | shell.spec |
| 8 | A workflow definition with an empty `tasks` list makes the diagram log `Layout Error: ... An edge must have a target node` to the console. | `orkes-workflow-visualizer` | editors.spec: "saving a new workflow" (uses one task to avoid it) |
| 9 | `/execution/<unknown id>` shows nothing (no message) after react-query retried 3 times; 4 failed requests and console errors. | `src/pages/execution/Execution.jsx`, `src/data/common.js` | routes.spec: `execution-not-found` |
| 10 | `/execution/:id/:taskId?` is not `exact` and `:taskId` is never read: `/execution/<id>/a/b/c` renders the execution. | `src/App.jsx:121` | navigation.spec: "not exact" |
| 11 | Monaco is loaded from `cdn.jsdelivr.net/npm/monaco-editor@0.43.0` at run time (version baked into `@monaco-editor/loader`), while `package.json` pins `monaco-editor@^0.44.0`. The documented alternative `REACT_APP_MONACO_EDITOR_USING_CDN=false` expects `<base>/monaco-editor/min/vs` but the build never copies those files. | `src/App.jsx:177`, `package.json` | harness (serves the CDN URL from `node_modules`) |
| 12 | Undeclared (phantom) dependencies that only resolve through hoisting: `qs` (`src/data/{workflow,task,scheduler}.js`), `@mui/icons-material` (`src/components/diagram/ZoomControls.jsx`, a v5 package in a v4 app), `@testing-library/jest-dom` (`src/setupTests.js`). | `package.json` | n/a |
| 13 | `yarn` is listed as a runtime dependency; `react-scripts@5` is unmaintained. | `package.json` | n/a |

## Test-infrastructure facts (baseline)

- There are **no unit tests**: `yarn test` (Jest) matches 0 files and exits 1 with "No tests found".
  `src/setupTests.js` exists but nothing uses it. The spec's "unit tests: Jest -> Vitest" has nothing to migrate.
- The 12 upstream component tests (`yarn test:ct`) all fail on the old app: Playwright CT reports
  `Component "WorkflowGraphTestBed" cannot be mounted` (the test beds are defined inside the test files).
  Upstream bug, left as is.
- `yarn test:e2e` starts `yarn build && yarn preview` with a 120 s web-server timeout; a cold build
  on this machine can take longer than that (see `metrics.md`).

## Behaviour the migration must preserve (hazards, not bugs)

- **Params are not decoded the same way.** React Router 5 leaves `%2F` encoded in `match.params`, so
  `/taskDef/a%2Fb` asks the API for `/api/metadata/taskdefs/a%2Fb`. React Router 6/7 decodes params
  (`a/b`), which would change the API call. Pinned by navigation.spec "an encoded slash inside a param".
- **`react-router-use-location-state`** (used for every filter/tab in the URL) imports `__RouterContext`
  from `react-router` 5 and calls `history.replace`. It cannot run on React Router 7. Its URL format
  (keys sorted, array values as repeated keys, defaults stripped, foreign params and the hash kept,
  `replace` not `push`) is pinned by query-state.spec.
- App bar and tab links are MUI `Button`/`Tab` with `component={NavLink}` and a `path` prop (role
  `button` on an `<a>`); `target="_blank"` for `newTab`.
- `exact` matching, trailing slash and case-insensitivity: `/workflowDefs/` and `/WorkflowDefs` render
  the page; `/workflowDef/a/b/c`, `/execution`, `/index.html` render the bare app bar.
