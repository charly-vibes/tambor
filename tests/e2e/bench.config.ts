// Purpose: the benchmark Playwright config (tambor-54j.4) — runs the
//   bench specs (*.bench.ts) against a served production build, on a
//   dedicated port, fully separate from the regular suite.
// Responsibilities: single project (bench-desktop, same 800×900
//   viewport as the regular suite's desktop project — identical
//   HTML/CSS across ports is a programme principle), workers 1 (no
//   parallel noise), long per-scenario timeout (N runs × ops × a
//   CPU-throttled browser), webServer that rebuilds the production
//   bundle (npm run build:spa) and serves the repo root through
//   tests/e2e/serve.mjs on the bench port (BENCH_PORT, default 4601 —
//   never the regular suite's 4599).
// Rationale: zero impact on the regular suite is a ticket requirement —
//   testMatch here is **/*.bench.ts while playwright.config.ts matches
//   only **/*.spec.ts, so no default `npx playwright test` run picks
//   bench files up, and vitest (tests/**/*.test.ts) never sees them.
//   The webServer reuses serve.mjs and build:spa (the y9d.4 overlap
//   note): the bench measures the exact artifact the regular tests
//   exercise, just on its own port. Env knobs (BENCH_RUNS,
//   BENCH_CPU_RATE, BENCH_SCENARIO, BENCH_COMMIT) are passed in by
//   benchmarks/run.mjs, reached structurally like every other host
//   global (the repo carries no @types/node).

import { defineConfig } from "@playwright/test";

// Structural process access (no node types in the repo tsconfig).
function env(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.[name];
}

function ci(): boolean {
  return env("CI") !== undefined;
}

const PORT = Number(env("BENCH_PORT") ?? 4601);

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.bench.ts",
  // generous: runs × (page load + ops) × a throttled browser
  timeout: 900_000,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 800, height: 900 },
    screenshot: "off",
    trace: "off",
  },
  webServer: {
    // the webServer cwd defaults to the config file's directory; the
    // bundle build + server both expect the repo root
    cwd: "../..",
    command: "npm run build:spa && node tests/e2e/serve.mjs",
    port: PORT,
    env: { PORT: String(PORT) },
    reuseExistingServer: !ci(),
    timeout: 60_000,
  },
});
