// Purpose: the node worker_threads harness entry for the worker-effect
//   contract tests (components.worker_effect, tambor-54j.8.6) — the
//   same runWorkerEffect envelope the app's bundled browser worker
//   entry would serve, wired to parentPort so vitest (node env) can
//   spawn a real Worker and verify the responsiveness contract.
// Responsibilities: the parentPort message wiring plus the test
//   handler table only — every semantic lives in envelope.ts
//   (runWorkerEffect). Built by tests/components-worker_effect.test.ts
//   via esbuild in a child process (the TextEncoder invariant — the
//   notebook harness precedent, tests/helpers/notebook-worker-node.ts).
// Rationale: workers exist in node >= 12 (worker_threads), so the
//   responsiveness contract (long compute off-thread keeps the main
//   wire responsive) is verified against a real Worker, not a mock;
//   the bundle mirrors the browser worker entry's self.onmessage shape
//   one platform over (parentPort.on).

// @ts-expect-error test-only node access (tsconfig types exclude node)
import { parentPort } from "node:worker_threads";

import {
  runWorkerEffect,
  type WorkerEffectHandler,
  type WorkerEffectRequest,
} from "../../src/components/worker_effect/envelope.ts";

// Busy-wait for ms, then return ms: deliberately occupies the thread
// (no yielding — a setTimeout-based fake would let the test pass for
// the wrong reason), so the main wire can prove it stays responsive
// while the compute runs off-thread.
function burn(ms: number): number {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // spin
  }
  return ms;
}

export const HANDLERS: Record<string, WorkerEffectHandler> = {
  double: (input) => (input as number) * 2,
  echo: (input) => input,
  sum: (input) => (input as readonly number[]).reduce((a, b) => a + b, 0),
  spin: (input) => burn((input as { readonly ms: number }).ms),
  boom: () => {
    throw new Error("boom");
  },
};

parentPort?.on("message", (m: unknown) => {
  parentPort?.postMessage(runWorkerEffect(HANDLERS, m as WorkerEffectRequest));
});
