// Purpose: the gallery Playwright pass (tambor-y9d.4) — every demo
//   mounted through the real dist/spa.js bundle in a real browser:
//   screenshots per demo per state (the HITL review artifact) plus the
//   scripted interactions the corpus semantics predict.
// Responsibilities: per-demo smoke (nav, blurb, drawn content), counter
//   dec/inc, todo add via the button + filter switch + restart,
//   dropdown open + select + close, logo run + clear + slider pointer
//   drag — each with a named screenshot of the reached state.
// Rationale: openspec demo specs are the design authorities — the
//   assertions here are the same corpus semantics the jsdom contract
//   tests verify, driven through the real pointer wire of a real
//   browser (surface hit-testing at view-space coordinates, mouse-move
//   drag chains). Interactions whose targets sit at live-state
//   positions replay the same intents on an in-process app to re-derive
//   the live view (replayView); the rest use the fresh-view scan
//   (buttonPoint) — the same centreOf pattern the contract tests use.
//   The known-limitation risks (typing/focus, dark tokens, touch
//   targets, below-fold reach) live in risks.spec.ts where they are
//   measured, not asserted away here.

import { expect, test, type Page } from "@playwright/test";
import {
  clickDrawnText,
  drawnText,
  navTo,
  open,
  shot,
} from "./drive.ts";

// Derived from the gallery registry (the bench apps extended it; a
// literal here went stale and failed every mounts-test — tambor-ibh).
import { DEMOS } from "../../src/spa/gallery.ts";
const DEMO_IDS = DEMOS.map((d) => d.id);
// id -> drawn nav title (the select demo's id differs from its title).
const NAV_TITLES: Readonly<Record<string, string>> = {
  ...Object.fromEntries(DEMOS.map((d) => [d.id, d.title])),
};

async function gotoDemo(page: Page, id: string): Promise<void> {
  await open(page);
  await navTo(page, NAV_TITLES[id] ?? id);
}

test.describe("gallery smoke + screenshots", () => {
  for (const id of DEMO_IDS) {
    test(`${id}: mounts with nav, blurb and drawn content`, async ({
      page,
    }, testInfo) => {
      await gotoDemo(page, id);
      const navButtons = await page.locator("nav button").count();
      expect(navButtons).toBe(DEMO_IDS.length);
      await expect(page.locator("nav button.active")).toHaveText(
        NAV_TITLES[id] ?? id,
      );
      await expect(page.locator("#demo .blurb")).not.toBeEmpty();
      const text = await drawnText(page);
      expect(text.length).toBeGreaterThan(0);
      await shot(page, `${id}-initial`, testInfo.project.name);
    });
  }
});

test.describe("counter", () => {
  test("inc and dec move the label", async ({ page }, testInfo) => {
    await gotoDemo(page, "counter");
    await clickDrawnText(page, "+");
    await clickDrawnText(page, "+");
    await clickDrawnText(page, "-");
    const text = await drawnText(page);
    // 5 + 2 - 1
    expect(text).toContain("6");
    await shot(page, "counter-after-inc-inc-dec", testInfo.project.name);
  });
});

test.describe("todo", () => {
  // Each row draws its delete X as two red rectangles, so the row
  // count is observable as the red-drawn count (the appended row's
  // description is empty — Add Todo carries the unfocused textarea's
  // state text, see risks.spec.ts for the typing finding).
  test("Add Todo appends an entry and restart resets", async ({
    page,
  }, testInfo) => {
    await gotoDemo(page, "todo");
    const reds = page.locator('#demo > div div[style*="rgb(255, 0, 0)"]');
    expect(await reds.count()).toBe(6);
    await clickDrawnText(page, "Add Todo");
    expect(await reds.count()).toBe(8);
    await shot(page, "todo-after-add", testInfo.project.name);
    // restart: nav away and back re-mounts fresh (unmount + fresh state)
    await navTo(page, "counter");
    await navTo(page, "todo");
    expect(await reds.count()).toBe(6);
    await shot(page, "todo-after-restart", testInfo.project.name);
  });

  test("filter row switches the visible rows", async ({ page }, testInfo) => {
    await gotoDemo(page, "todo");
    // the toggle options are handler nodes drawing their label — click the
    // drawn label's live box (DOM ground truth, tambor-0rp)
    await clickDrawnText(page, "complete");
    const text = await drawnText(page);
    expect(text).toContain("third");
    expect(text).not.toContain("first");
    await shot(page, "todo-filter-complete", testInfo.project.name);
  });
});

