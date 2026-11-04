// Purpose: a bounded wait for an async condition in the DOM-backed
//   contract tests — the docs page body arrives through a dynamic
//   import, so an assertion on it must wait rather than race.
// Responsibilities: waitFor(predicate) polls the predicate until it
//   holds or the deadline passes, and reports whether it held.
// Rationale: the ES2022 lib carries no timer declarations and the
//   tsconfig types exclude node, so the timer global is reached
//   structurally (the components-worker_effect.test.ts pattern).

// The timer global reached structurally (no node types).
const timers = globalThis as unknown as {
  setTimeout: (f: () => void, ms: number) => unknown;
};

// Poll the predicate until it holds; false means the deadline passed.
export async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (predicate()) return true;
    if (Date.now() > deadline) return false;
    await new Promise<void>((resolve) => {
      timers.setTimeout(() => resolve(), 5);
    });
  }
}
