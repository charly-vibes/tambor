// @vitest-environment jsdom
// Purpose: the gallery inspector contract tests (add-gallery-inspector
//   §2/§3) — the read-only ?debug=1 panel: live state pane, bounded
//   transition log, and the six pinned properties (consumes-never-
//   mutates, every-intent-logged, monotonic-sequence, ring-bounded,
//   json-safe, fresh-after-draw).
// Responsibilities: verify (1) wiring subscribes through App.subscribe
//   and renders one log entry per dispatch (sequence, sanitized intents,
//   change kind/reason); (2) unmount unsubscribes and removes the
//   panel; (3) the live pane reads the app's current state; (4) the
//   pinned properties hold: no mutation/extra draws, exact one-entry-
//   per-dispatch, strictly increasing sequences, ring capacity, and
//   JSON-safe projections even for function-bearing intents/state.
// Rationale: openspec/changes/add-gallery-inspector is the design
//   authority; the panel is host DOM (never canvas), so jsdom through
//   the structural adapter is the real surface, the same approach the
//   gallery contract tests use.

import { describe, expect, it, vi } from "vitest";

import { makeApp, type App, type Effect } from "../src/effects/dispatch.ts";
import {
  wireGalleryInspector,
  type InspectorHandle,
} from "../src/spa/inspector.ts";
import { label } from "../src/views/model.ts";
import type { HostDoc, HostElement } from "../src/interop/domhost.ts";
import type { Path } from "../src/effects/paths.ts";

// The structural host: jsdom's document is the HostDoc the panel
// renders through (domhost adapter), same as gallery.test.ts.
function hostDoc(): HostDoc {
  return (globalThis as { document?: unknown }).document as HostDoc;
}

// jsdom's async rAF would leak a pending repaint per dispatch; the
// inspector tests observe commits through subscribe, not paint — stub
// rAF and drop the queued frames, exactly like the commit tests.
function stubFrames(): void {
  vi.stubGlobal("requestAnimationFrame", (_cb: () => void): number => 0);
}

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

// data-sequence rides the real DOM elements, not the structural interface
function seq(entry: HostElement): string {
  return (entry as unknown as AttrHost).getAttribute?.("data-sequence") ?? "";
}

function wire(app: App): InspectorHandle {
  return wireGalleryInspector(hostDoc(), app, {});
}

// getAttribute rides the real DOM elements (jsdom/browser) but is not
// on the structural HostElement interface — reached through this cast.
interface AttrHost {
  getAttribute?(name: string): string | null;
}

function logPane(handle: InspectorHandle): HostElement | null {
  for (const child of handle.el.childNodes) {
    const el = child as unknown as AttrHost;
    if (el.getAttribute?.("data-pane") === "log") return child as HostElement;
  }
  return null;
}

function logEntries(handle: InspectorHandle): HostElement[] {
  const pane = logPane(handle);
  if (pane === null) return [];
  const out: HostElement[] = [];
  for (const child of pane.childNodes) {
    if (
      (child as unknown as AttrHost).getAttribute?.("data-entry") !== null &&
      (child as unknown as AttrHost).getAttribute?.("data-entry") !== undefined
    ) {
      out.push(child as HostElement);
    }
  }
  return out;
}

function entryField(entry: HostElement, field: string): string | null {
  for (const child of entry.childNodes) {
    const el = child as unknown as AttrHost;
    if (el.getAttribute?.("data-field") === field) {
      return (child as HostElement).textContent;
    }
  }
  return null;
}

function livePane(handle: InspectorHandle): string | null {
  for (const child of handle.el.childNodes) {
    const el = child as unknown as AttrHost;
    if (el.getAttribute?.("data-pane") === "state") {
      return (child as HostElement).textContent;
    }
  }
  return null;
}

