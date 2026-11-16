// Purpose: the opt-in debug handle's lifecycle (?debug=1) — what a
//   debug boot publishes, that a plain boot publishes nothing, and that
//   a nav switch never leaves a stale handle on screen while the next
//   demo's chunk is still loading.
// Responsibilities: boot the fixture with ?debug=1 and read the handle
//   through a serializable projection (the handle itself holds live
//   functions); assert the demo id, the live state, the raw view
//   derivation and the draw count; hold the next demo's content-hashed
//   chunk via page.route and assert the handle is cleared before the
//   new mount lands, then names the new demo once it draws.
// Rationale: the handle is a TEST seam (add-spa-test-seams), so these
//   cases pin the seam's contract, not the app's internals: only
//   serializable data crosses the Playwright boundary and the
//   projection carries the view root's type discriminator plus a live
//   handler closure — proof the seam returns the app's own tree, not a
//   JSON clone (which would drop every handler). The boot/fallback and
//   the inertness/flag-composition cases live in test-seams.spec.ts and
//   test-seams-inertness.spec.ts; the shared page helpers come from
//   test-seams-support.ts.

import { expect, test, type Page } from "@playwright/test";
import { stage } from "./drive.ts";
import {
  demoButton,
  demoChunk,
  openAt,
  watchErrors,
} from "./test-seams-support.ts";

// The opt-in debug handle as the page exposes it (structural host view:
// tsconfig carries no DOM lib).
interface TamborHandle {
  readonly demo: string;
  state(): unknown;
  view(): unknown;
  drawCount(): number;
}

// Read the opt-in debug handle from the page: the handle holds live
// functions (state/view/drawCount), so only a serializable projection
// crosses the Playwright boundary. The projection carries the raw view
// tree's root type discriminator — proof the seam returns the live
// derivation, not a JSON clone (which would drop the handler functions
// the corpus nodes carry).
interface DebugProjection {
  readonly demo: string;
  readonly state: unknown;
  readonly viewNonNull: boolean;
  readonly viewRootType: string | null;
  readonly viewCarriesFunction: boolean;
  readonly drawCount: number;
}

// A named in-page function (Playwright serializes its source): every
// read happens against the live handle inside the page. The probes stay
// separate named helpers so each unit stays small — a local closure can
// only be reached from the serialized body, so they live here.
function debugProjectionInPage(): DebugProjection | null {
  const host = globalThis as { __tambor?: TamborHandle };
  const handle = host.__tambor;
  if (handle === undefined) return null;
  const view = handle.view();
  const isObject = (value: unknown): boolean =>
    value !== null && typeof value === "object";
  // the counter's raw derivation is a laid-out node list; a node tree
  // carries a type discriminator (label, translate, button, ...)
  const rootOf = (value: unknown): unknown =>
    Array.isArray(value) ? value[0] : value;
  const rootTypeOf = (root: unknown): string | null => {
    if (!isObject(root)) return null;
    const tagged = root as { readonly type?: unknown };
    return typeof tagged.type === "string" ? tagged.type : null;
  };
  // the live derivation carries handler closures (buttons, nodes); a
  // JSON clone would have dropped every function, so finding one
  // proves the seam hands out the app's own tree
  const childrenOf = (value: unknown): readonly unknown[] => {
    if (Array.isArray(value)) return value;
    if (value === null || typeof value !== "object") return [];
    return Object.values(value);
  };
  const carriesFunction = (value: unknown, depth: number): boolean => {
    if (depth <= 0) return false;
    if (typeof value === "function") return true;
    return childrenOf(value).some((item) => carriesFunction(item, depth - 1));
  };
  return {
    demo: handle.demo,
    state: handle.state(),
    viewNonNull: isObject(view),
    viewRootType: rootTypeOf(rootOf(view)),
    viewCarriesFunction: carriesFunction(view, 5),
    drawCount: handle.drawCount(),
  };
}

async function debugProjection(page: Page): Promise<DebugProjection | null> {
  return await page.evaluate(debugProjectionInPage);
}

async function tamborAbsent(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    // structural host view: tsconfig carries no DOM lib
    const host = globalThis as { __tambor?: unknown };
    return host.__tambor === undefined;
  });
}

test.describe("opt-in debug snapshot — ?debug=1", () => {
  test("a debug boot exposes the demo, its state, the raw view and the draw count", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openAt(page, "?demo=counter&debug=1");
    await expect(stage(page)).toBeVisible();

    const debug = await debugProjection(page);
    expect(debug).not.toBeNull();
    if (debug === null) throw new Error("__tambor was not published");
    expect(debug.demo).toBe("counter");
    expect(debug.state).toEqual({ num: 5 });
    expect(debug.viewNonNull).toBe(true);
    // the projection is a real view tree, not a serialized copy: it
    // carries a node type and live handler functions
    expect(typeof debug.viewRootType).toBe("string");
    expect(debug.viewCarriesFunction).toBe(true);
    expect(debug.drawCount).toBeGreaterThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test("without ?debug=1 no global is created", async ({ page }) => {
    await openAt(page, "?demo=counter");
    await expect(stage(page)).toBeVisible();
    expect(await tamborAbsent(page)).toBe(true);
  });

  test("a nav switch exposes no stale demo while the next chunk loads", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openAt(page, "?demo=counter&debug=1");
    await expect(stage(page)).toBeVisible();
    expect((await debugProjection(page))?.demo).toBe("counter");

    // hold the todo chunk: the new mount cannot land until it continues
    let release = (): void => {};
    const held = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    const gate = { requested: false };
    await page.route(
      `**/chunks/${demoChunk("src/examples/todo/todo.ts")}`,
      async (route) => {
        gate.requested = true;
        await held;
        await route.continue();
      },
    );

    await demoButton(page, "todo").click();
    try {
      await expect.poll(() => gate.requested).toBe(true);
      // the old handle was cleared on unmount, and nothing names the
      // new demo before its mount draws
      expect(await tamborAbsent(page)).toBe(true);
      await expect(page.locator("#demo")).toContainText("loading todo");
    } finally {
      // always let the held request finish, even on assertion failure
      release();
    }
    await page.locator("#demo > div").waitFor({ state: "visible" });
    // the async gap is over: the handle names the newly mounted demo
    const debug = await debugProjection(page);
    expect(debug?.demo).toBe("todo");
    expect(debug?.drawCount).toBeGreaterThanOrEqual(1);
    expect(errors).toEqual([]);
  });
});
