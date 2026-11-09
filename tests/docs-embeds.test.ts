// Purpose: demo-embed contract tests (add-docs-site tasks 7.1/7.2) —
//   a docs page declaring a demo resolves it through the gallery demo
//   registry (src/spa/gallery.ts DEMOS) read-only behind the
//   dynamic-import boundary, and the drawn demo appears in the page
//   stacked above its prose (design D3's third assertion, deferred
//   from task 6). The chunk-graph half of the spec scenario lives in
//   tests/docs-embeds-chunk.test.ts (node environment — esbuild's
//   realm invariant breaks under jsdom).
// Responsibilities: generate the corpus content into the gitignored
//   generated dir (fresh checkouts have none until build-spa runs),
//   then exercise the resolution seam (registry hit yields an app via
//   load(), no declaration resolves to null, an unknown id fails loud
//   naming it), assert the embed band stacks above the page prose in
//   the derived tree at 320 px, and mount the docs app to assert the
//   counter demo's drawn row lands in the container.
// Rationale: openspec/changes/add-docs-site/specs/docs-site/spec.md
//   "Demo embeds" is the design authority — the demo's example module
//   resolves through a dynamic import and the drawn demo appears in
//   the page; the gallery's add-spa-delivery precedent (registry
//   metadata synchronous, example modules behind dynamic import) is
//   the mechanism, so the docs site consumes the registry read-only
//   instead of forking it.

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { CONTAINER_SIZE_KEY } from "../src/effects/dispatch.ts";
import { regenerateDocsContent } from "./helpers/docs-content.ts";
import type { DocsHandle } from "../src/docs/main.ts";
import type { HostDoc, HostElement } from "../src/interop/domhost.ts";
import { scanOf } from "./helpers/scan.ts";
import { waitFor } from "./helpers/wait.ts";
import { lastObserver, MockResizeObserver } from "./helpers/mock-ro.ts";

// DOCUMENT_POSITION_FOLLOWING (4): `other` comes after `node` in
// document order — the drawn slot rect's row follows the marker's, so
// the mount surface host div (which carries the same inline 300px
// height but precedes the marker) is never matched.
function docFollows(node: HostElement, other: HostElement): boolean {
  const cmp = (
    node as unknown as { compareDocumentPosition?(o: HostElement): number }
  ).compareDocumentPosition;
  return cmp !== undefined && (cmp.call(node, other) & 4) !== 0;
}

// The container-space offset of a drawn node: every positioned
// ancestor's left/top sums to the node's layout position (the drawn
// tree composites translate offsets over 0-origin atOrigin wrappers).
function boxOffset(
  el: HostElement,
  container: HostElement,
): { top: string; left: string } {
  let top = 0;
  let left = 0;
  let parent = (
    el as unknown as { parentElement?: HostElement | null }
  ).parentElement;
  while (parent !== undefined && parent !== null && parent !== container) {
    left += px(parent.style.getPropertyValue("left"));
    top += px(parent.style.getPropertyValue("top"));
    parent = (
      parent as unknown as { parentElement?: HostElement | null }
    ).parentElement;
  }
  return { top: `${top}px`, left: `${left}px` };
}

