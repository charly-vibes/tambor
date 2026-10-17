// Purpose: the B1/B2 benchmark scenarios (tambor-yx8 + tambor-1jz) —
//   keyed-table-build, keyed-table-ops, todomvc-ops, run through the
//   real gallery SPA bundle in a real, CPU-throttled Chromium, emitting
//   tambor-bench/1 JSON via the bench-stats contract. Follows the pilot
//   spec (pilot-todo.bench.ts) pattern exactly: fresh page per run,
//   CDP CPU throttle over exactly the timed ops, click → double-rAF
//   paint as the op, warmup first, validate-before-write.
// Responsibilities: per scenario — resolve the op points once from a
//   fresh in-process view (demoView + buttonPoint/pointWhere: the op
//   buttons sit in the fixed control row, and the todo ops target the
//   first visible row whose position is list-head-stable), apply the
//   untimed setup op (keyed-table-ops builds the 1000 rows it then
//   mutates), cycle the op points, emit one result JSON per scenario
//   into benchmarks/results/.
// Rationale: the ops are cycled, so a run's samples are labelled by
//   position in the cycle in the samples array (cycle order, per run) —
//   keyed-table-ops grows the table within a run (Append 1k), bounded
//   by the fresh page per run; todomvc-ops holds ~200 rows steady
//   (add/toggle/delete cycle). Node surface (fs, hrtime) is reached
//   structurally / via variable dynamic imports: the repo carries no
//   @types/node, so nothing here may use typed node globals. The
//   BENCH_SCENARIO knob (benchmarks/run.mjs --scenario) skips the other
//   scenarios so one command can target one scenario; empty = run all.

import { expect, test, type Page } from "@playwright/test";
import {
  buttonPoint,
  clickView,
  demoView,
  navTo,
  open,
  pointWhere,
  type ViewPoint,
} from "./drive.ts";
import {
  computeStats,
  validateBenchResult,
  type BenchResult,
} from "./bench-stats.ts";
import type { Elem } from "../../src/views/model.ts";

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

// A view-point resolver: the fresh in-process view the page's initial
// view equals (pure views over plain state).
type PointOf = (view: Elem) => ViewPoint;

interface Scenario {
  /** minimum drawn-descendant count the op must produce — a no-op op
   * (state update silently dropped) would measure overhead only */
  readonly expectedDrawn?: number;
  readonly id: string;
  readonly app: string;
  readonly demoId: string;
  readonly pointsOf: readonly PointOf[];
  readonly setupOf?: PointOf;
  readonly ops: number;
  readonly warmupOps: number;
}

// The first visible row's toggle checkbox (list-head-stable position).
const firstCheckbox: PointOf = (view) =>
  pointWhere(view, (f) => f.underHandler && f.node.type === "checkbox");

// The first visible row's delete X (list-head-stable position).
const firstDeleteX: PointOf = (view) =>
  pointWhere(view, (f) => f.underHandler && f.node.type === "path");

// The op button with the given drawn text (fixed control-row position).
const buttonText = (text: string): PointOf => (view) => buttonPoint(view, text);

// A drawn label by its exact text (the form's field labels).
const labelText = (text: string): PointOf => (view) =>
  pointWhere(view, (f) => f.node.type === "label" && f.node.text === text);

const SCENARIOS: readonly Scenario[] = [
  {
    id: "keyed-table-build",
    expectedDrawn: 1000,
    app: "keyed-table (bench demo, dist/spa.js)",
    demoId: "keyed-table",
    pointsOf: [buttonText("Build 1000")],
    ops: 6,
    warmupOps: 1,
  },
  {
    id: "keyed-table-ops",
    app: "keyed-table (bench demo, dist/spa.js)",
    demoId: "keyed-table",
    pointsOf: [
      buttonText("Replace 10%"),
      buttonText("Swap Rows"),
      buttonText("Remove 10"),
      buttonText("Append 1k"),
    ],
    setupOf: buttonText("Build 1000"),
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "todomvc-ops",
    app: "todo at scale (bench demo, dist/spa.js)",
    demoId: "todomvc",
    pointsOf: [
      buttonText("Add Todo"),
      firstCheckbox,
      firstDeleteX,
    ],
    ops: 12,
    warmupOps: 1,
  },
  {
    id: "form-200-focus",
    app: "200-field form (bench demo, dist/spa.js)",
    demoId: "form-200",
    // five spread fields, cycled — each click routes the ordinary
    // request-focus/edit intents and re-derives the whole 200-field view
    pointsOf: [
      labelText("field 0"),
      labelText("field 50"),
      labelText("field 100"),
      labelText("field 150"),
      labelText("field 199"),
    ],
    ops: 10,
    warmupOps: 1,
  },
  {
    id: "turtle-20k-draw",
    expectedDrawn: 20000,
    app: "turtle 20k (bench demo, dist/spa.js)",
    demoId: "turtle-20k",
    pointsOf: [buttonText("Draw 20k")],
    ops: 6,
    warmupOps: 1,
  },
  {
    id: "turtle-20k-recolor",
    app: "turtle 20k (bench demo, dist/spa.js)",
    demoId: "turtle-20k",
    pointsOf: [buttonText("Recolor red")],
    setupOf: buttonText("Draw 20k"),
    ops: 10,
    warmupOps: 1,
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
const ONLY = env("BENCH_SCENARIO") ?? "";

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

// --- the B1/B2 scenarios -----------------------------------------------

test.describe("benchmark scenarios (bench apps)", () => {
  for (const scenario of SCENARIOS) {
    if (ONLY !== "" && scenario.id !== ONLY) continue;

    test(`scenario ${scenario.id}`, async ({ browser }) => {
      const p = proc();
      if (p === undefined) {
        throw new Error("benchmarks need a node runtime with hrtime");
      }
      const fs = await fsPromise;

      const versions = await readPinnedVersions(fs);
      const samples: number[] = [];

      // The op points, resolved once from a fresh view: the ops sit at
      // fixed view-space positions (control row / list head).
      const fresh = demoView(scenario.demoId);
      const points = scenario.pointsOf.map((resolve) => resolve(fresh));
      const setup = scenario.setupOf?.(fresh);

      for (let run = 0; run < RUNS; run++) {
        // A fresh page per run: fresh app state (keyed-table-ops's
        // growth is bounded by the run), cold caches spread across
        // runs instead of warming forever inside one page.
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

        // The untimed setup op (the state the scenario measures ops over).
        if (setup !== undefined) {
          await clickView(page, setup);
          await settlePaint(page);
        }

        // warmup: untimed ops settle JIT + first-layout costs
        for (let i = 0; i < scenario.warmupOps; i++) {
          await clickView(page, points[i % points.length] as ViewPoint);
          await settlePaint(page);
        }

        for (let op = 0; op < scenario.ops; op++) {
          const point = points[op % points.length] as ViewPoint;
          const t0 = p.hrtime.bigint();
          await clickView(page, point);
          await settlePaint(page);
          const ms = Number(p.hrtime.bigint() - t0) / 1e6;
          samples.push(ms);
        }

        // The op actually happened: the drawn DOM must reflect the
        // scenario's product (a silently dropped update would measure
        // overhead only — the keyed-table finding, checked not eyeballed).
        if (scenario.expectedDrawn !== undefined) {
          const drawn = await page
            .locator("#demo *")
            .count();
          expect(drawn).toBeGreaterThanOrEqual(scenario.expectedDrawn);
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
