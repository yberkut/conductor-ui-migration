/**
 * Shared harness for the characterization suite.
 *
 * - Every `/api/**` call is answered by `ApiMock` (deterministic fixtures, recorded requests).
 * - Every other non-local request is aborted and recorded; the test fails if anything was blocked.
 *   The one exception is the Monaco editor CDN (the old app loads it from cdn.jsdelivr.net by
 *   default): those URLs are answered from the installed `monaco-editor` package.
 * - Time is frozen with `page.clock.setFixedTime`, `Math.random` is seeded, CSS animations are off.
 * - Console errors, page errors, unmocked API calls and blocked requests fail the test at teardown.
 */
import { test as base, expect, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

export { expect };

const root = path.resolve(__dirname, "../..");
export const upstream = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(root, "e2e/fixtures", name), "utf8"));
export const fixture = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures", name), "utf8"));

/** The frozen "now" of every test. */
export const FIXED_NOW = "2026-03-15T12:00:00.000Z";

export interface Reply {
  status?: number;
  json?: unknown;
  text?: string;
  contentType?: string;
}
export interface Req {
  method: string;
  /** pathname after `/api`, e.g. `/workflow/search` (percent-decoded once by URL, as sent by the browser) */
  path: string;
  /** raw pathname after `/api`, as sent on the wire */
  rawPath: string;
  search: URLSearchParams;
  body: any;
}
type Handler = (req: Req) => Reply | undefined;

export interface RecordedRequest {
  method: string;
  rawPath: string;
  query: Record<string, string[]>;
  body: any;
}

const j = (json: unknown): Reply => ({ json });

/** Mini query evaluator: honours `status IN (..)`, `workflowType IN (..)`, `workflowId="x"`. */
function filterWorkflows(all: any[], query: string) {
  let out = all;
  const inList = (field: string) => {
    const m = query.match(new RegExp(`${field} IN \\(([^)]*)\\)`));
    return m ? m[1].split(",") : null;
  };
  const statuses = inList("status");
  if (statuses) out = out.filter((r) => statuses.includes(r.status));
  const types = inList("workflowType");
  if (types) out = out.filter((r) => types.includes(r.workflowType));
  const id = query.match(/workflowId="([^"]*)"/);
  if (id) out = out.filter((r) => r.workflowId === id[1]);
  return out;
}

export class ApiMock {
  requests: RecordedRequest[] = [];
  unmocked: string[] = [];
  blocked: string[] = [];
  consoleErrors: string[] = [];
  /** Console errors the old app is known to emit in this test (substring match, each must occur). */
  expectedConsoleErrors: string[] = [];
  /** Console errors the old app emits only sometimes (races inside third-party widgets); tolerated, never required. */
  maybeConsoleErrors: string[] = [
    // A Monaco worker that is terminated while it is still loading (editor unmounted, page closed) reports this.
    "Failed trying to load default language strings",
  ];
  private overrides: Array<{ method: string; match: RegExp; handler: Handler }> = [];

  /** Register a per-test override. Later registrations win. `method` "*" matches any. */
  on(method: string, match: RegExp | string, handler: Handler | Reply) {
    const re = typeof match === "string" ? new RegExp(`^${match}$`) : match;
    const h: Handler = typeof handler === "function" ? handler : () => handler;
    this.overrides.unshift({ method: method.toUpperCase(), match: re, handler: h });
  }

  /** Requests whose path (after /api) matches. */
  calls(method: string, match: RegExp | string): RecordedRequest[] {
    const re = typeof match === "string" ? new RegExp(`^${match}$`) : match;
    return this.requests.filter((r) => r.method === method.toUpperCase() && re.test(r.rawPath));
  }

  /** Query-string params of the n-th (default last) matching call. */
  lastQuery(match: RegExp | string, method = "GET"): Record<string, string> {
    const c = this.calls(method, match);
    const q = c[c.length - 1]?.query ?? {};
    return Object.fromEntries(Object.entries(q).map(([k, v]) => [k, v.join("|")]));
  }

