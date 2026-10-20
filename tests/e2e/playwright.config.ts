// Purpose: the Playwright config (tambor-y9d.4) — browser-tests the
//   built dist/spa.js gallery bundle headlessly, per the HITL brief.
// Responsibilities: webServer builds the bundle (npm run build:spa) and
//   serves the repo root through tests/e2e/serve.mjs; two projects —
//   desktop (dark/light media emulation happens per-test) and a 380px
//   touch project for the small-screen + touch risks; specs live beside
//   this config as *.spec.ts and are excluded from vitest (vitest
//   include is tests/**/*.test.ts).
// Rationale: kept deliberately minimal and reusable (the overlap note
//   with tambor-54j.4): stock @playwright/test, one fixture page, no
//   custom harness abstractions beyond the coordinate-driving helpers
//   in drive.ts. The webServer rebuilds the bundle every run so the
//   browser always exercises the current source, same as the jsdom
//   bundle smoke test (tests/spa-bundle.test.ts).

import { defineConfig } from "@playwright/test";

const PORT = 4599;

// The CI env flag, reached structurally (no node types in tsconfig).
function ci(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  return env?.["CI"] !== undefined;
}

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    screenshot: "off",
    trace: "off",
  },
  webServer: {
    // the webServer cwd defaults to the config file's directory; the
    // bundle build + server both expect the repo root
    cwd: "../..",
    command: "npm run build:spa && node tests/e2e/serve.mjs",
    port: PORT,
    // process is not in the repo tsconfig types (no lib.dom/node by
    // design) — reach it structurally like every other host global
    reuseExistingServer: !ci(),
    timeout: 60_000,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 800, height: 900 } } },
    {
      name: "mobile-380",
      use: {
        viewport: { width: 380, height: 900 },
        hasTouch: true,
      },
    },
  ],
});
