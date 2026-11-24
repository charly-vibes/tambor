// @vitest-environment jsdom
// Purpose: the runtime-invalidation commit-contract tests (add-runtime-
//   invalidation tasks 1.0–1.4 and 2.0–2.4) — the ChangeSet +
//   DispatchCommit publication and the App.subscribe delivery
//   contract.
// Responsibilities: pin (1.0) a u-path dispatch publishes a commit with
//   a `known` ChangeSet carrying the touched path, previousState/state
//   and a sequence starting at 1, while a custom unannotated handler
//   publishes `unknown` with a reason; (1.2) a lane-only batch
//   publishes one unknown commit with the lane-only reason and
//   schedules no repaint; (1.3) a listener's reentrant dispatch queues
//   as its own commit with a strictly greater sequence; (1.4) 80
//   dispatches in one frame publish 80 commits and draw exactly once
//   (coalescing merges paints, never commits); (2.0) subscribe returns
//   an unsubscribe and two listeners receive the SAME frozen commit in
//   registration order until one unsubscribes; (2.3) a throwing
//   listener is isolated with the first error re-thrown after the
//   pass; (2.4) an unsubscribe made during delivery takes effect only
//   from the next commit.
// Rationale: openspec/changes/add-runtime-invalidation/spec.md is the
//   contract authority (requirement + scenario headings are mirrored in
//   .espectacular/). The ChangeSet/DispatchCommit/CommitListener types
//   are imported from the real exports (src/effects/dispatch.ts) since
//   the green phase landed; subscribe is reached through the
//   SubscribableApp narrowed view because the shared App type keeps the
//   member OPTIONAL for structural implementers (no lib.dom
//   reach-throughs). Split from tests/runtime-invalidation.test.ts
//   (the 400-line test-file gate); the painter/render halves live in
//   runtime-invalidation-render.test.ts and
//   runtime-invalidation-layout.test.ts, the shared mount rig in
//   tests/helpers/runtime-invalidation-rig.ts.

import { describe, expect, it, vi } from "vitest";

import {
  makeApp,
  type App,
  type CommitListener,
  type DispatchCommit,
  type Effect,
} from "../src/effects/dispatch.ts";
import type { SpaHandle } from "../src/spa/mount.ts";
import { label, on } from "../src/views/model.ts";
import type { IntentList } from "../src/events/bubble.ts";
import type { Path } from "../src/effects/paths.ts";
import { centreOf } from "./helpers/appview.ts";
import { scanOf } from "./helpers/scan.ts";
import { mounted } from "./helpers/runtime-invalidation-rig.ts";

// The shared App type keeps subscribe OPTIONAL (structural
// implementers — the ops-app seams — publish no commits and omit the
// member); every test here drives a makeApp-backed handle, so the
// tests reach the member through this narrowed view.
interface SubscribableApp extends App {
  subscribe(listener: CommitListener): () => void;
}

function subscribable(app: App): SubscribableApp {
  return app as unknown as SubscribableApp;
}

// jsdom DOES ship an async rAF (pretendToBeVisual), so every test stubs
// rAF explicitly; the makeApp repaint callback only re-derives the
// view, so nothing draws behind the test's back: the draws under test
// are synchronous wire draws, and the coalesced-paint test pumps the
// returned queue exactly once to fire the frame.
function stubFrames(): (() => void)[] {
  const frames: (() => void)[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: () => void): number => {
    frames.push(cb);
    return frames.length;
  });
  return frames;
}

// A plain counter app: the view reads nothing stateful that the commit
// tests depend on — commits are observed through subscribe, not paint.
function counterApp(): App {
  return makeApp({
    view: () => label("n"),
    state: { n: 0 },
  });
}

const N_PATH: Path = [["keypath", "n"]];

function incrementN(): Effect {
  return ["update", N_PATH, (n: unknown) => (n as number) + 1];
}

// The MouseEvent constructor, reached structurally (no lib.dom in
// tsconfig) — the same shape the frame-coalescing rig uses.
function mouseEventCtor(): new (
  type: string,
  init: { clientX: number; clientY: number },
) => unknown {
  const ctor = (globalThis as { MouseEvent?: unknown }).MouseEvent;
  if (typeof ctor !== "function") throw new Error("MouseEvent unavailable");
  return ctor as new (
    type: string,
    init: { clientX: number; clientY: number },
  ) => unknown;
}

// The fake frame pump (frame-coalescing rig pattern): the queued rAF
// callbacks fire now, so the coalesced paint lands synchronously.
function pump(frames: (() => void)[]): void {
  frames.splice(0).forEach((cb) => cb());
}

// A routed pointerdown+up pair at a view-tree point — the click the
// event layer synthesizes from the pair is what yields intents.
function clickAt(spa: SpaHandle, x: number, y: number): void {
  const ME = mouseEventCtor();
  spa.surface.host.dispatchEvent(new ME("pointerdown", { clientX: x, clientY: y }));
  spa.surface.host.dispatchEvent(new ME("pointerup", { clientX: x, clientY: y }));
}

