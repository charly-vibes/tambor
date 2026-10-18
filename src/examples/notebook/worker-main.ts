// Purpose: the Worker-boundary request/response protocol of the B9
//   reactive notebook (tambor-54j.9) — a typed plain-data envelope
//   around the pure runAll, spoken identically by the browser worker
//   entry (worker.ts) and the node worker_threads test harness
//   (tests/helpers/notebook-worker-node.ts).
// Responsibilities: the NotebookRunRequest shape (cells, sliders, the
//   previous out map for identity reuse upstream of the boundary, the
//   dirty id list — null means Full mode — and a caller id echoed
//   back); the NotebookRunResponse union (the run result — entries,
//   per-cell info, the touched list, ran and ms — or a typed failure);
//   runNotebook — run under the request, never throwing across the
//   boundary.
// Rationale: the core stays pure and boundary-free (notebook-core.ts);
//   the envelope is the only thing that crosses, so a long-running cell
//   (e.g. a big range reduce) costs the host a terminate() — the kill
//   switch — instead of a frozen tab. prev rides the request so the
//   Worker's evaluation sees the same reused-value semantics the
//   in-process contract pins; touched lets the app merge the reply
//   without losing that identity reuse on the main-thread side.

import {
  runAll,
  type Cell,
  type CellInfo,
  type OutEntry,
} from "./notebook-core.ts";

export interface NotebookRunRequest {
  readonly id: number;
  readonly cells: readonly Cell[];
  readonly sliders: Readonly<Record<number, number>>;
  readonly prev: Readonly<Record<number, OutEntry>>;
  /** the dirty cell ids, or null for a Full-mode (everything) run */
  readonly dirty: readonly number[] | null;
}

/** The typed outcome of one off-thread run. `touched` lists every id
 * whose entry is fresh (the identity-reuse complement); `info` carries
 * the per-cell static facts the view draws. */
export type NotebookRunResponse =
  | {
      readonly id: number;
      readonly ok: true;
      readonly out: Readonly<Record<number, OutEntry>>;
      readonly info: Readonly<Record<number, CellInfo>>;
      readonly touched: readonly number[];
      readonly ran: number;
      readonly ms: number;
    }
  | { readonly id: number; readonly ok: false; readonly message: string };

/** Run one notebook evaluation to a typed response: runAll under the
 * request, catching every failure into the failure branch — a worker
 * entry must never throw across the boundary. */
export function runNotebook(req: NotebookRunRequest): NotebookRunResponse {
  try {
    const r = runAll(req.cells, req.sliders, req.prev, req.dirty);
    return {
      id: req.id,
      ok: true,
      out: r.out,
      info: r.info,
      touched: r.touched,
      ran: r.ran,
      ms: r.ms,
    };
  } catch (e) {
    return {
      id: req.id,
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
