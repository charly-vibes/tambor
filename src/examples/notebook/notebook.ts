// Purpose: the B9 reactive notebook demo app (tambor-54j.9) — the
//   handler + app wire over notebook-state.ts and notebook-view.ts:
//   every edit/slider-move launches the killable Worker run, every
//   reply applies through the same dispatch (the tambor-a45 lesson:
//   the async apply must route through the app's own dispatch so the
//   mount re-draws it).
// Responsibilities: NotebookHooks (the launch/kill cell the app fills
//   after construction — the logo.ts precedent); notebookHandler — the
//   makeApp handler that routes textarea editing intents through
//   applyTextareaIntents (text changes mark the cell dirty and launch;
//   cursor moves don't), recognizes sliders-path updates as slider
//   moves, applies the structural ops (+cell/+chain/+fan/+heavy/mode/
//   kill/reset) and the run-applied reply (merge by touched — untouched
//   values keep their IDENTITY; stale replies ignored; a killed reply
//   marks dirty ?? added with the typed killed error); applyRunReply;
//   launch (runId monotonic + pending bookkeeping); createNotebookApp —
//   the gallery-mountable App with the Worker-backed runner.
// Rationale: handlers are pure state transitions plus the ONE launch
//   side effect (the reply comes back through dispatch, never through
//   a render-time mutation). The merge-by-touched contract is what
//   keeps the incremental identity reuse true at app level even though
//   the Worker boundary clones every reply. Runtime.send is never
//   used — everything rides app.dispatch so the mount's draw wire and
//   the registry-aware dispatcher stay the only paths.

import { makeApp, defaultHandler, type App, type Handler, type EffectContext } from "../../effects/dispatch.ts";
import { spaFocusView } from "../../spa/focus.ts";
import { VIEWPORT } from "../../spa/viewport.ts";
import { applyTextareaIntents } from "../../components/textarea/edit.ts";
import type { Intent } from "../../events/bubble.ts";
import type { OutEntry } from "./notebook-core.ts";
import {
  KILLED_MESSAGE,
  makeNotebookRunner,
  type NotebookRunner,
} from "./worker-client.ts";
import type { NotebookRunRequest, NotebookRunResponse } from "./worker-main.ts";
import {
  appendCell,
  chainCells,
  fanCells,
  heavyCells,
  addedOf,
  isSliderNumPath,
  notebookState,
  sliderIdOf,
  type NotebookState,
} from "./notebook-state.ts";
import { notebookView } from "./notebook-view.ts";

// The launch/kill cell the app fills after construction (the runner
// needs the app's dispatch, the app needs the runner).
export interface NotebookHooks {
  launch(req: NotebookRunRequest): void;
  kill(): void;
}

// Launch one run: bump runId, record pending, hand the request to the
// runner. The reply applies later through ["run-applied", resp].
function launch(
  s: NotebookState,
  hooks: { current: NotebookHooks },
  dirty: readonly number[] | null,
  added: readonly number[],
): NotebookState {
  const runId = s.runId + 1;
  const req: NotebookRunRequest = {
    id: runId,
    cells: s.cells,
    sliders: s.sliders,
    prev: s.out,
    dirty,
  };
  hooks.current.launch(req);
  return { ...s, runId, pending: { dirty, added }, err: "" };
}

// The text path an editing intent carries (insert-text's path sits at
// position 2; the other text ops carry it at 1).
function textPathOf(effect: Intent): unknown {
  return effect[0] === "insert-text" ? effect[2] : effect[1];
}

// The seq-nth index in a path (the cell position a textarea edits).
function seqIndexOf(path: unknown): number | null {
  if (!Array.isArray(path)) return null;
  for (const step of path) {
    if (Array.isArray(step) && step[0] === "seq-nth") {
      const idx = step[1];
      if (typeof idx === "number") return idx;
    }
  }
  return null;
}

