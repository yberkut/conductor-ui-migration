/**
 * URL <-> UI state. The search pages keep their filters in the query string through
 * react-router-use-location-state (`useQueryState`), which writes with history.replace,
 * sorts the keys, strips defaults and keeps foreign params and the hash.
 * The API query the pages build from that state is pinned here too.
 */
import { test, expect, FIXED_NOW, settle, pathAndSearch } from "./support/harness";
import { chips, field, histLen, pickOption, searchReady } from "./support/ui";

const NOW = Date.parse(FIXED_NOW);
const DAY = 86_400_000;
const WF_ID_1 = "00000000-0000-4000-8000-000000000001";

test.describe("workflow search (/)", () => {
  test("defaults: no query string, default search request", async ({ page, api }) => {
    await page.goto("/");
    await searchReady(page);
    expect(pathAndSearch(page)).toBe("/");
    expect(api.calls("GET", "/workflow/search")).toHaveLength(1);
    expect(api.lastQuery("/workflow/search")).toEqual({
      start: "0",
      size: "15",
      sort: "startTime:DESC",
      freeText: "*",
      query: "",
    });
    await expect(page.getByText("Page 1 of 3")).toBeVisible();
    await expect(page.locator(".rdt_TableRow")).toHaveCount(15);
  });

  test("deep link: every param becomes UI state and part of the API query", async ({ page, api }) => {
    await page.goto(
      `/?status=FAILED&status=COMPLETED&workflowType=feature_value_compute_workflow&workflowId=abc&freeText=foo&lookback=2&page=2&rowsPerPage=30&sort=workflowType:ASC`
    );
    await settle(page);
    expect(api.lastQuery("/workflow/search")).toEqual({
      start: "30",
      size: "30",
      sort: "workflowType:ASC",
      freeText: "foo",
      query: `workflowType IN (feature_value_compute_workflow) AND workflowId="abc" AND status IN (FAILED,COMPLETED) AND startTime>${NOW - 2 * DAY}`,
    });
    await expect(chips(page, "Workflow Name")).toHaveText(["feature_value_compute_workflow"]);
    await expect(chips(page, "Status")).toHaveText(["FAILED", "COMPLETED"]);
    await expect(field(page, "Workflow ID").locator("input")).toHaveValue("abc");
    await expect(field(page, "Lookback (days)").locator("input")).toHaveValue("2");
    await expect(field(page, /Lucene-syntax Query/).locator("input")).toHaveValue("foo");
    // the URL is left exactly as typed
    expect(pathAndSearch(page)).toBe(
      `/?status=FAILED&status=COMPLETED&workflowType=feature_value_compute_workflow&workflowId=abc&freeText=foo&lookback=2&page=2&rowsPerPage=30&sort=workflowType:ASC`
    );
  });

  test("deep link: start/end date range builds startTime clauses and disables lookback", async ({ page, api }) => {
    await page.goto(`/?startFrom=2026-03-01&startTo=2026-03-10`);
    await settle(page);
    expect(api.lastQuery("/workflow/search").query).toBe(
      `startTime>${Date.parse("2026-03-01")} AND startTime<${Date.parse("2026-03-10")}`
    );
    await expect(field(page, "Lookback (days)").locator("input")).toBeDisabled();
  });

  test("filters in the UI are written to the URL with replace (no history entries) and need Search", async ({ page, api }) => {
    await page.goto("/");
    await searchReady(page);
    const len = await histLen(page);

    await pickOption(page, "Status", "FAILED");
    expect(pathAndSearch(page)).toBe("/?status=FAILED");
    await pickOption(page, "Status", "COMPLETED");
    expect(pathAndSearch(page)).toBe("/?status=FAILED&status=COMPLETED");
    // nothing is fetched until Search is pressed
    expect(api.calls("GET", "/workflow/search")).toHaveLength(1);

    await pickOption(page, "Workflow Name", "19test009");
    expect(pathAndSearch(page)).toBe("/?status=FAILED&status=COMPLETED&workflowType=19test009");

    const id = field(page, "Workflow ID").locator("input");
    await id.fill("some-id");
    await id.blur();
    expect(pathAndSearch(page)).toContain("workflowId=some-id");
    const look = field(page, "Lookback (days)").locator("input");
    await look.fill("3");
    await look.blur();
    expect(pathAndSearch(page)).toContain("lookback=3");
    const text = field(page, /Lucene-syntax Query/).locator("input");
    await text.fill("hello world");
    await text.blur();
    expect(pathAndSearch(page)).toContain("freeText=hello+world");
    expect(pathAndSearch(page)).toBe(
      "/?freeText=hello+world&lookback=3&status=FAILED&status=COMPLETED&workflowId=some-id&workflowType=19test009"
    );

    expect(await histLen(page)).toBe(len);
    expect(api.calls("GET", "/workflow/search")).toHaveLength(1);

    await page.getByRole("button", { name: "Search" }).click();
    await expect.poll(() => api.calls("GET", "/workflow/search").length).toBe(2);
    expect(api.lastQuery("/workflow/search")).toEqual({
      start: "0",
      size: "15",
      sort: "startTime:DESC",
      freeText: "hello world",
      query: `workflowType IN (19test009) AND workflowId="some-id" AND status IN (FAILED,COMPLETED) AND startTime>${NOW - 3 * DAY}`,
    });
    expect(await histLen(page)).toBe(len);
  });

  test("clearing a filter back to its default removes it from the URL", async ({ page }) => {
    await page.goto("/?status=FAILED&workflowId=x");
    await settle(page);
    const id = field(page, "Workflow ID").locator("input");
    await id.fill("");
    await id.blur();
    expect(pathAndSearch(page)).toBe("/?status=FAILED");
    await field(page, "Status").locator(".MuiChip-deleteIcon").first().click();
    expect(pathAndSearch(page)).toBe("/");
  });

  test("pagination, rows per page and sort live in the URL and drive the API", async ({ page, api }) => {
    await page.goto("/");
    await searchReady(page);

    await page.locator("#pagination-next-page").click();
    await expect.poll(() => pathAndSearch(page)).toBe("/?page=2");
    await expect.poll(() => api.lastQuery("/workflow/search").start).toBe("15");
    await expect(page.getByText("Page 2 of 3")).toBeVisible();

    await page.locator("#pagination-next-page").click();
    await expect.poll(() => pathAndSearch(page)).toBe("/?page=3");
    await expect.poll(() => api.lastQuery("/workflow/search").start).toBe("30");
    await page.locator("#pagination-previous-page").click();
    await expect.poll(() => pathAndSearch(page)).toBe("/?page=2");

    // rows per page resets the page
    await page.locator("select").last().selectOption("30");
    await expect.poll(() => pathAndSearch(page)).toBe("/?rowsPerPage=30");
    await expect.poll(() => api.lastQuery("/workflow/search")).toMatchObject({ start: "0", size: "30" });
    await expect(page.getByText("Page 1 of 2")).toBeVisible();

    // sort resets the page too
    await page.locator(".rdt_TableCol_Sortable", { hasText: "workflowType" }).click();
    await expect.poll(() => pathAndSearch(page)).toContain("sort=workflowType");
    const sortParam = new URL(page.url()).searchParams.get("sort");
    expect(sortParam).toMatch(/^workflowType:(ASC|DESC)$/);
    await expect.poll(() => api.lastQuery("/workflow/search").sort).toBe(sortParam!);
  });

  test("pressing Search resets the page to 1", async ({ page }) => {
    await page.goto("/?page=2");
    await settle(page);
    await page.getByRole("button", { name: "Search" }).click();
    await expect.poll(() => pathAndSearch(page)).toBe("/");
  });

  test("foreign query params and the hash survive state changes", async ({ page }) => {
    await page.goto("/?foo=bar&stack=x#frag");
    await settle(page);
    await pickOption(page, "Status", "RUNNING");
    expect(pathAndSearch(page)).toBe("/?foo=bar&stack=x&status=RUNNING#frag");
  });

  test("garbage numeric params fall back to defaults", async ({ page, api }) => {
    await page.goto("/?page=abc&rowsPerPage=zzz");
    await settle(page);
    expect(api.lastQuery("/workflow/search")).toMatchObject({ start: "0", size: "15" });
    expect(pathAndSearch(page)).toBe("/?page=abc&rowsPerPage=zzz");
  });

  test("a bookmarked URL reproduces the same results", async ({ page, api }) => {
    await page.goto("/?status=FAILED&workflowType=19test009");
    await settle(page);
    // the mock honours status/type filters; every row on screen must match them
    const rows = page.locator(".rdt_TableRow");
    const n = await rows.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      await expect(rows.nth(i)).toContainText("FAILED");
      await expect(rows.nth(i)).toContainText("19test009");
    }
    expect(api.calls("GET", "/workflow/search")).toHaveLength(1);
  });
});

