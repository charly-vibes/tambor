// Purpose: the browser Worker entry of the example.logo demo (tambor-y9d.10)
//   — the off-thread side of the killable run boundary: receive a RunRequest
//   onmessage, answer runProgram's RunResponse.
// Responsibilities: the self.onmessage/postMessage wiring only. Every
//   semantics lives in worker-main.ts (envelope) and interpreter.ts (fold) —
//   this file is deliberately the only self-touching one so the boundary
//   stays auditable; no node builtins (esbuild bundles this file for the
//   browser via the new Worker(new URL(...)) pattern in worker-client.ts).
// Rationale: an infinite repeat must never hang the tab — the interpreter
//   runs off-thread and the host kills it via terminate() (tambor-y9d.10);
//   the entry is a thin adapter so the same envelope is testable against a
//   real Worker in node (worker_threads harness, tests/logo-worker.test.ts).

import { runProgram, type RunRequest } from "./worker-main.ts";

// Structural typing — the repo stays DOM-free (no lib.dom): the worker
// global scope is reached as plain message-passing fields.
const scope = globalThis as unknown as {
  onmessage: ((e: { readonly data: unknown }) => void) | null;
  postMessage: (m: unknown) => void;
};

scope.onmessage = (e: { readonly data: unknown }) => {
  scope.postMessage(runProgram(e.data as RunRequest));
};
