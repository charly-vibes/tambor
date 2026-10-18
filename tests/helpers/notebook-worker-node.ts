// Purpose: the node worker_threads harness entry for the B9 notebook
//   worker contract tests (tambor-54j.9) — the same runNotebook envelope
//   the browser worker entry serves, wired to parentPort so vitest (node
//   env) can spawn a real Worker and verify terminate() killability.
// Responsibilities: the parentPort message wiring only — every semantic
//   lives in worker-main.ts (envelope) and notebook-core.ts (evaluation).
//   Built by tests/notebook-worker.test.ts via esbuild in a child
//   process (the TextEncoder invariant — tests/spa-bundle.test.ts
//   precedent).
// Rationale: workers exist in node >= 12 (worker_threads), so the
//   killability contract is verified against a real Worker, not a mock;
//   the bundle mirrors src/examples/notebook/worker.ts (self.onmessage)
//   one platform over (parentPort.on), keeping the envelope contract
//   shared — the logo harness precedent (logo-worker-node.ts).

// @ts-expect-error test-only node access (tsconfig types exclude node)
import { parentPort } from "node:worker_threads";

import { runNotebook, type NotebookRunRequest } from "../../src/examples/notebook/worker-main.ts";

parentPort?.on("message", (m: unknown) => {
  parentPort?.postMessage(runNotebook(m as NotebookRunRequest));
});