test.describe("task search (/search/tasks)", () => {
  test("deep link params build the task query", async ({ page, api }) => {
    await page.goto(
      "/search/tasks?taskName=example_task_1&taskName=example_task_2&taskType=HTTP&taskId=t-1&status=FAILED&workflowType=19test009&freeText=abc&lookback=1&page=2&rowsPerPage=30"
    );
    await settle(page);
    expect(api.lastQuery("/tasks/search")).toEqual({
      start: "30",
      size: "30",
      sort: "startTime:DESC",
      freeText: "abc",
      query: `taskDefName IN (example_task_1,example_task_2) AND taskType IN (HTTP) AND taskId="t-1" AND status IN (FAILED) AND updateTime>${NOW - DAY} AND workflowType IN (19test009)`,
    });
    await expect(chips(page, "Task Name")).toHaveText(["example_task_1", "example_task_2"]);
  });

  test("selecting a task name writes the URL (replace) and Search fetches", async ({ page, api }) => {
    await page.goto("/search/tasks");
    await settle(page);
    expect(api.calls("GET", "/tasks/search")).toHaveLength(0);
    const len = await histLen(page);
    await pickOption(page, "Task Name", "example_task_2");
    expect(pathAndSearch(page)).toBe("/search/tasks?taskName=example_task_2");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.locator(".rdt_TableRow").first()).toBeVisible();
    expect(api.lastQuery("/tasks/search").query).toBe("taskDefName IN (example_task_2)");
    expect(await histLen(page)).toBe(len);
  });
});

