// @vitest-environment jsdom
// Purpose: the keyed DOM reconciliation painter tests (add-keyed-dom-
//   reconciliation §2) — the splice contract observable through a
//   real-DOM mount: keyed rows keep their element references across
//   reorder/insert/remove while the unkeyed M1 rule rebuilds.
// Responsibilities: pin (2.0) keyed reorder [c,a,b] splices — the same
//   three element references reappear in the new order; a keyed
//   mid-list insert builds exactly one new element and every subsequent
//   row keeps its reference; a keyed remove keeps the remaining rows'
//   references; the unkeyed M1 baseline rebuilds the same frames
//   (rebuildCount semantics unchanged — keys never enable the
//   short-circuit, §2.2 pins the boundaries).
// Rationale: openspec/changes/add-keyed-dom-reconciliation/spec.md is
//   the contract authority; element reference equality through the
//   mounted rig (tests/helpers/runtime-invalidation-rig.ts) is the
//   reuse observable M1 established. RED today: every draw rebuilds the
//   tree positionally (buildChildWithReuse has no keyed matching), so
//   every reference differs — green lands with the per-parent keyed
//   records + reconcile plan consumption in buildChildWithReuse.
//   Static test titles only (the testaruda store drifts on dynamic
//   titles).
import { describe, expect, it, vi } from "vitest";

import { makeApp, type App } from "../src/effects/dispatch.ts";
import { keyed, label, type Elem } from "../src/views/model.ts";
import type { HostElement } from "../src/interop/domhost.ts";
import { hostDoc, mounted } from "./helpers/runtime-invalidation-rig.ts";
import { mountDemo, type MountOptions, type SpaHandle } from "../src/spa/mount.ts";

// jsdom DOES ship an async rAF (pretendToBeVisual), so every test stubs
// rAF explicitly and pumps the queue exactly once per dispatch — the
// mount's coalescer paints the hinted wire draw on the frame, and the
// unpumped rAF would draw behind the assertions' backs (the M1 render
// tests' protocol).
function stubFrames(): (() => void)[] {
  const frames: (() => void)[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: () => void): number => {
    frames.push(cb);
    return frames.length;
  });
  return frames;
}

// A memo-stable row: the keyed wrapper is fresh per derive, the inner
// label Elem is identity-stable per row id (the memo boundary M1 pins).
interface Msg {
  readonly id: string;
  readonly text: string;
}

const rowCache = new Map<string, Elem>();
const rowOf = (m: Msg): Elem => {
  let row = rowCache.get(m.id);
  if (row === undefined) {
    row = label(`${m.id} — ${m.text}`);
    rowCache.set(m.id, row);
  }
  return row;
};

const keyedView = (state: unknown): Elem =>
  (state as { msgs: readonly Msg[] }).msgs.map((m) => keyed(m.id, rowOf(m)));

const appOf = (msgs: readonly Msg[]) =>
  makeApp({ view: keyedView, state: { msgs } });

const rowElements = (host: HostElement): HostElement[] =>
  Array.from(host.querySelectorAll("span"));

// jsdom elements carry parentElement; the structural HostElement type
// stays DOM-free, so the test reads it through a local narrowing.
const parentOf = (el: HostElement): HostElement | null =>
  (el as unknown as { parentElement: HostElement | null }).parentElement;

const abc: readonly Msg[] = [
  { id: "a", text: "alpha" },
  { id: "b", text: "beta" },
  { id: "c", text: "gamma" },
];

