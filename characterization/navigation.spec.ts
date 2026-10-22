/**
 * Navigation: app bar, tabs, list -> detail links, new-tab links, unknown routes, URL matching rules
 * (trailing slash, case, params, extra segments) and back/forward.
 */
import { test, expect, settle, pathAndSearch } from "./support/harness";
import { appBarLink, histLen, searchReady } from "./support/ui";

const EXEC_OK = "e66254b6-388d-43a6-b890-c518df832e51";
const bodyIsBlank = async (page: import("@playwright/test").Page) => {
  // app bar present, nothing rendered below it
  await expect(page.locator("header")).toBeVisible();
  await expect(page.locator("#root > div > div").last()).toBeEmpty();
};

test.describe("app bar", () => {
  test("links, their targets and the click behaviour (push, no reload)", async ({ page }) => {
    await page.goto("/");
    await searchReady(page);
    const links: Array<[string, string]> = [
      ["Executions", "/"],
      ["Definitions", "/workflowDefs"],
      ["Scheduler", "/schedulerExecs"],
      ["Task Queues", "/taskQueue"],
      ["Workbench", "/workbench"],
    ];
    for (const [name, href] of links) {
      await expect(appBarLink(page, name)).toHaveAttribute("href", href);
      await expect(appBarLink(page, name)).not.toHaveAttribute("target", /.+/);
    }
    // the logo is an image, not a link
    await expect(page.locator("header img[alt=Conductor]")).toBeVisible();
    await expect(page.locator("header a:has(img)")).toHaveCount(0);

    // client-side navigation: a marker set on window survives every click
    await page.evaluate(() => ((window as any).__marker = "still-here"));
    const len = await histLen(page);
    await appBarLink(page, "Definitions").click();
    await expect(page).toHaveURL(/\/workflowDefs$/);
    await appBarLink(page, "Scheduler").click();
    await expect(page).toHaveURL(/\/schedulerExecs$/);
    await appBarLink(page, "Task Queues").click();
    await expect(page).toHaveURL(/\/taskQueue$/);
    await appBarLink(page, "Workbench").click();
    await expect(page).toHaveURL(/\/workbench$/);
    await appBarLink(page, "Executions").click();
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
    expect(await histLen(page)).toBe(len + 5);
    expect(await page.evaluate(() => (window as any).__marker)).toBe("still-here");
  });

  test("back and forward walk the pushed entries", async ({ page }) => {
    await page.goto("/");
    await searchReady(page);
    await appBarLink(page, "Definitions").click();
    await expect(page.getByRole("heading", { name: "Definitions" })).toBeVisible();
    await appBarLink(page, "Task Queues").click();
    await expect(page.getByText("Select a Task Name")).toBeVisible();

    await page.goBack();
    await expect(page.getByRole("heading", { name: "Definitions" })).toBeVisible();
    expect(pathAndSearch(page)).toBe("/workflowDefs");
    await page.goBack();
    await expect(page.getByText("Search Executions")).toBeVisible();
    expect(pathAndSearch(page)).toBe("/");
    await page.goForward();
    expect(pathAndSearch(page)).toBe("/workflowDefs");
    await page.goForward();
    await expect(page.getByText("Select a Task Name")).toBeVisible();
    expect(pathAndSearch(page)).toBe("/taskQueue");
  });
});

