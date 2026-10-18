// Purpose: the browser Worker entry of the B9 reactive notebook
//   (tambor-54j.9) — the off-thread side of the killable evaluation
//   boundary: receive a NotebookRunRequest onmessage, answer
//   runNotebook's NotebookRunResponse.
// Responsibilities: the self.onmessage/postMessage wiring only. Every
//   semantic lives in worker-main.ts (envelope) and notebook-core.ts
//   (evaluation) — this file is deliberately the only self-touching one
//   so the boundary stays auditable; no node builtins (esbuild bundles
//   this file for the browser via build:spa, following the Logo
//   worker's dist/worker.js precedent).
// Rationale: a long-running cell (a big range reduce, a 200k-point
//   fan-out) must never hang the tab — the evaluation runs off-thread
//   and the host kills it via terminate(); the entry is a thin adapter
//   so the same envelope is testable against a real Worker in node
//   (worker_threads harness, tests/notebook-worker.test.ts).

import { runNotebook, type NotebookRunRequest } from "./worker-main.ts";

// Structural typing — the repo stays DOM-free (no lib.dom): the worker
// global scope is reached as plain message-passing fields.
const scope = globalThis as unknown as {
  onmessage: ((e: { readonly data: unknown }) => void) | null;
  postMessage: (m: unknown) => void;
};

scope.onmessage = (e: { readonly data: unknown }) => {
  scope.postMessage(runNotebook(e.data as NotebookRunRequest));
};
