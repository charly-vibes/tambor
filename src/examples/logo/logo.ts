// Purpose: the example.logo demo app (tambor-y9d.2) — the wanna-chat
//   Logo world rebuilt on the real library: a live world whose state is
//   plain data and whose view re-derives from
//   `fold(entries[0..cursor])` every render.
// Responsibilities: the LogoState shape (src, entries, cursor, late?,
//   err) and initial data; the run/clear handlers as per-app registry
//   entries (makeOpsApp — never the global registry); CURSOR/SRC/LATE
//   paths; the pure view — the turtle trace as colored path segments,
//   the time-travel slider bound to the cursor, the ◀ ▶ stepper
//   buttons, the example and procedure buttons, the corpus textarea
//   bound to src, the error label — and the corpus App wire
//   (view/dispatch/getState) over makeOpsApp for mountDemo.
// Rationale: the wanna-chat session demo (insights/dynamic-environment.md)
//   is the design authority for the fold/liveness semantics;
//   openspec/specs/interop-model/spec.md governs the per-app seam
//   (ops_bound_to_app: the registry is constructor state, never module
//   state) and openspec/specs/example-todo/spec.md the textarea and
//   wrapOn wiring the SPA runs through. All widgets are corpus
//   components: slider (components.numeric), textarea
//   (components.textarea), buttons returning effect vectors.

import { makeOpsApp } from "../../interop/app.ts";
import { makeRegistry, type InterHandler } from "../../interop/seam.ts";
import type { App } from "../../effects/dispatch.ts";
import type { Path } from "../../effects/paths.ts";
import type { IntentList } from "../../events/bubble.ts";
import {
  button,
  label as labelNode,
  path as pathNode,
  translate,
  withColor,
  withStrokeWidth,
  type Color,
  type Elem,
} from "../../views/model.ts";
import { verticalLayout } from "../../views/layout.ts";
import { slider } from "../../components/numeric/slider.ts";
import { call, render } from "../../model/component.ts";
import { textarea } from "../../components/textarea/textarea.ts";
import { initialTextareaExtra } from "../../components/textarea/edit.ts";
import {
  derive,
  EXAMPLES,
  procText,
  type LogoEntry,
  type Proc,
  type TraceSeg,
  type World,
} from "./interpreter.ts";

// The demo's presentation constants (original CSS analogues).
const INK: Color = [0.11, 0.106, 0.098];
const TURTLE: Color = [0.7, 0.149, 0.118];
const ERROR: Color = [0.7, 0.149, 0.118];
const WORLD_RADIUS = 200;

export const LOGO_TITLE = "tambor logo";

// The state shape of the demo: plain data throughout.
export interface LogoState {
  readonly src: string;
  readonly entries: readonly LogoEntry[];
  readonly cursor: number;
  readonly "late?": boolean;
  readonly err: string;
  readonly "slider-mdown?": boolean;
}

export function logoState(): LogoState {
  return {
    src: EXAMPLES["spiral"] as string,
    entries: [],
    cursor: 0,
    "late?": false,
    err: "",
    "slider-mdown?": false,
  };
}

// The paths the demo edits. The demo runs on the ops seam (makeOpsApp):
// there a path is a plain array of host-data steps, carried opaquely by
// the corpus components and applied directly by seamSet/seamUpdate —
// the keypath navigator form belongs to the global-dispatch tier
// (interop-model: paths are host data, passed untouched).
const step = (...steps: readonly string[]): Path => steps as unknown as Path;
export const SRC_PATH: Path = step("src");
export const CURSOR_PATH: Path = step("cursor");
export const LATE_PATH: Path = step("late?");
export const SLIDER_MDOWN_PATH: Path = step("slider-mdown?");

// run: keep entries[0..cursor], append the editor source, validate by
// deriving, move the cursor to the end — or record the error without
// touching entries.
export function runLogo(s: LogoState): LogoState {
  const entries: readonly LogoEntry[] = [
    ...s.entries.slice(0, s.cursor),
    { text: s.src },
  ];
  try {
    derive(entries, s["late?"]);
    return { ...s, entries, cursor: entries.length, err: "" };
  } catch (e) {
    return { ...s, err: e instanceof Error ? e.message : String(e) };
  }
}

// clear: the world is empty again.
export function clearLogo(s: LogoState): LogoState {
  return { ...s, entries: [], cursor: 0, err: "" };
}

// The per-app registry: run and clear, closed over per app
// (ops_bound_to_app — never a global registration).
export function logoRegistry(): Map<string, InterHandler> {
  const r = makeRegistry();
  r.set("run", (state) => runLogo(state as LogoState));
  r.set("clear", (state) => clearLogo(state as LogoState));
  return r;
}