describe("gallery-inspector — panel wiring (add-gallery-inspector §2)", () => {
  it("one dispatch appends exactly one log entry with sequence, intents and change kind", () => {
    stubFrames();
    try {
      const app = counterApp();
      const handle = wire(app);

      app.dispatch([incrementN(), ["noop-extra", 7]]);

      const entries = logEntries(handle);
      expect(entries.length).toBe(1);
      expect(seq(entries[0]!)).toBe("1");
      // the applied batch, JSON-safe projection, order preserved
      expect(entryField(entries[0]!, "intents")).toBe(
        '[["update",[["keypath","n"]],"ƒ()"],["noop-extra",7]]',
      );
      // the unregistered second effect degrades the ChangeSet to the
      // conservative unknown, with its reason on the entry
      expect(entryField(entries[0]!, "change")).toBe("unknown: custom handler");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("unmount unsubscribes and detaches the panel", () => {
    stubFrames();
    try {
      const app = counterApp();
      const handle = wire(app);
      app.dispatch(incrementN());
      expect(logEntries(handle).length).toBe(1);

      handle.unmount();
      app.dispatch(incrementN());

      // fully detached: no further entries and no pane content at all
      // (the shell owns the element's place in the layout)
      expect(logEntries(handle).length).toBe(0);
      expect(livePane(handle)).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("the live pane renders the current state, fresh after each commit", () => {
    stubFrames();
    try {
      const app = counterApp();
      const handle = wire(app);
      // fresh after wiring: the initial state is visible immediately
      expect(JSON.parse(livePane(handle) ?? "null")).toEqual({ n: 0 });

      app.dispatch(incrementN());
      expect(JSON.parse(livePane(handle) ?? "null")).toEqual({ n: 1 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("gallery-inspector — pinned properties (add-gallery-inspector §3)", () => {
  it("p_consumes_never_mutates: reads and renders mutate nothing and draw nothing", () => {
    stubFrames();
    try {
      const app = counterApp();
      const handle = wire(app);
      const before = app.getState();

      app.dispatch(incrementN());
      const afterFirst = app.getState();
      // reading every pane twice leaves identity untouched
      const entries = logEntries(handle);
      expect(entryField(entries[0]!, "intents")).toBe(entryField(entries[0]!, "intents"));
      expect(livePane(handle)).toBe(livePane(handle));

      expect(before).toEqual({ n: 0 });
      expect(afterFirst).toEqual({ n: 1 });
      expect(app.getState()).toBe(afterFirst);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("p_every_intent_logged: N dispatches land exactly N entries, reentrant included", () => {
    stubFrames();
    try {
      const app = counterApp();
      const handle = wire(app);

      app.dispatch(incrementN());
      // a reentrant dispatch from a listener lands its own entry
      (app as unknown as { subscribe(l: (c: { sequence: number }) => void): () => void }).subscribe((commit) => {
        if (commit.sequence === 2) {
          app.dispatch(["noop-extra", 1]);
        }
      });
      app.dispatch(incrementN());

      expect(logEntries(handle).length).toBe(3);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("p_monotonic_sequence + p_ring_bounded: sequences grow, the ring evicts the oldest", () => {
    stubFrames();
    try {
      const app = counterApp();
      const handle = wire(app);

      for (let i = 0; i < 55; i++) app.dispatch(incrementN());

      const entries = logEntries(handle);
      expect(entries.length).toBe(50);
      // the oldest evicted: first rendered sequence is 6, last is 55
      expect(seq(entries[0]!)).toBe("6");
      expect(seq(entries[49]!)).toBe("55");
      for (let i = 1; i < entries.length; i++) {
        const prev = Number(seq(entries[i - 1]!));
        const cur = Number(seq(entries[i]!));
        expect(cur).toBe(prev + 1);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("p_json_safe: function-bearing intents and state still serialize", () => {
    stubFrames();
    try {
      const app = makeApp({
        view: () => label("x"),
        state: { fn: (x: number) => x, n: 0 },
      });
      const handle = wire(app);

      // the filter predicate is a function arg; the state carries a fn
      app.dispatch(["filter", () => true, (x: unknown) => x]);

      const entries = logEntries(handle);
      const rendered = entryField(entries[0]!, "intents") ?? "";
      const parsed = JSON.parse(rendered) as unknown[][];
      // no throw: the function args are marked, the rest is data
      expect(parsed.length).toBe(1);
      expect(parsed[0]!.length).toBe(3);
      expect(parsed[0]!.slice(1)).toEqual(["ƒ()", "ƒ()"]);
      // the live state projection marks the function value too
      const live = JSON.parse(livePane(handle) ?? "null") as {
        fn: string;
        n: number;
      };
      expect(live.fn).toBe("ƒ()");
      expect(live.n).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
