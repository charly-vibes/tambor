// Purpose: per-gate timing instrumentation for the pre-push gate suite
// (tambor-j44) — lefthook prints per-job durations only in its ephemeral
// summary; this wrapper persists each gate's cost to .gate-timing.log so a
// distribution can be measured before restructuring the suite.
//
// Contract under test (tools/gate-timing.sh):
//   gate-timing.sh <gate-name> <cmd...> runs <cmd>, propagates its exit
//   code, and appends `ts,gate,exit,duration_ms` (header on first write)
//   to $GATE_TIMING_LOG (default: ./.gate-timing.log).
// Each property row is verified by exactly one dedicated scenario.
import { expect, it, describe, afterEach } from "vitest";
// @ts-expect-error node:child_process has no type declarations here
import { spawnSync } from "node:child_process";
// @ts-expect-error node:fs has no type declarations here
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
// @ts-expect-error node:os has no type declarations here
import { tmpdir } from "node:os";
// @ts-expect-error node:path has no type declarations here
import path from "node:path";

const script = path.resolve("tools/gate-timing.sh");

const tmpdirs: string[] = [];
function tmpDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "gate-timing-"));
  tmpdirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tmpdirs.splice(0)) rmSync(dir, { recursive: true });
});

// The wrapper's default log is cwd-relative (./.gate-timing.log), so each
// run gets its own cwd — no env injection, keeping the test free of node
// process types.
function run(gate: string, cmd: string[], dir: string): ReturnType<typeof spawnSync> {
  return spawnSync(script, [gate, ...cmd], { cwd: dir, encoding: "utf8" });
}

function logPath(dir: string): string {
  return path.join(dir, ".gate-timing.log");
}

function rows(log: string): string[] {
  return readFileSync(log, "utf8").trimEnd().split("\n");
}

describe("gate-timing.sh", () => {
  it("p_gate_timing_logs_row: success command appends a CSV row naming the gate, exit 0, positive duration", () => {
    const dir = tmpDir();
    const log = logPath(dir);
    const r = run("pretender-gate-full", ["sleep", "0.05"], dir);
    expect(r.status).toBe(0);
    expect(existsSync(log)).toBe(true);
    const [header, row] = rows(log);
    expect(header).toBe("ts,gate,exit,duration_ms");
    const [ts, gate, exit, ms] = row!.split(",");
    expect(gate).toBe("pretender-gate-full");
    expect(exit).toBe("0");
    expect(Number(ms)).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(ts!))).toBe(false);
  });

  it("p_gate_timing_propagates_exit: failing command propagates its exit code and logs it", () => {
    const dir = tmpDir();
    const log = logPath(dir);
    const r = run("some-gate", ["sh", "-c", "exit 3"], dir);
    expect(r.status).toBe(3);
    const [, row] = rows(log);
    const [, gate, exit, ms] = row!.split(",");
    expect(gate).toBe("some-gate");
    expect(exit).toBe("3");
    expect(Number(ms)).toBeGreaterThan(0);
  });

  it("p_gate_timing_appends: repeated runs append rows without clobbering the log", () => {
    const dir = tmpDir();
    const log = logPath(dir);
    run("g1", ["true"], dir);
    run("g2", ["true"], dir);
    const all = rows(log);
    expect(all).toHaveLength(3); // header + 2 rows
    expect(all[1]!.split(",")[1]).toBe("g1");
    expect(all[2]!.split(",")[1]).toBe("g2");
  });
});

describe("lefthook pre-push wiring", () => {
  it("p_every_push_gate_times_itself: every pre-push job runs through the timing wrapper", () => {
    const yml = readFileSync(path.resolve("lefthook.yml"), "utf8");
    expect(yml).toContain("\npre-push:");
    const prePush = yml.split("\npre-push:")[1] ?? "";
    // every job's `run:` in the pre-push block goes through gate-timing.sh
    const runs = [...prePush.matchAll(/^\s+run:\s*(.+)$/gm)].map((m) => m[1]);
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) expect(r).toMatch(/tools\/gate-timing\.sh/);
  });
});