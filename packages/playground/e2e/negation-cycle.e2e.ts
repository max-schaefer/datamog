import { expect, test } from "@playwright/test";

// `a` and `b` are mutually recursive with a negation between them, so
// the analyser rejects the program with a non-stratified-negation
// error. The error squiggly carries the same "Show cycle" affordance
// as the finiteness warnings — the cycle here is at the predicate
// level, with one edge marked as the offending `not`.
const NEGATION_PROGRAM = [
  "extensional input(x: integer).",
  "a(X) :- input(X), not b(X).",
  "b(X) :- a(X).",
].join("\n");

test.describe("non-stratified-negation cycle modal", () => {
  test("error squiggly carries Show cycle action and lights up the predicates", async ({
    page,
  }) => {
    await page.goto(`/#p=${encodeURIComponent(NEGATION_PROGRAM)}&norun`);

    // Errors render in red — different class from the warning case.
    const squiggly = page.locator(".cm-editor .cm-lintRange-error").first();
    await expect(squiggly).toBeVisible();

    // Hover-driven highlight should pick up the negation cycle's
    // predicate-name spans without us having to open the modal.
    await squiggly.hover();
    const highlights = page.locator(".cm-editor .cm-cycle-highlight");
    await expect(highlights.first()).toBeVisible();

    // Click the action — this is the same Show cycle button the
    // finiteness flow uses, just attached to an error diagnostic.
    const action = page.getByRole("button", { name: "Show cycle" });
    await expect(action).toBeVisible();
    await action.click();

    const modal = page.getByTestId("cycle-modal");
    await expect(modal).toBeVisible();
    // Title differs from the finiteness case.
    await expect(modal).toContainText("Stratification cycle");
    // Both predicates appear as nodes.
    await expect(modal).toContainText("a");
    await expect(modal).toContainText("b");
    // The offending edge carries a `not` label.
    await expect(modal).toContainText("not");

    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
  });

  test("Run button is disabled while there are errors", async ({ page }) => {
    await page.goto(`/#p=${encodeURIComponent(NEGATION_PROGRAM)}&norun`);

    // Wait for the linter to land — without this, the assertion races
    // the initial lint pass.
    await expect(page.locator(".cm-editor .cm-lintRange-error").first()).toBeVisible();

    const runButton = page.getByRole("button", { name: /^Run/ });
    await expect(runButton).toBeDisabled();
    await expect(runButton).toHaveAttribute("title", /Fix the errors/);
  });
});