describe("keyed-dom-reconciliation — painter splice (add-keyed-dom-reconciliation §2)", () => {
  it("2.0 keyed reorder splices: the same element references reappear in the new order, building identically to the unkeyed shape", () => {
    const frames = stubFrames();
    try {
      const app = appOf(abc);
      const { spa } = mounted(app);
      const before = rowElements(spa.root.host);
      expect(before.map((el) => el.textContent)).toEqual([
        "a — alpha",
        "b — beta",
        "c — gamma",
      ]);

      app.dispatch([
        "update",
        [["keypath", "msgs"]],
        (msgs: unknown) => [...(msgs as Msg[])].reverse(),
      ]);
      frames.splice(0).forEach((fire) => fire());

      const after = rowElements(spa.root.host);
      expect(after.map((el) => el.textContent)).toEqual([
        "c — gamma",
        "b — beta",
        "a — alpha",
      ]);
      // the splice observable: same elements, new order
      expect(after[0]).toBe(before[2]);
      expect(after[1]).toBe(before[1]);
      expect(after[2]).toBe(before[0]);
      // output-equality with the unkeyed draw: rows build DIRECTLY into
      // the frame container — one shared parent, no per-row wrapper div
      // (RED before the keyed wiring: the fresh keyed wrapper fell
      // through the unknown fallback, so every row carried a fresh
      // wrapper div per frame)
      expect(new Set(after.map(parentOf)).size).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("2.0 keyed mid-list insert builds exactly one new element and subsequent rows keep their references", () => {
    const frames = stubFrames();
    try {
      const app = appOf(abc);
      const { spa } = mounted(app);
      const before = rowElements(spa.root.host);

      app.dispatch([
        "update",
        [["keypath", "msgs"]],
        (msgs: unknown) => [
          (msgs as Msg[])[0]!,
          { id: "x", text: "xtra" },
          ...(msgs as Msg[]).slice(1),
        ],
      ]);
      frames.splice(0).forEach((fire) => fire());

      const after = rowElements(spa.root.host);
      expect(after.map((el) => el.textContent)).toEqual([
        "a — alpha",
        "x — xtra",
        "b — beta",
        "c — gamma",
      ]);
      expect(after[0]).toBe(before[0]);
      expect(after[2]).toBe(before[1]);
      expect(after[3]).toBe(before[2]);
      // exactly one new element: the inserted row
      expect(before.includes(after[1]!)).toBe(false);
      expect(after.filter((el) => !before.includes(el)).length).toBe(1);
      // no per-row wrapper churn: all rows share the container
      expect(new Set(after.map(parentOf)).size).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("2.0 keyed remove keeps the remaining rows' references", () => {
    const frames = stubFrames();
    try {
      const app = appOf(abc);
      const { spa } = mounted(app);
      const before = rowElements(spa.root.host);

      app.dispatch([
        "update",
        [["keypath", "msgs"]],
        (msgs: unknown) => (msgs as Msg[]).filter((m) => m.id !== "b"),
      ]);
      frames.splice(0).forEach((fire) => fire());

      const after = rowElements(spa.root.host);
      expect(after.map((el) => el.textContent)).toEqual([
        "a — alpha",
        "c — gamma",
      ]);
      expect(after[0]).toBe(before[0]);
      expect(after[1]).toBe(before[2]);
      expect(new Set(after.map(parentOf)).size).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("keyed-dom-reconciliation — boundary gates (add-keyed-dom-reconciliation §2.2)", () => {
  // The counting rig: immediate mode (dispatch draw tails run
  // synchronously, no frame pumping) with the opt-in counters exposed
  // through the debug snapshot, the runtime-invalidation-counters
  // pattern.
  interface DispatchCounts {
    readonly derive: number;
    readonly rebuild: number;
    readonly draw: number;
  }
  function immediateMount(app: App): {
    spa: SpaHandle;
    counts(): DispatchCounts;
  } {
    stubFrames();
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    const options: MountOptions = {
      debug: true,
      counters: true,
      mode: "immediate",
    };
    const spa = mountDemo(doc, container, () => app, options);
    const host = globalThis as {
      __tambor?: { counts(): DispatchCounts };
    };
    return { spa, counts: () => host.__tambor!.counts() };
  }

  it("2.2 an unknown ChangeSet frame with keyed children performs a full rebuild — no splice anywhere", () => {
    // The unannotated-handler app publishes `unknown` commits
    // (conservative — full rebuild), the runtime-invalidation-commits
    // pattern, with keyed rows in the view.
    const app = makeApp({
      view: keyedView,
      state: { msgs: abc },
      handler: (state) => state,
    });
    const handle = immediateMount(app);
    const before = rowElements(handle.spa.root.host);
    expect(before.length).toBe(3);

    handle.spa.app.dispatch(["custom-shuffle", 1]);

    const after = rowElements(handle.spa.root.host);
    expect(after.map((el) => el.textContent)).toEqual([
      "a — alpha",
      "b — beta",
      "c — gamma",
    ]);
    // keys never rescue the unknown frame: every row rebuilt
    for (let i = 0; i < before.length; i++) {
      expect(after[i]).not.toBe(before[i]);
    }
  });

  it("2.2 a hintless draw never reuses, with keys present", () => {
    const app = appOf(abc);
    const handle = immediateMount(app);
    const before = rowElements(handle.spa.root.host);
    expect(before.length).toBe(3);

    // a draw WITHOUT a hint (any non-wire caller): clear the backend's
    // frame hint structurally and draw the last view directly
    const backend = handle.spa.backend as unknown as {
      frameHint: unknown;
      lastView: unknown;
    };
    const lastView = backend.lastView;
    backend.frameHint = undefined;
    handle.spa.backend.draw(lastView as Elem);

    const after = rowElements(handle.spa.root.host);
    expect(after.map((el) => el.textContent)).toEqual([
      "a — alpha",
      "b — beta",
      "c — gamma",
    ]);
    for (let i = 0; i < before.length; i++) {
      expect(after[i]).not.toBe(before[i]);
    }
  });

  it("2.2 keys never enable the whole-view short-circuit: known skips, unknown rebuilds", () => {
    // Identity-equal view: the view function returns the SAME Elem
    // object every derive (the M1 short-circuit's fuel), rows keyed.
    const shared: Elem = [keyed("a", label("a")), keyed("b", label("b"))];
    const app = makeApp({ view: () => shared, state: { n: 0 } });
    const { spa, counts } = immediateMount(app);

    // known frame + identity-equal view: the short-circuit skips
    const skipBefore = counts().rebuild;
    spa.app.dispatch([
      "update",
      [["keypath", "n"]],
      (n: unknown) => (n as number) + 1,
    ]);
    expect(counts().rebuild).toBe(skipBefore);

    // unknown frame with the same identity-equal view: rebuild fires
    spa.app.dispatch(["custom-noop", 1]);
    expect(counts().rebuild).toBe(skipBefore + 1);

    // the unknown frame rebuilt THROUGH the keys (M1's rule with keys
    // present); the skipped known frame left the tree untouched — the
    // rebuild counter deltas above are the observable
    const after = rowElements(spa.root.host);
    expect(after.map((el) => el.textContent)).toEqual(["a", "b"]);
  });

  it("2.2 a key never crosses containers: the same key under a different parent rebuilds", () => {
    const x = label("shared-x");
    const app = makeApp({
      view: (state: unknown) => {
        const inFirst = (state as { inFirst: boolean }).inFirst;
        return [
          inFirst ? [keyed("k", x)] : [],
          inFirst ? [] : [keyed("k", x)],
        ];
      },
      state: { inFirst: true },
    });
    const handle = immediateMount(app);
    const before = rowElements(handle.spa.root.host);
    expect(before.length).toBe(1);

    handle.spa.app.dispatch([
      "update",
      [["keypath", "inFirst"]],
      () => false,
    ]);

    const after = rowElements(handle.spa.root.host);
    expect(after.map((el) => el.textContent)).toEqual(["shared-x"]);
    // the key matched under the OTHER container — the row rebuilds
    // (keyed records are per container index-path, never global)
    expect(after[0]).not.toBe(before[0]);
  });

  it("2.2 a null-inner keyed row draws nothing and never throws across keyed frames", () => {
    // keyed(k, null) is legal (only groups are rejected at
    // construction): the null inner has no range to donate, so the row
    // plan-normalizes to the positional/fresh rules — exercised here at
    // the render level across a reorder (no WeakMap null throw). The
    // label inners are memo-stable per id (the memo boundary M1 pins).
    const cache = new Map<string, Elem | null>();
    const rowOf = (m: string): Elem | null => {
      if (!cache.has(m)) cache.set(m, m === "nil" ? null : label(m));
      return cache.get(m) ?? null;
    };
    const app = makeApp({
      view: (state: unknown) => {
        const msgs = (state as { msgs: readonly string[] }).msgs;
        return msgs.map((m) => keyed(m, rowOf(m)));
      },
      state: { msgs: ["a", "nil", "b"] },
    });
    const handle = immediateMount(app);
    const before = rowElements(handle.spa.root.host);
    expect(before.map((el) => el.textContent)).toEqual(["a", "b"]);

    handle.spa.app.dispatch([
      "update",
      [["keypath", "msgs"]],
      (msgs: unknown) => [...(msgs as string[])].reverse(),
    ]);

    const after = rowElements(handle.spa.root.host);
    expect(after.map((el) => el.textContent)).toEqual(["b", "a"]);
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
  });
});

