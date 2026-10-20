// Purpose: the notebook demo's intent-dispatch layer (tambor-54j.9) —
//   launch-family resolution, textarea/control families, the makeApp
//   handler and the demo app wire.
// Responsibilities: applyOne resolves launch intents through
//   LAUNCH_BUILDERS and everything else through the family dispatch
//   (applyNonLaunch); notebookHandler folds a batch; createNotebookApp
//   wires the registry-aware makeApp + SPA focus view + the Worker
//   runner through the hooks cell (replies route through the demo's
//   OWN dispatch so the mount re-draws them — tambor-a45).
// Rationale: notebook.ts keeps the state-transition layer (launch,
//   edits, slider moves, run replies); this file is the dispatch of
//   intents onto those transitions — split at the pretender 300-line
//   seam, no cycle (intents imports transitions, never the reverse).

import { makeApp, defaultHandler, type App, type Handler, type EffectContext } from "../../effects/dispatch.ts";
import { spaFocusView } from "../../spa/focus.ts";
import { VIEWPORT } from "../../spa/viewport.ts";
import { applyTextareaIntents } from "../../components/textarea/edit.ts";
import type { Intent } from "../../events/bubble.ts";
import {
  appendCell,
  chainCells,
  fanCells,
  heavyCells,
  addedOf,
  isSliderNumPath,
  notebookState,
  type NotebookState,
} from "./notebook-state.ts";
import { notebookView } from "./notebook-view.ts";
import {
  applyEdit,
  applyRunReply,
  applySliderMove,
  launch,
  type NotebookHooks,
} from "./notebook.ts";
import type { NotebookRunRequest, NotebookRunResponse } from "./worker-main.ts";
import { makeNotebookRunner, type NotebookRunner } from "./worker-client.ts";

// The launch-family intents: one state-builder per button (the demo's
// measured ops). Each launches a fresh run over its extended cells.
const LAUNCH_BUILDERS: Record<
  "add" | "chain" | "fan" | "heavy",
  (s: NotebookState) => NotebookState
> = {
  add: appendCell,
  chain: chainCells,
  fan: fanCells,
  heavy: heavyCells,
};

// One dispatched effect through the notebook's handler vocabulary.
// Launch-family intents resolve through LAUNCH_BUILDERS; everything
// else falls to applyNonLaunch (kept under the pretender thresholds by
// splitting the dispatch families).
function applyOne(
  s: NotebookState,
  effect: Intent,
  ctx: EffectContext,
  hooks: { current: NotebookHooks },
): NotebookState {
  const type = effect[0];
  const builder = LAUNCH_BUILDERS[type as "add" | "chain" | "fan" | "heavy"] as ((s: NotebookState) => NotebookState) | undefined;
  if (builder !== undefined) {
    return launch(builder(s), hooks, null, addedOf(type as "add" | "chain" | "fan" | "heavy", s));
  }
  return applyNonLaunch(s, effect, ctx, hooks);
}

// One +1 step on the chain base's slider path — the same intent shape
// a slider gesture produces (update the sliders map, launch with only
// the slider's cell dirty).
function applyChainBump(
  s: NotebookState,
  hooks: { current: NotebookHooks },
): NotebookState {
  const id = s.chainBase;
  if (id === null) return s;
  const cur = s.sliders[id] ?? s.info[id]?.input?.[3] ?? 0;
  const bumped = {
    ...s,
    sliders: { ...s.sliders, [id]: Math.min(100, cur + 1) },
  };
  return launch(bumped, hooks, [id], []);
}

// The non-launch effect families, dispatched by intent-name sets so no
// single switch carries every family (pretender script thresholds).

// Textarea content intents (the cell source editors).
const EDIT_INTENTS = new Set(["insert-text", "insert-newline", "delete-backward"]);

// Textarea caret-navigation intents.
const MOVE_INTENTS = new Set(["backward-char", "forward-char", "previous-line", "next-line"]);

// Notebook-control intents (everything that is not cell content).
const CONTROL_INTENTS = new Set(["run-applied", "mode", "chain-bump", "kill", "reset"]);

// The non-launch effect families: cell content, notebook control, the
// slider-move update path, then the model's default fallback.
function applyNonLaunch(
  s: NotebookState,
  effect: Intent,
  ctx: EffectContext,
  hooks: { current: NotebookHooks },
): NotebookState {
  const type = effect[0] as string;
  if (EDIT_INTENTS.has(type) || MOVE_INTENTS.has(type)) {
    return applyTextareaFamily(s, effect, hooks);
  }
  if (CONTROL_INTENTS.has(type)) return applyControl(s, effect, hooks);
  if (type === "update" && isSliderNumPath(effect[1])) {
    return applySliderMove(s, effect, ctx, hooks);
  }
  return defaultHandler(s, [effect], ctx) as NotebookState;
}

// Cell-content intents: edits go through the notebook's edit path,
// caret moves through the shared textarea intent application.
function applyTextareaFamily(
  s: NotebookState,
  effect: Intent,
  hooks: { current: NotebookHooks },
): NotebookState {
  const type = effect[0] as string;
  if (EDIT_INTENTS.has(type)) return applyEdit(s, effect, hooks);
  return applyTextareaIntents(s, [effect]).state as NotebookState;
}

// Notebook-control intents: apply a run reply, toggle the run mode,
// bump the chain slider, kill the worker, or reset the notebook.
function applyControl(
  s: NotebookState,
  effect: Intent,
  hooks: { current: NotebookHooks },
): NotebookState {
  const type = effect[0] as string;
  switch (type) {
    case "run-applied":
      return applyRunReply(s, effect[1] as NotebookRunResponse);
    case "mode":
      return { ...s, mode: s.mode === "full" ? "incremental" : "full" };
    case "chain-bump":
      return applyChainBump(s, hooks);
    case "kill":
      hooks.current.kill();
      return s;
    default:
      return notebookState();
  }
}

// The makeApp handler: one effect per call (dispatch applies batches
// effect-by-effect).
function notebookHandler(hooks: { current: NotebookHooks }): Handler {
  return (state, effects, ctx) => {
    let s = state as NotebookState;
    for (const effect of effects) s = applyOne(s, effect, ctx, hooks);
    return s;
  };
}

// The demo app on the corpus wire: registry-aware makeApp + the SPA
// focus context (the textareas' focused state), with the Worker-backed
// runner wired through the hooks cell (worker replies route through the
// demo's OWN dispatch so the mount re-draws them — tambor-a45). The
// runner is injectable for tests (the default is the real one).
export function createNotebookApp(runner: NotebookRunner = makeNotebookRunner()): App {
  const hooks: { current: NotebookHooks } = { current: { launch: () => {}, kill: () => {} } };
  const app = makeApp({
    view: spaFocusView((state, context) =>
      notebookView(state as NotebookState, context as { focus?: unknown })),
    state: notebookState(),
    handler: notebookHandler(hooks),
    backend: { containerSize: VIEWPORT },
  });
  hooks.current = {
    launch: (req: NotebookRunRequest) => {
      runner.run(req).then(
        (resp) => app.dispatch([["run-applied", resp]]),
        () => app.dispatch([["run-applied", { id: req.id, ok: false, message: "notebook worker failed" }]]),
      );
    },
    kill: () => runner.kill(),
  };
  return app;
}