  private defaults(req: Req): Reply | undefined {
    const { method } = req;
    const p = req.rawPath;
    const wfDefs = upstream("metadataWorkflow.json");
    if (method === "GET") {
      if (p === "/metadata/workflow/names-and-versions")
        return j(upstream("metadataWorkflowNamesAndVersions.json"));
      if (p === "/metadata/workflow/names") return j(upstream("metadataWorkflowNames.json"));
      let m = p.match(/^\/metadata\/workflow\/([^/]+)\/versions$/);
      if (m) return j(upstream("metadataWorkflowVersions.json"));
      if (p === "/metadata/workflow") return j(wfDefs);
      m = p.match(/^\/metadata\/workflow\/([^/]+)$/);
      if (m) {
        const name = decodeURIComponent(m[1]);
        const def = wfDefs.find((d: any) => d.name === name);
        return def ? j(def) : { status: 404, json: { message: `No such workflow found by name: ${name}`, status: 404 } };
      }
      if (p === "/metadata/taskdefs") return j(upstream("metadataTasks.json"));
      m = p.match(/^\/metadata\/taskdefs\/([^/]+)$/);
      if (m) {
        const name = decodeURIComponent(m[1]);
        const def = upstream("metadataTasks.json").find((d: any) => d.name === name);
        return def ? j(def) : { status: 404, json: { message: `No such task definition: ${name}`, status: 404 } };
      }
      if (p === "/workflow/search") {
        const all = fixture("workflowSearchLarge.json");
        const hits = filterWorkflows(all, req.search.get("query") ?? "");
        const start = Number(req.search.get("start") ?? 0);
        const size = Number(req.search.get("size") ?? 15);
        return j({ totalHits: hits.length, results: hits.slice(start, start + size) });
      }
      m = p.match(/^\/workflow\/([^/?]+)$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        const byId: Record<string, unknown> = {};
        for (const f of ["dynamicFork/success.json", "dynamicFork/oneFailed.json", "doWhile/doWhileSwitch.json"]) {
          const e = upstream(f);
          byId[e.workflowId] = e;
        }
        for (const f of ["executionRunning.json", "executionWithParent.json", "executionWithSubWorkflow.json"]) {
          const e = fixture(f);
          byId[e.workflowId] = e;
        }
        // ids produced by the generated search fixtures / scheduler fixtures resolve to the plain "success" execution
        if (!byId[id] && /^(00000000-0000-4000-8000-|wf-)/.test(id)) {
          return j({ ...(byId["e66254b6-388d-43a6-b890-c518df832e51"] as object), workflowId: id });
        }
        return byId[id]
          ? j(byId[id])
          : { status: 404, json: { message: `No such workflow found by id: ${id}`, status: 404 } };
      }
      if (p === "/tasks/search") {
        const all = fixture("taskSearchLarge.json").results;
        const q = req.search.get("query") ?? "";
        let hits = all;
        const names = q.match(/taskDefName IN \(([^)]*)\)/);
        if (names) hits = hits.filter((r: any) => names[1].split(",").includes(r.taskDefName));
        const start = Number(req.search.get("start") ?? 0);
        const size = Number(req.search.get("size") ?? 15);
        return j({ totalHits: hits.length, results: hits.slice(start, start + size) });
      }
      if (p === "/tasks/queue/polldata" || p.startsWith("/tasks/queue/polldata?")) return j(upstream("taskPollData.json"));
      if (p === "/tasks/queue/size") return { text: "5", contentType: "application/json" };
      if (/^\/tasks\/[^/]+\/log$/.test(p)) return j(fixture("taskLog.json"));
      if (p === "/event") return j(upstream("eventHandlers.json"));
      m = p.match(/^\/event\/([^/]+)$/);
      if (m) {
        const ev = decodeURIComponent(m[1]);
        return j(upstream("eventHandlers.json").filter((h: any) => h.event === ev));
      }
      if (p === "/scheduler/schedules") return j(upstream("schedulerDefs.json"));
      m = p.match(/^\/scheduler\/schedules\/([^/]+)$/);
      if (m) {
        const name = decodeURIComponent(m[1]);
        const def = upstream("schedulerDefs.json").find((d: any) => d.name === name);
        return def ? j(def) : { status: 404, json: { message: `No such schedule: ${name}`, status: 404 } };
      }
      if (p === "/scheduler/search/executions") return j(upstream("schedulerExecutions.json"));
    }
    if (method === "POST" && p === "/workflow") {
      return { text: "33333333-3333-4333-8333-333333333333", contentType: "text/plain" };
    }
    if ((method === "POST" || method === "PUT") && (p === "/metadata/taskdefs" || p === "/event" || p === "/scheduler/schedules"))
      return { status: 200, text: "" };
    if (method === "DELETE" && /^\/scheduler\/schedules\/[^/]+$/.test(p)) return { status: 200, text: "" };
    if (method === "PUT" && /^\/scheduler\/schedules\/[^/]+\/(pause|resume)$/.test(p)) return { status: 200, text: "" };
    if (method === "POST" && p === "/metadata/workflow") return { status: 200, text: "" };
    if (method === "PUT" && p === "/metadata/workflow") return { status: 200, text: "" };
    if ((method === "PUT" || method === "POST") && /^\/workflow\/[^/]+\/(pause|resume|restart|retry|rerun)$/.test(p.split("?")[0]))
      return { status: 200, text: "" };
    return undefined;
  }

  /** Called for every intercepted /api request. */
  async handle(route: Route) {
    const url = new URL(route.request().url());
    const rawPath = url.pathname.replace(/^\/api/, "") || "/";
    let body: any = undefined;
    const post = route.request().postData();
    if (post) {
      try {
        body = JSON.parse(post);
      } catch {
        body = post;
      }
    }
    const method = route.request().method();
    const query: Record<string, string[]> = {};
    url.searchParams.forEach((v, k) => (query[k] ??= []).push(v));
    this.requests.push({ method, rawPath, query, body });

    const req: Req = { method, path: decodeURI(rawPath), rawPath, search: url.searchParams, body };
    let reply: Reply | undefined;
    for (const o of this.overrides) {
      if ((o.method === "*" || o.method === method) && o.match.test(rawPath)) {
        reply = o.handler(req);
        if (reply) break;
      }
    }
    reply ??= this.defaults(req);
    if (!reply) {
      this.unmocked.push(`${method} ${rawPath}${url.search}`);
      await route.fulfill({ status: 599, contentType: "text/plain", body: "characterization: unmocked" });
      return;
    }
    await route.fulfill({
      status: reply.status ?? 200,
      contentType: reply.contentType ?? (reply.json !== undefined ? "application/json" : "text/plain"),
      body: reply.json !== undefined ? JSON.stringify(reply.json) : reply.text ?? "",
    });
  }
}

