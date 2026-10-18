// Purpose: the Node contract tests of the reactive notebook core
//   (tambor-54j.9) — the ported chat-repo contract
//   (docs/reference/chat-repo-cold-read/tests/notebook-core.test.mjs):
//   graph correctness, incremental re-run counts (3 and 6), identity
//   reuse of untouched values, the five per-cell error classes,
//   previously-errored re-runs, the 200-cell chain and the 200k-point
//   array budget — adapted to tambor idioms (vitest, typed, .ts imports).
// Responsibilities: pin runAll's behavior before the Worker boundary and
//   the demo app can be trusted to measure anything.
// Rationale: the notebook's whole point is the incremental interaction —
//   a miscounted dirty closure or a lost identity reuse would make every
//   measured number meaningless, so the contract is checked here, not
//   eyeballed in the browser.

import { describe, expect, it } from "vitest";
import {
  runAll,
  type Cell,
  type OutEntry,
} from "../src/examples/notebook/notebook-core.ts";

// The chat-repo demo notebook: two sliders, two plots, derived arrays.
const CELLS: readonly Cell[] = [
  { id: 1, src: "freq = slider(1, 10, 1, 3)" },
  { id: 2, src: "xs = linspace(0, 6.283, 120)" },
  { id: 3, src: "ys = sin(xs * freq)" },
  { id: 4, src: "plot(xs, ys)" },
  { id: 5, src: "energy = sum(ys * ys) / len(ys)" },
  { id: 6, src: "amp = slider(0.5, 3, 0.1, 1)" },
  { id: 7, src: "zs = ys * amp" },
  { id: 8, src: "plot(xs, zs)" },
];

// A chain of 200 cells off one slider (the bench scenario's shape).
function chainOf(n: number): readonly Cell[] {
  const chain: Cell[] = [{ id: 0, src: "base = slider(0, 10, 1, 1)" }];
  for (let k = 1; k <= n; k++) {
    chain.push({ id: k, src: `c${k} = ${k === 1 ? "base" : `c${k - 1}`} + 1` });
  }
  return chain;
}

describe("notebook core — full run", () => {
  it("runs every cell once and derives the demo's energy", () => {
    const full = runAll(CELLS, {}, {}, null);
    expect(full.ran).toBe(8);
    expect(full.touched).toHaveLength(8);
    const energy = full.out[5];
    expect(energy?.err).toBeUndefined();
    const v = energy?.v;
    expect(typeof v).toBe("number");
    expect(Math.abs((v as number) - 0.5)).toBeLessThan(0.02);
  });

  it("a full run re-runs everything after any edit", () => {
    const prior = runAll(CELLS, {}, {}, null);
    const full = runAll(CELLS, { 6: 2 }, prior.out, null);
    expect(full.ran).toBe(8);
  });
});

describe("notebook core — incremental re-runs", () => {
  it("moving amp re-runs only amp, zs and its plot (3), and reuses untouched values BY IDENTITY", () => {
    const full = runAll(CELLS, {}, {}, null);
    const inc = runAll(CELLS, { 6: 2 }, full.out, [6]);
    expect(inc.ran).toBe(3);
    expect(inc.out[2]).toBe(full.out[2]);
    expect(inc.out[3]).toBe(full.out[3]);
    expect(inc.out[4]).toBe(full.out[4]);
    // zs and its plot DID change
    expect(inc.out[7]).not.toBe(full.out[7]);
    expect(inc.out[8]).not.toBe(full.out[8]);
  });

  it("moving freq re-runs six cells (freq, ys, both plots, energy, zs)", () => {
    const full = runAll(CELLS, {}, {}, null);
    expect(runAll(CELLS, { 1: 5 }, full.out, [1]).ran).toBe(6);
  });

  it("an empty dirty set with no errored cells re-runs nothing", () => {
    const full = runAll(CELLS, {}, {}, null);
    const idle = runAll(CELLS, { 6: 2 }, full.out, []);
    expect(idle.ran).toBe(0);
    expect(idle.out[2]).toBe(full.out[2]);
  });

  it("previously-errored cells re-run even when nothing is dirty", () => {
    const bad: readonly Cell[] = [{ id: 1, src: "a = b + 1" }];
    const first = runAll(bad, {}, {}, null);
    expect(first.out[1]?.err).toMatch(/b is not defined/);
    const retried = runAll(bad, {}, first.out, []);
    expect(retried.ran).toBe(1);
    expect(retried.out[1]?.err).toMatch(/b is not defined/);
  });
});

