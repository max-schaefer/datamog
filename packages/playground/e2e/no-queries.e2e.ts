import { expect, test } from "@playwright/test";

// A complete, error-free program with rules but no `?-` query: the
// playground would have nothing to display, so the Run button should
// be disabled with a tooltip pointing at the missing query.
const NO_QUERY_PROGRAM = [
  "extensional input(x: integer).",
  "double(Y) :- input(X), Y = X * 2.",
].join("\n");

test.describe("Run button gating on missing query", () => {
  test("Run is disabled until a query is added", async ({ page }) => {
    await page.goto(`/#p=${encodeURIComponent(NO_QUERY_PROGRAM)}&norun`);

    // Wait for the editor to mount; the linter's first pass tells the
    // App whether the program has a query.
    await expect(page.locator(".cm-editor")).toBeVisible();

    const runButton = page.getByRole("button", { name: /^Run/ });
    // Auto-wait: the linter is async, so the disabled+tooltip state
    // becomes true on the first lint result.
    await expect(runButton).toBeDisabled();
    await expect(runButton).toHaveAttribute("title", /Add a `\?- \.\.\.` query/);
  });
});
