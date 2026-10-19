// Purpose: the drawn half of the log-stream benchmark app (tambor-54j.17
//   BZ5) — the view and the makeApp mount, split from log-stream.ts's
//   state/ops half to stay inside the pretender file budget.
// Responsibilities: opButton/controlRow (the ingest/search buttons),
//   logStreamView (summary lines, match sample, fixed-height ring
//   window, the naive corpus's unbounded label stack) and
//   createLogStreamApp (the ordinary registry-aware makeApp mount).
// Rationale: openspec/specs/components-ring_buffer/spec.md is the
//   design authority for the bounded store this view rides; the drawn
//   window is newestSeries (only the newest WINDOW_DRAWN lines drawn —
//   the fixed-height candidate half of BZ5).

import {
  button,
  label as labelNode,
  spacer,
  type Elem,
} from "../../views/model.ts";
import { horizontalLayout, verticalLayout } from "../../views/layout.ts";
import type { IntentList } from "../../events/bubble.ts";
import { makeApp, type App } from "../../effects/dispatch.ts";
import { VIEWPORT } from "../../spa/viewport.ts";
import { newestSeries } from "../../components/ring_buffer/ring_buffer.ts";
import {
  LINES_PATH,
  RING_APPEND_PATH,
  RING_NEXT_PATH,
  SEARCH_ALL_PATH,
  SEARCH_RING_PATH,
  TOTAL_PATH,
  WINDOW_DRAWN,
  appendNaiveOp,
  logStreamState,
  ringAppendOp,
  ringNextTick,
  searchAllOp,
  searchRingOp,
  summaryLines,
  totalTick,
  type LogStreamState,
} from "./log-stream.ts";

// One op button: an ordinary handler returning its plain-data updates.
function opButton(text: string, intents: IntentList): Elem {
  return button(text, (): IntentList => intents);
}

// The ingest/search buttons, two per row: four buttons overflow the
// 300px viewport's single row and the real-text-metric layout then
// diverges from the in-process replay coordinates the bench points
// resolve from (the drive.ts divergence note) — a two-row control
// keeps every drawn button under the point its scan computes. The
// search buttons ingest-then-search: one click is one stream cycle
// (batch lands, then the scan runs), so the scan covers the fresh
// batch too.
function controlRow(): Elem {
  const ingest = horizontalLayout([
    opButton("Append 250", [
      ["update", LINES_PATH, appendNaiveOp],
      ["update", TOTAL_PATH, totalTick],
    ] as IntentList),
    spacer(5, 0),
    opButton("Ring append 250", [
      ["update", RING_APPEND_PATH, ringAppendOp],
      ["update", RING_NEXT_PATH, ringNextTick],
      ["update", TOTAL_PATH, totalTick],
    ] as IntentList),
  ]) as Elem;
  const search = horizontalLayout([
    opButton("Search all", [
      ["update", LINES_PATH, appendNaiveOp],
      ["update", TOTAL_PATH, totalTick],
      ["update", SEARCH_ALL_PATH, searchAllOp],
    ] as IntentList),
    spacer(5, 0),
    opButton("Search ring", [
      ["update", RING_APPEND_PATH, ringAppendOp],
      ["update", RING_NEXT_PATH, ringNextTick],
      ["update", TOTAL_PATH, totalTick],
      ["update", SEARCH_RING_PATH, searchRingOp],
    ] as IntentList),
  ]) as Elem;
  return (verticalLayout([ingest, search]) ?? ingest) as Elem;
}

// The log-stream view: the control row, then the summary lines, the
// match sample, the fixed-height ring window, and the naive corpus's
// full (unbounded — the failure the scenario measures) label stack.
export function logStreamView(state: LogStreamState): Elem {
  const summaries = summaryLines(state).map((text) => labelNode(text));
  const matches = state.results.sample.map((line) =>
    labelNode(`match ${line.id} — ${line.msg}`),
  );
  const window = newestSeries(state.ring, WINDOW_DRAWN).map((line) =>
    labelNode(`kept ${line.id} — ${line.msg}`),
  );
  const body = state.lines.map((line) => labelNode(line.msg));
  const head = [...summaries, ...matches, ...window] as readonly Elem[];
  const stack = [...head, ...body] as readonly Elem[];
  const controls = controlRow();
  return (verticalLayout([controls, spacer(0, 10), ...stack]) ??
    controls) as Elem;
}

// The bench app: the ordinary registry-aware makeApp mount, the same
// shape gallery.ts's demos use — no benchmark-specific path.
export function createLogStreamApp(): App {
  return makeApp({
    view: (state) => logStreamView(state as LogStreamState),
    state: logStreamState(),
    backend: { containerSize: VIEWPORT },
  });
}
