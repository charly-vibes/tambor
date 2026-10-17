// Purpose: the Logo interpreter contract tests (tambor-y9d.2) — the
//   pure fold from source entries to a drawn world, ported from the
//   wanna-chat session demo.
// Responsibilities: pin the trace counts of the five example programs,
//   late binding (definitions applied first, commands re-run) changing
//   the drawing, and the four error families (unknown command,
//   recursion too deep, too many steps, non-finite number) thrown by
//   derive; plus the tambor-mgb edge cases — an empty repeat body still
//   consuming the step budget, unspaced operators tokenizing as
//   separate tokens (a leading minus stays with its number).
// Rationale: openspec/specs/interop-model/spec.md governs the seam the
//   demo mounts through; the interpreter itself is demo-local logic
//   with no corpus semantics — these tests are the port of the session
//   repo's logo-interpreter.test.mjs, the only executable contract the
//   original ever had.

import { describe, expect, it } from "vitest";

import { derive, EXAMPLES } from "../src/examples/logo/interpreter.ts";
import { tokenize } from "../src/examples/logo/expr.ts";

describe("logo-interpreter — the world is a fold over entries", () => {
  it("draws the example programs with the pinned trace counts", () => {
    expect(derive([{ text: EXAMPLES["square"] as string }], false).trace.length).toBe(4);
    expect(derive([{ text: EXAMPLES["star"] as string }], false).trace.length).toBe(5);
    expect(derive([{ text: EXAMPLES["spiral"] as string }], false).trace.length).toBe(66);
    expect(derive([{ text: EXAMPLES["flower"] as string }], false).trace.length).toBe(720);
    expect(derive([{ text: EXAMPLES["tree"] as string }], false).trace.length).toBe(254);
  });

  it("late binding redraws with the newest procedure definitions", () => {
    const entries = [
      { text: EXAMPLES["spiral"] as string },
      { text: "to spiral :n\n fd :n rt 121\n if :n < 200 [spiral :n + 3]\nend" },
    ];
    const early = derive(entries, false).trace[1];
    const late = derive(entries, true).trace[1];
    expect(late).not.toEqual(early);
  });

  it("rejects an unknown command", () => {
    expect(() => derive([{ text: "foo" }], false)).toThrow(/don't know how to foo/);
  });

  it("rejects runaway recursion", () => {
    expect(() => derive([{ text: "to a a end a" }], false)).toThrow(/recursion too deep/);
  });

  it("rejects an infinite loop by step budget", () => {
    expect(() =>
      derive([{ text: "repeat 99999 [repeat 99999 [fd 1]]" }], false),
    ).toThrow(/too many steps/);
  });

  it("rejects a non-finite number as a typed error (tambor-mgb)", () => {
    // fd 1 / 0 used to poison the turtle with Infinity → invalid SVG path
    // data; the corpus convention is a typed error (the scrollview div0
    // fallback of 0 is only sensible for scrollbars), so every numeric
    // coercion rejects non-finite values
    expect(() => derive([{ text: "fd 1 / 0" }], false)).toThrow(/finite/);
    expect(() => derive([{ text: "rt 1 / 0" }], false)).toThrow(/finite/);
  });
});

describe("logo-interpreter — tambor-mgb edge cases", () => {
  it("an empty repeat body still consumes the step budget proportionally to N", () => {
    // steps were counted per executed token, so an empty body ran N
    // iterations for free — 100000 (≫ the 30000 budget) must be rejected
    expect(() => derive([{ text: "repeat 100000 []" }], false)).toThrow(
      /too many steps/,
    );
    // a small empty repeat stays legal and draws nothing
    const w = derive([{ text: "repeat 100 []" }], false);
    expect(w.trace.length).toBe(0);
    expect(w.x).toBe(0);
    expect(w.y).toBe(0);
  });

  it("tokenizes unspaced operator runs as separate tokens", () => {
    expect(tokenize("fd 10+5")).toEqual(["fd", "10", "+", "5"]);
    expect(tokenize("rt 360/5")).toEqual(["rt", "360", "/", "5"]);
    expect(tokenize(":n*2")).toEqual([":n", "*", "2"]);
    // the negative-number reading is pinned: a leading minus (not
    // preceded by a token character) stays with its number — subtraction
    // only splits when the minus follows a token character
    expect(tokenize("fd -5")).toEqual(["fd", "-5"]);
    expect(tokenize("fd 10-5")).toEqual(["fd", "10", "-", "5"]);
  });

  it("runs programs written with unspaced operators", () => {
    const fd = derive([{ text: "fd 10+5" }], false);
    expect(fd.y).toBe(15);
    const rt = derive([{ text: "rt 360/5" }], false);
    expect(rt.hd).toBe(72);
    // the misleading case: :n*2 used to read as the variable ":n*2"
    const proc = derive([{ text: "to t :n\n fd :n*2\nend\nt 3" }], false);
    expect(proc.y).toBe(6);
  });
});
