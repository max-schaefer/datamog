import { expect, test } from "@playwright/test";

// Drives the generated embed tutorial page (/tutorial.html, produced by
// `tutorial:html` from doc/embed-tutorials/getting-started.md). Proves phase 3:
// the renderer turns fenced ```datamog blocks into mounted embeds with the
// sibling CSV data inlined, while the surrounding prose renders normally.
test.describe("embed tutorial page", () => {
  test("renders prose and mounts an embed per datamog block", async ({ page }) => {
    await page.goto("/tutorial.html");
    await expect(page.locator("h1")).toContainText("Getting started");
    // Three fenced datamog blocks in the source → three mounted editors.
    await expect(page.locator(".datamog-embed .cm-editor")).toHaveCount(3);
  });

  test("a query runs against the inlined sibling CSV data", async ({ page }) => {
    await page.goto("/tutorial.html");
    // The second block computes reachable(X); edge.csv reaches b, c, d from "a".
    const block = page.locator(".datamog-embed").nth(1);
    await block.locator(".datamog-embed-runquery").click();
    // The result opens in a popover appended to <body> (for typography
    // isolation), so it is page-scoped rather than nested in the embed.
    const table = page.locator(".datamog-embed-result-popover .datamog-embed-table");
    await expect(table.locator("tbody tr")).toHaveCount(3);
    await expect(table.locator("tbody td", { hasText: "d" })).toBeVisible();
  });
});
