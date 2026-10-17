// Purpose: real-browser smoke for the bench apps (tambor-yx8/ibh) — the
//   bench scenarios measure clicks on these demos, so the ops must
//   actually mutate the drawn DOM (the overhead-only measurement the
//   expectedDrawn assertion guards would otherwise hide).
// Responsibilities: keyed-table Build 1000 draws 1000+ rows; turtle-20k
//   Draw 20k draws 20k+ segments; both through the real bundle + nav.
// Rationale: the same ground truth the bench's expectedDrawn assertion
//   needs, pinned in the regular e2e lane where it runs on every
//   change instead of only on a bench invocation.

import { test, expect } from "@playwright/test";
import { open, navTo, clickDrawnText } from "./drive.ts";

test.describe("bench apps smoke (real browser)", () => {
  test("keyed-table Build 1000 draws the rows", async ({ page }) => {
    await open(page);
    await navTo(page, "keyed-table");

    await expect
      .poll(async () => page.locator("#demo *").count(), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1000);
    await expect(page.locator("#demo")).toContainText("row 999");
  });

  test("turtle-20k Draw 20k draws the segments", async ({ page }) => {
    await open(page);
    await navTo(page, "turtle-20k");
    await clickDrawnText(page, "Draw 20k");
    await expect
      .poll(async () => page.locator("#demo *").count(), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(20000);
  });
});
