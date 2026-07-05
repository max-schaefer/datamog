import { expect, test } from "@playwright/test";

// Two short declarations: enough to shift-select from the start of line 1
// to the start of line 2. Loaded via `#p=` with `&norun` so nothing runs.
const PROGRAM = [
  "extensional clause_lit(c: string, v: integer, pol: integer).",
  "extensional nvars(n: integer).",
].join("\n");

test.describe("active-line highlight vs. selection", () => {
  // Regression test: `highlightActiveLine` used to paint the head line of
  // every selection range. Shift-selecting to the start of the next line
  // put the cursor on that line, washing it full-width in the same colour
  // as the selection so it read as "the whole next line is selected". The
  // custom `highlightActiveLineWhenCollapsed` plugin only highlights empty
  // ranges (plain cursors), so a selection leaves no active-line wash.
  test("no active-line wash while a selection is active", async ({ page, browserName }) => {
    await page.goto(`/#p=${encodeURIComponent(PROGRAM)}&norun`);
    await expect(page.locator(".cm-editor")).toBeVisible();

    // Focus the editor via its content area (focusing the contenteditable
    // directly is brittle across CodeMirror versions).
    await page.locator(".cm-content").click();
    const ctrl = browserName === "webkit" ? "Meta" : "Control";

    // A plain cursor keeps its active-line highlight.
    await page.keyboard.press(`${ctrl}+Home`);
    await expect(page.locator(".cm-activeLine")).toHaveCount(1);

    // Shift-selecting onto the next line must not light up the active line.
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Shift+Home");
    await expect(page.locator(".cm-activeLine")).toHaveCount(0);

    // Collapsing the selection brings the active-line highlight back.
    await page.keyboard.press("ArrowDown");
    await expect(page.locator(".cm-activeLine")).toHaveCount(1);
  });
});
