/**
 * /execution/:id : header links, actions, the task drawer (?task=), history behaviour of task selection.
 */
import { test, expect, settle, pathAndSearch } from "./support/harness";
import { appBarLink, histLen, searchReady } from "./support/ui";

const OK = "e66254b6-388d-43a6-b890-c518df832e51";
const RUNNING = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const FIRST_TASK_ID = "6ce064a7-7ef3-413c-b6af-318cb7e6751e";

test.describe("execution header", () => {
  test("Definition link opens the definition in a new tab", async ({ page, context }) => {
    await page.goto(`/execution/${OK}`);
    const def = page.getByRole("link", { name: /Definition/ }).first();
    await expect(def).toHaveAttribute("href", "/workflowDef/example_dynamic_tasks");
    await expect(def).toHaveAttribute("target", "_blank");
    const [popup] = await Promise.all([context.waitForEvent("page"), def.click()]);
    await popup.waitForLoadState();
    await expect(popup).toHaveURL(/\/workflowDef\/example_dynamic_tasks$/);
    await popup.close();
  });

  test("a child execution links to its parent in a new tab; the parent has no such link", async ({ page }) => {
    await page.goto(`/execution/${CHILD}`);
    const parent = page.getByRole("link", { name: /Parent Workflow/ });
    await expect(parent).toHaveAttribute("href", `/execution/${OK}`);
    await expect(parent).toHaveAttribute("target", "_blank");
    await page.goto(`/execution/${OK}`);
    await expect(page.getByText("Refresh")).toBeVisible();
    await expect(page.getByRole("link", { name: /Parent Workflow/ })).toHaveCount(0);
  });

  test("Refresh fetches the execution again", async ({ page, api }) => {
    await page.goto(`/execution/${OK}`);
    await expect(page.getByText("Refresh")).toBeVisible();
    await settle(page);
    expect(api.calls("GET", `/workflow/${OK}`)).toHaveLength(1);
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect.poll(() => api.calls("GET", `/workflow/${OK}`).length).toBe(2);
  });
});

test.describe("execution actions", () => {
  test("RUNNING: Pause sends PUT /workflow/:id/pause, then reloads", async ({ page, api }) => {
    await page.goto(`/execution/${RUNNING}`);
    await page.getByRole("button", { name: "Actions" }).click();
    const items = await page.getByRole("menuitem").allTextContents();
    expect(items).toEqual(["Pause", "Terminate", "Terminate with Reason"]);
    await page.getByRole("menuitem", { name: "Pause" }).click();
    await expect.poll(() => api.calls("PUT", `/workflow/${RUNNING}/pause`).length).toBe(1);
    await expect.poll(() => api.calls("GET", `/workflow/${RUNNING}`).length).toBe(2);
  });

  test("COMPLETED and restartable: restart options; Restart sends POST /workflow/:id/restart", async ({ page, api }) => {
    await page.goto(`/execution/${OK}`);
    await page.getByRole("button", { name: "Actions" }).click();
    const items = await page.getByRole("menuitem").allTextContents();
    expect(items).toEqual(["Restart with Current Definitions", "Restart with Latest Definitions"]);
    await page.getByRole("menuitem", { name: "Restart with Current Definitions" }).click();
    await expect.poll(() => api.calls("POST", `/workflow/${OK}/restart`).length).toBe(1);
    await expect.poll(() => api.calls("GET", `/workflow/${OK}`).length).toBe(2);
  });

  test("FAILED: retry options", async ({ page }) => {
    await page.goto(`/execution/d4b14434-73a7-4be9-b085-d4b40b30856e`);
    await page.getByRole("button", { name: "Actions" }).click();
    const items = await page.getByRole("menuitem").allTextContents();
    expect(items).toEqual(expect.arrayContaining(["Retry - From failed task"]));
  });
});