test.describe("tabs", () => {
  test("Workflows/Tasks search tabs are links", async ({ page }) => {
    await page.goto("/");
    await searchReady(page);
    const tabs = page.locator("a.MuiTab-root");
    await expect(tabs.filter({ hasText: "Workflows" })).toHaveAttribute("href", "/");
    await expect(tabs.filter({ hasText: "Tasks" })).toHaveAttribute("href", "/search/tasks");
    await tabs.filter({ hasText: "Tasks" }).click();
    await expect(page).toHaveURL(/\/search\/tasks$/);
    await expect(page.getByText("Task Name")).toBeVisible();
    await tabs.filter({ hasText: "Workflows" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("Workflow Name")).toBeVisible();
    await page.goBack();
    await expect(page.getByText("Task Name")).toBeVisible();
    expect(pathAndSearch(page)).toBe("/search/tasks");
  });

  test("filters are not carried over between the two search tabs", async ({ page }) => {
    await page.goto("/?status=FAILED");
    await settle(page);
    await page.locator("a.MuiTab-root").filter({ hasText: "Tasks" }).click();
    expect(pathAndSearch(page)).toBe("/search/tasks");
  });

  test("Definitions tabs are links", async ({ page }) => {
    await page.goto("/workflowDefs");
    await settle(page);
    const tabs = page.locator("a.MuiTab-root");
    const map: Array<[string, string, RegExp]> = [
      ["Workflows", "/workflowDefs", /Workflow Definitions$/],
      ["Tasks", "/taskDefs", /Task Definitions$/],
      ["Event Handlers", "/eventHandlerDefs", /Event Handler Definitions$/],
      ["Schedulers", "/schedulerDefs", /Scheduler Definitions$/],
    ];
    for (const [label, href, title] of map) {
      await expect(tabs.filter({ hasText: label })).toHaveAttribute("href", href);
      await tabs.filter({ hasText: label }).click();
      await expect(page).toHaveURL(new RegExp(href + "$"));
      await expect(page).toHaveTitle(title);
    }
  });
});

test.describe("list -> detail links", () => {
  test("workflow search row -> execution; back restores the filters", async ({ page }) => {
    await page.goto("/?status=COMPLETED");
    await searchReady(page);
    const link = page.locator(".rdt_TableRow a").first();
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/execution\/00000000-0000-4000-8000-0000000000\w\w$/);
    await expect(link).not.toHaveAttribute("target", /.+/);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await page.goBack();
    expect(pathAndSearch(page)).toBe("/?status=COMPLETED");
    await expect(page.locator(".MuiChip-label", { hasText: "COMPLETED" })).toBeVisible();
  });

  test("workflow definitions: name -> editor, New -> blank editor, Query opens the executions search in a new tab", async ({
    page,
    context,
  }) => {
    await page.goto("/workflowDefs");
    await settle(page);
    const name = page.locator(".rdt_TableRow a", { hasText: "19test009" });
    await expect(name).toHaveAttribute("href", "/workflowDef/19test009");
    const newBtn = page.getByRole("button", { name: /New Workflow Definition/ });
    await expect(newBtn).toHaveAttribute("href", "/workflowDef");

    const query = page.locator(".rdt_TableRow", { hasText: "19test009" }).getByRole("link", { name: /Query/ });
    await expect(query).toHaveAttribute("target", "_blank");
    await expect(query).toHaveAttribute("href", "/?workflowType=19test009");
    const [popup] = await Promise.all([context.waitForEvent("page"), query.click()]);
    await popup.waitForLoadState();
    await expect(popup.locator(".MuiChip-label", { hasText: "19test009" })).toBeVisible();
    expect(new URL(popup.url()).pathname + new URL(popup.url()).search).toBe("/?workflowType=19test009");
    await popup.close();

    await name.click();
    await expect(page).toHaveURL(/\/workflowDef\/19test009$/);
    await page.goBack();
    await newBtn.click();
    await expect(page).toHaveURL(/\/workflowDef$/);
    await expect(page.getByText("NEW")).toBeVisible();
  });

  test("task definitions: name -> editor, New -> blank editor, Query points at a route that does not exist", async ({
    page,
    context,
  }) => {
    await page.goto("/taskDefs");
    await settle(page);
    await expect(page.locator(".rdt_TableRow a", { hasText: "example_task_1" })).toHaveAttribute("href", "/taskDef/example_task_1");
    await expect(page.getByRole("button", { name: /New Task Definition/ })).toHaveAttribute("href", "/taskDef");
    const query = page.locator(".rdt_TableRow", { hasText: "example_task_1" }).getByRole("link", { name: /Query/ });
    await expect(query).toHaveAttribute("target", "_blank");
    await expect(query).toHaveAttribute("href", "/search/by-tasks?tasks=example_task_1");
    // /search/by-tasks is declared nowhere: the new tab shows the bare shell (see followups.md)
    const [popup] = await Promise.all([context.waitForEvent("page"), query.click()]);
    await popup.waitForLoadState();
    await expect(popup.locator("header")).toBeVisible();
    await expect(popup.locator("#root > div > div").last()).toBeEmpty();
    await popup.close();

    await page.locator(".rdt_TableRow a", { hasText: "example_task_1" }).click();
    await expect(page).toHaveURL(/\/taskDef\/example_task_1$/);
  });

  test("event handler definitions: name -> editor at /eventHandlerDef/:event/:name", async ({ page }) => {
    await page.goto("/eventHandlerDefs");
    await settle(page);
    const link = page.locator(".rdt_TableRow a", { hasText: "test_event_handler" });
    await expect(link).toHaveAttribute("href", "/eventHandlerDef/conductor:workflow:COMPLETED/test_event_handler");
    await expect(page.getByRole("button", { name: /New Event Handler Definition/ })).toHaveAttribute("href", "/eventHandlerDef");
    await link.click();
    await expect(page).toHaveURL(/\/eventHandlerDef\/conductor:workflow:COMPLETED\/test_event_handler$/);
    await expect(page).toHaveTitle("Conductor UI - Event Handler Definition - test_event_handler");
  });

  test("scheduler definitions: name -> editor; New -> blank editor", async ({ page }) => {
    await page.goto("/schedulerDefs");
    await settle(page);
    const link = page.locator(".rdt_TableRow a", { hasText: "daily_cleanup_schedule" });
    await expect(link).toHaveAttribute("href", "/schedulerDef/daily_cleanup_schedule");
    await expect(page.getByRole("button", { name: /New Schedule/ })).toHaveAttribute("href", "/schedulerDef");
    await link.click();
    await expect(page).toHaveURL(/\/schedulerDef\/daily_cleanup_schedule$/);
  });

  test("scheduler executions: schedule name -> /schedulerDef/:name, workflow id -> /execution/:id", async ({ page }) => {
    await page.goto("/schedulerExecs");
    await settle(page);
    const sched = page.locator(".rdt_TableRow a", { hasText: "daily_cleanup_schedule" });
    await expect(sched).toHaveAttribute("href", "/schedulerDef/daily_cleanup_schedule");
    const wf = page.locator(".rdt_TableRow a", { hasText: "wf-123456" });
    await expect(wf).toHaveAttribute("href", "/execution/wf-123456");
    await wf.click();
    await expect(page).toHaveURL(/\/execution\/wf-123456$/);
    await expect(page).toHaveTitle("Conductor UI - Execution - wf-123456");
  });

  test("task search: workflow id and task id links", async ({ page }) => {
    await page.goto("/search/tasks?taskName=example_task_2");
    await settle(page);
    const row = page.locator(".rdt_TableRow").first();
    const hrefs = await row.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    // only the task id is a link in the default columns; it points at the execution with ?task=
    expect(hrefs).toHaveLength(1);
    expect(hrefs[0]).toMatch(/^\/execution\/00000000-0000-4000-8000-0000000000\w\w\?task=/);
    // the task link carries the task as a rison object in ?task=
    const taskParam = new URL(hrefs[0]!, "http://x").searchParams.get("task");
    expect(taskParam).toMatch(/^\(id:'?00000000-0000-4000-9000-0000000000\w\w'?\)$/);
  });

  test("kitchen sink -> gantt link", async ({ page }) => {
    await page.goto("/kitchen");
    await expect(page.getByRole("link", { name: "Gantt" })).toHaveAttribute("href", "/kitchen/gantt");
    await page.getByRole("link", { name: "Gantt" }).click();
    await expect(page).toHaveURL(/\/kitchen\/gantt$/);
    await expect(page.getByText("This example demonstrate using groups.")).toBeVisible();
  });
});

