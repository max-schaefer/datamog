import { expect, test } from "@playwright/test";

// A minimal program that trips the finiteness analyser: `Y = X + 1`
// inside a recursive rule means the value flow lies on a cycle through
// an arithmetic op, which the analyser reports as
// "potentially-infinite-column". Loaded via the `#p=` URL fragment with
// `&norun` so we don't actually execute it — we only need the linter to
// fire.
const INFINITE_PROGRAM = "s(0).\ns(Y) :- s(X), Y = X + 1.";

const WARNING_SELECTOR = ".cm-editor .cm-lintRange-warning";
const HIDE_BUTTON_SELECTOR = 'button[aria-label="Hide warnings"]';
const SHOW_BUTTON_SELECTOR = 'button[aria-label="Show warnings"]';

test.describe("finiteness-warning visibility toggle", () => {
  test("hides and re-shows the squigglies", async ({ page }) => {
    await page.goto(`/#p=${encodeURIComponent(INFINITE_PROGRAM)}&norun`);

    // Wait for the editor to mount and the linter's first pass to land.
    await expect(page.locator(WARNING_SELECTOR).first()).toBeVisible();
    const initialCount = await page.locator(WARNING_SELECTOR).count();
    expect(initialCount).toBeGreaterThan(0);

    // Click the toggle — default state is "warnings shown", so the
    // button is labelled "Hide warnings".
    await page.locator(HIDE_BUTTON_SELECTOR).click();
    await expect(page.locator(WARNING_SELECTOR)).toHaveCount(0);

    // Click again to re-show.
    await page.locator(SHOW_BUTTON_SELECTOR).click();
    await expect(page.locator(WARNING_SELECTOR).first()).toBeVisible();
    expect(await page.locator(WARNING_SELECTOR).count()).toBe(initialCount);
  });

  test("preference survives a reload", async ({ page }) => {
    await page.goto(`/#p=${encodeURIComponent(INFINITE_PROGRAM)}&norun`);

    await expect(page.locator(WARNING_SELECTOR).first()).toBeVisible();
    await page.locator(HIDE_BUTTON_SELECTOR).click();
    await expect(page.locator(WARNING_SELECTOR)).toHaveCount(0);

    await page.reload();

    // After reload the toggle should be in the "Show warnings" state
    // (warnings hidden, persisted via localStorage). The editor needs a
    // moment to mount; the locator's auto-wait handles the timing.
    await expect(page.locator(SHOW_BUTTON_SELECTOR)).toBeVisible();
    await expect(page.locator(WARNING_SELECTOR)).toHaveCount(0);
  });
});
