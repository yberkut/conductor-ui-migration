import type { Locator, Page } from "@playwright/test";
import { expect, settle } from "./harness";

/** The MUI FormControl that carries a given label (labels are not linked to inputs in this app). */
export const field = (page: Page, label: string | RegExp): Locator =>
  page.locator(".MuiFormControl-root").filter({ has: page.locator("label", { hasText: label }) }).first();

/** Open an Autocomplete (Dropdown) by label and pick an option by its text. */
export async function pickOption(page: Page, label: string | RegExp, option: string) {
  const input = field(page, label).locator("input").first();
  await input.click();
  await page.locator("li.MuiAutocomplete-option").filter({ hasText: option }).first().click();
}

/** Chips (selected values) of an Autocomplete. */
export const chips = (page: Page, label: string | RegExp) => field(page, label).locator(".MuiChip-label");

/** Wait for the executions search table to be rendered with data. */
export async function searchReady(page: Page) {
  await expect(page.locator(".rdt_TableRow").first()).toBeVisible();
  await settle(page);
}

/** App bar entries are MUI Buttons rendered as <a> with role=button (component={NavLink}). */
export const appBarLink = (page: Page, name: string) =>
  page.locator("header a").filter({ hasText: new RegExp("^" + name + "$") });

/** window.history.length of the page. */
export const histLen = (page: Page) => page.evaluate(() => window.history.length);

/** Set the content of the first Monaco editor model (as if the user had pasted a document). */
export async function setEditor(page: Page, text: string) {
  await page.evaluate((t) => {
    // @ts-ignore monaco is a global once the AMD loader has loaded the editor
    const models = window.monaco.editor.getModels();
    models[0].setValue(t);
  }, text);
}

export async function editorText(page: Page): Promise<string> {
  return page.evaluate(() => {
    // @ts-ignore
    return window.monaco.editor.getModels()[0].getValue();
  });
}