test.describe("task queue selection", () => {
  test("choosing a task pushes /taskQueue/:name; back and forward restore it", async ({ page, api }) => {
    await page.goto("/taskQueue");
    await expect(page.getByText("Select a Task Name")).toBeVisible();
    const len = await histLen(page);
    await page.locator(".MuiAutocomplete-inputRoot input").first().click();
    await page.locator("li.MuiAutocomplete-option").filter({ hasText: "example_task_1" }).click();
    await expect(page).toHaveURL(/\/taskQueue\/example_task_1$/);
    await expect(page.getByText("Poll Status by Domain")).toBeVisible();
    expect(await histLen(page)).toBe(len + 1);
    expect(api.lastQuery("/tasks/queue/polldata")).toEqual({ taskType: "example_task_1" });

    await page.locator(".MuiAutocomplete-inputRoot input").first().click();
    await page.locator("li.MuiAutocomplete-option").filter({ hasText: "example_task_3" }).click();
    await expect(page).toHaveURL(/\/taskQueue\/example_task_3$/);
    expect(api.lastQuery("/tasks/queue/polldata")).toEqual({ taskType: "example_task_3" });

    await page.goBack();
    await expect(page).toHaveURL(/\/taskQueue\/example_task_1$/);
    await expect(page.locator(".MuiAutocomplete-inputRoot input").first()).toHaveValue("example_task_1");
    await page.goBack();
    await expect(page).toHaveURL(/\/taskQueue$/);
    await expect(page.getByText("Poll Status by Domain")).toHaveCount(0);
    await page.goForward();
    await expect(page).toHaveURL(/\/taskQueue\/example_task_1$/);
  });
});

