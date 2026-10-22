/**
 * Definition editors (Monaco): version switching, reset confirmation, save flows and the
 * history.push navigation that follows a successful save (usePushHistory / useRouteMatch sites).
 */
import type { Page } from "@playwright/test";
import { test, expect, settle, pathAndSearch } from "./support/harness";
import { editorText, histLen, setEditor } from "./support/ui";

const editorReady = async (page: Page) => {
  await expect(page.locator(".monaco-editor .view-lines").first()).toContainText(/\w/);
  await page.waitForFunction(() => !!(window as any).monaco);
  // The workflow editor also lays out a diagram next to the editor; let that finish, otherwise
  // the diagram (orkes-workflow-visualizer) sometimes logs a "Layout Error" when the page changes under it.
  if (new URL(page.url()).pathname.startsWith("/workflowDef")) {
    await expect(page.getByText("End", { exact: true })).toBeVisible();
  }
};

const toolbarSave = (page: Page) => page.getByRole("button", { name: "Save", exact: true }).first();
const dialogSave = (page: Page) => page.getByRole("dialog").getByRole("button", { name: "Save", exact: true });

/** Make a real edit through the editor model so Monaco fires its change event. */
async function appendSpace(page: Page) {
  const cur = await editorText(page);
  await setEditor(page, cur + " ");
}