test.describe("task selection and the drawer", () => {
  test("clicking a diagram node selects the task with replace (?task=(ref:...)), close removes it", async ({ page }) => {
    await page.goto(`/execution/${OK}`);
    await expect(page.getByText("End", { exact: true })).toBeVisible();
    const len = await histLen(page);
    await page.getByText("first_task", { exact: true }).first().click();
    await expect.poll(() => pathAndSearch(page)).toBe(`/execution/${OK}?task=%28ref%3Afirst_task%29`);
    expect(await histLen(page)).toBe(len);
    await expect(page.getByRole("tab", { name: "Summary" }).last()).toBeVisible();
    await expect(page.getByText("LAMBDA").first()).toBeVisible();

    await page.getByRole("button", { name: "Close sidebar" }).click();
    await expect.poll(() => pathAndSearch(page)).toBe(`/execution/${OK}`);
    await expect(page.getByRole("tab", { name: "Definition" })).toHaveCount(0);
  });

  test("Task List: the task id is a link that PUSHES /execution/:id?task=(id:...); back closes the drawer", async ({ page }) => {
    await page.goto(`/execution/${OK}`);
    await page.getByRole("tab", { name: "Task List" }).click();
    const link = page.locator(".rdt_TableRow a", { hasText: FIRST_TASK_ID });
    await expect(link).toHaveAttribute("href", `/execution/${OK}?task=(id%3A'${FIRST_TASK_ID}')`);
    const len = await histLen(page);
    await link.click();
    await expect(page.getByRole("button", { name: "Close sidebar" })).toBeVisible();
    expect(await histLen(page)).toBe(len + 1);
    expect(new URL(page.url()).searchParams.get("task")).toBe(`(id:'${FIRST_TASK_ID}')`);

    await page.goBack();
    await expect(page.getByRole("button", { name: "Close sidebar" })).toHaveCount(0);
    expect(pathAndSearch(page)).toBe(`/execution/${OK}`);
    await page.goForward();
    await expect(page.getByRole("button", { name: "Close sidebar" })).toBeVisible();
  });

  test("deep link ?task=(id:...) opens the drawer on that task", async ({ page }) => {
    await page.goto(`/execution/${OK}?task=(id:'${FIRST_TASK_ID}')`);
    await expect(page.getByRole("button", { name: "Close sidebar" })).toBeVisible();
    await expect(page.getByText(FIRST_TASK_ID).first()).toBeVisible();
    await expect(page.getByText("first_task").first()).toBeVisible();
  });

  test("drawer tab Logs fetches /tasks/:id/log", async ({ page, api }) => {
    await page.goto(`/execution/${OK}?task=(ref:first_task)`);
    await page.getByRole("tab", { name: "Logs" }).click();
    await expect(page.getByText("processing batch 1 of 2")).toBeVisible();
    expect(api.calls("GET", `/tasks/${FIRST_TASK_ID}/log`)).toHaveLength(1);
    expect(new URL(page.url()).searchParams.get("task")).toBe("(ref:first_task)");
  });

  // Input / Output / JSON / Definition render a Monaco editor. One tab per test: replacing editors quickly
  // kills a Monaco worker mid-load, which logs "Failed trying to load default language strings".
  for (const [tab, text] of [
    ["Input", "scriptExpression"],
    ["Output", "result"],
    ["JSON", "taskDefName"],
    ["Definition", "taskReferenceName"],
  ] as const) {
    test(`drawer tab ${tab} shows the task data`, async ({ page }) => {
      await page.goto(`/execution/${OK}?task=(ref:first_task)`);
      await page.getByRole("tab", { name: tab, exact: true }).last().click();
      await expect(page.locator(".monaco-editor .view-lines").first()).toContainText(text);
      await settle(page);
      expect(new URL(page.url()).searchParams.get("task")).toBe("(ref:first_task)");
    });
  }

  test("the drawer can be maximised and restored", async ({ page }) => {
    await page.goto(`/execution/${OK}?task=(ref:first_task)`);
    // The two icon buttons are told apart by their SVG path (the tooltip title disappears while the tooltip is open).
    const maximize = page.locator('button:has(svg path[d^="M7 14H5v5"])');
    const restore = page.locator('button:has(svg path[d^="M5 16h3v3"])');
    await expect(maximize).toHaveCount(1);
    await expect(restore).toHaveCount(0);
    const before = (await page.locator("#dragger").locator("xpath=..").boundingBox())!.width;
    await maximize.click();
    await expect(restore).toHaveCount(1);
    await expect(maximize).toHaveCount(0);
    const after = (await page.locator("#dragger").locator("xpath=..").boundingBox())!.width;
    expect(after).toBeGreaterThan(before);
    await restore.click();
    await expect(maximize).toHaveCount(1);
  });

  test("tab switches use replace: back from the execution page returns to the search page", async ({ page }) => {
    await page.goto("/?status=COMPLETED");
    await searchReady(page);
    await page.locator(".rdt_TableRow a").first().click();
    await expect(page.getByText("Refresh")).toBeVisible();
    await page.getByRole("tab", { name: "Summary" }).click();
    await page.getByRole("tab", { name: "JSON" }).click();
    expect(new URL(page.url()).searchParams.get("tabIndex")).toBe("3");
    await page.goBack();
    expect(pathAndSearch(page)).toBe("/?status=COMPLETED");
    await expect(page.getByText("Search Executions")).toBeVisible();
  });

  test("the diagram, task list and timeline tabs are local state: no URL change", async ({ page }) => {
    await page.goto(`/execution/${OK}`);
    await expect(page.getByText("End", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Task List" }).click();
    await expect(page.locator(".rdt_TableRow")).toHaveCount(5);
    expect(pathAndSearch(page)).toBe(`/execution/${OK}`);
    await page.getByRole("tab", { name: "Timeline" }).click();
    await expect(page.locator(".vis-timeline")).toBeVisible();
    expect(pathAndSearch(page)).toBe(`/execution/${OK}`);
    await page.getByRole("tab", { name: "Diagram" }).click();
    expect(pathAndSearch(page)).toBe(`/execution/${OK}`);
  });

  test("app bar navigation away from an execution keeps working", async ({ page }) => {
    await page.goto(`/execution/${OK}?tabIndex=1`);
    await expect(page.getByText("Refresh")).toBeVisible();
    await appBarLink(page, "Definitions").click();
    await expect(page).toHaveURL(/\/workflowDefs$/);
    await page.goBack();
    expect(pathAndSearch(page)).toBe(`/execution/${OK}?tabIndex=1`);
    await expect(page.getByText("Workflow ID")).toBeVisible();
  });
});

test.describe("sub workflow links", () => {
  const WITH_SUB = "44444444-4444-4444-8444-444444444444";
  const CHILD = "22222222-2222-4222-8222-222222222222";

  test("the task summary links to the sub workflow definition and execution (new tabs)", async ({ page, api }) => {
    api.on("GET", /^\/metadata\/workflow\/child_workflow$/, {
      json: { name: "child_workflow", version: 1, tasks: [], schemaVersion: 2, ownerEmail: "a@b.c" },
    });
    await page.goto(`/execution/${WITH_SUB}?task=(ref:first_task)`);
    const def = page.getByRole("link", { name: /child_workflow/ });
    await expect(def).toHaveAttribute("href", "/workflowDef/child_workflow");
    await expect(def).toHaveAttribute("target", "_blank");
    const exec = page.getByRole("link", { name: CHILD });
    await expect(exec).toHaveAttribute("href", `/execution/${CHILD}`);
    await expect(exec).toHaveAttribute("target", "_blank");
    await settle(page);
  });
});