// The demo app on the corpus wire: view/dispatch/getState, dispatch
// routed through the per-app ops seam.
export function createLogoApp(): App {
  const opsApp = makeOpsApp({ state: logoState(), registry: logoRegistry() });
  return {
    view: () => logoView(opsApp.getState() as LogoState, {}),
    dispatch: (batch, ...rest) => {
      void rest;
      opsApp.dispatch(batch);
    },
    getState: () => opsApp.getState(),
  };
}

// "#rrggbb" → the corpus [0..1] rgb triple; anything else is ink.
function hexColor(name: string | null): Color {
  if (typeof name === "string" && /^#[0-9a-f]{6}$/i.test(name)) {
    const n = parseInt(name.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  return INK;
}

function emptyWorld(): World {
  return derive([], false);
}

// The turtle canvas: every trace segment is a colored path node; the
// turtle marker is a stroked triangle at the current heading.
function logoCanvas(w: World): Elem {
  const segs: Elem = w.trace.map((seg: TraceSeg) =>
    translate(seg[0] + WORLD_RADIUS, WORLD_RADIUS - seg[1], withColor(hexColor(seg[4]), withStrokeWidth(2, pathNode([0, 0], [seg[2] - seg[0], seg[1] - seg[3]])))),
  );
  const tri: Elem = translate(w.x + WORLD_RADIUS, WORLD_RADIUS - w.y, withColor(TURTLE, withStrokeWidth(2, pathNode([0, 0], [-5, -11], [5, -11], [0, 0]))));
  return [segs, tri];
}

// A button whose click returns the one effect vector its arguments
// spell (an IntentList: the list containing that vector).
function fxButton(text: string, ...vector: readonly unknown[]): Elem {
  return button(text, () => [vector] as unknown as IntentList);
}

// The time-travel row: ◀ / slider / ▶ / "cursor/entries".
function timeTravel(s: LogoState): Elem {
  const n = s.entries.length;
  return verticalLayout([
    fxButton("◀", "set", CURSOR_PATH, Math.max(0, s.cursor - 1)),
    render(
      call(slider, {
        num: s.cursor,
        min: 0,
        max: n,
        "integer?": true,
        "mdown?": s["slider-mdown?"],
        "max-width": 150,
        $num: CURSOR_PATH,
        "$mdown?": SLIDER_MDOWN_PATH,
      }),
    ) as Elem,
    fxButton("▶", "set", CURSOR_PATH, Math.min(n, s.cursor + 1)),
    labelNode(`${s.cursor}/${n}`),
  ]);
}

// The editor: example loaders, the src textarea, the error label.
function editor(s: LogoState, focus: unknown): Elem {
  const examples: Elem[] = Object.keys(EXAMPLES).map((k) =>
    fxButton(k, "set", SRC_PATH, EXAMPLES[k]),
  );
  const errLabel: Elem = s.err.length === 0 ? null : labelNode(s.err);
  const ta: Elem = textarea({
    text: s.src,
    textPath: SRC_PATH,
    extraPath: TEXTAREA_EXTRA_PATH,
    focus,
    state: initialTextareaExtra(),
    font: null,
    indexForPosition: () => 0,
    now: 0,
  });
  return verticalLayout([
    verticalLayout(examples),
    ta,
    errLabel,
  ]);
}

export const TEXTAREA_EXTRA_PATH: Path = step("::extra", "logo-src");

// The procedure row: every definition loads back into the editor.
function procsRow(w: World): Elem {
  const names = Object.keys(w.procs);
  const btns: Elem[] = names.map((k) =>
    fxButton(`${k} ✎`, "set", SRC_PATH, procText(k, w.procs[k] as Proc)),
  );
  const none: Elem = labelNode("None yet — define one with to name :arg … end.");
  return names.length === 0 ? none : btns;
}

// The world is never stored — re-derived every render.
export function logoView(s: LogoState, context: { focus?: unknown } = {}): Elem {
  const focus = context.focus ?? null;
  let w: World;
  let err = s.err;
  try {
    w = derive(s.entries.slice(0, s.cursor), s["late?"]);
  } catch (e) {
    w = emptyWorld();
    err = err.length === 0 ? (e instanceof Error ? e.message : String(e)) : err;
  }
  const lateLabel = `Late binding: ${s["late?"] ? "on" : "off"}`;
  return verticalLayout([
    labelNode(LOGO_TITLE),
    logoCanvas(w),
    timeTravel(s),
    editor(s, focus),
    verticalLayout([
      fxButton("Run", "run"),
      fxButton("Clear world", "clear"),
      fxButton(lateLabel, "set", LATE_PATH, !s["late?"]),
    ]),
    withColor(ERROR, err.length === 0 ? labelNode(" ") : labelNode(err)),
    procsRow(w),
  ]);
}
