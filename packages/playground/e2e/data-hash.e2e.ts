import { expect, test } from "@playwright/test";

// One extensional so the Data panel renders an editable CSV textarea.
// Loaded via `#p=` with `&norun` so nothing executes — we only care that
// the data buffer survives a round-trip through the URL hash.
const PROGRAM = [
  "input predicate person(name: string, age: integer).",
  "adult(N) :- person(N, A), A >= 18.",
  "?- adult(N).",
].join("\n");

const CSV = "name,age\nalice,30\nbob,17\n";

test.describe("extensional data in the URL hash", () => {
  test("data typed in the Data panel persists across a reload", async ({ page }) => {
    await page.goto(`/#p=${encodeURIComponent(PROGRAM)}&norun`);
    await expect(page.locator(".cm-editor")).toBeVisible();

    // The Data panel shows one entry for `person`; fill its CSV textarea.
    const textarea = page.locator("#data-entry-person");
    await expect(textarea).toBeVisible();
    await textarea.fill(CSV);

    // The hash should now carry a `d=` data param in addition to `p=`.
    await expect.poll(() => page.evaluate(() => location.hash)).toContain("d=");

    // Reload from the (replaceState-updated) URL and confirm the buffer
    // came back rather than resetting to an empty/seeded textarea.
    await page.reload();
    await expect(page.locator(".cm-editor")).toBeVisible();
    await expect(page.locator("#data-entry-person")).toHaveValue(CSV);
  });

  test("a program-only link (no d=) loads with empty data", async ({ page }) => {
    await page.goto(`/#p=${encodeURIComponent(PROGRAM)}&norun`);
    await expect(page.locator(".cm-editor")).toBeVisible();
    // Untouched CSV textarea is seeded display-only with the header row,
    // not real buffered data — so it shows just the declared columns.
    await expect(page.locator("#data-entry-person")).toHaveValue("name,age\n");
  });
});
