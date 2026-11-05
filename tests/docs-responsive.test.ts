// @vitest-environment jsdom
// Purpose: docs responsive breakpoints (add-docs-site task 6.1) — the
//   shell collapses below the 600 px breakpoint into a top-bar dropdown
//   (components-select), re-derives per container width, and renders
//   without horizontal overflow at a 320 px viewport.
// Responsibilities: mount the docs shell with a mocked ResizeObserver
//   (docs-host-sizing pattern) and pin three contracts: the sidebar
//   variant carries a real button per registry page while the collapsed
//   variant carries none (the dropdown header/list are on-wrapped
//   labels, never native buttons); the derived tree at 320 px is no
//   wider than its container (bounds over the pure docsView); and a
//   state-identity-preserving dispatch after a resize still draws the
//   NEW width's variant (the wire viewCache must key on the container
//   size, or the first dispatch after a resize repaints the stale tree).
// Rationale: openspec/changes/add-docs-site/specs/docs-site/spec.md
//   "Responsive re-derivation" and design.md D3 are the design
//   authorities: breakpoints are pure functions of the container width
//   the view already receives. The dropdown idiom is the gallery's
//   (src/spa/gallery.ts createSelectDemo): options are [name, title]
//   pairs, selection writes the page path through the dispatcher
//   builtins, the scratch tree lives at ::extra. Demo embeds stacking
//   above prose (the third D3 assertion) lands with task 7's embed
//   tests — no embed slots exist before then.

import { beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error node:child_process has no type declarations here
import { spawnSync } from "node:child_process";
// @ts-expect-error node:path has no type declarations here
import { resolve } from "node:path";
import type { DocsHandle } from "../src/docs/main.ts";
import type { HostDoc, HostElement } from "../src/interop/domhost.ts";
import { CONTAINER_SIZE_KEY } from "../src/effects/dispatch.ts";
import { bounds } from "../src/views/model.ts";
import {
  lastObserver,
  MockResizeObserver,
  observers,
} from "./helpers/mock-ro.ts";

const TOOL = resolve("tools/gen_docs_content.py");
const CORPUS = resolve("openspec/specs");
const GENERATED = resolve("src/docs/content/generated");

// Install the shared RO double before the dynamic import: mounting
// constructs the observer through the global, and jsdom defines none.
(globalThis as { ResizeObserver?: unknown }).ResizeObserver =
  MockResizeObserver;

spawnSync("python3", [TOOL, "--corpus", CORPUS, "--out", GENERATED], {
  encoding: "utf8",
});
const { mountDocs, docsView } = await import("../src/docs/main.ts");

function mount(): {
  docs: DocsHandle;
  observer: ReturnType<typeof lastObserver>;
  container: HostElement;
} {
  const doc = (globalThis as { document?: unknown }).document;
  if (doc === undefined) throw new Error("no document in this environment");
  const host = doc as HostDoc;
  const container = host.createElement("div");
  host.body.appendChild(container);
  const docs = mountDocs(host, container);
  const observer = lastObserver();
  return { docs, observer, container };
}

// Native <button> count in the drawn surface: the sidebar renders one
// button per registry page (the corpus button node paints a native
// button, task 3.1); the collapsed dropdown renders none — its header
// and rows are on-wrapped labels (components.select list rows are
// mouse-down wrappers, list.ts).
function buttonCount(container: HostElement): number {
  const html = (container as unknown as { innerHTML: string }).innerHTML;
  return (html.match(/<button/g) ?? []).length;
}

beforeEach(() => {
  observers.length = 0;
});

describe("docs responsive breakpoints (task 6.1)", () => {
  it("sidebar carries a button per page; the collapsed variant carries none", () => {
    const { docs, observer } = mount();
    observer.fire([{ contentRect: { width: 900, height: 600 } }]);
    const pages = docs.app.getState() as { page: string };
    expect(typeof pages.page).toBe("string");
    expect(buttonCount(mountSurface(docs))).toBeGreaterThanOrEqual(32);
    docs.unmount();
  });

  it("the derived tree at 320 px is no wider than its container", () => {
    const { docs, observer } = mount();
    observer.fire([{ contentRect: { width: 320, height: 600 } }]);
    const view = docsView(docs.app.getState(), {
      [CONTAINER_SIZE_KEY]: [320, 600],
    });
    expect(bounds(view)[0]).toBeLessThanOrEqual(320);
    docs.unmount();
  });

  it("a post-resize dispatch draws the new width's variant, not the cached tree", () => {
    const { docs, observer } = mount();
    observer.fire([{ contentRect: { width: 900, height: 600 } }]);
    const wide = buttonCount(mountSurface(docs));
    observer.fire([{ contentRect: { width: 320, height: 600 } }]);
    expect(buttonCount(mountSurface(docs))).toBe(0);
    // A dispatch that preserves state identity (the focus effect for
    // the current page) must still repaint the COLLAPSED view — the
    // wire viewCache keys on state identity, so a size-blind cache
    // would repaint the stale wide tree here.
    const state = docs.app.getState() as { page: string };
    docs.app.dispatch([["docs-focus", state.page]]);
    expect(buttonCount(mountSurface(docs))).toBe(0);
    expect(wide).toBeGreaterThanOrEqual(32);
    docs.unmount();
  });
});

// The surface element the SPA mount drew into: DocsHandle carries the
// spa mount's surface (host element) — the tree lands under it.
function mountSurface(docs: DocsHandle): HostElement {
  const surface = docs.surface as unknown as { host: HostElement };
  return surface.host;
}
