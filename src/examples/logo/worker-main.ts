// Purpose: the Worker-boundary request/response protocol of the example.logo
//   demo (tambor-y9d.10) — a typed plain-data envelope around the pure
//   interpreter, spoken identically by the browser worker entry (worker.ts)
//   and the node worker_threads test harness (tests/helpers/
//   logo-worker-node.ts).
// Responsibilities: the RunRequest shape (program entries + late + dialect +
//   budget + a caller id echoed back); the RunResponse union (the world, or
//   a typed failure with the interpreter's message); runProgram — derive
//   under the request's budget, never throwing across the boundary;
//   WORKER_BUDGET, the kill-sized budget of an off-thread run.
// Rationale: the interpreter itself stays pure and boundary-free — the
//   envelope is the only thing that crosses, so an infinite repeat costs the
//   host a terminate() (the worker spins; the tab never blocks) instead of a
//   frozen main thread. The budget moves from the interpreter to the kill:
//   the in-thread fallback keeps the bounded STEP_BUDGET, the off-thread run
//   gets WORKER_BUDGET (a runaway is stopped by terminate, not by counting).

import { derive, type Dialect, type LogoEntry, type World } from "./interpreter.ts";

export interface RunRequest {
  readonly id: number;
  readonly entries: readonly LogoEntry[];
  readonly late: boolean;
  readonly dialect: Dialect;
  readonly budget: number;
}

/** The typed outcome of one off-thread run: the derived world, or the
 * interpreter's failure message. `id` echoes the request's id so a stale
 * reply from a superseded run can be recognized and ignored. */
export type RunResponse =
  | { readonly id: number; readonly ok: true; readonly world: World }
  | { readonly id: number; readonly ok: false; readonly message: string };

// The kill-sized step budget of an off-thread run: large enough that a
// legitimate program never trips it, unbounded in practice — the runaway
// protection is the host's terminate(), not counting (tambor-y9d.10).
export const WORKER_BUDGET = 1_000_000_000;

/** Run one program to a typed response: derive under the request's budget,
 * catching every interpreter failure into the failure branch of the union —
 * a worker entry must never throw across the boundary. */
export function runProgram(req: RunRequest): RunResponse {
  try {
    return {
      id: req.id,
      ok: true,
      world: derive(req.entries, req.late, req.dialect, req.budget),
    };
  } catch (e) {
    return { id: req.id, ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