describe("runtime-invalidation — dispatch commits (add-runtime-invalidation §1)", () => {
  // Task 1.0 — derives_from: known change reports paths
  it("a u-path dispatch publishes a known commit with the touched path, the states and a sequence starting at 1", () => {
    stubFrames();
    try {
      const app = counterApp();
      const commits: DispatchCommit[] = [];
      subscribable(app).subscribe((commit) => commits.push(commit));

      app.dispatch(incrementN());
      app.dispatch(incrementN());

      expect(commits.length).toBe(2);
      const [first, second] = commits as [DispatchCommit, DispatchCommit];
      // known ChangeSet: built-in path edit effects report the paths
      expect(first.changes.kind).toBe("known");
      expect(
        first.changes.kind === "known" ? first.changes.paths : [],
      ).toContainEqual(["n"]);
      // prior and next state exposed on the commit
      expect(first.previousState).toEqual({ n: 0 });
      expect(first.state).toEqual({ n: 1 });
      // strictly increasing, starting at 1; the commit is frozen
      expect(first.sequence).toBe(1);
      expect(second.sequence).toBe(2);
      expect(Object.isFrozen(first)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // Task 1.0 — derives_from: unannotated custom handler is conservative
  it("a custom unannotated handler publishes an unknown commit with a reason", () => {
    stubFrames();
    try {
      // A custom handler reports no path annotations: every effect it
      // applies must publish `unknown` (conservative — full rebuild).
      const app = makeApp({
        view: () => label("n"),
        state: { n: 0 },
        handler: (state) => state,
      });
      const commits: DispatchCommit[] = [];
      subscribable(app).subscribe((commit) => commits.push(commit));

      app.dispatch(["custom-noop", 1]);

      expect(commits.length).toBe(1);
      const commit = commits[0] as DispatchCommit;
      expect(commit.changes.kind).toBe("unknown");
      expect(
        commit.changes.kind === "unknown" ? commit.changes.reason : "",
      ).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // Task 1.2 — derives_from: lane-only batch publishes a commit whose
  // changes carry the lane marker and still schedules NO repaint
  // (commits_published + interaction-lane lane_batch_no_repaint).
  it("a lane-only batch publishes one unknown commit with the lane-only reason and schedules no repaint", () => {
    const frames = stubFrames();
    try {
      const app = counterApp();
      const commits: DispatchCommit[] = [];
      subscribable(app).subscribe((commit) => commits.push(commit));

      app.dispatch([["lane", "pan", (old: unknown) => (typeof old === "number" ? old : 0) + 5]]);

      // exactly one commit published for the lane-only batch
      expect(commits.length).toBe(1);
      const commit = commits[0] as DispatchCommit;
      // the lane marker: the lane builtin leaves no path annotations,
      // so the ChangeSet degrades to unknown with the lane-only reason
      expect(commit.changes).toEqual({
        kind: "unknown",
        reason: "lane-only batch",
      });
      // the lane touches no state: prior and next state are unchanged
      expect(commit.previousState).toEqual({ n: 0 });
      expect(commit.state).toEqual({ n: 0 });
      expect(commit.sequence).toBe(1);
      // the lane_batch_no_repaint invariant: no repaint scheduled
      expect(frames.length).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // Task 1.3 — derives_from: reentrant dispatch queues
  it("a listener's reentrant dispatch queues as its own commit with a strictly greater sequence", () => {
    stubFrames();
    try {
      const app = counterApp();
      const commits: DispatchCommit[] = [];
      let reentrant = false;
      subscribable(app).subscribe((commit) => {
        commits.push(commit);
        if (!reentrant) {
          reentrant = true;
          // the dispatch lands DURING delivery: it must queue as its
          // own later commit, not reenter the pass or deadlock
          app.dispatch(incrementN());
        }
      });

      app.dispatch(incrementN());

      // the queued dispatch published as its OWN commit — sequence 2,
      // state n=2 — and the pass terminated (no deadlock)
      expect(commits.length).toBe(2);
      const [first, second] = commits as [DispatchCommit, DispatchCommit];
      expect(first.sequence).toBe(1);
      expect(second.sequence).toBe(2);
      expect(second.state).toEqual({ n: 2 });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // Task 1.4 — derives_from: coalescing merges paints, never commits.
  // The rig is the frame-coalescing one (tests/spa-mount-coalesce.test.ts):
  // stubbed rAF queues the frames, routed clicks apply state
  // synchronously, and the pump fires exactly one frame.
  it("80 dispatches in one frame publish 80 commits with strictly increasing sequences and draw exactly once", () => {
    const frames = stubFrames();
    try {
      // routed clicks need a clickable view: a handler node whose
      // intent increments n. The routed pointerdown+up pair arrives as
      // the corpus mouse-down/mouse-up events (a "click" eventType
      // never matches — dispatch matches event.type === node.eventType,
      // and the button fires on mouse-down)
      const app = makeApp({
        view: () =>
          on(
            "mouse-down",
            (): IntentList => [["update", N_PATH, (n: unknown) => (n as number) + 1]],
            label("inc"),
          ),
        state: { n: 0 },
      });
      const commits: DispatchCommit[] = [];
      subscribable(app).subscribe((commit) => commits.push(commit));
      const { spa } = mounted(app);
      const drawSpy = vi.spyOn(spa.backend, "draw");

      // 80 routed clicks inside one (stubbed, unpumped) frame: every
      // click applies its intent synchronously (apply-immediate) and
      // publishes its own commit; the paints coalesce into one
      const target = scanOf(app.view()).find((f) => f.node.type === "handler")!;
      const [cx, cy] = centreOf(target);
      for (let i = 0; i < 80; i++) clickAt(spa, cx, cy);

      expect((app.getState() as { n: number }).n).toBe(80);
      expect(commits.length).toBe(80);
      expect(commits[0]!.sequence).toBe(1);
      expect(commits[79]!.sequence).toBe(80);
      for (let i = 1; i < commits.length; i++) {
        expect(commits[i]!.sequence).toBe(commits[i - 1]!.sequence + 1);
      }

      // nothing painted yet — the draws wait for the frame
      expect(drawSpy).toHaveBeenCalledTimes(0);
      pump(frames);
      // exactly one build-or-skip decision for the whole burst
      expect(drawSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("runtime-invalidation — subscriptions (add-runtime-invalidation §2)", () => {
  // Task 2.0 — derives_from: same commit to all listeners /
  // unsubscribe stops delivery
  it("subscribe delivers the same frozen commit in registration order and unsubscribe stops delivery", () => {
    stubFrames();
    try {
      const app = counterApp();
      const a: DispatchCommit[] = [];
      const b: DispatchCommit[] = [];
      const unsubA = subscribable(app).subscribe((c) => a.push(c));
      subscribable(app).subscribe((c) => b.push(c));

      app.dispatch(incrementN());

      // both listeners, registration order, the SAME frozen object
      expect(a.length).toBe(1);
      expect(b.length).toBe(1);
      expect(b[0]).toBe(a[0]);
      expect(Object.isFrozen(a[0])).toBe(true);

      unsubA();
      app.dispatch(incrementN());

      // the unsubscribed listener receives nothing further
      expect(a.length).toBe(1);
      expect(b.length).toBe(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // Task 2.3 (add-runtime-invalidation) — RED documented: against the
  // pre-edit code the delivery loop `for (…) listener(commit)` lets the
  // first throw propagate immediately, so the second listener never
  // receives the commit and the test fails on `b.length === 0` before
  // the re-throw assertion is even reached. The green shape: wrap each
  // delivery per-listener, collect the first error, re-throw it only
  // after every listener was served (delivery order otherwise
  // unchanged).
  it("a throwing listener is isolated: later listeners still receive the commit and the first error is re-thrown after the pass", () => {
    stubFrames();
    try {
      const app = counterApp();
      const a: DispatchCommit[] = [];
      const b: DispatchCommit[] = [];
      subscribable(app).subscribe((commit) => {
        a.push(commit);
        throw new Error("listener boom");
      });
      subscribable(app).subscribe((commit) => b.push(commit));

      // the first (throwing) listener's error surfaces from dispatch…
      expect(() => app.dispatch(incrementN())).toThrow("listener boom");
      // …but only AFTER the delivery pass completed: the second
      // listener received the same commit in registration order
      expect(a.length).toBe(1);
      expect(b.length).toBe(1);

      // a later pass: the throwing listener throws every time — the
      // isolation contract is that b STILL receives (order unchanged)
      expect(() => app.dispatch(incrementN())).toThrow("listener boom");
      expect(a.length).toBe(2);
      expect(b.length).toBe(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // Task 2.4 — derives_from: the listener list is snapshotted at
  // dispatch start, so an unsubscribe made during delivery takes
  // effect from the NEXT commit, not the in-flight pass.
  it("an unsubscribe made during delivery takes effect only from the next commit", () => {
    stubFrames();
    try {
      const app = counterApp();
      const a: DispatchCommit[] = [];
      const b: DispatchCommit[] = [];
      // b registers FIRST, so the in-flight pass serves it before a
      // unsubscribes it mid-pass
      const unsubB = subscribable(app).subscribe((commit) => b.push(commit));
      subscribable(app).subscribe((commit) => {
        a.push(commit);
        unsubB();
      });

      app.dispatch(incrementN());

      // the in-flight pass is unchanged: b still received commit 1
      expect(a.length).toBe(1);
      expect(b.length).toBe(1);

      app.dispatch(incrementN());

      // the unsubscribe took effect from the NEXT commit
      expect(a.length).toBe(2);
      expect(b.length).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
