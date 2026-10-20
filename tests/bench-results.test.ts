// Purpose: the benchmark-harness contract test (tambor-54j.4) — pins the
//   shape of every result JSON the bench harness emits before any app
//   suite (54j.6/.7) consumes it: the stats math (median/p25/p75/p90
//   over raw samples) and the result-schema validator.
// Responsibilities: unit-test computeStats/percentile against hand
//   computed values; pin validateBenchResult's accept/reject behaviour
//   (pinned versions, commit, throttle rate, non-empty samples, stats
//   consistency); when benchmarks/results/ holds artifacts from a
//   runner run, validate each one against the same contract.
// Rationale: the programme principle is "publish raw JSON with pinned
//   versions" — a malformed result silently poisons every later table,
//   so the contract is enforced by a test, not by convention. The
//   validator is pure (no fs, no process) so it runs in the plain
//   vitest node environment; the artifact sweep reads the results dir
//   through the same structural dynamic-import pattern the bench spec
//   uses (the repo carries no @types/node).

import { describe, expect, it } from "vitest";
import {
  computeStats,
  validateBenchResult,
  type BenchResult,
} from "./e2e/bench-stats.ts";

describe("bench stats", () => {
  it("interpolates percentiles over sorted samples", () => {
    const s = computeStats([5, 1, 4, 2, 3]);
    expect(s.n).toBe(5);
    expect(s.min).toBe(1);
    expect(s.max).toBe(5);
    expect(s.median).toBe(3);
    expect(s.p25).toBe(2);
    expect(s.p75).toBe(4);
    expect(s.p90).toBeCloseTo(4.6, 10);
    expect(s.mean).toBeCloseTo(3, 10);
  });

  it("handles an even count with interpolated median", () => {
    const s = computeStats([10, 20, 30, 40]);
    expect(s.median).toBe(25);
    expect(s.p25).toBeCloseTo(17.5, 10);
    expect(s.p75).toBeCloseTo(32.5, 10);
  });

  it("rejects empty samples", () => {
    expect(() => computeStats([])).toThrow();
  });

  it("keeps single-sample stats finite", () => {
    const s = computeStats([7]);
    expect(s.median).toBe(7);
    expect(s.p25).toBe(7);
    expect(s.p90).toBe(7);
    expect(s.max).toBe(7);
  });
});

// A well-formed fixture: everything the validator must demand.
function wellFormed(): BenchResult {
  return {
    schema: "tambor-bench/1",
    grade: "T",
    scenario: "todo-add",
    app: "todo (pilot)",
    commit: "abc1234abcdef",
    port: 4601,
    throttle: { cpuRate: 4, via: "Emulation.setCPUThrottlingRate" },
    runs: 2,
    opsPerRun: 3,
    unit: "ms",
    versions: {
      playwright: "1.64.1",
      chrome: "141.0.0.0",
      esbuild: "0.28.2",
      typescript: "5.9.3",
      node: "v26.10.0",
    },
    samples: [1, 2, 3, 4, 5, 6],
    stats: computeStats([1, 2, 3, 4, 5, 6]),
  };
}

describe("bench result contract", () => {
  it("accepts a well-formed result", () => {
    expect(validateBenchResult(wellFormed())).toEqual([]);
  });

  it("rejects missing pinned versions", () => {
    const r = wellFormed();
    delete (r.versions as Record<string, string>)["chrome"];
    expect(validateBenchResult(r).length).toBeGreaterThan(0);
  });

  it("rejects empty samples", () => {
    const r = wellFormed();
    (r as { samples: unknown }).samples = [];
    expect(validateBenchResult(r).length).toBeGreaterThan(0);
  });

  it("rejects a cpu throttle rate below 1", () => {
    const r = wellFormed();
    (r.throttle as { cpuRate: number }).cpuRate = 0;
    expect(validateBenchResult(r).length).toBeGreaterThan(0);
  });

  it("rejects stats inconsistent with samples", () => {
    const r = wellFormed();
    (r.stats as { n: number }).n = 99;
    expect(validateBenchResult(r).length).toBeGreaterThan(0);
  });

  it("rejects a malformed commit", () => {
    const r = wellFormed();
    (r as { commit: string }).commit = "not a sha";
    expect(validateBenchResult(r).length).toBeGreaterThan(0);
  });
});

describe("emitted artifacts (when the runner has produced results)", () => {
  it("every emitted result JSON satisfies the contract", async () => {
    const fsName = "node:" + "fs";
    const fs = (await import(fsName)) as {
      existsSync(p: string): boolean;
      readdirSync(p: string): string[];
    };
    // vitest runs from the repo root; the results dir is relative to it
    const dir = "benchmarks/results";
    if (!fs.existsSync(dir)) return; // runner not executed here yet
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const raw = (await import("node:" + "fs")) as {
        readFileSync(p: string, enc: string): string;
      };
      const parsed: unknown = JSON.parse(raw.readFileSync(`${dir}/${file}`, "utf8"));
      expect(validateBenchResult(parsed), file).toEqual([]);
    }
  });
});
