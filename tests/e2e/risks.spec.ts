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
import { parseColor } from "./audit-color.ts";
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

// The computed body ink: the shell CSS declares the --tambor-* palette
// and switches it on the prefers-color-scheme media query, so these are
// the resolved values a visitor actually sees (string body: the repo
// tsconfig has no DOM lib).
async function bodyInk(
  page: Page,
): Promise<{ background: string; foreground: string }> {
  return (await page.evaluate(
    `(() => {
      const cs = getComputedStyle(document.body);
      return { background: cs.backgroundColor, foreground: cs.color };
    })()`,
  )) as { background: string; foreground: string };
}

// The WCAG 2.x sRGB linearisation of one 0..255 channel.
function linearChannel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

// WCAG 2.x relative luminance of a computed rgb() color; parseColor
// (audit-color.ts) owns the string form the browser returns.
function luminanceOf(style: string): number {
  const rgb = parseColor(style);
  if (rgb === null) throw new Error(`unparsed computed color: ${style}`);
  return (
    0.2126 * linearChannel(rgb[0]) +
    0.7152 * linearChannel(rgb[1]) +
    0.0722 * linearChannel(rgb[2])
  );
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

test.describe("small screens at 380px", () => {
  // Was a recorded expected-fail (~8px nav overflow). add-demo-visual-
  // polish task 5.2 replaced the fixture blurb's fixed width with
  // max-width and centred the stage, so the page no longer widens; the
  // check stays as a regular regression guard.
  test("no horizontal overflow at 380px", async ({ page }, testInfo) => {
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

test.describe("risk: dark-mode tokens are consumed", () => {
  test.use({ colorScheme: "dark" });

  // The shell palette is CSS (the media query paints it), and the drawn
  // demos read the ambient matcher live, so emulating dark must change
  // what is painted, not just what matchMedia reports. Both comparisons
  // are fresh pages under their own media emulation.
  test("emulated dark repaints the body and inverts the ink", async ({
    page,
  }) => {
    await open(page);
    const dark = await bodyInk(page);
    await page.emulateMedia({ colorScheme: "light" });
    await open(page);
    const light = await bodyInk(page);

    expect(dark.background).not.toBe(light.background);
    const darkBackground = luminanceOf(dark.background);
    expect(darkBackground).toBeLessThan(0.2);
    expect(luminanceOf(dark.foreground)).toBeGreaterThan(darkBackground);
    // the light run stays the readable light shell (the fallback story)
    expect(luminanceOf(light.background)).toBeGreaterThan(0.2);
    expect(luminanceOf(light.foreground)).toBeLessThan(
      luminanceOf(light.background),
    );
  });
});

test.describe("touch targets", () => {
  // Was a recorded expected-fail (native buttons ~21px tall). The
  // corpus button_bounds floor (max(label + 12, 44) per axis, task 2 of
  // add-demo-visual-polish) and the shell nav's 44px minimum landed, so
  // every native button now meets the floor; the check stays as a
  // regular regression guard.
  test("every native button meets the 44px touch-target floor", async ({
    page,
  }) => {
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
