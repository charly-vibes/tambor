// Purpose: opt-in phase timers for the dispatch pipeline (tambor-54j.1)
//   — the per-dispatch cost breakdown of the chat-repo cold read §4.5/H1
//   (docs/reference/chat-repo-cold-read): handler · view derivation ·
//   reconcile/layout · paint · GC, buffered per dispatch and exposed as
//   plain data through drain().
// Responsibilities: the DispatchTiming record shape and phase names;
//   enable/disable (disable clears the buffer); begin(event) opens one
//   record per wire invocation and closes a still-open predecessor;
//   startSpan/endSpan bracket a measured region inside the open record;
//   finishDraw closes the record at the draw site that completes it;
//   drain() finalizes any open record and hands out buffered records.
// Rationale: the doc proposes the split handler · view derivation ·
//   reconcile/layout · paint · GC; the actual boundaries live in the
//   code and are instrumented where they happen:
//   - handler + derive: the wire sites — Runtime.send (render/backend.ts),
//     makeHeadlessApp.send (app/app.ts), the SPA surface wire
//     (spa/mount.ts). Derive is view re-derivation (accumulated across
//     both the pre-dispatch derivation and any derivation feeding the
//     draw); handler is event routing plus intent application.
//   - reconcile_layout + paint: the backend draw sites — canvas.ts
//     (buffer clear/matrix = reconcile, rasterize = paint), dom.ts
//     (element-tree rebuild = reconcile; paint is the browser's, after
//     the call, so it reads 0 here), text.ts (grid allocation =
//     reconcile, cell painting = paint).
//   - GC: not instrumentable in the dispatch path — JavaScript exposes
//     no per-dispatch collector attribution. The field exists in the
//     shape (the §4.5 split is the API) and reads 0 until an external
//     meter (e.g. --expose-gc heap deltas over N dispatches) populates
//     it; populating it from inside the pipeline would need a semantics
//     change, so it is left as data.
//   Zero cost when off: every seam function returns immediately when
//   disabled — no clock reads, no allocation, no timers in the hot
//   path. Enabling is an explicit enable() call at the meter, not
//   env-polling per dispatch. Attribution is per wire invocation; an
//   app that routes one event through two wires produces two records.
//   A draw with no open record (resize, a draw after the record
//   closed) drops its timing rather than inventing a record; with more
//   than one dispatch in flight per frame the deferred canvas paint
//   attributes to the newest open record (one dispatch per frame is the
//   corpus constraint, so the approximation is rare by design). Records
//   buffer until drain() — a meter must drain; the buffer is bounded
//   only by that contract.

// The five §4.5 phases, in pipeline order. gc is carried by the shape
// but never populated in-pipeline (see the header).
export type PhaseName = "handler" | "derive" | "reconcile_layout" | "paint" | "gc";

// Per-phase milliseconds for one dispatch. Plain mutable record while
// open; handed out frozen from drain().
export interface DispatchPhases {
  handler: number;
  derive: number;
  reconcile_layout: number;
  paint: number;
  gc: number;
}

export interface DispatchTiming {
  /** the event kind of the wire invocation (TamborEvent.type) */
  readonly event: string;
  readonly phases: DispatchPhases;
}

interface OpenRecord {
  readonly event: string;
  readonly phases: DispatchPhases;
}

let recording = false;
let open: OpenRecord | null = null;
let spanPhase: PhaseName | null = null;
let spanT0 = 0;
const buffer: DispatchTiming[] = [];

// The host clock, resolved once: the Web performance clock when the
// host provides one (browser, Node), falling back to Date.now on
// exotic hosts. performance sits outside tsconfig's ES2022 lib, so the
// lookup is a cast rather than a global reference.
const clock =
  (globalThis as unknown as { performance?: { now(): number } }).performance ??
  { now: () => Date.now() };

function now(): number {
  return clock.now();
}

function freshPhases(): DispatchPhases {
  return { handler: 0, derive: 0, reconcile_layout: 0, paint: 0, gc: 0 };
}

/** Turn the timers on: the wire and draw seams begin buffering records. */
export function enable(): void {
  recording = true;
  buffer.length = 0;
  open = null;
  spanPhase = null;
}

/** Turn the timers off and clear the buffer: the seams are no-ops again. */
export function disable(): void {
  recording = false;
  buffer.length = 0;
  open = null;
  spanPhase = null;
}

/** Whether the timers are on. */
export function enabled(): boolean {
  return recording;
}

/**
 * Open one record for a wire invocation (a routed event). Closes a
 * still-open predecessor first, so records never merge. No-op when
 * disabled.
 */
export function begin(event: string): void {
  if (!recording) return;
  if (open !== null) {
    buffer.push(freeze(open));
  }
  open = { event, phases: freshPhases() };
}

/**
 * Start a measured region (a phase span) inside the open record.
 * No-op when disabled, when no record is open, or when a span is
 * already open (spans do not nest).
 */
export function startSpan(phase: PhaseName): void {
  if (!recording || open === null || spanPhase !== null) return;
  spanPhase = phase;
  spanT0 = now();
}

/**
 * Close the open span, accumulating its elapsed milliseconds into the
 * record (a phase may be marked by several spans, e.g. the two view
 * derivations of one routed event). No-op when nothing is open.
 */
export function endSpan(): void {
  if (!recording || open === null || spanPhase === null) return;
  open.phases[spanPhase] += now() - spanT0;
  spanPhase = null;
}

/**
 * Close the open record at the draw site that completes it. No-op when
 * disabled or when no record is open (a recordless draw — resize,
 * late repaint — records nothing).
 */
export function finishDraw(): void {
  if (!recording || open === null) return;
  buffer.push(freeze(open));
  open = null;
}

/**
 * Finalize any open record, hand out the buffered records as frozen
 * plain data, and empty the buffer. A meter must drain: the buffer has
 * no other bound.
 */
export function drain(): readonly DispatchTiming[] {
  if (recording && open !== null) {
    buffer.push(freeze(open));
    open = null;
    spanPhase = null;
  }
  const out = Object.freeze(buffer.slice());
  buffer.length = 0;
  return out;
}

function freeze(record: OpenRecord): DispatchTiming {
  return Object.freeze({
    event: record.event,
    phases: Object.freeze({ ...record.phases }),
  });
}

/** The module surface, importable as one value. */
export const phaseTimers = {
  enable,
  disable,
  enabled,
  begin,
  startSpan,
  endSpan,
  finishDraw,
  drain,
} as const;
