// Purpose: shared mount rig for the runtime-invalidation contract
//   tests — the jsdom document lookup and the real-DOM mounted-app
//   handle the commit and render halves both drive.
// Responsibilities: hostDoc returns the document the jsdom test
//   environment installed (reached structurally, no lib.dom
//   reach-through); mounted mounts the given app into a fresh container
//   and draws once, so spies installed after the mount count only
//   post-mount work.
// Rationale: openspec/changes/add-runtime-invalidation/spec.md is the
//   contract authority; the split halves of the former
//   tests/runtime-invalidation.test.ts (runtime-invalidation-commits,
//   runtime-invalidation-render) both need this rig, so it lives here
//   instead of being duplicated. The module imports only src modules
//   and type imports — no test-framework dependency, no import-cycle
//   risk.

import {
  makeApp,
  type App,
  type CommitListener,
  type Effect,
} from "../../src/effects/dispatch.ts";
import type { HostDoc } from "../../src/interop/domhost.ts";
import { mountDemo } from "../../src/spa/mount.ts";
import { label } from "../../src/views/model.ts";
import type { Path } from "../../src/effects/paths.ts";

export function hostDoc(): HostDoc {
  return (globalThis as { document?: unknown }).document as HostDoc;
}

// The mounted rig: a real-DOM mount of the given app, drawn once before
// the spies install so assertions count only post-mount work.
export function mounted(app: App) {
  const doc = hostDoc();
  const container = doc.createElement("div");
  doc.body.appendChild(container);
  const spa = mountDemo(doc, container, () => app);
  return { spa, container };
}

// The shared App type keeps subscribe OPTIONAL (structural
// implementers — the ops-app seams — publish no commits and omit the
// member); every commit-stream test drives a makeApp-backed handle, so
// the tests reach the member through this narrowed view.
export interface SubscribableApp extends App {
  subscribe(listener: CommitListener): () => void;
}

export function subscribable(app: App): SubscribableApp {
  return app as unknown as SubscribableApp;
}

// jsdom DOES ship an async rAF (pretendToBeVisual), so every commit
// test stubs rAF explicitly; the makeApp repaint callback only
// re-derives the view, so nothing draws behind the test's back: the
// draws under test are synchronous wire draws, and the coalesced-paint
// test pumps the returned queue exactly once to fire the frame.
// Plain save/replace (no test-framework dependency — rig rule); the
// caller restores with unstubFrames in its finally.
export function stubFrames(): (() => void)[] {
  const frames: (() => void)[] = [];
  const g = globalThis as { requestAnimationFrame?: unknown };
  framesOriginal = g.requestAnimationFrame;
  g.requestAnimationFrame = (cb: () => void): number => {
    frames.push(cb);
    return frames.length;
  };
  return frames;
}

export function unstubFrames(): void {
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame =
    framesOriginal;
  framesOriginal = undefined;
}

let framesOriginal: unknown;

// A plain counter app: the view reads nothing stateful that the commit
// tests depend on — commits are observed through subscribe, not paint.
export function counterApp(): App {
  return makeApp({
    view: () => label("n"),
    state: { n: 0 },
  });
}

export const N_PATH: Path = [["keypath", "n"]];

export function incrementN(): Effect {
  return ["update", N_PATH, (n: unknown) => (n as number) + 1];
}