test.describe("URL matching rules", () => {
  test("no redirects: / and /executions both render the workflow search and keep their URL", async ({ page }) => {
    await page.goto("/");
    await searchReady(page);
    expect(pathAndSearch(page)).toBe("/");
    await page.goto("/executions");
    await searchReady(page);
    expect(pathAndSearch(page)).toBe("/executions");
    // the app bar "Executions" button always goes to "/", never /executions
    await expect(appBarLink(page, "Executions")).toHaveAttribute("href", "/");
  });

  test("unknown paths render the app bar and an empty body", async ({ page }) => {
    for (const url of [
      "/nope",
      "/execution", // :id is mandatory
      "/index.html",
      "/workflowDef/a/b/c", // exact: too many segments
      "/kitchen/unknown",
      "/search/by-tasks?tasks=x",
      "/eventHandlerDef/a/b/c",
      "/taskQueue/a/b",
    ]) {
      await page.goto(url);
      await bodyIsBlank(page);
      await expect(page).toHaveTitle("Conductor UI");
      expect(pathAndSearch(page)).toBe(url);
    }
  });

  test("trailing slash and letter case do not matter", async ({ page }) => {
    for (const [url, heading] of [
      ["/workflowDefs/", "Definitions"],
      ["/WorkflowDefs", "Definitions"],
      ["/TASKDEFS/", "Definitions"],
    ] as const) {
      await page.goto(url);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      expect(pathAndSearch(page)).toBe(url);
    }
    await page.goto("/Executions/");
    await expect(page.getByText("Search Executions")).toBeVisible();
  });

  test("/execution/:id/:taskId? is not exact: extra segments still match and :taskId is ignored", async ({ page, api }) => {
    await page.goto(`/execution/${EXEC_OK}/some-task/and/more`);
    await expect(page.getByText("example_dynamic_tasks").first()).toBeVisible();
    await expect(page).toHaveTitle(`Conductor UI - Execution - ${EXEC_OK}`);
    expect(api.lastQuery(`/workflow/${EXEC_OK}`)).toEqual({});
    expect(pathAndSearch(page)).toBe(`/execution/${EXEC_OK}/some-task/and/more`);
  });

  test("optional params: /workflowDef, /workflowDef/:name, /workflowDef/:name/:version", async ({ page, api }) => {
    await page.goto("/workflowDef");
    await expect(page.getByText("NEW")).toBeVisible();
    await page.goto("/workflowDef/19test009");
    await expect(page.getByText("19test009", { exact: true })).toBeVisible();
    expect(api.calls("GET", "/metadata/workflow/19test009")[0].query).toEqual({});
    await page.goto("/workflowDef/19test009/1");
    await expect(page.getByText("Version 1")).toBeVisible();
    // the version goes to the API as ?version=
    expect(api.calls("GET", "/metadata/workflow/19test009").some((c) => c.query.version?.[0] === "1")).toBe(true);
  });

  test("params are percent-decoded once: a name with a space reaches the API as the same name", async ({ page, api }) => {
    api.on("GET", /^\/metadata\/taskdefs\/name%20with%20space$/, {
      json: { name: "name with space", retryCount: 1, timeoutSeconds: 1, ownerEmail: "a@b.c" },
    });
    await page.goto("/taskDef/name%20with%20space");
    await expect(page.getByText("name with space", { exact: true })).toBeVisible();
    expect(pathAndSearch(page)).toBe("/taskDef/name%20with%20space");
    expect(api.calls("GET", "/metadata/taskdefs/name%20with%20space")).toHaveLength(1);
    await expect(page).toHaveTitle("Conductor UI - Task Definition - name with space");
  });

  test("an encoded slash inside a param stays encoded (RR5 does not decode %2F in params)", async ({ page, api }) => {
    api.on("GET", /^\/metadata\/taskdefs\/a%2Fb$/, {
      json: { name: "a/b", retryCount: 1, timeoutSeconds: 1, ownerEmail: "a@b.c" },
    });
    api.on("GET", /^\/metadata\/taskdefs\/a\/b$/, { json: { name: "decoded-slash" } });
    await page.goto("/taskDef/a%2Fb");
    await settle(page);
    const taskCalls = api.requests.filter((r) => r.rawPath.startsWith("/metadata/taskdefs/")).map((r) => r.rawPath);
    // Record exactly what the old app asked for, whatever it was.
    expect([...new Set(taskCalls)]).toEqual(["/metadata/taskdefs/a%2Fb"]);
    await expect(page).toHaveTitle("Conductor UI - Task Definition - a%2Fb");
  });
});

