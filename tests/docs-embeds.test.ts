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
// @ts-expect-error node:child_process has no type declarations here
import { spawnSync } from "node:child_process";
// @ts-expect-error node:path has no type declarations here
import { resolve } from "node:path";
import { CONTAINER_SIZE_KEY } from "../src/effects/dispatch.ts";
import type { DocsHandle } from "../src/docs/main.ts";
import type { HostDoc } from "../src/interop/domhost.ts";
import { scanOf } from "./helpers/scan.ts";
import { waitFor } from "./helpers/wait.ts";
import { lastObserver, MockResizeObserver } from "./helpers/mock-ro.ts";

const TOOL = resolve("tools/gen_docs_content.py");
const CORPUS = resolve("openspec/specs");
const GENERATED = resolve("src/docs/content/generated");

// Generate the build-time content (atomic publication — the generator
// owns its out dir), then import the modules under test. Static
// imports would hoist past the generation and fail on a fresh
// checkout where build-spa has not run yet (docs-shell precedent).
// Install the shared RO double before the dynamic import: mounting
// constructs the observer through the global, and jsdom defines none
// (docs-shell/docs-responsive precedent).
(globalThis as { ResizeObserver?: unknown }).ResizeObserver =
  MockResizeObserver;

const gen = spawnSync("python3", [TOOL, "--corpus", CORPUS, "--out", GENERATED], {
  encoding: "utf8",
});
if (gen.status !== 0) throw new Error(`content generator failed: ${gen.stderr}`);

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
    docs.unmount();
  });
});
