// Purpose: the boot-seam browser contract — deep-link selection
//   (?demo=<id>), the unknown-id default, the failed-chunk fallback and
//   the all-demos-failed static error, driven through the real built
//   bundle.
// Responsibilities: boot the fixture with a query string and assert the
//   mounted demo's nav button (the entry marks the demo actually on
//   screen), the drawn content, and that no unhandled rejection
//   (pageerror) or console error escapes; abort the selected demo's
//   content-hashed chunk through page.route — the chunk names come from
//   the build's metafile, never a hardcoded hash — to exercise the
//   fallback; abort every lazy chunk, plus the two chunk-less
//   (synchronous) loaders, to reach the terminal error state.
// Rationale: the parser rules are unit-tested in
//   tests/spa-boot-selection.test.ts — this spec pins the WIRING: that
//   main.ts parses location.search once, marks the demo that actually
//   mounted, and swallows load failures instead of leaving a blank
//   stage plus an unhandled rejection. Unlike gallery.spec.ts (kept out
//   of CI for environment-sensitive interaction flakiness), this spec
//   drives no coordinates and asserts only the entry's own boot and
//   mount, so it is deterministic and joins the CI e2e gate. The debug
//   handle lifecycle and the debug/flag-composition cases live in
//   test-seams-debug.spec.ts and test-seams-inertness.spec.ts; the page
//   helpers all come from test-seams-support.ts.

import { expect, test } from "@playwright/test";
import { drawnText, navTo, open, stage } from "./drive.ts";
import {
  demoButton,
  demoChunk,
  openAt,
  rejectChunklessLoaders,
  watchErrors,
} from "./test-seams-support.ts";

test.describe("boot selection — ?demo deep links", () => {
  test("?demo=todo mounts todo with its nav button active", async ({ page }) => {
    const errors = watchErrors(page);
    await openAt(page, "?demo=todo");
    await expect(stage(page)).toBeVisible();
    await expect(demoButton(page, "todo")).toHaveClass("active");
    expect(await drawnText(page)).toContain("Add Todo");
    expect(errors).toEqual([]);
  });

  test("a direct ?demo=todo boot matches a nav-selected todo boot", async ({
    page,
  }) => {
    await openAt(page, "?demo=todo");
    const directText = await drawnText(page);
    const directActive = await page.locator("nav button.active").innerText();

    await open(page);
    // leave todo first: the comparison must be a real nav switch, not a
    // remount of the demo the parameterless boot already mounted
    await navTo(page, "counter");
    await navTo(page, "todo");
    await expect(demoButton(page, "todo")).toHaveClass("active");
    expect(await page.locator("nav button.active").innerText()).toBe(
      directActive,
    );
    expect(await drawnText(page)).toBe(directText);
  });

  test("an unknown ?demo id boots the first demo without errors", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openAt(page, "?demo=does-not-exist");
    await expect(stage(page)).toBeVisible();
    await expect(page.locator("nav button").first()).toHaveClass("active");
    expect(await drawnText(page)).toContain("Add Todo");
    expect(errors).toEqual([]);
  });

  test("the first ?demo occurrence wins on a duplicated parameter", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openAt(page, "?demo=todo&demo=counter");
    await expect(stage(page)).toBeVisible();
    await expect(demoButton(page, "todo")).toHaveClass("active");
    expect(await drawnText(page)).toContain("Add Todo");
    expect(errors).toEqual([]);
  });

  test("a boot without parameters mounts the first demo", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page);
    await expect(stage(page)).toBeVisible();
    await expect(page.locator("nav button").first()).toHaveClass("active");
    expect(await drawnText(page)).toContain("Add Todo");
    expect(errors).toEqual([]);
  });
});

test.describe("failed-chunk fallback", () => {
  test("a failed demo chunk mounts the first different demo that loads", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    // the expected fallback's drawn text from a clean boot of the
    // chunk-less counter demo (so no example chunk is fetched here)
    await openAt(page, "?demo=counter");
    const counterText = await drawnText(page);
    await expect(demoButton(page, "counter")).toHaveClass("active");

    // abort ONLY the selected demo's chunk: todo is registry entry 0,
    // so the first different demo is counter (registry order)
    await page.route(
      `**/chunks/${demoChunk("src/examples/todo/todo.ts")}`,
      async (route) => {
        await route.abort();
      },
    );
    await openAt(page, "?demo=todo");

    await expect(stage(page)).toBeVisible();
    await expect(demoButton(page, "counter")).toHaveClass("active");
    expect(await drawnText(page)).toBe(counterText);
    expect(await demoButton(page, "todo").getAttribute("class")).toBe("");
    expect(errors).toEqual([]);
  });

  test("when every demo fails the stage shows a static error", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    // boot a chunk-less demo so no example chunk is in the module cache
    // when the abort route goes up
    await openAt(page, "?demo=counter");
    expect((await rejectChunklessLoaders(page, ["counter", "select"])).sort()).toEqual([
      "counter",
      "select",
    ]);

    // every remaining demo resolves through a lazy chunk; the boot's
    // static chunks are already loaded, so this route only ever sees
    // the lazy demo imports
    await page.route("**/chunks/*.js", async (route) => {
      await route.abort();
    });
    await demoButton(page, "todo").click();

    await expect(page.locator("#demo")).toContainText("demo unavailable");
    await expect(stage(page)).toHaveCount(0);
    await expect(page.locator("nav button.active")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
