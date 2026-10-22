/**
 * /workbench: no URL state at all. Run history lives in localStorage; the execution link opens in a new tab.
 */
import { test, expect, settle, pathAndSearch, fixture } from "./support/harness";
import { field, pickOption } from "./support/ui";

const NEW_ID = "33333333-3333-4333-8333-333333333333";

test.describe("workbench", () => {
  test.beforeEach(async ({ api }) => {
    api.on("GET", new RegExp(`^/workflow/${NEW_ID}$`), {
      json: { ...fixture("executionRunning.json"), workflowId: NEW_ID },
    });
  });

  test("run a workflow: POST /workflow, run saved in localStorage, execution link opens a new tab, URL untouched", async ({
    page,
    api,
    context,
  }) => {
    await page.goto("/workbench");
    await expect(page.getByText("Workflow Workbench")).toBeVisible();
    await pickOption(page, "Workflow Name", "19test009");
    await page.getByRole("button", { name: "Execute Workflow" }).click();

    await expect.poll(() => api.calls("POST", "/workflow").length).toBe(1);
    expect(api.calls("POST", "/workflow")[0].body).toEqual({ name: "19test009" });
    expect(pathAndSearch(page)).toBe("/workbench");

    // run history entry and execution history entry appear
    await expect(page.getByText("No saved runs.")).toHaveCount(0);
    const link = page.getByRole("link", { name: new RegExp(NEW_ID) });
    await expect(link).toHaveAttribute("href", `/execution/${NEW_ID}`);
    await expect(link).toHaveAttribute("target", "_blank");
    const [popup] = await Promise.all([context.waitForEvent("page"), link.click()]);
    await popup.waitForLoadState();
    await expect(popup).toHaveURL(new RegExp(`/execution/${NEW_ID}$`));
    await expect(popup).toHaveTitle(`Conductor UI - Execution - ${NEW_ID}`);
    await popup.close();

    const keys = await page.evaluate(() => Object.keys(window.localStorage).filter((k) => k.startsWith("runHistory_")));
    expect(keys).toHaveLength(1);

    // survives a reload
    await page.reload();
    await expect(page.getByText("No saved runs.")).toHaveCount(0);
    await settle(page);
  });

  test("selecting a saved run restores the form without touching the URL", async ({ page }) => {
    await page.goto("/workbench");
    await pickOption(page, "Workflow Name", "19test009");
    await page.getByRole("button", { name: "Execute Workflow" }).click();
    await expect(page.getByText("No saved runs.")).toHaveCount(0);
    await page.reload();
    // a fresh page load starts with an empty form; clicking the saved run fills it again
    await expect(field(page, "Workflow Name").locator("input")).toHaveValue("");
    await page.locator(".MuiListItem-root", { hasText: /19test009/ }).first().click();
    await expect(field(page, "Workflow Name").locator("input")).toHaveValue("19test009");
    expect(pathAndSearch(page)).toBe("/workbench");
  });
});
