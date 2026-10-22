/**
 * Visual states reached by interaction (dialogs, menus, tabs). Same screenshot rules as routes.spec.ts.
 */
import type { Locator, Page } from "@playwright/test";
import { test, expect, settle, fixture } from "./support/harness";
import { editorText, pickOption, setEditor } from "./support/ui";

const OK = "e66254b6-388d-43a6-b890-c518df832e51";
const shot = (page: Page, name: string, mask: Locator[] = []) =>
  expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, mask });
const editorReady = async (page: Page) => {
  await expect(page.locator(".monaco-editor .view-lines").first()).toContainText(/\w/);
  await page.waitForFunction(() => !!(window as any).monaco);
  // The workflow editor also lays out a diagram next to the editor; let that finish, otherwise
  // the diagram (orkes-workflow-visualizer) sometimes logs a "Layout Error" when the page changes under it.
  if (new URL(page.url()).pathname.startsWith("/workflowDef")) {
    await expect(page.getByText("End", { exact: true })).toBeVisible();
  }
};

test.describe("visual states", () => {
  test("workflow search with filters applied from the URL", async ({ page }) => {
    await page.goto("/?status=FAILED&status=COMPLETED&workflowType=19test009&lookback=2");
    await expect(page.locator(".rdt_TableRow").first()).toBeVisible();
    await settle(page);
    await shot(page, "state-workflow-search-filtered");
  });

  test("execution: task list tab", async ({ page }) => {
    await page.goto(`/execution/${OK}`);
    await page.getByRole("tab", { name: "Task List" }).click();
    await expect(page.locator(".rdt_TableRow")).toHaveCount(5);
    await settle(page);
    await shot(page, "state-execution-task-list");
  });

  test("execution: timeline tab", async ({ page }) => {
    await page.goto(`/execution/${OK}`);
    await page.getByRole("tab", { name: "Timeline" }).click();
    await expect(page.locator(".vis-timeline")).toBeVisible();
    await settle(page);
    await page.waitForTimeout(500);
    await shot(page, "state-execution-timeline");
  });

  test("execution: actions menu open", async ({ page }) => {
    await page.goto(`/execution/${OK}`);
    await expect(page.getByText("End", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Actions" }).click();
    await expect(page.getByRole("menuitem").first()).toBeVisible();
    await settle(page);
    await shot(page, "state-execution-actions-menu");
  });

  test("workflow definitions: filter popover open", async ({ page }) => {
    await page.goto("/workflowDefs?filter=%7B%22columnName%22%3A%22name%22%2C%22substring%22%3A%22do%22%7D");
    await expect(page.locator(".rdt_TableRow")).toHaveCount(1);
    await page.locator('[title="Show Columns"]').first().click();
    await expect(page.locator(".MuiPopover-paper")).toBeVisible();
    await settle(page);
    await shot(page, "state-workflow-defs-filter-popover");
  });

  test("workflow editor: reset confirmation dialog", async ({ page }) => {
    await page.goto("/workflowDef/19test009");
    await editorReady(page);
    await setEditor(page, (await editorText(page)) + " ");
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await settle(page);
    await shot(page, "state-workflow-def-reset-dialog");
  });

  test("workflow editor: save dialog with the diff editor", async ({ page }) => {
    await page.goto("/workflowDef/19test009");
    await editorReady(page);
    await setEditor(page, (await editorText(page)).replace('"test workflow"', '"test workflow, edited"'));
    await page.getByRole("button", { name: "Save", exact: true }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator(".monaco-diff-editor")).toBeVisible();
    await expect(page.locator(".monaco-diff-editor .view-lines").last()).toContainText("edited");
    // the diff is computed asynchronously: wait for its decorations before taking the picture
    await expect(page.locator(".monaco-diff-editor .line-insert").first()).toBeVisible();
    await expect(page.locator(".monaco-diff-editor .line-delete").first()).toBeVisible();
    await settle(page);
    // force one more layout pass so the editor edges are final, then let it paint
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await page.waitForTimeout(1000);
    // Mask: the diff editor's overview ruler is a canvas painted asynchronously; it flickers by one column of pixels.
    await shot(page, "state-workflow-def-save-dialog", [page.locator(".monaco-diff-editor canvas.decorationsOverviewRuler")]);
  });

  test("workbench after running a workflow", async ({ page, api }) => {
    api.on("GET", /^\/workflow\/33333333-3333-4333-8333-333333333333$/, {
      json: { ...fixture("executionRunning.json"), workflowId: "33333333-3333-4333-8333-333333333333" },
    });
    await page.goto("/workbench");
    await pickOption(page, "Workflow Name", "19test009");
    await page.getByRole("button", { name: "Execute Workflow" }).click();
    await expect(page.getByRole("link", { name: /33333333-3333/ })).toBeVisible();
    await settle(page);
    await shot(page, "state-workbench-after-run");
  });
});
