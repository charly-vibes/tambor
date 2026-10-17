// Purpose: contract tests for the turtle-20k bench app (tambor-ibh) —
//   the interpreter re-derive + the ordinary update intents must work
//   through the plain makeApp wire before the browser scenario can be
//   trusted to measure anything.
// Responsibilities: pin (a) traceOf derives 20k segments for the bench
//   program under the explicit budget, (b) an ordinary ["update", …]
//   on the program path, applied by the app's dispatcher, makes the
//   view emit 20k translated segments (the browser's measured op),
//   (c) the empty program draws zero segments.
// Rationale: the first keyed-table finding generalizes — a bench app
//   whose measured op is a no-op produces overhead-only medians; these
//   tests make "the op actually happened" a checked contract instead
//   of a screenshot eyeball.

import { describe, it, expect } from "vitest";
import {
  createTurtle20kApp,
  turtle20kState,
  traceOf,
  PROGRAM_20K,
  PROGRAM_PATH,
  type TurtleState,
} from "../src/examples/bench/turtle-20k.ts";
import { scanOf } from "./helpers/scan.ts";

describe("turtle-20k bench app", () => {
  it("empty program draws zero segments", () => {
    expect(traceOf(turtle20kState()).length).toBe(0);
  });

  it("derives 20k segments for the bench program (explicit budget)", () => {
    const segs = traceOf({ program: PROGRAM_20K, color: "blue" } as TurtleState);
    expect(segs.length).toBe(20000);
  });

  it("the ordinary update intent through the app makes the view emit 20k segments", () => {
    const app = createTurtle20kApp();
    app.dispatch(["update", PROGRAM_PATH, () => PROGRAM_20K]);
    const view = app.view();
    // 20k segments, each a translate wrapper carrying a path node
    const found = scanOf(view);
    const paths = found.filter((f) => f.node.type === "path");
    expect(paths.length).toBe(20000);
  });
});
