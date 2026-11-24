// Purpose: the gallery inspector (tambor-90p, add-gallery-inspector) —
//   the visible sibling of the ?debug=1 __tambor seam: a strictly
//   read-only host-DOM panel showing the mounted demo's plain-data
//   state live and a bounded log of every dispatched transition.
// Responsibilities: wireGalleryInspector(doc, app) — subscribes the
//   app's commit stream (App.subscribe), appends each commit to a
//   bounded series (components.ring_buffer, capacity 50, oldest
//   evicted), and renders two panes: data-pane="state" (the live
//   JSON-safe state projection, re-read per commit) and data-pane="log"
//   (one data-entry per commit with data-sequence, a data-field="intents"
//   JSON-safe projection of the applied batch, and data-field="change"
//   naming the ChangeSet kind and unknown reason). unmount() unsubscribes
//   and empties the panel; the gallery shell removes the element itself.
// Rationale: openspec/changes/add-gallery-inspector is the design
//   authority. Consumption never mutates (p_consumes_never_mutates):
//   the panel only reads commits and state, dispatches nothing, and is
//   host DOM outside the drawn root, so it adds zero draws. The log
//   stores the commits' live references in the ring (states are
//   immutable plain data — the reference IS the snapshot; a JSON copy
//   would allocate a whole tree per dispatch) and renders only JSON-safe
//   projections (p_json_safe): function values are marked "ƒ()", never
//   thrown over; the same projection keeps bigint/symbol values
//   serializable. fresh_after_draw is commit-driven (p_fresh_after_draw):
//   each delivered commit re-renders the live read, so after a dispatch's
//   repaint the panel already shows the new state — no polling, no rAF
//   coupling. Apps whose seam omits subscribe (ops-app wires publish no
//   commits) still get the live pane and simply never grow a log.

import {
  appendSeries,
  boundedSeries,
  newestSeries,
  type BoundedSeries,
} from "../components/ring_buffer/ring_buffer.ts";
import type { App, CommitListener } from "../effects/dispatch.ts";
import type { DispatchCommit } from "../effects/commits.ts";
import type { HostDoc, HostElement } from "../interop/domhost.ts";

// The log's hard bound (p_ring_bounded); the property pins the bound,
// not the number.
const CAPACITY = 50;

// The JSON-safe marker for non-serializable values (functions, and the
// bigint/symbol fallbacks) — rendering never throws (p_json_safe).
const MARKED = "\u0192()";

// Narrowed subscribe view: the shared App keeps subscribe OPTIONAL
// (structural implementers publish no commits); a makeApp-backed app
// carries the member.
interface SubscribableApp extends App {
  subscribe(listener: CommitListener): () => void;
}

export interface InspectorHandle {
  /** The panel root; the gallery shell places it in the layout. */
  readonly el: HostElement;
  /** Unsubscribe from the commit stream and empty the panel. */
  unmount(): void;
}

// The JSON-safe projection (p_json_safe): JSON.stringify with a
// replacer that marks non-serializable values instead of throwing.
function jsonSafe(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    typeof v === "function" || typeof v === "bigint" || typeof v === "symbol"
      ? MARKED
      : v,
  );
}

// The change field: the ChangeSet kind, with the conservative reason
// when the dispatch carried no path annotations.
function changeField(commit: DispatchCommit): string {
  return commit.changes.kind === "known"
    ? "known"
    : `unknown: ${commit.changes.reason}`;
}

export function wireGalleryInspector(
  d: HostDoc,
  app: App,
  _opts?: Record<string, never>,
): InspectorHandle {
  const el = d.createElement("aside");
  el.setAttribute("data-inspector", "");
  const statePane = d.createElement("div");
  statePane.setAttribute("data-pane", "state");
  const logPane = d.createElement("div");
  logPane.setAttribute("data-pane", "log");
  el.appendChild(statePane);
  el.appendChild(logPane);

  // appendSeries is persistent — each append returns the fresh window,
  // so the local must rebind (never mutate in place)
  let ring: BoundedSeries<DispatchCommit> = boundedSeries(CAPACITY);

  const renderState = (): void => {
    statePane.textContent = jsonSafe(app.getState());
  };

  const renderLog = (): void => {
    logPane.textContent = "";
    // oldest→newest, so the log reads in dispatch order
    for (const commit of newestSeries(ring, CAPACITY)) {
      const entry = d.createElement("div");
      entry.setAttribute("data-entry", "");
      entry.setAttribute("data-sequence", String(commit.sequence));
      const intents = d.createElement("span");
      intents.setAttribute("data-field", "intents");
      intents.textContent = jsonSafe(commit.intents ?? []);
      const change = d.createElement("span");
      change.setAttribute("data-field", "change");
      change.textContent = changeField(commit);
      entry.appendChild(intents);
      entry.appendChild(change);
      logPane.appendChild(entry);
    }
  };

  const listener: CommitListener = (commit) => {
    ring = appendSeries(ring, [commit]);
    renderLog();
    // fresh_after_draw: the live read is re-taken per commit
    renderState();
  };

  // an ops-seam app omits subscribe (no commits ever) — degrade to the
  // live pane only, never throw
  const unsubscribe = (app as SubscribableApp).subscribe?.(listener);
  renderState();

  return {
    el,
    unmount(): void {
      unsubscribe?.();
      // the shell owns the element's place in the layout; we only
      // release the app's data and the log
      el.textContent = "";
    },
  };
}