test.describe("document title follows client-side navigation", () => {
  test("Helmet titles change on push and on back", async ({ page }) => {
    await page.goto("/workflowDefs");
    await expect(page).toHaveTitle("Conductor UI - Workflow Definitions");
    await page.locator(".rdt_TableRow a", { hasText: "19test009" }).click();
    await expect(page).toHaveTitle("Conductor UI - Workflow Definition - 19test009");
    await page.goBack();
    await expect(page).toHaveTitle("Conductor UI - Workflow Definitions");
    await appBarLink(page, "Executions").click();
    // Quirk (see followups.md): pages without a <Helmet> do not reset the title, so it is stale.
    await expect(page.getByText("Search Executions")).toBeVisible();
    await expect(page).toHaveTitle("Conductor UI - Workflow Definitions");
    await appBarLink(page, "Scheduler").click();
    await expect(page.getByText("Scheduler Executions")).toBeVisible();
    await expect(page).toHaveTitle("Conductor UI - Workflow Definitions");
  });

  test("task search -> task id link pushes /execution/:id?task= and opens the drawer; back returns", async ({ page }) => {
    await page.goto("/search/tasks?taskName=example_task_2");
    await settle(page);
    const len = await histLen(page);
    await page.locator(".rdt_TableRow a").first().click();
    await expect(page.getByRole("button", { name: "Close sidebar" })).toBeVisible();
    await expect(page).toHaveTitle(/^Conductor UI - Execution - 00000000-0000-4000-8000-0000000000\w\w$/);
    expect(await histLen(page)).toBe(len + 1);
    await page.goBack();
    expect(pathAndSearch(page)).toBe("/search/tasks?taskName=example_task_2");
    await expect(page.locator(".MuiChip-label", { hasText: "example_task_2" })).toBeVisible();
  });
});

test.describe("links that are hidden by default", () => {
  test("task search: the Workflow ID column (hidden by default) links to /execution/:id", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("taskResultsTable", JSON.stringify(["updateTime", "taskId", "workflowId", "status"]));
    });
    await page.goto("/search/tasks?taskName=example_task_2");
    await settle(page);
    const wf = page.locator(".rdt_TableRow a[href^='/execution/']:not([href*='?task='])").first();
    await expect(wf).toHaveAttribute("href", /^\/execution\/00000000-0000-4000-8000-0000000000\w\w$/);
    await expect(wf).not.toHaveAttribute("target", /.+/);
    await wf.click();
    await expect(page).toHaveURL(/\/execution\/00000000-0000-4000-8000-0000000000\w\w$/);
  });

  test("execution summary tab: parent workflow link opens in a new tab", async ({ page }) => {
    const parent = "e66254b6-388d-43a6-b890-c518df832e51";
    await page.goto(`/execution/22222222-2222-4222-8222-222222222222?tabIndex=1`);
    const link = page.locator(`a[href="/execution/${parent}"]`).filter({ hasText: parent });
    await expect(link).toHaveAttribute("target", "_blank");
  });
});
