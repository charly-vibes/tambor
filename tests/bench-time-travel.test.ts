// Purpose: contract tests for the time-travel-10k bench app (tambor-bkg)
//   — the step-log append, the scrub-to-k and undo-one update intents
//   must work through the plain makeApp wire before the browser
//   scenario can be trusted to measure anything.
// Responsibilities: pin (a) the empty log draws zero step labels,
//   (b) appendSteps appends 10k fresh steps with continuing ids,
//   (c) the ordinary build intents, applied by the app's dispatcher,
//   make the view emit 10k step labels (the browser's measured op),
//   (d) scrub-to-5k halves the drawn prefix to 5k labels, (e) undo-one
//   rewinds the drawn prefix by exactly one label.
// Rationale: the keyed-table/turtle finding generalizes — a bench app
//   whose measured op is a no-op produces overhead-only medians; these
//   tests make "the op actually happened" a checked contract instead
//   of a screenshot eyeball.

import { describe, it, expect } from "vitest";
import type { Elem } from "../src/views/model.ts";
import {
  createTimeTravel10kApp,
  timeTravelState,
  appendSteps,
  advanceCursor,
  scrubTo,
  undoOne,
  STEP_CHUNK,
  SCRUB_TARGET,
  STEPS_PATH,
  CURSOR_PATH,
  type TimeTravelState,
} from "../src/examples/bench/time-travel-10k.ts";
import { scanOf } from "./helpers/scan.ts";

// The drawn step labels of a view: the labels whose text names a step
// (the drawn visible prefix), excluding the cursor readout.
function stepLabelsOf(view: Elem): readonly string[] {
  return scanOf(view).flatMap((f) =>
    f.node.type === "label" && f.node.text.startsWith("step ")
      ? [f.node.text]
      : [],
  );
}

// The app after the ordinary build intents (append + cursor advance)
// applied through the real dispatcher — the browser's measured op.
function builtApp(): ReturnType<typeof createTimeTravel10kApp> {
  const app = createTimeTravel10kApp();
  app.dispatch([
    ["update", STEPS_PATH, appendSteps],
    ["update", CURSOR_PATH, advanceCursor],
  ]);
  return app;
}

describe("time-travel-10k bench app", () => {
  it("empty log draws zero step labels", () => {
    expect(stepLabelsOf(createTimeTravel10kApp().view()).length).toBe(0);
  });

  it("appendSteps appends 10k fresh steps with continuing ids", () => {
    const first = appendSteps(timeTravelState().steps);
    expect(first.length).toBe(STEP_CHUNK);
    expect(first[0]?.id).toBe(0);
    expect(first[STEP_CHUNK - 1]?.id).toBe(STEP_CHUNK - 1);
    // a second append continues the ids, never colliding
    const second = appendSteps(first);
    expect(second.length).toBe(2 * STEP_CHUNK);
    expect(second[STEP_CHUNK]?.id).toBe(STEP_CHUNK);
  });

  it("the ordinary build intents through the app make the view emit 10k step labels", () => {
    const labels = stepLabelsOf(builtApp().view());
    expect(labels.length).toBe(10000);
    expect(labels[0]).toBe("step 0 — step 0");
    expect(labels[9999]).toBe("step 9999 — step 9999");
  });

  it("scrub-to-5k halves the drawn prefix to 5k labels", () => {
    const app = builtApp();
    app.dispatch(["update", CURSOR_PATH, scrubTo(SCRUB_TARGET)]);
    expect(app.getState() as TimeTravelState).toMatchObject({
      cursor: SCRUB_TARGET,
    });
    const labels = stepLabelsOf(app.view());
    expect(labels.length).toBe(5000);
    expect(labels[4999]).toBe("step 4999 — step 4999");
  });

  it("undo-one rewinds the drawn prefix by exactly one label", () => {
    const app = builtApp();
    app.dispatch(["update", CURSOR_PATH, undoOne]);
    expect(app.getState() as TimeTravelState).toMatchObject({
      cursor: STEP_CHUNK - 1,
    });
    const labels = stepLabelsOf(app.view());
    expect(labels.length).toBe(9999);
    expect(labels[9998]).toBe("step 9998 — step 9998");
  });
});