function px(v: string): number {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

// Generate the build-time content (atomic publication — the generator
// owns its out dir), then import the modules under test. Static
// imports would hoist past the generation and fail on a fresh
// checkout where build-spa has not run yet (docs-shell precedent).
// Install the shared RO double before the dynamic import: mounting
// constructs the observer through the global, and jsdom defines none
// (docs-shell/docs-responsive precedent).
(globalThis as { ResizeObserver?: unknown }).ResizeObserver =
  MockResizeObserver;

regenerateDocsContent();

describe("docs embeds — p_docs_embeds_resolve_through_gallery_registry", () => {
  it("p_docs_embeds_resolve: a page declaring a demo resolves to the registry entry and load() yields an app", async () => {
    const { resolveDemo } = await import("../src/docs/embeds.ts");
    const page = {
      title: "Counter",
      statement: "The - / label / + row counts.",
      description: "Two buttons and a label over plain state.",
      demo: "counter",
    };
    const def = resolveDemo(page);
    expect(def?.id).toBe("counter");
    const app = await def!.load();
    expect(typeof app.dispatch).toBe("function");
    expect(typeof app.getState).toBe("function");
  });

  it("p_docs_embeds_resolve: a page declaring no demo resolves to null", async () => {
    const { resolveDemo } = await import("../src/docs/embeds.ts");
    expect(
      resolveDemo({
        title: "Plain",
        statement: "No demo on this page.",
        description: "Prose only.",
      }),
    ).toBeNull();
  });

  it("p_docs_embeds_resolve: an unknown demo id fails loud naming the id", async () => {
    const { resolveDemo } = await import("../src/docs/embeds.ts");
    expect(() =>
      resolveDemo({
        title: "Broken",
        statement: "Declares a demo the registry does not carry.",
        description: "A typo'd id must not silently drop the embed.",
        demo: "nope-not-a-demo",
      }),
    ).toThrow(/nope-not-a-demo/);
  });
});

describe("docs embeds — p_docs_embeds_stack_above_prose (D3 third assertion, owed from task 6)", () => {
  it("p_docs_embeds_stack: at 320 px the declared demo's band renders above the page's prose", async () => {
    const { docsView } = await import("../src/docs/main.ts");
    const { embedMarker } = await import("../src/docs/embeds.ts");
    const view = docsView(
      {
        page: "example-counter",
        body: null,
        focus: null,
        "open?": false,
        "::extra": {},
      },
      { [CONTAINER_SIZE_KEY]: [320, 600] },
    );
    const found = scanOf(view);
    const marker = found.find(
      (f) => f.node.type === "label" &&
        (f.node as { text?: string }).text === embedMarker("counter"),
    );
    // The prose anchor is the page statement's first wrapped line —
    // the bare title also appears in the collapsed dropdown's header
    // (drawn above the band), so it cannot anchor "above prose".
    const prose = found.find(
      (f) => f.node.type === "label" &&
        (f.node as { text?: string }).text?.startsWith(
          "WHEN the user presses more",
        ) === true,
    );
    expect(marker, "embed marker label drawn").toBeTruthy();
    expect(prose, "page statement line drawn").toBeTruthy();
    expect(marker!.y, "embed band stacks above the page prose").toBeLessThan(
      prose!.y,
    );
  });

  it("p_docs_embeds_stack: the mounted page's demo draws inside the container (spec: the drawn demo appears in the page)", async () => {
    const { mountDocs } = await import("../src/docs/main.ts");
    const { embedMarker, EMBED_SLOT_HEIGHT } = await import(
      "../src/docs/embeds.ts"
    );
    const doc = (globalThis as { document?: unknown }).document;
    if (doc === undefined) throw new Error("no document in this environment");
    const host = doc as HostDoc;
    const container = host.createElement("div");
    host.body.appendChild(container);
    const docs: DocsHandle = mountDocs(host, container);
    lastObserver().fire([{ contentRect: { width: 320, height: 600 } }]);
    docs.app.dispatch([["select-page", "example-counter"]]);
    const appeared = await waitFor(() => {
      const html = (container as unknown as { innerHTML: string }).innerHTML;
      // the band marker plus the counter demo's drawn row: at 320 px
      // the collapsed nav renders no native buttons of its own, so
      // the demo's - / + buttons are the only ones in the container
      return (
        html.includes("demo: counter") &&
        (html.match(/<button/g) ?? []).length >= 2
      );
    });
    expect(appeared).toBe(true);

    // A-CORR-001 (HIGH): the embed host must sit over the DRAWN slot
    // box — not over the CSS mount surface. The surface host div carries
    // the same inline height (VIEWPORT[1] === EMBED_SLOT_HEIGHT) and
    // precedes the band marker, so a height-only scan returns the
    // surface's box (empty top/left and the 300px surface width). Locate
    // the slot rect as the first height-300 div FOLLOWING the marker in
    // document order, read its box, and assert the host matches it.
    const marker = [...container.querySelectorAll("span")].find(
      (s) => s.textContent === embedMarker("counter"),
    );
    expect(marker, "band marker span drawn").toBeTruthy();
    const slot = [...container.querySelectorAll("div")].find(
      (d) =>
        d.style.getPropertyValue("height") === `${EMBED_SLOT_HEIGHT}px` &&
        docFollows(marker!, d),
    );
    expect(slot, "drawn slot rect after the marker").toBeTruthy();
    const box = boxOffset(slot!, container);
    const el = [...container.childNodes].find(
      (c) => c.style.getPropertyValue("position") === "absolute",
    );
    expect(el, "embed host element").toBeTruthy();
    expect(
      el!.style.getPropertyValue("top"),
      "host top equals the drawn slot's container offset (not 0px — the surface/0-origin wrapper match)",
    ).toBe(box.top);
    expect(el!.style.getPropertyValue("left")).toBe(box.left);
    expect(
      el!.style.getPropertyValue("width"),
      "host width equals the drawn slot's width (not the surface's 300px)",
    ).toBe(slot!.style.getPropertyValue("width"));
    docs.unmount();
  });
});
