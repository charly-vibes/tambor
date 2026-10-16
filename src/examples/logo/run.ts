// Purpose: the typed run outcome of the example.logo demo (tambor-y9d.10) —
//   a run is a discriminated union in the demo state (idle → running →
//   ok/failed/terminated), surfaced as a distinct label by the view, so a
//   killed run is a typed state, never a silent freeze.
// Responsibilities: the RunOutcome union; RunHooks (the launch/stop hooks
//   the registry closes over — the worker lives in createLogoApp's wiring);
//   runLogo (the in-thread fallback: append the editor source and validate,
//   or record the failure); startRun (worker mode: park the run as running
//   and hand the request to the launch hook; fallback: the sync runLogo
//   path); applyRun (the typed apply — ok appends and moves the cursor,
//   failed records the message, a stale reply is ignored by its echoed id);
//   stopLogo (running → terminated only); outcomeLabel (the status/error
//   label the view renders).
// Rationale: per the typed-outcome lens (wanna) the Worker boundary must
//   return typed answers — terminate() kills the spinning worker and the
//   state records the kill. The interpreter fold itself stays pure: these
//   handlers are plain state → state functions plus the two hooks; the
//   sync fallback keeps today's bounded behavior for hosts without a
//   Worker (tests, jsdom) so the demo degrades, never hangs.

import type { LogoState } from "./logo.ts";
import { derive, type LogoEntry } from "./interpreter.ts";
import { WORKER_BUDGET, type RunRequest, type RunResponse } from "./worker-main.ts";
import { label as labelNode, withColor, type Color, type Elem } from "../../views/model.ts";

/** The run lifecycle as typed state: `running` while the off-thread
 * interpreter spins, `ok` after the typed apply, `failed` with the
 * interpreter's message, `terminated` once the host killed the worker. */
export type RunOutcome =
  | { readonly kind: "idle" }
  | { readonly kind: "running" }
  | { readonly kind: "ok" }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "terminated" };

// The hooks the per-app registry closes over; createLogoApp wires them to
// the runner (launch → run + dispatch the reply, stop → terminate()).
export interface RunHooks {
  readonly launch: (req: RunRequest) => void;
  readonly stop: () => void;
}

// The error label's color (moved from logo.ts — the label lives here now).
const ERROR: Color = [0.7, 0.149, 0.118];

// The terminated-run label's color: amber, distinct from a red failure.
const KILLED: Color = [0.87, 0.45, 0.05];

// run: keep entries[0..cursor], append the editor source, validate by
// deriving, move the cursor to the end — or record the typed failure
// without touching entries (the in-thread fallback path).
export function runLogo(s: LogoState): LogoState {
  const entries: readonly LogoEntry[] = [
    ...s.entries.slice(0, s.cursor),
    { text: s.src },
  ];
  try {
    derive(entries, s["late?"], s.dialect);
    return { ...s, entries, cursor: entries.length, err: "", outcome: { kind: "ok" } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ...s, err: msg, outcome: { kind: "failed", message: msg } };
  }
}

// run, worker mode: park the candidate run as a typed running outcome and
// hand the request to the launch hook — the entry is appended only by the
// typed apply, so an infinite loop never reaches the fold in-thread.
export function startRun(s: LogoState, hooks: RunHooks, worker: boolean): LogoState {
  if (!worker) return runLogo(s);
  const runId = s.runId + 1;
  const req: RunRequest = {
    id: runId,
    entries: [...s.entries.slice(0, s.cursor), { text: s.src }],
    late: s["late?"],
    dialect: s.dialect,
    budget: WORKER_BUDGET,
  };
  hooks.launch(req);
  return { ...s, runId, err: "", outcome: { kind: "running" } };
}

// The typed apply: the worker's reply either appends the entry (ok — the
// program was validated off-thread), records the failure, or is ignored
// (stale: its id no longer matches the state's run id).
export function applyRun(s: LogoState, resp: RunResponse | null): LogoState {
  if (resp === null || resp.id !== s.runId) return s;
  if (!resp.ok) {
    return { ...s, err: resp.message, outcome: { kind: "failed", message: resp.message } };
  }
  const entries: readonly LogoEntry[] = [
    ...s.entries.slice(0, s.cursor),
    { text: s.src },
  ];
  return { ...s, entries, cursor: entries.length, outcome: { kind: "ok" } };
}

// stop: a running run becomes a typed terminated outcome — the host has
// (or will) kill the worker; anything else is untouched.
export function stopLogo(s: LogoState): LogoState {
  return s.outcome.kind === "running" ? { ...s, outcome: { kind: "terminated" } } : s;
}

// The status/error label: running and terminated get their own typed
// labels; otherwise today's error label (blank filler when clean).
export function outcomeLabel(o: RunOutcome, err: string): Elem {
  if (o.kind === "running") return labelNode("running — off-thread; Stop kills it");
  if (o.kind === "terminated") {
    return withColor(KILLED, labelNode("terminated — the runaway program was killed"));
  }
  return withColor(ERROR, err.length === 0 ? labelNode(" ") : labelNode(err));
}
