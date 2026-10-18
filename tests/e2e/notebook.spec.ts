// Purpose: the B9 reactive notebook's e2e fault-path specs (tambor-54j.9)
//   — the four browser behaviors the Node contract cannot see: (a) the
//   textarea focus surviving a re-derive (edit a cell, the Worker reply
//   re-derives the tree, typing continues), (b) many cards (the 200-cell
//   chain renders and the page stays interactive), (c) the small-screen
//   viewport rendering without horizontal overflow, (d) the worker kill
//   switch (a long-running cell killed mid-run reports the typed killed
//   error and the notebook stays usable).
// Responsibilities: drive the real dist/spa.js bundle through the
//   gallery fixture (the gallery.spec pattern: drawn-box clicks for
//   live-state targets, drawn-text assertions for state), with retry-
//   wrapped toContainText for every async Worker reply.
// Rationale: the chat-repo lane's recorded gap — the notebook UI was
//   untested in a real browser (textarea/slider carry-over, 200+ cards,
//   mobile layout); these specs close it against the corpus wire where
//   every finding above lives (focus plumbing, drawn-root sizing, the
//   killable Worker boundary).

import { expect, test, type Page } from "@playwright/test";
import { clickDrawnText, drawnText, navTo, open, shot } from "./drive.ts";

async function gotoDemo(page: Page): Promise<void> {
  await open(page);
  await navTo(page, "notebook");
}

test.describe("notebook — textarea focus across a re-derive", () => {
  // The click gives the textarea real browser focus; request-focus also
  // sets the corpus focus path, so the redrawn tree keeps it focused.
  // Typing continues after the Worker reply's re-derive: the second
  // keystroke lands in the SAME cell (cursor scratch lives in ::extra,
  // plain state — the keep-node property the corpus wires for).
  test("edit a cell, the re-derive lands, typing continues", async ({
    page,
  }, testInfo) => {
    await gotoDemo(page);
    await clickDrawnText(page, "+ cell");
    await clickDrawnText(page, "1 + 1");
    await page.keyboard.type("2");
    // the edit landed and the re-run reply applied: src reads 21 + 1,
    // the cell's value line reads 22
    await expect(page.locator("#demo")).toContainText("22");
    // typing CONTINUES across the re-derive: the second keystroke
    // inserts at the surviving cursor → 221 + 1 = 222
    await page.keyboard.type("2");
    await expect(page.locator("#demo")).toContainText("222");
    await shot(page, "notebook-focus-rederive", testInfo.project.name);
  });
});

test.describe("notebook — many cards", () => {
  test("a 200-cell chain renders and the page stays interactive", async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await gotoDemo(page);
    await clickDrawnText(page, "+200 chained");
    // the chain's full-run reply applied: all 209 cells ran once
    await expect(page.locator("#demo")).toContainText("ran 209/209");
    // the chain's top cell evaluated: base(1) + 200
    await expect(page.locator("#demo")).toContainText("201");
    // the page is still interactive: a chained bump re-runs exactly the
    // 201-cell dependent closure, then Reset restores the demo
    await clickDrawnText(page, "+1 chain");
    await expect(page.locator("#demo")).toContainText("ran 201/209");
    await clickDrawnText(page, "Reset");
    await expect(page.locator("#demo")).toContainText("ran 8/8");
    await shot(page, "notebook-chain-200", testInfo.project.name);
  });
});

test.describe("notebook — small screens", () => {
  test("renders at 380px without horizontal overflow", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-380", "380px project only");
    await gotoDemo(page);
    // the DRAWN ROOT must not overflow horizontally (the nav's own ~8px
    // overflow at 380px is the recorded corpus finding, risks.spec —
    // this guard is the demo's, not the nav's)
    const [scrollWidth, clientWidth] = (await page.evaluate(
      "(() => { const e = document.querySelector('#demo > div'); return [e.scrollWidth, e.clientWidth]; })()",
    )) as readonly [number, number];
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    // and the demo drew its content
    expect(await drawnText(page)).toContain("ran 8/8");
    await shot(page, "notebook-380", testInfo.project.name);
  });
});

test.describe("notebook — the worker kill switch", () => {
  test("a long-running cell killed mid-run reports killed and the notebook stays usable", async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await gotoDemo(page);
    // +200 heavy: a 1M-point array feeding 200 reduction cells —
    // seconds of off-thread work; the kill lands mid-run
    await clickDrawnText(page, "+200 heavy");
    await page.waitForTimeout(400);
    await clickDrawnText(page, "Kill");
    // the terminated run's cells report the typed killed error
    await expect(page.locator("#demo")).toContainText("killed");
    await shot(page, "notebook-killed", testInfo.project.name);
    // the notebook stays usable: the respawned worker runs a full pass
    // over all 210 cells (the killed cells re-run — previously-errored
    // cells are always re-evaluated, ~seconds of honest recompute) and
    // the demo recovers its values
    await clickDrawnText(page, "+ cell");
    await expect(page.locator("#demo")).toContainText("ran 210/210", { timeout: 30_000 });
    await expect(page.locator("#demo")).not.toContainText("killed");
    await shot(page, "notebook-after-kill-recover", testInfo.project.name);
  });
});
