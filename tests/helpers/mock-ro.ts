// Purpose: the shared ResizeObserver test double for docs host tests —
//   jsdom ships no implementation, and every docs test that pins a
//   width-dependent contract (host sizing, responsive breakpoints,
//   sidebar-shaped shell/keyboard fixtures) delivers boxes through the
//   same structural surface.
// Responsibilities: MockResizeObserver — records observed targets and
//   delivers callback entries the way a browser does on a container box
//   change; the exported registry array the mounts assert through;
//   lastObserver — the most recent mount's observer, failing loud when
//   a mount constructed none. Consumers assign the class onto the
//   global themselves (one statement, before the dynamic main.ts
//   import) and clear the registry in beforeEach — keeping this module
//   to the known-green statement surface (pretender lazy_cluster).
// Rationale: the docs host (src/docs/host.ts, task 4.2) constructs the
//   observer through the global because the core keeps no lib.dom
//   types; the double is the host seam's test surface (docs-host-sizing
//   pattern, shared from one module so the four consumers cannot fork).

// The box entry a callback receives (structural — no lib.dom).
export interface MockEntry {
  readonly contentRect: { readonly width: number; readonly height: number };
}

export interface MockObserver {
  readonly observed: unknown[];
  disconnected: boolean;
  fire(entries: readonly MockEntry[]): void;
}

// Every constructed observer is recorded so a test can fire its
// callback the way a real browser would on a container box change.
export const observers: MockObserver[] = [];

export class MockResizeObserver {
  readonly observed: unknown[] = [];
  disconnected = false;
  private readonly callback: (entries: readonly MockEntry[]) => void;

  constructor(callback: (entries: readonly MockEntry[]) => void) {
    this.callback = callback;
    observers.push(this);
  }

  observe(target: unknown): void {
    this.observed.push(target);
  }

  unobserve(target: unknown): void {
    const at = this.observed.indexOf(target);
    if (at >= 0) this.observed.splice(at, 1);
  }

  disconnect(): void {
    this.disconnected = true;
  }

  // Deliver a box change the way a browser does: invoke the mount's
  // callback with entries carrying the observed content rect.
  fire(entries: readonly MockEntry[]): void {
    this.callback(entries);
  }
}

// The observer the most recent mount constructed — a mount without one
// fails loud here, since every width assertion rides on it.
export function lastObserver(): MockObserver {
  const observer = observers[observers.length - 1];
  if (observer === undefined) {
    throw new Error("mock-ro: no ResizeObserver was constructed");
  }
  return observer;
}
