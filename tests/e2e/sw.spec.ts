// Purpose: the service worker e2e (tambor-dfk, add-spa-delivery) — the
//   PWA shell installs and serves offline: one visit registers the SW,
//   the precache covers the shell, and an offline reload still renders
//   the gallery (network-first navigation falls back to the cache).
// Responsibilities: drive the real built demo-dist/ bundle in a real
//   browser — load the shell page (/demo-dist/index.html, inside the
//   SW's scope), wait for navigator.serviceWorker.ready, flip the
//   context offline, reload, and assert the shell's nav is still there.
// Rationale: the unit contracts (tests/spa-delivery.test.ts
//   p_offline_shell_serves_navigation) pin respond()'s strategy against
//   fake doubles; this spec pins the real registration + precache +
//   interception path end-to-end (manifest and worker present in dist,
//   offline reload serves the shell scenarios). localhost is a secure
//   origin, so the entry's registration guard allows it — the
//   navigator.webdriver guard is what keeps OTHER e2e specs
//   SW-free (this spec drives registration deliberately).

import { test, expect } from "@playwright/test";

test.describe("service worker — offline shell", () => {
  test("first visit installs, offline reload serves the cached shell", async ({
    page,
    context,
  }) => {
    // ?sw=1 opts the registration in under automation (the entry skips
    // the worker when navigator.webdriver, so other e2e specs stay
    // SW-free — this spec drives it deliberately)
    await page.goto("/demo-dist/index.html?sw=1");

    // registration + install (asset-manifest precache) complete
    await page.evaluate(() => {
      const nav = globalThis as {
        navigator?: { serviceWorker?: { ready: Promise<unknown> } };
      };
      return nav.navigator?.serviceWorker?.ready;
    });

    // the controlling worker is active; going offline must not blank
    // the shell — network-first navigation falls back to the precache
    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.locator("nav button").first()).toBeVisible();
      // the gallery booted through the cached chunks, not just the shell
      await expect(page.locator("#demo > *").first()).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });
});
