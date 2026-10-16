// Purpose: the node worker_threads harness entry for the logo worker
//   contract tests (tambor-y9d.10) — the same runProgram envelope the
//   browser worker entry serves, wired to parentPort so vitest (node env)
//   can spawn a real Worker and verify terminate() killability.
// Responsibilities: the parentPort message wiring only — every semantic
//   lives in worker-main.ts (envelope) and interpreter.ts (fold). Built by
//   tests/logo-worker.test.ts via esbuild in a child process (the
//   TextEncoder invariant — tests/spa-bundle.test.ts precedent).
// Rationale: workers exist in node >= 12 (worker_threads), so the
//   killability contract is verified against a real Worker, not a mock;
//   the bundle mirrors src/examples/logo/worker.ts (self.onmessage) one
//   platform over (parentPort.on), keeping the envelope contract shared.

// @ts-expect-error test-only node access (tsconfig types exclude node)
import { parentPort } from "node:worker_threads";

import { runProgram, type RunRequest } from "../../src/examples/logo/worker-main.ts";

parentPort?.on("message", (m: unknown) => {
  parentPort?.postMessage(runProgram(m as RunRequest));
});