test.describe("scheduler executions (/schedulerExecs)", () => {
  test("deep link params build the scheduler query", async ({ page, api }) => {
    await page.goto(
      "/schedulerExecs?scheduleName=daily_cleanup_schedule&scheduleName=hourly_data_sync&workflowName=w1&executionId=e1&status=FAILED&lookback=1&page=1&rowsPerPage=30"
    );
    await settle(page);
    expect(api.lastQuery("/scheduler/search/executions")).toEqual({
      start: "0",
      size: "30",
      sort: "scheduledTime:DESC",
      freeText: "*",
      query: `scheduleName IN (daily_cleanup_schedule,hourly_data_sync) AND workflowName=w1 AND executionId=e1 AND state IN (FAILED) AND scheduledTime>${NOW - DAY}`,
    });
    await expect(chips(page, "Schedule Name")).toHaveText(["daily_cleanup_schedule", "hourly_data_sync"]);
    await expect(chips(page, "Status")).toHaveText(["FAILED"]);
  });

  test("selecting a status writes the URL with replace", async ({ page }) => {
    await page.goto("/schedulerExecs");
    await settle(page);
    const len = await histLen(page);
    await pickOption(page, "Status", "EXECUTED");
    expect(pathAndSearch(page)).toBe("/schedulerExecs?status=EXECUTED");
    expect(await histLen(page)).toBe(len);
  });
});

