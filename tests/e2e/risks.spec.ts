// Purpose: the named-risk probes (tambor-y9d.4, F05 brief) — the five
//   real-browser risks the session repo named for the gallery: the
//   keep-node swap carrying a live textarea across re-derivation,
//   focus restoration via data-id, slider drag on touch, small screens
//   (380px) and dark-mode tokens.
// Responsibilities: each risk is scripted against its IDEAL behavior;
//   where the risk is real (the current wire cannot pass it) the test
//   carries a test.fail annotation naming the recorded finding — the
//   suite stays green, the failure is on record, and if the corpus
//   later fixes the wire the test flips to a red "unexpectedly
//   passed". Passing tests assert the behavior that does work (touch
//   taps on the slider track).
// Rationale: this is the HITL lane — findings need human review, not
//   green-washing. The annotations carry the finding text the reviewer
//   reads (bd comment tambor-y9d.4 lists the same findings).

import { expect, test, type Page } from "@playwright/test";
import {
  clickDrawnText,
  clickView,
  drawnText,
  open,
  shot,
} from "./drive.ts";

// The todo demo's new-todo textarea sits at translate(30, 10) beside
// the Add Todo button (its empty track is ~10 units wide).
const TODO_TA: readonly [number, number] = [31, 10.5];

// The count of drawn delete-X red rectangles: 2 per todo row.
async function redRows(page: Page): Promise<number> {
  return page.locator('#demo > div div[style*="rgb(255, 0, 0)"]').count();
}

test.describe("risk: keep-node swap / live textarea (todo)", () => {
  // FINDING (recorded, expected-fail): the SPA wire never applies the
  // textarea's request-focus intent — wireSurface forwards intents to
  // app.dispatch whose defaultHandler ignores request-focus, and the
  // view context focus is never threaded — so the new-todo textarea
  // never focuses and every keypress is dropped (keys_need_focus).
  test("typing into the new-todo textarea edits the scratch and survives redraws", async ({
    page,
  }) => {
    test.fail(true, "request-focus is dropped by the SPA wire: typing edits nothing");
    await open(page);
    await clickView(page, TODO_TA);
    await page.keyboard.type("hello");
    // the redraw round trip (any click re-draws) must carry the typed
    // scratch — the keep-node property
    await clickDrawnText(page, "Add Todo");
    expect(await drawnText(page)).toContain("hello");
  });

  // RESOLVED (tambor-0rp layout parity): with real text metrics the
  // textarea renders where the view says it is — a click gives it REAL
  // browser focus natively, so typed keys land and Enter triggers the
  // add. The request-focus WIRE gap remains for programmatic focus
  // restoration (see the data-id finding below) but no longer blocks
  // the click-to-type path.
  test("Enter in the new-todo textarea appends the typed todo", async ({
    page,
  }) => {
    await open(page);
    await clickView(page, TODO_TA);
    await page.keyboard.type("hello");
    await page.keyboard.press("Enter");
    expect(await redRows(page)).toBe(8);
  });

  // FINDING (recorded, expected-fail): no data-id anchor exists in the
  // drawn DOM at all — focus restoration across re-derivation has no
  // mechanism to anchor to.
  test("the drawn tree carries data-id anchors for focus restoration", async ({
    page,
  }) => {
    test.fail(true, "no data-id anchors in the drawn DOM: focus restoration is unanchored");
    await open(page);
    // string form: the callback runs in the browser and the repo
    // tsconfig has no DOM lib (lib-free core by design)
    const anchored = await page.evaluate(
      "document.querySelectorAll('[data-id]').length",
    );
    expect(anchored).toBeGreaterThan(0);
  });
});

test.describe("risk: slider touch tap (works)", () => {
  // PASSES: a touch tap on the track is a pointerdown — the value maps
  // from the tap position (slider_gesture's down update). Asserted on
  // the touch project through CDP touch events (real touch synthesis).
  test("touch tap on the track maps the value", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-380", "touch project only");
    await open(page);
    await page.getByRole("button", { name: "logo" }).click();
    for (let i = 0; i < 3; i++) {
      await clickDrawnText(page, "Run");
    }
    // the track: the 150-wide absolute div in the LIVE drawn DOM
    // (tambor-0rp: real metrics live in the bundle, not in a node-side
    // replay — DOM ground truth is the only honest coordinate source)
    const track = page.locator('#demo div[style*="width: 150px"]').last();
    const box = await track.boundingBox();
    if (box === null) throw new Error("slider track has no box");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: box.x + 35, y: box.y + box.height / 2 }],
    });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    expect(await drawnText(page)).toContain("0/3");
  });
});