test.describe("dropdown", () => {
  test("tap header opens, tap option selects and closes", async ({
    page,
  }, testInfo) => {
    await gotoDemo(page, "dropdown");
    // the closed header draws the gray "no selection" label — click its
    // drawn box (DOM ground truth, tambor-0rp)
    await clickDrawnText(page, "no selection");
    const opened = await drawnText(page);
    expect(opened).toContain("Uno");
    await shot(page, "dropdown-open", testInfo.project.name);
    await clickDrawnText(page, "Dos");
    const after = await drawnText(page);
    expect(after).toContain("Dos");
    expect(after).not.toContain("Uno");
    await shot(page, "dropdown-selected", testInfo.project.name);
  });
});

test.describe("logo", () => {
  test("Run appends a fold entry: cursor 0/0 → 1/1", async ({
    page,
  }, testInfo) => {
    await gotoDemo(page, "logo");
    expect(await drawnText(page)).toContain("0/0");
    // The stale-draw bug the annotation covered (tambor-a45): the Run
    // click always routed and the worker replied, but the async
    // run-applied apply bypassed the mount's draw wire — the fold stayed
    // 0/0 on screen forever. Fixed by drawing after every app.dispatch.
    await clickDrawnText(page, "Run");
    expect(await drawnText(page)).toContain("1/1");
    await shot(page, "logo-after-run", testInfo.project.name);
  });

  test("Clear world empties the fold", async ({ page }, testInfo) => {
    await gotoDemo(page, "logo");
    await clickDrawnText(page, "Run");
    expect(await drawnText(page)).toContain("1/1");
    // the buttons row shifted with the grown world — the drawn box of
    // "Clear world" IS the live position (DOM ground truth)
    await clickDrawnText(page, "Clear world");
    expect(await drawnText(page)).toContain("0/0");
    await shot(page, "logo-after-clear", testInfo.project.name);
  });

  test("slider pointer rewinds the cursor (3 → 0 → 2)", async ({
    page,
  }, testInfo) => {
    await gotoDemo(page, "logo");
    // three fold entries — each Run click targets the drawn button's
    // live box (DOM ground truth), so the growing row needs no replay
    for (let i = 0; i < 3; i++) {
      await clickDrawnText(page, "Run");
    }
    expect(await drawnText(page)).toContain("3/3");
    await shot(page, "logo-3-entries", testInfo.project.name);
    // the track: the 150-wide rectangle of the time-travel row — located
    // in the LIVE drawn DOM (a 150px-wide absolute div), not replayed
    const track = page
      .locator('#demo div[style*="width: 150px"]')
      .last();
    // pointer down on the track's left third rewinds the cursor to the
    // mapped value (35/150 of [0..3] → 0): 3/3 → 0/3. The full drag
    // gesture is asserted as far as the wire supports it — see
    // risks.spec.ts: the browser wire never delivers mouse-move-global,
    // so mid-drag tracking (slider_gesture's move updates) is dead and
    // every value update re-derives the world, shifting the layout
    // under the pointer (recorded findings, HITL review).
    const box = await track.boundingBox();
    if (box === null) throw new Error("slider track has no box");
    await page.mouse.click(box.x + 35, box.y + box.height / 2);
    expect(await drawnText(page)).toContain("0/3");
    await shot(page, "logo-after-slider-pointerdown", testInfo.project.name);
    // a second pointerdown further right maps to entry 2 — the LIVE
    // box again (the locator re-resolves after the world re-derived)
    const box2 = await track.boundingBox();
    if (box2 === null) throw new Error("slider track has no box");
    await page.mouse.click(box2.x + box2.width - 35, box2.y + box2.height / 2);
    expect(await drawnText(page)).toContain("2/3");
    await shot(page, "logo-after-slider-tap-right", testInfo.project.name);
  });
});
