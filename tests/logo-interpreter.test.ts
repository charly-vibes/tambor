// Purpose: the Logo interpreter contract tests (tambor-y9d.2) — the
//   pure fold from source entries to a drawn world, ported from the
//   wanna-chat session demo.
// Responsibilities: pin the trace counts of the five example programs,
//   late binding (definitions applied first, commands re-run) changing
//   the drawing, and the three error families (unknown command,
//   recursion too deep, too many steps) thrown by derive.
// Rationale: openspec/specs/interop-model/spec.md governs the seam the
//   demo mounts through; the interpreter itself is demo-local logic
//   with no corpus semantics — these tests are the port of the session
//   repo's logo-interpreter.test.mjs, the only executable contract the
//   original ever had.

import { describe, expect, it } from "vitest";

import { derive, EXAMPLES } from "../src/examples/logo/interpreter.ts";

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
});
