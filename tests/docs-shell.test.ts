// @vitest-environment jsdom
// Purpose: docs shell contract tests (add-docs-site task 2.1) — the
//   mounted docs SPA renders journey-grouped navigation (getting
//   started → guides → reference → examples, D7 quadrant order) and a
//   content pane, selecting a nav section renders that page and marks
//   it current, and the content check fails naming any page module
//   that declares no journey group.
// Responsibilities: mount through the same DomBackend wire the gallery
//   tests use (real document, surface pointer events routed through
//   the corpus dispatcher), click nav entries at their drawn centres,
//   and assert pane content plus the current marker through the drawn
//   DOM text; exercise the content check pure on a synthetic registry
//   (fail naming the module) and on the real generated registry (every
//   page grouped). Fresh checkouts have no generated content until
//   build-spa runs, so the test regenerates it into the gitignored
//   generated dir before the first dynamic import.
// Rationale: openspec/changes/add-docs-site/specs/docs-site/spec.md
//   "Site shell and navigation" is the design authority; the shell is
//   mounting plumbing over makeApp/dispatch — no app semantics of its
//   own (tambor-cie gallery precedent).

import { describe, expect, it } from "vitest";
// @ts-expect-error node:child_process has no type declarations here
import { spawnSync } from "node:child_process";
// @ts-expect-error node:path has no type declarations here
import { resolve } from "node:path";
import type { Elem, ButtonNode } from "../src/views/model.ts";
import type { HostDoc, HostElement } from "../src/interop/domhost.ts";
import { scanOf, type Found } from "./helpers/scan.ts";
import { centreOf } from "./helpers/appview.ts";
import { waitFor } from "./helpers/wait.ts";
import { lastObserver, MockResizeObserver } from "./helpers/mock-ro.ts";

const TOOL = resolve("tools/gen_docs_content.py");
const CORPUS = resolve("openspec/specs");
const GENERATED = resolve("src/docs/content/generated");

// Journey groups in D7 reader order — the nav renders the headers in
// exactly this sequence regardless of the registry's flat order.
const JOURNEY = ["Getting started", "Guides", "Reference", "Examples"];

// The current-entry marker the shell draws on the nav label.
const CURRENT = "▸ ";

// Generate the build-time content into the gitignored generated dir
// (idempotent — the generator wipes its own outdir), then import the
// modules under test. Static imports would hoist past the generation
// and fail on a fresh checkout where build-spa has not run yet.
spawnSync("python3", [TOOL, "--corpus", CORPUS, "--out", GENERATED], {
  encoding: "utf8",
});
const { mountDocs } = await import("../src/docs/main.ts");
const { checkGroups } = await import("../src/docs/content/check.ts");
const { generatedPages } = await import(
  "../src/docs/content/generated/registry.ts"
);

// The sidebar fixtures deliver width through the RO double (jsdom
// ships none) — installed before any mount constructs one.
(globalThis as { ResizeObserver?: unknown }).ResizeObserver =
  MockResizeObserver;

// The shell tests pin the SIDEBAR contracts (journey groups, real nav
// buttons — task 2/3), so each mount delivers a desktop-width box: the
// responsive branch (task 6) collapses below 600 px, and the unmeasured
// fallback width is the corpus VIEWPORT constant.
function mountDocsAtSidebarWidth(
  doc: HostDoc,
  container: HostElement,
): ReturnType<typeof mountDocs> {
  const docs = mountDocs(doc, container);
  lastObserver().fire([{ contentRect: { width: 900, height: 600 } }]);
  return docs;
}

function hostDoc(): HostDoc {
  return (globalThis as { document?: unknown }).document as HostDoc;
}

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

function clickAt(surface: { host: HostElement }, x: number, y: number): void {
  const ME = mouseEventCtor();
  surface.host.dispatchEvent(new ME("pointerdown", { clientX: x, clientY: y }));
  surface.host.dispatchEvent(new ME("pointerup", { clientX: x, clientY: y }));
}

// The nav entry (a real DOM control) whose label names the page
// title, with or without the current marker prefix.
function navEntryOf(view: Elem, title: string): Found {
  const found = scanOf(view).find((f) => {
    if (f.node.type !== "button") return false;
    const text = (f.node as ButtonNode).text;
    return text === title || text === CURRENT + title;
  });
  if (found === undefined) {
    throw new Error(`nav entry not drawn for ${title}`);
  }
  return found;
}

describe("docs shell — journey nav and content pane", () => {
  it("renders the four journey groups in order with every reference page", () => {
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    const docs = mountDocsAtSidebarWidth(doc, container);
    const text = container.textContent;
    let at = -1;
    for (const group of JOURNEY) {
      const next = text.indexOf(group);
      expect(next, `journey group ${group} in order`).toBeGreaterThan(at);
      at = next;
    }
    for (const page of generatedPages) {
      expect(text, `nav lists ${page.title}`).toContain(page.title);
    }
    expect(text.length).toBeGreaterThan(0); // the content pane shows a page
    docs.unmount();
  });

  it("selecting a nav section renders its page and marks it current", async () => {
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    const docs = mountDocsAtSidebarWidth(doc, container);
    const target = "View Model";
    const [x, y] = centreOf(navEntryOf(docs.app.view(), target));
    clickAt(docs.surface, x, y);
    const text = container.textContent;
    expect(text).toContain(target); // the pane renders the selected page
    expect(text).toContain("computable origin, bounds and children"); // statement
    expect(text).toContain(CURRENT + target); // the nav marks it current
    // the page body arrives through a dynamic import: the pane must
    // re-draw with the verbatim corpus content once it lands
    const body = await waitFor(() =>
      container.textContent.includes("immutable_nodes"),
    );
    expect(body).toBe(true);
    expect(container.textContent).toContain("immutable_nodes");
    docs.unmount();
  });

  it("content check fails naming a page that declares no group", () => {
    expect(() => checkGroups([{ name: "ungrouped-page" }])).toThrow(/ungrouped-page/);
    expect(() => checkGroups(generatedPages)).not.toThrow();
  });
});