// A text edit: apply the editing intent, then re-run the edited cell
// (clearing its moved slider value — the artifact's edit rule).
function applyEdit(
  s: NotebookState,
  effect: Intent,
  hooks: { current: NotebookHooks },
): NotebookState {
  const next = applyTextareaIntents(s, [effect]).state as NotebookState;
  const idx = seqIndexOf(textPathOf(effect));
  if (idx === null) return next;
  const id = next.cells[idx]?.id;
  if (id === undefined) return next;
  const sliders = { ...next.sliders };
  delete sliders[id];
  return launch({ ...next, sliders }, hooks, [id], []);
}

// A slider move: apply the update builtin, then re-run that slider's
// cell (the only dirty seed — the incremental contraction).
function applySliderMove(
  s: NotebookState,
  effect: Intent,
  ctx: EffectContext,
  hooks: { current: NotebookHooks },
): NotebookState {
  const next = defaultHandler(s, [effect], ctx) as NotebookState;
  const id = sliderIdOf(effect[1]);
  if (id === null) return next;
  return launch(next, hooks, [id], []);
}

// The run reply: merge by touched (identity preserved for untouched
// cells), refresh info/stats, clear pending. Stale replies (a superseded
// run's) are ignored; the killed failure marks dirty ?? added.
export function applyRunReply(s: NotebookState, resp: NotebookRunResponse): NotebookState {
  if (s.pending === null || resp.id !== s.runId) return s;
  if (!resp.ok) {
    if (resp.message === KILLED_MESSAGE) return markKilled(s);
    return { ...s, err: resp.message, pending: null };
  }
  const out: Record<number, OutEntry> = { ...s.out };
  for (const id of resp.touched) {
    const e = resp.out[id];
    if (e !== undefined) out[id] = e;
  }
  return {
    ...s,
    out,
    info: resp.info,
    stats: { ran: resp.ran, total: s.cells.length, ms: resp.ms },
    pending: null,
  };
}

// A killed run: the cells it was going to (re)compute report the typed
// killed error; every other value keeps its previous entry — the
// notebook stays consistent and usable (commit 2's contract).
function markKilled(s: NotebookState): NotebookState {
  const ids = s.pending?.dirty ?? s.pending?.added ?? [];
  const out: Record<number, OutEntry> = { ...s.out };
  for (const id of ids) out[id] = { err: KILLED_MESSAGE };
  return { ...s, out, pending: null };
}

// One dispatched effect through the notebook's handler vocabulary.
function applyOne(
  s: NotebookState,
  effect: Intent,
  ctx: EffectContext,
  hooks: { current: NotebookHooks },
): NotebookState {
  const type = effect[0];
  switch (type) {
    case "insert-text":
    case "insert-newline":
    case "delete-backward":
      return applyEdit(s, effect, hooks);
    case "backward-char":
    case "forward-char":
    case "previous-line":
    case "next-line":
      return applyTextareaIntents(s, [effect]).state as NotebookState;
    case "run-applied":
      return applyRunReply(s, effect[1] as NotebookRunResponse);
    case "mode":
      return { ...s, mode: s.mode === "full" ? "incremental" : "full" };
    case "add":
      return launch(appendCell(s), hooks, null, addedOf("add", s));
    case "chain":
      return launch(chainCells(s), hooks, null, addedOf("chain", s));
    case "chain-bump": {
      // one +1 step on the chain base's slider path — the same intent
      // shape a slider gesture produces (update the sliders map, launch
      // with only the slider's cell dirty)
      const id = s.chainBase;
      if (id === null) return s;
      const cur = s.sliders[id] ?? s.info[id]?.input?.[3] ?? 0;
      const bumped = { ...s, sliders: { ...s.sliders, [id]: Math.min(100, cur + 1) } };
      return launch(bumped, hooks, [id], []);
    }
    case "fan":
      return launch(fanCells(s), hooks, null, addedOf("fan", s));
    case "heavy":
      return launch(heavyCells(s), hooks, null, addedOf("heavy", s));
    case "kill":
      hooks.current.kill();
      return s;
    case "reset":
      return notebookState();
    default:
      if (type === "update" && isSliderNumPath(effect[1])) {
        return applySliderMove(s, effect, ctx, hooks);
      }
      return defaultHandler(s, [effect], ctx) as NotebookState;
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
