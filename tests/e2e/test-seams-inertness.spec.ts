// Purpose: debug inertness and flag composition (?debug=1) — the handle
//   observes the app without changing it, a deep link renders the same
//   as the equivalent nav selection, and the debug flag composes with
//   the service-worker flag without adding a second registration.
// Responsibilities: project the tree the browser laid out (root text
//   plus every element's tag/text/box) with and without ?debug=1 and
//   require exact equality; compare a ?demo=todo deep link against a
//   nav-selected todo by the JSON state projection and the drawn tree;
//   count service-worker register attempts for ?debug=1&sw=1 and ?sw=1
//   and require the same single attempt and sw.js URL.
// Rationale: an opt-in test seam must be observation-only — a flag that
//   perturbs layout, state or boot ordering would make every debug-mode
//   assertion suspect. The projections are the app's own (JSON.stringify
//   of live state, getBoundingClientRect of the drawn root), never a
//   Playwright-serialized copy, and the sw case pins the registration
//   ATTEMPT because Chromium fetches the worker script out of band. The
//   boot/fallback and debug-lifecycle cases live in test-seams.spec.ts
//   and test-seams-debug.spec.ts; the page helpers come from
//   test-seams-support.ts.

import { expect, test } from "@playwright/test";
import { navTo, stage } from "./drive.ts";
import {
  drawnProjection,
  instrumentSwRegistration,
  openAt,
  swAttempts,
  tamborDemo,
  tamborStateJson,
} from "./test-seams-support.ts";

test.describe("debug inertness and flag composition — ?debug=1", () => {
  test("the debug handle does not change the drawn tree", async ({ page }) => {
    await openAt(page, "?demo=todo");
    await expect(stage(page)).toBeVisible();
    const plain = await drawnProjection(page);

    await openAt(page, "?demo=todo&debug=1");
    await expect(stage(page)).toBeVisible();
    await expect.poll(() => tamborDemo(page)).toBe("todo");
    const debugged = await drawnProjection(page);

    // exact projection equality: text and every element's tag/text/box
    expect(debugged).toEqual(plain);
  });

  test("a todo deep link matches selecting todo through the nav", async ({
    page,
  }) => {
    await openAt(page, "?demo=todo&debug=1");
    await expect.poll(() => tamborDemo(page)).toBe("todo");
    const direct = {
      state: await tamborStateJson(page),
      drawn: await drawnProjection(page),
    };

    // ?debug=1 without ?demo keeps the handle opted in for the nav's
    // runtime mount too (the flag is parsed once at boot), so the
    // nav-selected run exposes the same two projections.
    await openAt(page, "?debug=1");
    await navTo(page, "todo");
    await expect.poll(() => tamborDemo(page)).toBe("todo");
    const selected = {
      state: await tamborStateJson(page),
      drawn: await drawnProjection(page),
    };

    expect(selected).toEqual(direct);
  });

  test("?debug=1&sw=1 takes the same registration attempt as ?sw=1", async ({
    page,
  }) => {
    // installed before the first boot: main.ts calls register during
    // the entry's synchronous boot, and each navigation re-runs the
    // script with fresh counters
    await instrumentSwRegistration(page);

    await openAt(page, "?demo=todo&debug=1&sw=1");
    await expect(stage(page)).toBeVisible();
    await expect.poll(() => tamborDemo(page)).toBe("todo");
    expect(await tamborDemo(page)).toBe("todo");
    await expect
      .poll(async () => (await swAttempts(page)).calls)
      .toBeGreaterThanOrEqual(1);
    const combined = await swAttempts(page);

    await openAt(page, "?demo=todo&sw=1");
    await expect(stage(page)).toBeVisible();
    await expect
      .poll(async () => (await swAttempts(page)).calls)
      .toBeGreaterThanOrEqual(1);
    const alone = await swAttempts(page);

    // the debug flag adds a handle, not a second registration attempt
    expect(combined.calls).toBeGreaterThanOrEqual(1);
    expect(alone.calls).toBeGreaterThanOrEqual(1);
    expect(combined.calls).toBe(alone.calls);
    expect(combined.url).toMatch(/sw\.js$/);
    expect(alone.url).toMatch(/sw\.js$/);
  });
});