describe("notebook core — the five error classes, reported per cell", () => {
  it("an undefined name is a cell error", () => {
    const bad = runAll([{ id: 1, src: "a = b + 1" }], {}, {}, null);
    expect(bad.out[1]?.err).toMatch(/b is not defined/);
  });

  it("a two-cell cycle is reported and neither side evaluates", () => {
    const cyc = runAll(
      [{ id: 1, src: "a = b" }, { id: 2, src: "b = a" }],
      {},
      {},
      null,
    );
    const errs = [cyc.out[1]?.err ?? "", cyc.out[2]?.err ?? ""];
    expect(errs.some((e) => /cycle/.test(e))).toBe(true);
  });

  it("a self-reference is a cycle", () => {
    const self = runAll([{ id: 1, src: "x = x + 1" }], {}, {}, null);
    expect(self.out[1]?.err).toMatch(/cycle/);
  });

  it("a duplicate definition is an error on the second cell", () => {
    const dup = runAll(
      [{ id: 1, src: "x = 1" }, { id: 2, src: "x = 2" }],
      {},
      {},
      null,
    );
    expect(dup.out[2]?.err).toMatch(/defined twice/);
  });

  it("a parse error is a cell error", () => {
    const bad = runAll([{ id: 1, src: "x = 1 +" }], {}, {}, null);
    expect(bad.out[1]?.err).toMatch(/ended early|unexpected/);
  });

  it("an unknown function is a cell error", () => {
    const bad = runAll([{ id: 1, src: "x = foo(1)" }], {}, {}, null);
    expect(bad.out[1]?.err).toMatch(/unknown function/);
  });

  it("a reader of a runtime-errored name reports the upstream error", () => {
    const cells: readonly Cell[] = [
      { id: 1, src: "x = foo(1)" },
      { id: 2, src: "y = x + 1" },
    ];
    const run = runAll(cells, {}, {}, null);
    expect(run.out[1]?.err).toMatch(/unknown function/);
    expect(run.out[2]?.err).toMatch(/upstream error in x/);
  });

  it("an empty cell is a cell error", () => {
    const empty = runAll([{ id: 1, src: "   " }], {}, {}, null);
    expect(empty.out[1]?.err).toMatch(/empty cell/);
  });
});

describe("notebook core — scale", () => {
  it("a 200-cell chain evaluates fully, and a slider move re-runs all 201 dependents", () => {
    const chain = chainOf(200);
    const c0 = runAll(chain, {}, {}, null);
    expect(c0.ran).toBe(201);
    expect(c0.out[200]?.v).toBe(201);
    const c1 = runAll(chain, { 0: 5 }, c0.out, [0]);
    expect(c1.ran).toBe(201);
    expect(c1.out[200]?.v).toBe(205);
  });

  it("a fan-out of 200 off one cell re-runs all of them", () => {
    const fan: readonly Cell[] = [
      { id: 0, src: "xs = linspace(0, 6.283, 120)" },
      ...Array.from(
        { length: 200 },
        (_, k): Cell => ({ id: k + 1, src: `f${k} = sum(sin(xs * ${k + 1}))` }),
      ),
    ];
    const f0 = runAll(fan, {}, {}, null);
    expect(f0.ran).toBe(201);
    const f1 = runAll(fan, {}, f0.out, [0]);
    expect(f1.ran).toBe(201);
    expect(f1.out[200]?.v).toEqual(f0.out[200]?.v);
  });

  it("a 200k-point array stays in the compute budget", () => {
    const t0 = Date.now();
    const run = runAll(
      [
        { id: 1, src: "xs = linspace(0, 6.283, 200000)" },
        { id: 2, src: "s = sum(sin(xs * 3))" },
      ],
      {},
      {},
      null,
    );
    const ms = Date.now() - t0;
    const v = run.out[2]?.v;
    expect(typeof v).toBe("number");
    expect(Number.isFinite(v as number)).toBe(true);
    expect(ms).toBeLessThan(2000);
  });
});

describe("notebook core — sliders", () => {
  it("a slider cell's value comes from the sliders map, else its default", () => {
    const cells: readonly Cell[] = [
      { id: 1, src: "f = slider(0, 10, 1, 3)" },
      { id: 2, src: "y = f * 2" },
    ];
    expect(runAll(cells, {}, {}, null).out[2]?.v).toBe(6);
    expect(runAll(cells, { 1: 5 }, {}, null).out[2]?.v).toBe(10);
  });

  it("a malformed slider definition is a cell error", () => {
    const bad = runAll([{ id: 1, src: "f = slider(0, 10)" }], {}, {}, null);
    expect(bad.out[1]?.err).toMatch(/slider/);
  });

  it("redefining a built-in name is a cell error", () => {
    const bad = runAll([{ id: 1, src: "sin = 1" }], {}, {}, null);
    expect(bad.out[1]?.err).toMatch(/built-in/);
  });

  it("array op results are Float64Arrays reused by identity when untouched", () => {
    const full = runAll(CELLS, {}, {}, null);
    const xs = full.out[2]?.v;
    expect(xs).toBeInstanceOf(Float64Array);
    const inc = runAll(CELLS, { 6: 2 }, full.out, [6]);
    expect(inc.out[2]?.v).toBe(xs as OutEntry["v"]);
  });
});
