// Purpose: the turtle-canvas benchmark app (tambor-ibh) — B4 of the
//   bench core suite: 20k animated-path segments driven through the
//   EXISTING logo interpreter (no fork of semantics), mounted as an
//   ordinary gallery demo through the same makeApp/SPA mount path as
//   every other corpus app.
// Responsibilities: TurtleState (the program entries in state, world
//   derived in the view), turtle20kState (empty program), the op
//   builders — draw20k (sets the 20k-segment program), recolor (flips
//   the pen color over the drawn trace), turtle20kView (the derived
//   trace as drawn path segments via canvas.ts's seg normalization).
// Rationale: no benchmark-specific fast paths: the world is derived by
//   the corpus interpreter (src/examples/logo/interpreter.ts derive —
//   the same pure fold the logo demo runs) and every op is an ordinary
//   ["update", …] intent; the view re-derives the interpreter output
//   and emits the 20k path segments the same way the logo canvas does,
//   so the scenario measures the real draw + re-derive cost. The demo
//   starts with an empty program so a "Draw 20k" click is the measured
//   creation op (scenario turtle-20k-draw) and recolor cycles are the
//   re-derive op (scenario turtle-20k-recolor).

import {path as pathNode,
  rectangle,
  spacer,
  translate,
  withColor,
  withStrokeWidth,
  button,
  type Elem,
} from "../../views/model.ts";
import { horizontalLayout,} from "../../views/layout.ts";
import type { Intent, IntentList } from "../../events/bubble.ts";
import type { Path } from "../../effects/paths.ts";
import { makeApp, type App } from "../../effects/dispatch.ts";
import { derive, type TraceSeg } from "../logo/interpreter.ts";
import { hexColor } from "../logo/canvas.ts";
import { VIEWPORT } from "../../spa/viewport.ts";

// The world radius the logo canvas normalizes around (canvas.ts).
const WORLD_RADIUS = 300;

// The app state: plain data — the program entries (the logo
// dialect's entry list) and the selected pen color.
export interface TurtleState {
  readonly program: string;
  readonly color: string;
}

export const PROGRAM_PATH: Path = [["keypath", "program"]];
export const COLOR_PATH: Path = [["keypath", "color"]];

// The demo's initial state: no program — drawing it is the measured op.
export function turtle20kState(): TurtleState {
  return { program: "", color: "blue" };
}

// The 20k-segment program: a dense spiral (repeat with per-step
// forward+turn), the same dialect the logo demo runs.
export const PROGRAM_20K = "repeat 20000 [fd 5 rt 2]";

// The trace the corpus interpreter derives from the program.
export function traceOf(state: TurtleState): readonly TraceSeg[] {
  if (state.program === "") return [];
  // The 20k-segment program needs ~3 interpreter steps per segment —
  // far past the demo's interactive 30k budget, so the bench derives
  // with an explicit larger budget (documented: the interactive demo
  // keeps its own default; this is the bench's bounded need, not an
  // unbounded run).
  const world = derive([{ text: state.program }], false, "en", 200000);
  return world.trace;
}

// The drawn segment: the same normalization the logo canvas uses
// (item top-left at local origin, y-down flip around WORLD_RADIUS).
export function segNode(seg: TraceSeg): Elem {
  const ax = seg[0] + WORLD_RADIUS;
  const ay = WORLD_RADIUS - seg[1];
  const bx = seg[2] + WORLD_RADIUS;
  const by = WORLD_RADIUS - seg[3];
  const ox = Math.min(ax, bx);
  const oy = Math.min(ay, by);
  const line = pathNode([ax - ox, ay - oy], [bx - ox, by - oy]);
  const node = withStrokeWidth(2, withColor(hexColor(seg[4]), line as Elem));
  return translate(ox, oy, node as Elem);
}

// The view: a control row over the derived trace stack. The derive
// runs on every view call — the honest whole-view re-derive measure.
export function turtle20kView(state: TurtleState): Elem {
  const controls = horizontalLayout([
    button("Draw 20k", (): IntentList => [
      ["update", PROGRAM_PATH, () => PROGRAM_20K as unknown as never],
    ] as Intent[] as IntentList),
    spacer(5, 0),
    button("Recolor red", (): IntentList => [
      ["update", COLOR_PATH, (c: string) => (c === "red" ? "blue" : "red") as unknown as never],
    ] as Intent[] as IntentList),
  ]) as Elem;
  const segs = traceOf(state).map((s) => segNode([s[0], s[1], s[2], s[3], state.color]));
  // Bare-array composition: the segments superimpose at the shared
  // origin (the same paintTree shape the logo canvas uses — canvas.ts
  // logoCanvas returns a bare list; layout would stack them, which is
  // not the turtle's geometry).
  return [controls, spacer(0, 10), ...segs] as unknown as Elem;
}

// The bench app: the ordinary registry-aware makeApp mount.
export function createTurtle20kApp(): App {
  return makeApp({
    view: (state) => turtle20kView(state as TurtleState),
    state: turtle20kState(),
    backend: { containerSize: VIEWPORT },
  });
}

// Hit-testable surface for the drawn segments (parity with the logo
// canvas's invisible hit pads — kept minimal here: the bench measures
// draw/re-derive, not hit-testing, and the segments carry no handlers).
export const _hitPad = rectangle;
