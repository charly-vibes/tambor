// Purpose: the model seam of the bombadil suite — a safe read of the
//   `?debug=1` handle (`globalThis.__tambor`) plus the derived values the
//   specs compare against the drawn DOM.
// Responsibilities: `handle()` returns the debug handle when
//   `hasHandleMembers` accepts its shape (null while absent), each member
//   read isolated so a throw degrades to null/0; `counterValue` projects
//   `state().num` to a finite number and falls back to the drawn label
//   text when the handle is missing; `appSnapshot` is a JSON-safe projection
//   of the state for diagnostics. `view()` is never returned: an Elem
//   carries handler functions and is not serializable (design D5).
// Rationale: extractors run in the page for every captured state and
//   their results must be JSON. The handle arrives from a parallel slice
//   (`add-spa-test-seams`), so every read is defensive: absent, partial or
//   throwing handles degrade to null instead of breaking a run.

import type { JSON } from "@antithesishq/bombadil";
import { STAGE_SELECTOR } from "./stage.ts";

// The debug handle published by the SPA entry when `?debug=1` is present
// (openspec/changes/add-spa-test-seams). This module treats it as an
// untrusted structural seam: any shape mismatch reads as "no handle".
export type TamborHandle = {
  readonly demo: string;
  state(): unknown;
  view(): unknown;
  drawCount(): number;
};

type HostGlobals = { readonly __tambor?: unknown };

// The used members of the published handle, as verified by
// `hasHandleMembers`. The readers stay `unknown`-returning: their results
// are projected (`demo`, finite `drawCount`) before the handle is built.
type HandleProbe = {
  readonly demo: string;
  readonly state: (this: unknown) => unknown;
  readonly view: (this: unknown) => unknown;
  readonly drawCount: (this: unknown) => unknown;
};

// The documented handshake shape (add-spa-test-seams); each used member is
// verified, so a partial or stale handle reads as absent. The cast only
// names the probe shape; the checks below are what admit a value.
function hasHandleMembers(value: unknown): value is HandleProbe {
  const probe = value as Partial<Record<keyof TamborHandle, unknown>>;
  return (
    typeof probe === "object" &&
    probe !== null &&
    typeof probe["demo"] === "string" &&
    typeof probe["state"] === "function" &&
    typeof probe["view"] === "function" &&
    typeof probe["drawCount"] === "function"
  );
}

// Any read that throws degrades to its neutral value (null / 0): a stale
// or hostile handle must never break a run.
function safeRead<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

export function handle(): TamborHandle | null {
  const candidate: unknown = (globalThis as HostGlobals).__tambor;
  if (!hasHandleMembers(candidate)) return null;
  // Bind the verified readers to the published object and neutralise
  // throws, so a read never escapes as an exception.
  const demo = candidate.demo;
  const readState = candidate.state;
  const readView = candidate.view;
  const readDrawCount = candidate.drawCount;
  return {
    demo,
    state: (): unknown =>
      safeRead<unknown>(() => readState.call(candidate), null),
    view: (): unknown => safeRead<unknown>(() => readView.call(candidate), null),
    drawCount: (): number => {
      const count = safeRead<unknown>(() => readDrawCount.call(candidate), 0);
      return typeof count === "number" && Number.isFinite(count) ? count : 0;
    },
  };
}

export function demoId(): string | null {
  const current = handle();
  return current === null ? null : current.demo;
}

export function drawCount(): number | null {
  const current = handle();
  return current === null ? null : current.drawCount();
}

// `state().num` projected to a number; null when there is no handle, no
// state object, or no finite numeric `num` (the counter demo's shape).
export function handleCounterNum(): number | null {
  const current = handle();
  if (current === null) return null;
  const state = current.state();
  if (typeof state !== "object" || state === null) return null;
  if (!("num" in state)) return null;
  const num: unknown = state["num"];
  return typeof num === "number" && Number.isFinite(num) ? num : null;
}

const INTEGER_TEXT = /^-?\d+$/;

// The drawn counter label is a leaf span whose text is the padded count
// (counter/centredLabel). Used as the fallback when the debug handle is
// absent, so the counter property still observes transitions in a bundle
// built without the seam.
export function drawnCounterValue(document: Document): number | null {
  const root = document.querySelector(STAGE_SELECTOR);
  if (root === null) return null;
  for (const element of root.querySelectorAll("*")) {
    if (element.childElementCount > 0) continue;
    const text = element.textContent?.trim() ?? "";
    if (!INTEGER_TEXT.test(text)) continue;
    const value = Number.parseInt(text, 10);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

// The counter's observed value: the handle's state projection first, the
// drawn label second. Both are plain numbers (or null before mount), so
// the extractor result stays JSON.
export function counterValue(document: Document): number | null {
  return handleCounterNum() ?? drawnCounterValue(document);
}

// Strip everything JSON cannot carry (functions, cycles, bigints) by
// round-tripping. An unserializable value degrades to null.
export function toJson(value: unknown): JSON {
  if (value === undefined) return null;
  try {
    const text = JSON.stringify(value);
    if (text === undefined) return null;
    return JSON.parse(text) as JSON;
  } catch {
    return null;
  }
}

// A JSON-safe diagnostic snapshot: demo name, draw count and projected
// state. Deliberately excludes view(), which is a handler-laden Elem.
export function appSnapshot(): JSON {
  const current = handle();
  if (current === null) return null;
  return {
    demo: current.demo,
    drawCount: current.drawCount(),
    state: toJson(current.state()),
  };
}