const monacoRoot = path.join(root, "node_modules/monaco-editor/min/vs");
const MONACO_CDN = /^https:\/\/cdn\.jsdelivr\.net\/npm\/monaco-editor@[^/]+\/min\/vs\/(.*?)(\?.*)?$/;

const LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="175" height="37" viewBox="0 0 175 37"><rect width="175" height="37" rx="6" fill="#1976d2"/><text x="87.5" y="24" font-family="sans-serif" font-size="16" fill="#fff" text-anchor="middle">Conductor</text></svg>';

const INIT_SCRIPT = `
(() => {
  // Seeded Math.random (mulberry32) so pages that use it (kitchen/gantt) render the same every time.
  let a = 0x2f6e2b1;
  Math.random = function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const css = '*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important;caret-color:transparent!important}';
  const add = () => { const s = document.createElement('style'); s.setAttribute('data-char', ''); s.textContent = css; (document.head || document.documentElement).appendChild(s); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();
`;

export const test = base.extend<{ api: ApiMock }>({
  api: async ({}, use) => {
    await use(new ApiMock());
  },
  page: async ({ page, context, api, baseURL }, use) => {
    const origin = new URL(baseURL!).origin;

    // 1. Block everything that is not the local server (registered first = lowest priority).
    await context.route(
      (url) => url.origin !== origin,
      (route) => {
        api.blocked.push(`${route.request().method()} ${route.request().url()}`);
        return route.abort("blockedbyclient");
      }
    );
    // 2. Monaco editor from the CDN URL the old app uses, served from node_modules.
    await context.route(MONACO_CDN, async (route) => {
      const m = route.request().url().match(MONACO_CDN)!;
      const file = path.join(monacoRoot, decodeURIComponent(m[1]));
      if (!file.startsWith(monacoRoot) || !fs.existsSync(file)) {
        return route.fulfill({ status: 404, body: "not found" });
      }
      const ext = path.extname(file);
      const ct =
        ext === ".js" ? "text/javascript" : ext === ".css" ? "text/css" : ext === ".ttf" ? "font/ttf" : "application/octet-stream";
      return route.fulfill({
        status: 200,
        contentType: ct,
        body: fs.readFileSync(file),
        headers: { "access-control-allow-origin": "*" },
      });
    });
    // 2b. The app bar logo is hard-coded to an external URL (src/plugins/AppLogo.jsx); answer it locally.
    await context.route("https://assets.conductor-oss.org/logo.png", (route) =>
      route.fulfill({ status: 200, contentType: "image/svg+xml", body: LOGO_SVG })
    );
    // 3. The API.
    await context.route(
      (url) => url.origin === origin && url.pathname.startsWith("/api/"),
      (route) => api.handle(route)
    );

    await context.addInitScript(INIT_SCRIPT);
    await page.clock.setFixedTime(new Date(FIXED_NOW));

    page.on("console", (m) => {
      if (m.type() === "error") api.consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => api.consoleErrors.push(`pageerror: ${e.message}`));

    await use(page);

    // Let late work (layout, retries, effects) finish so late console errors are not missed.
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(300).catch(() => {});

    // Teardown checks: these make every test also a "nothing leaked" test.
    expect(api.blocked, "requests to non-local hosts").toEqual([]);
    expect(api.unmocked, "unmocked /api requests").toEqual([]);
    const unexpected = api.consoleErrors.filter(
      (e) => ![...api.expectedConsoleErrors, ...api.maybeConsoleErrors].some((x) => e.includes(x))
    );
    expect(unexpected, "console errors / page errors").toEqual([]);
    for (const x of api.expectedConsoleErrors) {
      expect(
        api.consoleErrors.some((e) => e.includes(x)),
        `expected console error not seen: ${x}`
      ).toBe(true);
    }
  },
});

/** Wait until the page looks finished: no progress bars, network idle, fonts ready, two frames. */
export async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".MuiLinearProgress-root")).toHaveCount(0);
  await page.evaluate(
    () => document.fonts.ready.then(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
  );
}

export const pathAndSearch = (page: Page) => {
  const u = new URL(page.url());
  return u.pathname + u.search + u.hash;
};

export async function historyLength(page: Page) {
  return page.evaluate(() => window.history.length);
}
