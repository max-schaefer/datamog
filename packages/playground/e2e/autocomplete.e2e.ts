import { expect, test } from "@playwright/test";

// A minimal program with one extensional and one rule-defined predicate
// so the popup has both kinds of user-declared names to surface. Loaded
// via `#p=` with `&norun` so the linter fires but the program isn't
// executed (no query, and we don't need any results).
const PROGRAM = [
  "extensional person(name: string, age: integer).",
  "adult(N) :- person(N, A), A >= 18.",
].join("\n");

test.describe("editor autocomplete", () => {
  test("Ctrl-Space surfaces user predicates and built-ins", async ({ page, browserName }) => {
    await page.goto(`/#p=${encodeURIComponent(PROGRAM)}&norun`);
    await expect(page.locator(".cm-editor")).toBeVisible();

    // Click into the editor so it owns the focus. The editor extends a
    // click handler over its content area; focusing the contenteditable
    // directly via `.focus()` is brittle across CodeMirror versions.
    await page.locator(".cm-content").click();
    // `Mod+End` (Ctrl on Linux/Windows, Cmd on macOS) is the default
    // keymap binding for "cursor to end of document". Use `Meta` on
    // webkit and `Control` everywhere else; the playwright config only
    // ships chromium-on-Linux, but the conditional keeps the test
    // portable if that ever changes.
    const ctrl = browserName === "webkit" ? "Meta" : "Control";
    await page.keyboard.press(`${ctrl}+End`);
    // Pop a fresh line and trigger the completion popup explicitly.
    // Implicit activation depends on `activateOnTypingDelay`, which
    // would race with the test's keyboard input — Ctrl-Space sidesteps
    // the timing question.
    await page.keyboard.press("Enter");
    await page.keyboard.press(`${ctrl}+Space`);

    const popup = page.locator(".cm-tooltip-autocomplete");
    await expect(popup).toBeVisible();
    // User-declared predicate (extensional).
    await expect(popup.getByText("person", { exact: true })).toBeVisible();
    // User-declared predicate (rule head).
    await expect(popup.getByText("adult", { exact: true })).toBeVisible();
    // A built-in function name should be in the same pool.
    await expect(popup.getByText("upper", { exact: true })).toBeVisible();
    // A reserved keyword should be in the same pool too.
    await expect(popup.getByText("extensional", { exact: true })).toBeVisible();
  });

  test("Tab accepts the open completion (does not insert a tab)", async ({ page, browserName }) => {
    await page.goto(`/#p=${encodeURIComponent(PROGRAM)}&norun`);
    await expect(page.locator(".cm-editor")).toBeVisible();

    // Same open-the-popup sequence as the test above (a fresh line +
    // Ctrl-Space), which avoids the contenteditable typing path that
    // hangs `keyboard.type` here.
    await page.locator(".cm-content").click();
    const ctrl = browserName === "webkit" ? "Meta" : "Control";
    await page.keyboard.press(`${ctrl}+End`);
    await page.keyboard.press("Enter");
    await page.keyboard.press(`${ctrl}+Space`);

    const popup = page.locator(".cm-tooltip-autocomplete");
    await expect(popup).toBeVisible();

    const cmText = () => page.locator(".cm-content").evaluate((el) => el.textContent ?? "");
    const before = await cmText();

    // Tab should accept the selected completion. The regression this
    // guards: Tab fell through to `indentWithTab` and inserted a literal
    // tab instead of accepting the popup's selection.
    await page.keyboard.press("Tab");
    await expect(popup).toBeHidden();

    const after = await cmText();
    // Something was inserted (the completion), and it wasn't a tab.
    expect(after.length).toBeGreaterThan(before.length);
    expect(after).not.toContain("\t");
  });
});
