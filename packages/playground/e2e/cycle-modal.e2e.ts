import { expect, test } from "@playwright/test";

// Same finiteness-tripping program as warnings-toggle.e2e.ts: the
// recursive `Y = X + 1` produces a single warning on column 1 of `s`,
// with a one-node SCC (s[1] → s[1] via a growing edge).
const INFINITE_PROGRAM = "s(0).\ns(Y) :- s(X), Y = X + 1.";

test.describe("finiteness-cycle modal", () => {
  test("Show cycle action opens a modal with the offending predicate", async ({ page }) => {
    await page.goto(`/#p=${encodeURIComponent(INFINITE_PROGRAM)}&norun`);

    // Wait for the linter to run and produce a warning squiggly.
    const squiggly = page.locator(".cm-editor .cm-lintRange-warning").first();
    await expect(squiggly).toBeVisible();

    // Hover the squiggly to open the CodeMirror lint tooltip; the
    // "Show cycle" action button lives inside it.
    await squiggly.hover();
    const action = page.getByRole("button", { name: "Show cycle" });
    await expect(action).toBeVisible();

    await action.click();

    // The modal is rendered as a native <dialog>; data-testid lets us
    // grab it without relying on whatever DOM tree mermaid happens to
    // build inside.
    const modal = page.getByTestId("cycle-modal");
    await expect(modal).toBeVisible();

    // The diagram should mention the predicate column. Labels are an
    // elided form of the recursive rule's head, so for `s(Y) :- ...`
    // we expect "s(Y)". Mermaid renders labels as <span>/<text> inside
    // the SVG, so a substring match on the modal's text content is the
    // most resilient assertion.
    await expect(modal).toContainText("s(Y)");

    // The participating spans in the editor should light up while the
    // modal is open. For `s(0). s(Y) :- s(X), Y = X + 1.` the analyser
    // emits spans for the head args of both rules (the `0` and the `Y`)
    // and the body atom arg (the `X`).
    const highlights = page.locator(".cm-editor .cm-cycle-highlight");
    await expect(highlights).not.toHaveCount(0);

    // Close with Escape — native <dialog> handles this for free.
    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
    // Highlights clear when the modal closes (and the mouse is no
    // longer over the squiggly, since Escape moved focus).
    await page.mouse.move(0, 0);
    await expect(highlights).toHaveCount(0);
  });

  test("Hovering the squiggly lights up the cycle without opening the modal", async ({ page }) => {
    await page.goto(`/#p=${encodeURIComponent(INFINITE_PROGRAM)}&norun`);

    const squiggly = page.locator(".cm-editor .cm-lintRange-warning").first();
    await expect(squiggly).toBeVisible();

    const highlights = page.locator(".cm-editor .cm-cycle-highlight");
    await expect(highlights).toHaveCount(0);

    // Hover the squiggly: cycle highlight should appear without us
    // having ever clicked the "Show cycle" action.
    await squiggly.hover();
    await expect(highlights.first()).toBeVisible();
    await expect(page.getByTestId("cycle-modal")).toBeHidden();

    // Mouse off (over the editor's whitespace) — highlight clears.
    const editor = page.locator(".cm-editor");
    const box = await editor.boundingBox();
    if (!box) throw new Error("editor not laid out");
    await page.mouse.move(box.x + box.width - 5, box.y + box.height - 5);
    await expect(highlights).toHaveCount(0);
  });
});
