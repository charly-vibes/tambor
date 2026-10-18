// Purpose: the whiteboard bench app (tambor-54j.15) — BZ3 of the bench
//   business suite: a 10k-shape scene with drag, resize, undo and
//   remote cursors, mounted as an ordinary gallery demo through the
//   same makeApp/SPA mount path as every other corpus app.
// Responsibilities: whiteboardView (three control rows + summary line +
//   the drawn scene window + the cursor markers) and
//   createWhiteboardApp; the op shapes live in whiteboard-scene.ts.
// Rationale: every op is an ordinary ["update", …] intent applied by
//   the registry-aware dispatcher — no benchmark-specific path. The
//   drawn scene is the honest scene-layer cost: the ~700 shapes the
//   viewport window shows are re-derived (and redrawn) from the full
//   10k array on EVERY dispatch, so the naive cursor pump pays that
//   scene re-derive once per message while the folded burst pays it
//   once — the scene-vs-interaction candidate's data. The buttons:
//   Drag naive (full-scene snapshot per drag — the §4.3 O(n)-copy
//   hazard), Drag log (one old-rect entry), Drag grid (log + the
//   maintained bucket index — the 54j.10 hit-test seam), Undo, Resize
//   one, Cursor naive (one dispatch per message) and Cursor frame (the
//   burst folded into one update).

import {
  button,
  label as labelNode,
  rectangle,
  spacer,
  translate,
  withColor,
  type Color,
  type Elem,
} from "../../views/model.ts";
import { horizontalLayout, verticalLayout } from "../../views/layout.ts";
import type { Intent, IntentList } from "../../events/bubble.ts";
import type { Path } from "../../effects/paths.ts";
import { makeApp, type App } from "../../effects/dispatch.ts";
import { VIEWPORT } from "../../spa/viewport.ts";
import {
  CURSOR_BURST,
  WIN_X,
  WIN_Y,
  dragGridOp,
  dragLogOp,
  dragNaiveOp,
  frameOp,
  naiveMsgOp,
  resizeLogOp,
  seedOp,
  summaryLine,
  undoOp,
  whiteboardState,
  type Cursor,
  type Shape,
  type WBState,
} from "./whiteboard-scene.ts";

// The whole-state path: one drag/undo/seed moves the scene, the
// counters and the history together (the plots shape).
export const STATE_PATH: Path = [] as unknown as Path;

// Scene + cursor colors (normalized RGB triples, the corpus Color shape).
const SHAPE_COLOR: Color = [0.25, 0.5, 0.9];
const CURSOR_COLOR: Color = [0.9, 0.3, 0.1];

// One op button: an ordinary handler returning its plain-data update.
function opButton(text: string, op: (state: WBState) => WBState): Elem {
  return button(text, (): IntentList => [["update", STATE_PATH, op]]);
}

// The naive cursor pump: one dispatch PER message (80 per click) — the
// BZ1 per-message-dispatch baseline at cursor scale. The handler
// returns no intents: the dispatches it performed ARE the op (the
// stream-dashboard shape).
function naivePump(app: App, k: number): void {
  for (let i = 0; i < k; i++) {
    app.dispatch(["update", STATE_PATH, naiveMsgOp] as unknown as IntentList);
  }
}

// One drawn scene shape: translated into the viewport window's
// coordinates, drawn only when its bbox intersects the window.
function sceneShape(s: Shape): Elem | undefined {
  if (s.x + s.w <= WIN_X || s.x >= WIN_X + VIEWPORT[0]) return undefined;
  if (s.y + s.h <= WIN_Y || s.y >= WIN_Y + VIEWPORT[1]) return undefined;
  return translate(
    s.x - WIN_X,
    s.y - WIN_Y,
    withColor(SHAPE_COLOR, rectangle(s.w, s.h)),
  ) as Elem;
}

// The scene layer: the honest full-scene pass per derivation — the
// visibility filter walks ALL 10k shapes every dispatch.
function sceneLayer(shapes: readonly Shape[]): Elem {
  const visible: Elem[] = [];
  for (const s of shapes) {
    const node = sceneShape(s);
    if (node !== undefined) visible.push(node);
  }
  return translate(-WIN_X, -WIN_Y, visible) as Elem;
}

// The interaction layer: one marker per remote cursor (view-space —
// cursor positions need no window transform).
function cursorLayer(users: readonly Cursor[]): Elem {
  return translate(
    0,
    0,
    users.map((c) => withColor(CURSOR_COLOR, translate(c.x, c.y, rectangle(6, 6)))),
  ) as Elem;
}

// The control rows: three per row — five buttons overflow the 300px
// viewport's single row (the plots note).
function controlRows(appOf: () => App): readonly Elem[] {
  const row1 = horizontalLayout([
    opButton("Seed 10k", seedOp),
    spacer(5, 0),
    opButton("Drag naive", dragNaiveOp),
    spacer(5, 0),
    opButton("Drag log", dragLogOp),
  ]) as Elem;
  const row2 = horizontalLayout([
    opButton("Drag grid", dragGridOp),
    spacer(5, 0),
    opButton("Undo", undoOp),
    spacer(5, 0),
    opButton("Resize one", resizeLogOp),
  ]) as Elem;
  const row3 = horizontalLayout([
    button("Cursor naive", (): IntentList => {
      naivePump(appOf(), CURSOR_BURST);
      return [];
    }),
    spacer(5, 0),
    opButton("Cursor frame", frameOp),
  ]) as Elem;
  return [row1, spacer(0, 4), row2, spacer(0, 4), row3] as readonly Elem[];
}

// The whiteboard view: the control rows, the summary (the no-op guard
// line), then the scene + cursor layers — a pure function of state.
export function whiteboardView(state: WBState, appOf: () => App): Elem {
  const summary = labelNode(summaryLine(state)) as Elem;
  const body = [
    ...controlRows(appOf),
    spacer(0, 4),
    summary,
    spacer(0, 4),
    sceneLayer(state.shapes),
    cursorLayer(state.cursors.users),
  ] as readonly Elem[];
  return (verticalLayout(body) ?? summary) as Elem;
}

// The bench app: the ordinary registry-aware makeApp mount. The app
// instance is captured so the naive pump can dispatch per-message.
export function createWhiteboardApp(): App {
  let app: App | undefined;
  const appOf = (): App => {
    if (app === undefined) throw new Error("whiteboard not mounted");
    return app;
  };
  app = makeApp({
    view: (state) => whiteboardView(state as WBState, appOf),
    state: whiteboardState(),
    backend: { containerSize: VIEWPORT },
  });
  return app;
}
