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

## Phase B findings (found while migrating; not fixed, not required by the migration)

Corrections to phase A's notes:

- `@mui/icons-material` is **not** imported: `src/components/diagram/ZoomControls.jsx:2` is a comment, and the package is not in
  `node_modules`. Nothing to declare (followups #12 is only true for `qs`, now declared as `6.10.3`, and for the dead
  `@testing-library/jest-dom` import in `src/setupTests.js`, which was deleted together with that file).
- `src/setupTests.js` was dead (no tests) and imported a package that was never installed.

Consequences of the new toolchain that a user or maintainer can notice:

| # | What | Where | Note |
|---|---|---|---|
| 14 | **No lint and no type check in the build any more.** CRA ran ESLint and the TypeScript checker inside `yarn build`; Vite does neither. `.eslintrc` extends `react-app`, a preset that shipped with `react-scripts`, so ESLint no longer runs at all. `npx tsc --noEmit` passes (exit 0). | `.eslintrc`, `package.json` | add `eslint-config-react-app` (or a flat config) and a `typecheck` script |
| 15 | **Browser support is decided by Vite now.** `browserslist` in `package.json` (">0.2%, not dead") no longer drives the JS or CSS output; Vite 8 builds for `build.target: "baseline-widely-available"`. The field is left untouched. | `package.json`, `vite.config.mjs` | check against the browsers you must support, set `build.target` if needed |
| 16 | **Build output layout changed.** `build/assets/*` instead of `build/static/{js,css}/*`, a `<script type="module" crossorigin>` in `index.html`, no `asset-manifest.json`. `build/` is still the output folder, source maps are still emitted. | `vite.config.mjs` | anything that serves or inspects `static/` or the manifest (reverse proxy rules, the Java server) needs a look |
| 17 | **`process.env` is still how the code reads configuration.** `vite.config.mjs` defines `process.env` as an object (`NODE_ENV`, `PUBLIC_URL`, every `REACT_APP_*`), like CRA's DefinePlugin, so `src/App.jsx` and `src/serviceWorker.js` are unchanged. `import.meta.env.VITE_*` is the Vite way. | `vite.config.mjs`, `src/App.jsx:38,177`, `src/serviceWorker.js` | cosmetic; the object is repeated inline in the bundle |
| 18 | **The `CustomRoutes` extension point changed shape.** In RR5 `<CustomRoutes />` sat inside `<Switch>` as a path-less catch-all and could render its own `<Route>`s. In RR7 it is the element of `<Route path="*">`; routes it adds must be inside its own `<Routes>`. It renders `<></>`, so nothing visible changed. | `src/App.jsx`, `src/plugins/CustomRoutes.jsx` | document for plugin authors |
| 19 | **`use-location-state@2.5.0` is now a direct dependency.** It was already in the tree (under `react-router-use-location-state`); it is unmaintained, with a `react@^16.8` peer range. | `src/hooks/useQueryState.js` | the logic it provides is about 100 lines and could be inlined |
| 20 | **`useRouteMatch` hook takes the route pattern as an argument** (`useRouteMatch("/taskDef/:name?")`) and repeats the pattern from `App.jsx`. Needed so params keep RR5's undecoded `%2F`/`%3F`/`%23`... values. A shared constants module would remove the duplication. | `src/hooks/useRouteMatch.js`, six pages | |
| 21 | **`sass` had to move from 1.53 to 1.106** (`^1.70.0` declared): Vite 8 calls `sass.initAsyncCompiler`. TypeScript stays on 4.7.4 (Vite does not need it). Playwright's component-test runner brings its own `@vitejs/plugin-react@4.7`, which declares a `vite@<=7` peer, next to the root `vite@8`; it still fails the same 12 tests, for the same reason. | `package.json` | |
| 22 | `engines.node` went from `>=14.17.0` to `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0`, set by `jsdom@30` and `vitest@5` (dev only). Vite 8 alone needs `^20.19.0 \|\| >=22.12.0`. Older `vitest`/`jsdom` would allow Node 20. | `package.json` | |
| 23 | `ReactDOM.render` (deprecated in React 18) and MUI v4's `findDOMNode` warn in the **dev** server console, as they did under CRA's dev server. The production build is silent. | `src/index.jsx` | React 18 `createRoot` is out of scope |
| 24 | `qs` is pinned to `6.10.3` (exact), the version the hoisted tree resolved before; newer 6.x is available. | `package.json` | |
| 25 | **Repeated trailing slashes now match a route** (phase C finding 2). RR7 patterns accept `/workflowDefs//`; RR5 showed only the app bar there. Every other unpinned URL phase C compared (27) behaves the same. Left as is: the new behaviour is harmless, and copying the old one would mean adding a bug. | `src/App.jsx:107-148` | known difference |
| 26 | **The Vite dev server answers 403 to host names other than localhost** (phase C finding 3). CRA's dev server allowed any host here, so dev behind a docker service name (`Host: conductor-ui`) breaks. Not changed: Vite's host check protects the dev server from DNS rebinding. To restore the old behaviour, list the host in `server.allowedHosts`. Dev server only; the production build is not affected. | `vite.config.mjs:72-80` | known difference, dev only |
| 27 | **Fixed after review: sub-path deploy.** With `homepage` ending in a slash (`https://example.com/conductor/`), the bare `/conductor` showed a blank page, because React Router 7 keeps the basename's trailing slash and history v4 did not (phase C finding 1). The basename is now passed without the trailing slash. Checked by building with that `homepage` and loading `/conductor`, `/conductor/` and `/conductor/workflowDefs` under a sub-path server: empty before the fix, rendered after. Not covered by the frozen suite, which runs at `/`. | `src/index.jsx:26` | fixed |

Test-infrastructure notes:

- Phase A's flake note holds for the new build too: Monaco's overview-ruler canvas (`canvas.decorationsOverviewRuler`, 14 px wide at
  the editor's right edge) is sometimes painted with a 1 px border column and sometimes not. Only the diff editor's ruler is masked by
  the frozen suite, so the same flicker in the plain editor of `route states > workflow-def-version` fails that screenshot
  (one column, ~760 px). See `metrics.md` (After) for how often it happened on the old and on the new build.
- Unit tests: `vitest run` exits 0 with "No test files found" (`passWithNoTests`); its `include` is `src/**/*.{test,spec}.{js,jsx,ts,tsx}`
  so it can never pick up the Playwright specs.