test.describe("workflow definition editor", () => {
  test("version select: choosing a version PUSHES /workflowDef/:name/:version, Latest goes back to /workflowDef/:name", async ({
    page,
  }) => {
    await page.goto("/workflowDef/19test009");
    await editorReady(page);
    const len = await histLen(page);

    await page.getByText("Latest Version").click();
    const options = await page.getByRole("option").allTextContents();
    expect(options[0]).toBe("Latest Version");
    expect(options.slice(1)).toEqual(["Version 1 (2023-11-14 22:13:20)", "Version 2 (2023-11-16 02:00:00)"]);
    await page.getByRole("option", { name: /^Version 2/ }).click();
    await expect(page).toHaveURL(/\/workflowDef\/19test009\/2$/);
    await expect(page.getByText("Version 2").first()).toBeVisible();
    expect(await histLen(page)).toBe(len + 1);

    await page.getByText("Version 2").first().click();
    await page.getByRole("option", { name: "Latest Version" }).click();
    // Quirk (see followups.md): "Latest Version" has the value "" (not undefined), so the code pushes
    // `/workflowDef/${name}/${version}` and the URL ends with a slash.
    await expect(page).toHaveURL(/\/workflowDef\/19test009\/$/);
    await expect(page.getByText("Latest Version")).toBeVisible();
    expect(await histLen(page)).toBe(len + 2);

    await page.goBack();
    expect(pathAndSearch(page)).toBe("/workflowDef/19test009/2");
    await expect(page.getByText("Version 2").first()).toBeVisible();
    await page.goBack();
    expect(pathAndSearch(page)).toBe("/workflowDef/19test009");
  });

  test("editing marks the document Modified; Reset asks for confirmation and restores it", async ({ page }) => {
    await page.goto("/workflowDef/19test009");
    await editorReady(page);
    await expect(page.getByText("Unmodified")).toBeVisible();
    await expect(toolbarSave(page)).toBeDisabled();
    const original = await editorText(page);
    await appendSpace(page);
    await expect(page.getByText("Modified", { exact: true })).toBeVisible();
    await expect(toolbarSave(page)).toBeEnabled();

    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("You will lose all changes made in the editor. Are you sure to proceed?");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Modified", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Unmodified")).toBeVisible();
    expect(await editorText(page)).toBe(original);
  });

  test("switching version while modified asks first; Confirm then navigates", async ({ page }) => {
    await page.goto("/workflowDef/19test009");
    await editorReady(page);
    await appendSpace(page);
    await page.getByText("Latest Version").click();
    await page.getByRole("option", { name: /^Version 1/ }).click();
    await expect(page.getByRole("dialog")).toContainText("You will lose all changes");
    expect(pathAndSearch(page)).toBe("/workflowDef/19test009");
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page).toHaveURL(/\/workflowDef\/19test009\/1$/);
    await expect(page.getByText("Unmodified")).toBeVisible();
  });

  test("saving an existing workflow: PUT /metadata/workflow with [def] and the next version, then push to /workflowDef/:name/:version", async ({
    page,
    api,
  }) => {
    await page.goto("/workflowDef/19test009");
    await editorReady(page);
    const len = await histLen(page);
    await appendSpace(page);
    await toolbarSave(page).click();
    await expect(page.getByRole("dialog")).toContainText("Saving");
    await expect(page.getByRole("dialog")).toContainText("19test009");
    await expect(page.getByRole("dialog").getByText("Automatically set version")).toBeVisible();
    await dialogSave(page).click();

    await expect(page).toHaveURL(/\/workflowDef\/19test009\/3$/);
    const puts = api.calls("PUT", "/metadata/workflow");
    expect(puts).toHaveLength(1);
    expect(Array.isArray(puts[0].body)).toBe(true);
    expect(puts[0].body[0]).toMatchObject({ name: "19test009", version: 3 });
    expect(await histLen(page)).toBe(len + 1);
  });

  test("saving a new workflow: POST /metadata/workflow with the bare object, then push to /workflowDef/:name/1", async ({
    page,
    api,
  }) => {
    api.on("GET", /^\/metadata\/workflow\/brand_new_wf\/versions$/, { json: [] });
    // The diagram races when the definition changes under it (the old app sometimes logs this; see followups.md #8).
    api.maybeConsoleErrors.push("Layout Error: Error: org.eclipse.elk.graph.json.JsonImportException");
    // One task: the diagram logs a "Layout Error" for a definition with an empty task list (see followups.md).
    const doc = {
      name: "brand_new_wf",
      description: "x",
      version: 1,
      tasks: [{ name: "t1", taskReferenceName: "t1", type: "SIMPLE", inputParameters: {} }],
      schemaVersion: 2,
      ownerEmail: "a@b.c",
    };
    api.on("GET", /^\/metadata\/workflow\/brand_new_wf$/, { json: doc });
    await page.goto("/workflowDef");
    await editorReady(page);
    await setEditor(page, JSON.stringify(doc, null, 2));
    await expect(page.getByText("Modified", { exact: true })).toBeVisible();
    await toolbarSave(page).click();
    await expect(page.getByRole("dialog")).toContainText("New");
    await dialogSave(page).click();
    await expect(page).toHaveURL(/\/workflowDef\/brand_new_wf\/1$/);
    const posts = api.calls("POST", "/metadata/workflow");
    expect(posts).toHaveLength(1);
    expect(Array.isArray(posts[0].body)).toBe(false);
    expect(posts[0].body).toMatchObject({ name: "brand_new_wf", version: 1 });
    await settle(page);
  });

  test("a new workflow whose name is already taken cannot be saved", async ({ page }) => {
    await page.goto("/workflowDef");
    await editorReady(page);
    await setEditor(page, JSON.stringify({ name: "19test009", description: "x", version: 1, tasks: [], schemaVersion: 2, ownerEmail: "a@b.c" }, null, 2));
    await toolbarSave(page).click();
    await expect(page.getByText("Cannot save workflow definition. Workflow name already in use.")).toBeVisible();
    await expect(dialogSave(page)).toBeDisabled();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(pathAndSearch(page)).toBe("/workflowDef");
  });

  test("a failed save shows the server message and stays on the page", async ({ page, api }) => {
    api.on("GET", /^\/metadata\/workflow\/brand_new_wf\/versions$/, { json: [] });
    api.on("POST", "/metadata/workflow", {
      status: 400,
      json: { message: "bad definition", validationErrors: [{ message: "must not be empty", path: "tasks" }] },
    });
    api.expectedConsoleErrors = ["Failed to load resource", "bad definition"];
    await page.goto("/workflowDef");
    await editorReady(page);
    await setEditor(page, JSON.stringify({ name: "brand_new_wf", description: "x", version: 1, tasks: [], schemaVersion: 2, ownerEmail: "a@b.c" }, null, 2));
    await toolbarSave(page).click();
    await dialogSave(page).click();
    await expect(page.getByText("Failed to save the workflow definition. must not be empty: tasks")).toBeVisible();
    expect(pathAndSearch(page)).toBe("/workflowDef");
  });
});

