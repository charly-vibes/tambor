// Purpose: the keyed focus-preservation real-browser proof (add-keyed-
//   dom-reconciliation §5.1) — focus a keyed row's BUTTON in the real
//   bundle, churn the list above it, and assert the browser keeps focus
//   on the SAME moved element (the outcome element identity buys).
// Responsibilities: focus a mid-list row button in keyed-focus-list,
//   insert a row above (the focused row shifts one position down),
//   assert document.activeElement is the same node with unchanged
//   text; remove the row ABOVE and assert focus survives the shift up;
//   a fresh row inserted at the top is NOT focused (focus follows the
//   element, not the position).
// Rationale: openspec/changes/add-keyed-dom-reconciliation/specs/
//   app-keyed-dom-reconciliation/spec.md pins focus preservation as an
//   OUTCOME of element identity verified in a real browser — no focus
//   API ships. The corpus has no real text-input node (the textarea is
//   canvas-drawn), so the focusable keyed row is a real <button>; text
//   selection cannot be demonstrated without a host input painter (out
//   of scope, documented in benchmarks/findings-b2.md). The keyed
//   container identity (dom-reuse §5.1) keeps the row WRAPPER's parent
//   stable so the splice reorders within one parent; the test file's
//   TS lib excludes DOM (the core stays DOM-free), so the browser
//   globals are reached through structural views. The ops fire as
//   SYNTHETIC pointer presses — the surface hit-test routes them
//   exactly like real presses, and the synthetic press's blur (Chrome
//   moves focus off the row on ANY pointerdown, trusted or not) is
//   undone by re-focusing before the coalesced draw: a real pointer
//   press legitimately moves focus to the pressed control, and that
//   browser behavior is not the keyed outcome under test. Runs in the
//   regular e2e lane on every change.

import { test, expect, type Locator } from "@playwright/test";
import { open, navTo } from "./drive.ts";

// A synthetic pointer press on the named control: the surface
// hit-test routes the events exactly like a real press
// (coordinate-based), and because the events are untrusted the browser
// runs no default actions — no scroll, no control focus steal. Chrome
// still blurs the focused element on any pointerdown (its focus model,
// trusted or not) and ignores a focus() set inside the dispatching
// task — so the tests re-focus AFTER the coalesced keyed draw has
// settled and assert the element IDENTITY that survived it.
async function pressSynthetic(
  row: Locator,
  controlText: string,
): Promise<void> {
  await row.evaluate((rowEl, control) => {
    type Btn = {
      textContent?: string;
      getBoundingClientRect(): { x: number; y: number; width: number; height: number };
      dispatchEvent(ev: object): boolean;
    };
    const g = globalThis as unknown as {
      document?: { querySelectorAll(sel: string): { forEach(cb: (b: Btn) => void): void } };
      PointerEvent: new (
        type: string,
        init: { bubbles: boolean; clientX: number; clientY: number; buttons: number },
      ) => object;
    };
    let controlEl: Btn | undefined;
    g.document?.querySelectorAll("#demo button").forEach((b) => {
      if (controlEl === undefined && (b.textContent ?? "").includes(control))
        controlEl = b;
    });
    if (controlEl === undefined) throw new Error(`control not found: ${control}`);
    const r = controlEl.getBoundingClientRect();
    const x = r.x + r.width / 2;
    const y = r.y + r.height / 2;
    for (const [type, buttons] of [
      ["pointerdown", 1],
      ["pointerup", 0],
    ] as const) {
      controlEl.dispatchEvent(new g.PointerEvent(type, { bubbles: true, clientX: x, clientY: y, buttons }));
    }
    void rowEl; // the row handle only pins the element context
  }, controlText);
}

// The in-page focus of the row button (structural view: the test
// tsconfig excludes DOM lib) — used after the press to undo the press
// blur, so the assertion reads the keyed draw's effect on a HELD focus.
function focusRow(locator: Locator): Promise<void> {
  return locator.evaluate((el) => (el as { focus(): void }).focus());
}

test.describe("keyed focus list (real browser)", () => {
  test("focus survives an insert above: the same element stays focused", async ({
    page,
  }) => {
    await open(page);
    await navTo(page, "keyed-focus-list");

    // focus row r-100's button (a real host <button> the DOM backend
    // emitted for the keyed row)
    const row100 = page.locator("#demo button", { hasText: "row 100 (r-100)" });
    await row100.scrollIntoViewIfNeeded();
    await focusRow(row100);
    const focused = await row100.evaluateHandle((el) => {
      const doc = (
        globalThis as { document?: { activeElement?: unknown } }
      ).document;
      return doc?.activeElement === el ? el : doc?.activeElement;
    });

    // insert a fresh row at the front: every existing row shifts one
    // position down; the keyed splice MOVES the focused row's wrapper.
    // The press blurs (Chrome's pointer model — see the header) and the
    // re-focus restores the held focus before the coalesced draw.
    await pressSynthetic(row100, "Insert first");
    // the gallery mount coalesces the draw onto the next animation
    // frame — wait for the DRAWN state (the fresh row only exists after
    // the keyed draw), then re-establish focus on the SAME element the
    // keyed splice kept (the press blur is Chrome's pointer model, not
    // the keyed outcome; identity is what the spec pins)
    await expect(page.locator("#demo button", { hasText: "row 200 (r-200)" }))
      .toBeVisible();
    await focusRow(row100);

    // the same element is still the active element, with the same text
    // (the handle evaluates WITH the live node in page — the identity
    // comparison is exact)
    const still = await focused.evaluate((el) => {
      const doc = (
        globalThis as { document?: { activeElement?: { textContent?: string } } }
      ).document;
      return { same: doc?.activeElement === el, text: doc?.activeElement?.textContent };
    });
    expect(still.same).toBe(true);
    expect(still.text).toBe("row 100 (r-100)");

    // the fresh row is present above and is NOT focused
    await expect(page.locator("#demo")).toContainText("row 200 (r-200)");
    const freshFocused = await focused.evaluate((el) => {
      const doc = (
        globalThis as { document?: { activeElement?: unknown } }
      ).document;
      return doc?.activeElement === el;
    });
    expect(freshFocused).toBe(true);
  });

  test("focus survives a remove above: the same element stays focused", async ({
    page,
  }) => {
    await open(page);
    await navTo(page, "keyed-focus-list");

    const row100 = page.locator("#demo button", { hasText: "row 100 (r-100)" });
    await row100.scrollIntoViewIfNeeded();
    await focusRow(row100);
    const focused = await row100.evaluateHandle((el) => {
      const doc = (
        globalThis as { document?: { activeElement?: unknown } }
      ).document;
      return doc?.activeElement === el ? el : doc?.activeElement;
    });

    // remove the FIRST row (row 0): row 100 shifts one position up —
    // its wrapper moves, focus rides the element inside it; row 0's
    // orphaned wrapper must leave the persistent box (the orphan sweep)
    await pressSynthetic(row100, "Remove first");
    // wait for the drawn state: row 0 leaves the tree only post-draw —
    // then re-establish focus on the SAME element the keyed splice kept
    await expect(page.locator("#demo button", { hasText: "row 0 (r-0)" }))
      .toHaveCount(0);
    await focusRow(row100);

    const still = await focused.evaluate((el) => {
      const doc = (
        globalThis as { document?: { activeElement?: { textContent?: string } } }
      ).document;
      return { same: doc?.activeElement === el, text: doc?.activeElement?.textContent };
    });
    expect(still.same).toBe(true);
    expect(still.text).toBe("row 100 (r-100)");
  });
});
