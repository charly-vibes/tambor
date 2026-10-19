// Purpose: the example.logo demo app (tambor-y9d.2) — the wanna-chat
//   Logo world rebuilt on the real library: a live world whose state is
//   plain data and whose view re-derives from
//   `fold(entries[0..cursor])` every render.
// Responsibilities: the LogoState shape (src, entries, cursor, late?,
//   dialect, err, sel) and initial data; the run/clear handlers as per-app
//   registry entries (makeOpsApp — never the global registry); the
//   select-path effect entry routing through select.ts (tambor-y9d.6);
//   the killable Worker run boundary (tambor-y9d.10): run parks the
//   candidate as a typed running outcome and the off-thread reply is
//   applied by the typed apply (run.ts), with the in-thread fallback for
//   Worker-less hosts; CURSOR/SRC/LATE paths; the pure view — the canvas
//   (canvas.ts: trace segments, turtle marker, halo handles), the
//   inspector pane (inspector.ts), the time-travel slider bound to the
//   cursor, the ◀ ▶ stepper buttons, the example and procedure buttons,
//   the corpus textarea bound to src, the run-outcome/error label — and
//   the corpus App wire (view/dispatch/getState) over makeOpsApp for
//   mountDemo.
// Rationale: the wanna-chat session demo (insights/dynamic-environment.md)
//   is the design authority for the fold/liveness semantics;
//   openspec/specs/interop-model/spec.md governs the per-app seam
//   (ops_bound_to_app: the registry is constructor state, never module
//   state) and openspec/specs/example-todo/spec.md the textarea and
//   wrapOn wiring the SPA runs through. All widgets are corpus
//   components: slider (components.numeric), textarea
//   (components.textarea), buttons returning effect vectors.

import { makeOpsApp } from "../../interop/app.ts";
import { makeRunner } from "./worker-client.ts";
import type { RunRequest, RunResponse } from "./worker-main.ts";
import {
  applyRun,
  outcomeLabel,
  startRun,
  stopLogo,
  type RunHooks,
  type RunOutcome,
} from "./run.ts";
import { makeRegistry, type InterHandler } from "../../interop/seam.ts";
import type { App, LaneStore } from "../../effects/dispatch.ts";
import type { Path } from "../../effects/paths.ts";
import type { IntentList } from "../../events/bubble.ts";
import {
  button,
  label as labelNode,
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
  EXAMPLES_ES,
  procText,
  type Dialect,
  type LogoEntry,
  type Proc,
  type World,
} from "./interpreter.ts";
import {
  selectLogo,
  type Selection,
} from "./select.ts";
import { logoCanvas } from "./canvas.ts";
import { inspectorPane } from "./inspector.ts";

// runLogo moved to run.ts (the typed outcome module) — re-exported here so
// the demo's public surface keeps its shape (tambor-y9d.10).
export { runLogo } from "./run.ts";

export const LOGO_TITLE = "tambor logo";

// The state shape of the demo: plain data throughout.
export interface LogoState {
  readonly src: string;
  readonly entries: readonly LogoEntry[];
  readonly cursor: number;
  readonly "late?": boolean;
  readonly dialect: Dialect;
  readonly err: string;
  readonly outcome: RunOutcome;
  readonly runId: number;
  readonly "slider-mdown?": boolean;
  // the Smalltalk-style selection: the selected item's path, or null
  readonly sel: Selection;
}

