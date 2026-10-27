// Purpose: the pilot benchmark scenario (tambor-54j.4) — todo-add, run
//   through the real gallery SPA bundle in a real, CPU-throttled
//   Chromium, emitting a raw-JSON result the app suites (54j.6/.7)
//   will extend with B1–B9/BZ1–BZ7 scenarios.
// Responsibilities: per scenario — open a fresh page per run (fresh
//   todo state), apply the CPU throttle rate via CDP
//   (Emulation.setCPUThrottlingRate), drive the "Add Todo" button
//   through the real pointer wire (drive.ts: clickView on the stage
//   canvas), time each op from click to double-rAF paint, warm up 2
//   untimed clicks first, then emit one result JSON per scenario into
//   benchmarks/results/ via the bench-stats contract (validated before
//   it is written — a malformed result never leaves the harness).
// Rationale: reuses the y9d.4 tooling end to end (serve.mjs fixture
//   serving, gallery.html, drive.ts coordinate driving) per the
//   overlap note; the sample is honest about including driver overhead
//   (click dispatch + double-rAF round-trip) and the todo list grows
//   across the timed ops (3 items + 2 warmup → +opsPerRun items), so
//   per-op cost at this small scale is what is measured — scaling
//   curves are later tickets' business. Node surface (fs, hrtime,
//   versions) is reached structurally / via variable dynamic imports:
//   the repo carries no @types/node, so nothing here may use typed
//   node globals. Result paths are relative to the process cwd, which
//   is the repo root (benchmarks/run.mjs spawns playwright there, and
//   a direct `npx playwright test -c tests/e2e/bench.config.ts` from
//   the root does the same).

import { expect, test, type Page } from "@playwright/test";
import { buttonPoint, clickView, demoView, navTo, open } from "./drive.ts";
import {
  computeStats,
  validateBenchResult,
  type BenchResult,
} from "./bench-stats.ts";

// --- structural node surface (no @types/node in this repo) ------------

interface FsLike {
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  writeFileSync(path: string, data: string): void;
  readFileSync(path: string, encoding: "utf8"): string;
  existsSync(path: string): boolean;
}

interface HrTime {
  bigint(): bigint;
}

function proc(): { hrtime: HrTime; version: string } | undefined {
  return (globalThis as { process?: { hrtime: HrTime; version: string } })
    .process;
}

// A dynamic import whose specifier is a variable — TS resolves only
// static literal specifiers, and "node:fs" has no installed types, so
// the variable form keeps `tsc --noEmit` green while still loading fs.
const fsPromise: Promise<FsLike> = import("node:" + "fs");

// --- scenario registry -------------------------------------------------

interface Scenario {
  readonly id: string;
  readonly app: string;
  readonly demoId: string;
  readonly buttonText: string;
  readonly ops: number;
  readonly warmupOps: number;
}

const SCENARIOS: readonly Scenario[] = [
  {
    id: "todo-add",
    app: "todo (pilot — gallery demo, dist/spa.js)",
    demoId: "todo",
    buttonText: "Add Todo",
    ops: 10,
    warmupOps: 2,
  },
];

// --- env knobs (set by benchmarks/run.mjs) -----------------------------

function env(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.[name];
}

const RUNS = Number(env("BENCH_RUNS") ?? 15);
const CPU_RATE = Number(env("BENCH_CPU_RATE") ?? 4);
const COMMIT = env("BENCH_COMMIT") ?? "";
const PORT = Number(env("BENCH_PORT") ?? 4601);

const RESULTS_DIR = "benchmarks/results";

// Double-rAF: the click's effects are derived, the DOM written and the
// frame painted when the second rAF callback fires. Passed as a string
// (evaluate) — a typed callback would need DOM globals this repo's
// tsconfig deliberately omits.
const PAINT =
  "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))";

async function settlePaint(page: Page): Promise<void> {
  await page.evaluate(PAINT);
}

async function readPinnedVersions(fs: FsLike): Promise<Record<string, string>> {
  const pkg = (name: string): string => {
    const raw = fs.readFileSync(`node_modules/${name}/package.json`, "utf8");
    return String((JSON.parse(raw) as { version?: unknown }).version);
  };
  return {
    playwright: pkg("@playwright/test"),
    chrome: "", // filled from the browser session below
    esbuild: pkg("esbuild"),
    typescript: pkg("typescript"),
    node: proc()?.version ?? "",
  };
}

// --- the pilot scenario ------------------------------------------------

test.describe("benchmark scenarios", () => {
  for (const scenario of SCENARIOS) {
    test(`scenario ${scenario.id}`, async ({ browser }) => {
      const p = proc();
      if (p === undefined) {
        throw new Error("benchmarks need a node runtime with hrtime");
      }
      const fs = await fsPromise;

      const versions = await readPinnedVersions(fs);
      const samples: number[] = [];

      for (let run = 0; run < RUNS; run++) {
        // A fresh page per run: fresh todo state, cold caches spread
        // across runs instead of warming forever inside one page.
        const context = await browser.newContext({
          viewport: { width: 800, height: 900 },
        });
        const page = await context.newPage();

        // Navigate unthrottled (page load is not the measured op), then
        // apply the CPU throttle — pinned into the result below — so it
        // covers exactly the timed ops.
        await open(page);
        await navTo(page, scenario.demoId);
        const cdp = await context.newCDPSession(page);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_RATE });

        const view = await demoView(scenario.demoId);
        const point = buttonPoint(view, scenario.buttonText);

        // warmup: untimed clicks settle JIT + first-layout costs
        for (let i = 0; i < scenario.warmupOps; i++) {
          await clickView(page, point);
          await settlePaint(page);
        }

        for (let op = 0; op < scenario.ops; op++) {
          const t0 = p.hrtime.bigint();
          await clickView(page, point);
          await settlePaint(page);
          const ms = Number(p.hrtime.bigint() - t0) / 1e6;
          samples.push(ms);
        }

        await context.close();
      }

      versions["chrome"] = browser.version();

      const result: BenchResult = {
        schema: "tambor-bench/1",
        grade: "T",
        scenario: scenario.id,
        app: scenario.app,
        commit: COMMIT,
        port: PORT,
        throttle: {
          cpuRate: CPU_RATE,
          via: "Emulation.setCPUThrottlingRate",
        },
        runs: RUNS,
        opsPerRun: scenario.ops,
        unit: "ms",
        versions,
        samples,
        stats: computeStats(samples),
      };

      // The contract is enforced at the emission point: a malformed
      // result fails the scenario instead of landing on disk.
      const violations = validateBenchResult(result);
      expect(violations, "result contract").toEqual([]);

      fs.mkdirSync(RESULTS_DIR, { recursive: true });
      fs.writeFileSync(
        `${RESULTS_DIR}/${scenario.id}.json`,
        `${JSON.stringify(result, null, 2)}\n`,
      );
    });
  }
});
