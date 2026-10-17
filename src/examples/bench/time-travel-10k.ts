// Purpose: the time-travel benchmark app (tambor-bkg B5) — a step log
//   of 10k plain-data steps with scrub-to-step-k and undo-one as
//   ordinary update intents, mounted as an ordinary gallery demo
//   through the same makeApp/SPA mount path as every other corpus app.
// Responsibilities: Step/TimeTravelState, timeTravelState (empty log,
//   cursor 0), STEPS_PATH/CURSOR_PATH, the op builders — appendSteps
//   (10k fresh steps, ids continue), advanceCursor (cursor follows the
//   appended steps), scrubTo (absolute cursor set), undoOne (cursor −1,
//   never below 0), and timeTravelView (a control row of op buttons
//   over the visible prefix stack).
// Rationale: no benchmark-specific fast paths — the keyed-table-faithful
//   reading of time travel: the log is plain data that is never
//   rewritten, and the cursor is the time-travel position, exactly the
//   logo demo's `fold(entries[0..cursor])` shape (src/examples/logo/
//   logo.ts). The view is a pure function of plain state: the drawn
//   stack is the visible prefix steps[0..cursor], re-derived whole on
//   every op (the honest measure — the same whole-view re-derive the
//   form-200 bench names as the weak spot). Every op is an ordinary
//   ["update", …] intent applied by the registry-aware dispatcher; the
//   demo starts with an empty log so a "Build 10k" click is the
//   measured creation op (scenario time-travel-10k-build) and the
//   scrub/undo cycles are the re-derive ops (scenario
//   time-travel-10k-ops). Scrub targets are constants of the bench
//   (SCRUB_TARGET and STEP_CHUNK): the bench log is exactly STEP_CHUNK
//   long after its build op, and the view slices safely regardless.

import {
  button,
  label as labelNode,
  spacer,
  type Elem,
} from "../../views/model.ts";
import { horizontalLayout, verticalLayout } from "../../views/layout.ts";
import type { IntentList } from "../../events/bubble.ts";
import type { Path } from "../../effects/paths.ts";
import { makeApp, type App } from "../../effects/dispatch.ts";
import { VIEWPORT } from "../../spa/viewport.ts";

// One logged step: a stable id (the key the log preserves) and a
// mutable label (the datum the step carries).
export interface Step {
  readonly id: number;
  readonly label: string;
}

// The app state: plain data — the step log and the time-travel cursor
// (how many of the log's steps the view draws). Nothing else.
export interface TimeTravelState {
  readonly steps: readonly Step[];
  readonly cursor: number;
}

// The paths the op buttons update.
export const STEPS_PATH: Path = [["keypath", "steps"]];
export const CURSOR_PATH: Path = [["keypath", "cursor"]];

// The bench's step count: one build op appends this many steps.
export const STEP_CHUNK = 10000;

// The scrub target the ops scenario cycles through (half the log).
export const SCRUB_TARGET = STEP_CHUNK / 2;

// The demo's initial state: an empty log at cursor 0 — building the
// log is the measured op.
export function timeTravelState(): TimeTravelState {
  return { steps: [], cursor: 0 };
}

// The integers 0..n-1, ascending.
function range(n: number): readonly number[] {
  return Array.from({ length: n }, (_, i) => i);
}

// The largest id already in use (−1 when empty), so fresh ids never
// collide with steps still in the log after a rebuild.
function maxId(steps: readonly Step[]): number {
  return steps.reduce((max, step) => Math.max(max, step.id), -1);
}

// Append n fresh steps labelled "step <n>": ids continue after
// anything already in the log (the appendRows contract, keyed-table).
export function appendSteps(
  current: readonly Step[],
  n: number = STEP_CHUNK,
): readonly Step[] {
  const start = maxId(current) + 1;
  return [
    ...current,
    ...range(n).map((i) => ({ id: start + i, label: `step ${start + i}` })),
  ];
}

// The cursor's build companion: the cursor advances with the appended
// steps, so a fresh build ends fully scrubbed to the log's end.
export function advanceCursor(cursor: number): number {
  return cursor + STEP_CHUNK;
}

// Scrub to step k: the time-travel position is set absolutely (the
// same plain set the logo demo's slider applies at CURSOR_PATH) — the
// log is never rewritten, only the visible prefix moves.
export function scrubTo(k: number): (cursor: number) => number {
  return () => Math.max(0, k);
}

// Undo one step: rewind the cursor by exactly one — the log is
// untouched, the visible prefix shortens by a single step.
export function undoOne(cursor: number): number {
  return Math.max(0, cursor - 1);
}

// One op button: an ordinary handler returning its plain-data update.
function opButton(text: string, op: (cursor: number) => number): Elem {
  return button(text, (): IntentList => [["update", CURSOR_PATH, op]]);
}

// The drawn step: one label carrying the step's id and label.
function stepLabel(step: Step): Elem {
  return labelNode(`step ${step.id} — ${step.label}`);
}

// The time-travel view: the control row, the cursor readout, then the
// visible prefix as a label stack. The stack is re-derived from the
// plain state on every view call — the honest whole-view measure.
export function timeTravelView(state: TimeTravelState): Elem {
  const controls = horizontalLayout([
    button("Build 10k", (): IntentList => [
      ["update", STEPS_PATH, (steps: readonly Step[]) => appendSteps(steps)],
      ["update", CURSOR_PATH, advanceCursor],
    ] as IntentList),
    spacer(5, 0),
    opButton("Scrub to 5k", scrubTo(SCRUB_TARGET)),
    spacer(5, 0),
    opButton("Scrub to 10k", scrubTo(STEP_CHUNK)),
    spacer(5, 0),
    opButton("Undo one", undoOne),
  ]) as Elem;
  const readout = labelNode(
    `${Math.min(state.cursor, state.steps.length)}/${state.steps.length}`,
  );
  const visible = state.steps.slice(0, state.cursor).map(stepLabel);
  const body = [controls, spacer(0, 10), readout, ...visible] as readonly Elem[];
  return (verticalLayout(body) ?? controls) as Elem;
}

// The bench app: the ordinary registry-aware makeApp mount, the same
// shape gallery.ts's demos use — no benchmark-specific path.
export function createTimeTravel10kApp(): App {
  return makeApp({
    view: (state) => timeTravelView(state as TimeTravelState),
    state: timeTravelState(),
    backend: { containerSize: VIEWPORT },
  });
}