export function logoState(): LogoState {
  return {
    src: EXAMPLES["spiral"] as string,
    entries: [],
    cursor: 0,
    "late?": false,
    dialect: "en",
    err: "",
    outcome: { kind: "idle" },
    runId: 0,
    "slider-mdown?": false,
    sel: null,
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
export const DIALECT_PATH: Path = step("dialect");
export const SLIDER_MDOWN_PATH: Path = step("slider-mdown?");

// clear: the world is empty again (and any run outcome with it).
export function clearLogo(s: LogoState): LogoState {
  return { ...s, entries: [], cursor: 0, err: "", outcome: { kind: "idle" } };
}

// The per-app registry: run/stop/run-applied and clear, closed over per
// app (ops_bound_to_app — never a global registration). `hooks` is the
// cell createLogoApp fills with the runner wiring; `worker` selects the
// off-thread park-and-apply path vs the in-thread fallback.
export function logoRegistry(
  hooks: { current: RunHooks },
  worker: boolean,
): Map<string, InterHandler> {
  const r = makeRegistry();
  r.set("run", (state) => startRun(state as LogoState, hooks.current, worker));
  r.set("stop", (state) => {
    hooks.current.stop();
    return stopLogo(state as LogoState);
  });
  r.set("run-applied", (state, ...args) =>
    applyRun(state as LogoState, (args[0] ?? null) as RunResponse),
  );
  r.set("clear", (state) => clearLogo(state as LogoState));
  // the select-path effect: the carried path is data, applied by the
  // pure toggle handler — never imperative mutation
  r.set("select", (state, ...args) => selectLogo(state as LogoState, (args[0] ?? null) as Selection));
  return r;
}

// The demo app on the corpus wire: view/dispatch/getState, dispatch
// routed through the per-app ops seam.
export function createLogoApp(): App {
  // the runner: Worker-backed where the host has one, the bounded
  // in-thread fallback otherwise (graceful degradation — tambor-y9d.10)
  const runner = makeRunner();
  // the hooks cell: filled after opsApp exists so the launch hook can
  // dispatch the worker's reply back through the same per-app seam
  const hooks: { current: RunHooks } = { current: { launch: () => {}, stop: () => {} } };
  const opsApp = makeOpsApp({ state: logoState(), registry: logoRegistry(hooks, runner.worker) });
  // the app object is built before the hooks so the async worker reply
  // can route through the demo's OWN dispatch (the host-visible apply
  // path the mount wraps for re-render — tambor-a45): the reply applies
  // outside the event wire, and only a public dispatch re-draws it.
  const app: App = {
    view: () => logoView(opsApp.getState() as LogoState, {}),
    dispatch: (batch, ...rest) => {
      void rest;
      opsApp.dispatch(batch);
    },
    getState: () => opsApp.getState(),
    // the demo's own lane store (ops-app is the interop seam, not an
    // effects.makeApp, so it carries no lane of its own)
    getLane: (): LaneStore => lane,
  };
  const lane: LaneStore = {};
  hooks.current = {
    launch: (req: RunRequest) => {
      void runner.run(req).then(
        (resp) => app.dispatch([["run-applied", resp]]),
        () => app.dispatch([["run-applied", null]]),
      );
    },
    stop: () => runner.terminate(),
  };
  return app;
}

function emptyWorld(): World {
  return derive([], false);
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
  const shown: Readonly<Record<string, string>> =
    s.dialect === "es" ? EXAMPLES_ES : EXAMPLES;
  const examples: Elem[] = Object.keys(shown).map((k) =>
    fxButton(k, "set", SRC_PATH, shown[k]),
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
    w = derive(s.entries.slice(0, s.cursor), s["late?"], s.dialect);
  } catch (e) {
    w = emptyWorld();
    err = err.length === 0 ? (e instanceof Error ? e.message : String(e)) : err;
  }
  const lateLabel = `Late binding: ${s["late?"] ? "on" : "off"}`;
  return verticalLayout([
    labelNode(LOGO_TITLE),
    logoCanvas(s, w),
    inspectorPane(s, w),
    timeTravel(s),
    editor(s, focus),
    verticalLayout([
      fxButton("Run", "run"),
      fxButton("Stop", "stop"),
      fxButton("Clear world", "clear"),
      fxButton(lateLabel, "set", LATE_PATH, !s["late?"]),
      fxButton(
        s.dialect === "es" ? "English" : "Español",
        "set",
        DIALECT_PATH,
        s.dialect === "es" ? "en" : "es",
      ),
    ]),
    outcomeLabel(s.outcome, err),
    procsRow(w),
  ]);
}