test.describe("task definition editor", () => {
  test("saving an existing task: PUT /metadata/taskdefs with the bare object; stays on the page (refetch)", async ({ page, api }) => {
    await page.goto("/taskDef/example_task_1");
    await editorReady(page);
    await appendSpace(page);
    await toolbarSave(page).click();
    await dialogSave(page).click();
    await expect.poll(() => api.calls("PUT", "/metadata/taskdefs").length).toBe(1);
    expect(Array.isArray(api.calls("PUT", "/metadata/taskdefs")[0].body)).toBe(false);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(() => api.calls("GET", "/metadata/taskdefs/example_task_1").length).toBe(2);
    expect(pathAndSearch(page)).toBe("/taskDef/example_task_1");
  });

  test("saving a new task: POST /metadata/taskdefs with [def], then push to /taskDef/:name", async ({ page, api }) => {
    const def = { name: "brand_new_task", retryCount: 1, timeoutSeconds: 10, ownerEmail: "a@b.c" };
    api.on("GET", /^\/metadata\/taskdefs\/brand_new_task$/, { json: def });
    await page.goto("/taskDef");
    await editorReady(page);
    const len = await histLen(page);
    await setEditor(page, JSON.stringify(def, null, 2));
    await toolbarSave(page).click();
    await dialogSave(page).click();
    await expect(page).toHaveURL(/\/taskDef\/brand_new_task$/);
    const posts = api.calls("POST", "/metadata/taskdefs");
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual([expect.objectContaining({ name: "brand_new_task" })]);
    expect(await histLen(page)).toBe(len + 1);
    await settle(page);
  });
});

test.describe("event handler editor", () => {
  test("saving a new handler: POST /event, then push to /eventHandlerDef/:event/:name", async ({ page, api }) => {
    await page.goto("/eventHandlerDef");
    await editorReady(page);
    await setEditor(
      page,
      JSON.stringify(
        { name: "brand_new_handler", event: "conductor:workflow:FAILED", condition: "true", actions: [], active: true },
        null,
        2
      )
    );
    await toolbarSave(page).click();
    await dialogSave(page).click();
    await expect(page).toHaveURL(/\/eventHandlerDef\/conductor:workflow:FAILED\/brand_new_handler$/);
    expect(api.calls("POST", "/event")).toHaveLength(1);
    expect(api.calls("POST", "/event")[0].body).toMatchObject({ name: "brand_new_handler" });
  });
});

test.describe("scheduler definition editor", () => {
  test("saving a new schedule: POST /scheduler/schedules, then push to /schedulerDef/:name", async ({ page, api }) => {
    const def = {
      name: "brand_new_schedule",
      cronExpression: "0 */5 * * * *",
      zoneId: "UTC",
      paused: false,
      startWorkflowRequest: { name: "workflow_name", version: 1, input: {} },
    };
    api.on("GET", /^\/scheduler\/schedules\/brand_new_schedule$/, { json: def });
    await page.goto("/schedulerDef");
    await expect(page.locator(".monaco-editor .view-lines").first()).toBeVisible();
    await page.waitForFunction(() => !!(window as any).monaco);
    await setEditor(page, JSON.stringify(def, null, 2));
    await toolbarSave(page).click();
    await dialogSave(page).click();
    await expect(page).toHaveURL(/\/schedulerDef\/brand_new_schedule$/);
    expect(api.calls("POST", "/scheduler/schedules")).toHaveLength(1);
    expect(api.calls("POST", "/scheduler/schedules")[0].body).toMatchObject({ name: "brand_new_schedule" });
    await settle(page);
  });
});
