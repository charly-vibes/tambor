// @vitest-environment jsdom
// Purpose: docs live container sizing (add-docs-site task 4.1) — the
//   ResizeObserver callback routes the observed container box through
//   DomBackend.resize and the shell re-derives, so the drawn tree at a
//   narrow width differs from the tree at a wide one.
// Responsibilities: mock ResizeObserver in jsdom (jsdom ships no
//   implementation), mount the docs shell, and pin the sizing chain:
//   the observer watches the mount container and is dropped on
//   unmount; firing the callback updates the backend container size
//   and re-draws; the re-derived tree differs at 320 vs 900 px
//   container width.
// Rationale: openspec/changes/add-docs-site/design.md D3 — the corpus
//   way is backend.render.resize_redraws (DomBackend.resize relayouts
//   and redraws); the docs entry adds the live size source the SPA
//   mount otherwise pins as a constant. The observer is a host seam
//   (src/docs/host.ts, task 4.2) reached through mountDocs: the corpus
//   tree cannot observe the DOM container. Fresh checkouts have no
//   generated content until the generator runs, so the test
//   regenerates it before the first dynamic import (docs-shell and
//   docs-keyboard shape). The mock is installed before the import: the
//   host constructs its observer at mount time through the global.

import { beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error node:child_process has no type declarations here
import { spawnSync } from "node:child_process";
// @ts-expect-error node:path has no type declarations here
import { resolve } from "node:path";
import type { DocsHandle } from "../src/docs/main.ts";
import type { HostDoc, HostElement } from "../src/interop/domhost.ts";

const TOOL = resolve("tools/gen_docs_content.py");
const CORPUS = resolve("openspec/specs");
const GENERATED = resolve("src/docs/content/generated");

// The structural ResizeObserver surface the host reaches through the
// global (the core keeps no lib.dom types; jsdom ships no RO).
interface MockEntry {
  readonly contentRect: { readonly width: number; readonly height: number };
}

// Every constructed observer is recorded so a test can fire its
// callback the way a real browser would on a container box change.
interface MockObserver {
  readonly observed: HostElement[];
  disconnected: boolean;
  fire(entries: readonly MockEntry[]): void;
}

const observers: MockObserver[] = [];

class MockResizeObserver {
  readonly observed: HostElement[] = [];
  disconnected = false;
  private readonly callback: (entries: readonly MockEntry[]) => void;

  constructor(callback: (entries: readonly MockEntry[]) => void) {
    this.callback = callback;
    observers.push(this);
  }

  observe(target: HostElement): void {
    this.observed.push(target);
  }

  // Deliver a box change the way a browser does: invoke the mount's
  // callback with entries carrying the observed content rect.
  fire(entries: readonly MockEntry[]): void {
    this.callback(entries);
  }

  // The host never re-targets a mounted observer.
  unobserve(_target: HostElement): void {}

  disconnect(): void {
    this.disconnected = true;
  }
}

// Install the mock before the dynamic import: mounting constructs the
// observer through the global, and jsdom defines none.
(globalThis as { ResizeObserver?: unknown }).ResizeObserver =
  MockResizeObserver;

spawnSync("python3", [TOOL, "--corpus", CORPUS, "--out", GENERATED], {
  encoding: "utf8",
});
const { mountDocs } = await import("../src/docs/main.ts");

// Mount the docs shell into a fresh container and return the observer
// the host constructed — a mount without one fails loud here, since
// every assertion below rides on it.
function mount(): {
  docs: DocsHandle;
  observer: MockObserver;
  container: HostElement;
} {
  const doc = (globalThis as { document?: unknown }).document;
  if (doc === undefined) throw new Error("no document in this environment");
  const host = doc as HostDoc;
  const container = host.createElement("div");
  host.body.appendChild(container);
  const docs = mountDocs(host, container);
  const observer = observers[observers.length - 1] as MockObserver | undefined;
  if (observer === undefined) {
    throw new Error("docs: no ResizeObserver was constructed at mount");
  }
  return { docs, observer, container };
}

beforeEach(() => {
  observers.length = 0;
});

describe("docs host sizing — the live size source (task 4.1)", () => {
  it("the docs host observes the mount container and drops it on unmount", () => {
    const { docs, observer, container } = mount();
    expect(observer.observed).toEqual([container]);
    docs.unmount();
    expect(observer.disconnected).toBe(true);
  });

  it("the observer callback routes the observed size through DomBackend.resize", () => {
    const { docs, observer } = mount();
    const draws = docs.backend.drawCount;
    // one observed box change, delivered the way the browser does
    observer.fire([{ contentRect: { width: 320, height: 600 } }]);
    expect(docs.backend.containerSize).toEqual([320, 600]);
    expect(docs.backend.drawCount).toBeGreaterThan(draws);
    docs.unmount();
  });

  it("the re-derived view differs at 320 vs 900 px container width", () => {
    const { docs, observer, container } = mount();
    // the structural HostElement carries no innerHTML; the tree each
    // re-derivation draws is compared through the markup jsdom
    // serializes — one observation per probed width, narrowest first
    const trees: string[] = [];
    for (const width of [320, 900]) {
      observer.fire([{ contentRect: { width, height: 600 } }]);
      trees.push((container as unknown as { innerHTML: string }).innerHTML);
    }
    expect(trees[0]).not.toEqual(trees[1]);
    docs.unmount();
  });
});