test.describe("risk: slider drag tracking", () => {
  // FINDING (recorded, expected-fail): mid-drag tracking is dead in the
  // browser — the slider's move handler listens on mouse-move-global,
  // but normalizeDOMEvent delivers browser pointermove as plain
  // mouse-move, which never matches a global handler. Worse, every
  // value update re-derives the logo world, shifting the layout under
  // the pointer mid-drag (the corpus's touch capture —
  // slider_pointer_capture — cannot compensate through this wire).
  test("a full pointer drag tracks the value to its endpoint", async ({
    page,
  }) => {
    test.fail(true, "browser wire never delivers mouse-move-global: drag tracking dead");
    await open(page);
    await page.getByRole("button", { name: "logo" }).click();
    for (let i = 0; i < 3; i++) {
      await clickDrawnText(page, "Run");
    }
    // the track: the 150-wide absolute div in the LIVE drawn DOM
    const track = page.locator('#demo div[style*="width: 150px"]').last();
    const tbox = await track.boundingBox();
    if (tbox === null) throw new Error("slider track has no box");
    await page.mouse.move(tbox.x + 35, tbox.y + tbox.height / 2);
    await page.mouse.down();
    await page.mouse.move(tbox.x + tbox.width - 35, tbox.y + tbox.height / 2, { steps: 8 });
    await page.mouse.up();
    // the drag endpoint (centre+40 → local 115 → value 2)
    expect(await drawnText(page)).toContain("2/3");
  });
});

test.describe("risk: small screens (380px)", () => {
  test("no horizontal overflow on desktop", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "desktop control");
    await open(page);
    const [scrollWidth, clientWidth] = (await page.evaluate(
      "(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])()",
    )) as readonly [number, number];
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});

test.describe("risk: small screens at 380px", () => {
  // FINDING (recorded, expected-fail on the 380px project): the nav row
  // overflows the 380px viewport by ~8px (scrollWidth 388) — horizontal
  // panning on a small phone.
  test("no horizontal overflow at 380px", async ({ page }, testInfo) => {
    test.fail(true, "nav row overflows the 380px viewport by ~8px");
    test.skip(testInfo.project.name !== "mobile-380", "380px project only");
    await open(page);
    const [scrollWidth, clientWidth] = (await page.evaluate(
      "(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])()",
    )) as readonly [number, number];
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});

test.describe("risk: dark-mode tokens", () => {
  test.use({ colorScheme: "dark" });

  test("dark screenshots of the todo and logo demos", async ({
    page,
  }, testInfo) => {
    await open(page);
    await shot(page, "todo-dark", testInfo.project.name);
    await page.getByRole("button", { name: "logo" }).click();
    await shot(page, "logo-dark", testInfo.project.name);
    // the emulation itself is in force (the page sees the dark scheme)
    const scheme = await page.evaluate(
      'window.matchMedia("(prefers-color-scheme: dark)").matches',
    );
    expect(scheme).toBe(true);
  });
});

test.describe("risk: dark-mode tokens are unwired", () => {
  test.use({ colorScheme: "dark" });

  // FINDING (recorded, expected-fail): the tokens exist (ui/theme.ts
  // resolves every token in both schemes — its contract tests pass),
  // but the gallery SPA never consumes them: the page CSS and the
  // drawn colors are light-scheme literals, so emulating
  // prefers-color-scheme dark changes nothing on screen.
  test("the page carries dark-scheme CSS rules", async ({ page }) => {
    test.fail(true, "gallery never consumes the theme tokens: no dark-scheme rules exist");
    await open(page);
    // the ideal: the stylesheet carries prefers-color-scheme rules the
    // tokens would live behind
    const hasDarkRules = (await page.evaluate(
      `(() => {
        for (const sheet of Array.from(document.styleSheets)) {
          for (const rule of Array.from(sheet.cssRules)) {
            const text = rule.constructor.name === "CSSMediaRule"
              ? rule.conditionText
              : "";
            if (text.includes("prefers-color-scheme: dark")) return true;
          }
        }
        return false;
      })()`,
    )) as boolean;
    expect(hasDarkRules).toBe(true);
  });
});

test.describe("risk: touch targets", () => {
  // FINDING (recorded, expected-fail): the native buttons render at
  // ~21px height (nav 41–75×21, drawn 72×21) — under every mobile
  // touch-target floor (44px Apple / 48dp Material); the corpus draws
  // geometry in unit-space (buttons ~1 unit tall), so the DOM mirrors
  // inherit the browser's intrinsic 21px button height.
  test("every native button meets the 44px touch-target floor", async ({
    page,
  }) => {
    test.fail(true, "buttons render ~21px tall: under the 44px touch-target floor");
    await open(page);
    const sizes = (await page.evaluate(
      `Array.from(document.querySelectorAll("nav button, #demo > div button"))
        .map((b) => {
          const r = b.getBoundingClientRect();
          return { w: r.width, h: r.height };
        })`,
    )) as readonly { w: number; h: number }[];
    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) {
      expect(Math.min(s.w, s.h)).toBeGreaterThanOrEqual(44);
    }
  });
});