test.describe("workflow definitions filter (/workflowDefs?filter=)", () => {
  const filter = JSON.stringify({ columnName: "name", substring: "do" });

  test("deep link filters the table", async ({ page }) => {
    await page.goto(`/workflowDefs?filter=${encodeURIComponent(filter)}`);
    await settle(page);
    // the title still counts all definitions; only the rows are filtered
    await expect(page.getByText("3 results")).toBeVisible();
    await expect(page.locator(".rdt_TableRow")).toHaveCount(1);
    await expect(page.locator(".rdt_TableRow")).toContainText("Do_While_Workflow_Iteration_Fix");
  });

  test("typing a substring writes filter JSON to the URL, clearing removes it", async ({ page }) => {
    await page.goto("/workflowDefs");
    await settle(page);
    const len = await histLen(page);
    await page.locator('[title="Show Columns"]').first().click();
    await page.locator(".MuiPopover-paper").getByLabel("Substring").or(page.locator(".MuiPopover-paper input").last()).first().fill("do");
    await expect.poll(() => pathAndSearch(page)).toBe(`/workflowDefs?filter=${encodeURIComponent(filter).replace(/%20/g, "+")}`);
    await expect(page.locator(".rdt_TableRow")).toHaveCount(1);
    expect(await histLen(page)).toBe(len);
    await page.locator(".MuiPopover-paper input").last().fill("");
    await expect.poll(() => pathAndSearch(page)).toBe("/workflowDefs");
  });

  test("an unparsable filter crashes the whole page (bug, see followups.md)", async ({ page, api }) => {
    api.expectedConsoleErrors = ["is not valid JSON"];
    await page.goto("/workflowDefs?filter=notjson");
    await expect(page.locator("#root")).toBeEmpty();
  });
});

test.describe("execution page (/execution/:id)", () => {
  const ID = "e66254b6-388d-43a6-b890-c518df832e51";

  test("tabs write tabIndex with replace; index 0 is the default and is stripped", async ({ page }) => {
    await page.goto(`/execution/${ID}`);
    await expect(page.getByText("example_dynamic_tasks").first()).toBeVisible();
    const len = await histLen(page);
    await page.getByRole("tab", { name: "Summary" }).click();
    expect(pathAndSearch(page)).toBe(`/execution/${ID}?tabIndex=1`);
    await page.getByRole("tab", { name: "Workflow Input/Output" }).click();
    expect(pathAndSearch(page)).toBe(`/execution/${ID}?tabIndex=2`);
    await page.getByRole("tab", { name: "JSON" }).click();
    expect(pathAndSearch(page)).toBe(`/execution/${ID}?tabIndex=3`);
    await page.getByRole("tab", { name: "Tasks" }).click();
    expect(pathAndSearch(page)).toBe(`/execution/${ID}`);
    expect(await histLen(page)).toBe(len);
  });
});

test.describe("remaining query params", () => {
  test("task search: startFrom/startTo and sort", async ({ page, api }) => {
    await page.goto("/search/tasks?startFrom=2026-03-01&startTo=2026-03-10&sort=taskDefName:ASC");
    await settle(page);
    expect(api.lastQuery("/tasks/search")).toMatchObject({
      sort: "taskDefName:ASC",
      query: `updateTime>${Date.parse("2026-03-01")} AND updateTime<${Date.parse("2026-03-10")}`,
    });
  });

  test("scheduler executions: startFrom/startTo", async ({ page, api }) => {
    await page.goto("/schedulerExecs?startFrom=2026-03-01&startTo=2026-03-10");
    await settle(page);
    expect(api.lastQuery("/scheduler/search/executions").query).toBe(
      `scheduledTime>${Date.parse("2026-03-01")} AND scheduledTime<${Date.parse("2026-03-10")}`
    );
  });
});
