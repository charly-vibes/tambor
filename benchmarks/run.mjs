#!/usr/bin/env node
// Purpose: the benchmark runner (tambor-54j.4) — one command that
//   builds the production bundle, serves it, runs the Playwright bench
//   specs, and reports the emitted raw-JSON results.
// Responsibilities: parse --runs/--cpu/--scenario/--port knobs; pin the
//   commit (git rev-parse HEAD) into the environment for the bench
//   specs; execute `npx playwright test -c tests/e2e/bench.config.ts`
//   (the config owns the build + serve via its webServer, on the bench
//   port, never the regular suite's 4599); on success read each
//   emitted benchmarks/results/*.json and print a one-line summary
//   (median/p25/p75/p90 + pinned chrome/cpu-rate) instead of the whole
//   file; exit with the playwright exit code.
// Rationale: the programme's acceptance bar is "one command reproduces
//   the benchmark tables with raw JSON output" — the specs do the
//   measuring and emitting (tests/e2e/pilot-todo.bench.ts), this script
//   is only orchestration so results carry a pinned commit and the
//   invocation is reproducible. Plain node .mjs: the repo tsconfig
//   deliberately excludes node tooling.

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// --- args ---------------------------------------------------------------

function args(argv) {
  const out = { runs: 15, cpu: 4, scenario: "", port: 4601 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--runs") { out.runs = Number(v); i++; }
    else if (k === "--cpu") { out.cpu = Number(v); i++; }
    else if (k === "--scenario") { out.scenario = String(v); i++; }
    else if (k === "--port") { out.port = Number(v); i++; }
    else if (k === "--help" || k === "-h") { out.help = true; }
    else { console.error(`unknown arg: ${k}`); process.exit(2); }
  }
  return out;
}

const opts = args(process.argv.slice(2));
if (opts.help) {
  console.log(
    "usage: node benchmarks/run.mjs [--runs N] [--cpu RATE] [--scenario ID] [--port P]",
  );
  process.exit(0);
}

const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT })
  .stdout?.toString().trim() ?? "";
if (!/^[0-9a-f]{7,40}$/.test(commit)) {
  console.error("bench: could not pin the commit (git rev-parse HEAD)");
  process.exit(1);
}

// --- run (build + serve happen inside the bench config's webServer) -----

const result = spawnSync(
  "npx",
  ["playwright", "test", "-c", "tests/e2e/bench.config.ts"],
  {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      BENCH_RUNS: String(opts.runs),
      BENCH_CPU_RATE: String(opts.cpu),
      BENCH_SCENARIO: opts.scenario,
      BENCH_COMMIT: commit,
      BENCH_PORT: String(opts.port),
    },
  },
);

if (result.status !== 0) {
  console.error(`bench: playwright exited ${result.status} — no summary`);
  process.exit(result.status ?? 1);
}

// --- summary ------------------------------------------------------------

const resultsDir = new URL("./results/", import.meta.url);
if (!existsSync(resultsDir)) {
  console.error("bench: no benchmarks/results/ emitted");
  process.exit(1);
}
const fmt = (v) => Number(v).toFixed(2);
for (const file of readdirSync(resultsDir).filter((f) => f.endsWith(".json"))) {
  const r = JSON.parse(readFileSync(new URL(file, resultsDir), "utf8"));
  const s = r.stats;
  console.log(
    `bench ${r.scenario}: n=${s.n} median=${fmt(s.median)}ms ` +
      `p25=${fmt(s.p25)}ms p75=${fmt(s.p75)}ms p90=${fmt(s.p90)}ms ` +
      `(cpu×${r.throttle.cpuRate}, chrome ${r.versions.chrome}, ` +
      `commit ${r.commit.slice(0, 9)}) → benchmarks/results/${file}`,
  );
}
