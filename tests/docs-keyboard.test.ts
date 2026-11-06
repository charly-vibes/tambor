// @vitest-environment jsdom
// Purpose: docs keyboard contract (add-docs-site task 3.1) — the
//   navigation is operable by keyboard alone and a page change moves DOM
//   focus to the content pane heading.
// Responsibilities: mount the docs shell in jsdom and assert the nav
//   entries are real DOM controls that take keyboard focus (a native
//   <button> the browser can focus), and that activating a nav entry
//   with the keyboard alone swaps the page and leaves DOM focus on the
//   pane heading rather than on the nav control.
// Rationale: openspec/changes/add-docs-site/specs/docs-site/spec.md
//   "Site shell and navigation" — the navigation SHALL be operable by
//   keyboard alone and completing a page change SHALL move focus to the
//   content pane. The keyboard path is exercised through a keydown on
//   the focused control (the activation a keyboard user performs); the
//   pointer path stays covered by tests/docs-shell.test.ts. Fresh
//   checkouts have no generated content until build-spa runs, so the
//   test regenerates it into the gitignored generated dir before the
//   first dynamic import (docs-shell.test.ts shape).

import { describe, expect, it } from "vitest";
// @ts-expect-error node:child_process has no type declarations here
import { spawnSync } from "node:child_process";
// @ts-expect-error node:path has no type declarations here
import { resolve } from "node:path";
import type { HostDoc, HostElement } from "../src/interop/domhost.ts";

const TOOL = resolve("tools/gen_docs_content.py");
const CORPUS = resolve("openspec/specs");
const GENERATED = resolve("src/docs/content/generated");

// The page the keyboard journey navigates to (a reference page, not the
// initially selected one) and the statement its pane draws.
const TARGET = "View Model";
const STATEMENT = "computable origin, bounds and children";

// The timer global reached structurally (the ES2022 lib has no timer
// declarations; tsconfig types exclude node).
const timers = globalThis as unknown as {
  setTimeout: (f: () => void, ms: number) => unknown;
};

// The DOM bits the test reads off the structural host seam (the core
// keeps no lib.dom types).
interface RawElement {
  readonly tagName: string;
  readonly textContent: string;
  getAttribute(name: string): string | null;
  focus(): void;
}

function raw(element: HostElement): RawElement {
  return element as unknown as RawElement;
}

// Generate the build-time content into the gitignored generated dir
// (atomic publication — tools/gen_docs_content.py), then import the
// module under test. Static imports would hoist past the generation
// and fail on a fresh checkout where build-spa has not run yet.
spawnSync("python3", [TOOL, "--corpus", CORPUS, "--out", GENERATED], {
  encoding: "utf8",
});
const { mountDocs } = await import("../src/docs/main.ts");
import { lastObserver, MockResizeObserver } from "./helpers/mock-ro.ts";

// The sidebar fixtures deliver width through the RO double (jsdom
// ships none) — installed before any mount constructs one.
(globalThis as { ResizeObserver?: unknown }).ResizeObserver =
  MockResizeObserver;

// The keyboard contracts are SIDEBAR contracts (real nav buttons —
// task 3), so each mount delivers a desktop-width box: the responsive
// branch (task 6) collapses below 600 px, and the unmeasured fallback
// width is the corpus VIEWPORT constant.
function mountDocsAtSidebarWidth(
  doc: HostDoc,
  container: HostElement,
): ReturnType<typeof mountDocs> {
  const docs = mountDocs(doc, container);
  lastObserver().fire([{ contentRect: { width: 900, height: 600 } }]);
  return docs;
}

function hostDoc(): HostDoc {
  const doc = (globalThis as { document?: unknown }).document;
  if (doc === undefined) throw new Error("no document in this environment");
  return doc as HostDoc;
}

// The document's focused element (the structural HostDoc carries no
// activeElement).
function activeElement(doc: HostDoc): HostElement | null {
  return (doc as unknown as { activeElement?: HostElement | null })
    .activeElement ?? null;
}

// The nav controls in the drawn DOM: real DOM controls, in nav order.
function navControls(container: HostElement): HostElement[] {
  return Array.from(container.querySelectorAll("button"));
}

// The control whose label names the given page (the current page's
// entry carries the "▸ " marker, the others their bare title).
function controlFor(container: HostElement, title: string): HostElement {
  const found = navControls(container).find((c) =>
    raw(c).textContent.endsWith(title),
  );
  if (found === undefined) {
    throw new Error(`no nav control for ${title}`);
  }
  return found;
}

// The page change completes when the page body module has loaded (a
// dynamic import), so the focus move lands a tick later — wait for it
// rather than racing it.
async function waitForHeadingFocus(
  doc: HostDoc,
  control: HostElement,
  title: string,
): Promise<HostElement | null> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const active = activeElement(doc);
    if (
      active !== null &&
      active !== control &&
      raw(active).textContent === title
    ) {
      return active;
    }
    await new Promise<void>((resolve) => {
      timers.setTimeout(() => resolve(), 5);
    });
  }
  return null;
}

describe("docs keyboard — nav operable by keyboard alone", () => {
  it("the nav entries are real DOM controls that take keyboard focus", () => {
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    const docs = mountDocsAtSidebarWidth(doc, container);

    const controls = navControls(container);
    expect(controls.length).toBeGreaterThan(0);

    const control = controlFor(container, TARGET);
    // a native control: the browser focuses it, no tabindex needed
    expect(raw(control).tagName).toBe("BUTTON");
    raw(control).focus();
    expect(activeElement(doc)).toBe(control);

    docs.unmount();
  });

  it("a keyboard activation swaps the page and moves focus to the pane heading", async () => {
    const doc = hostDoc();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    const docs = mountDocsAtSidebarWidth(doc, container);

    const control = controlFor(container, TARGET);
    raw(control).focus();
    // the keyboard activation: a keydown on the focused control
    const KeyboardEventCtor = (
      globalThis as unknown as {
        KeyboardEvent: new (
          type: string,
          init: { key: string; bubbles: boolean },
        ) => unknown;
      }
    ).KeyboardEvent;
    control.dispatchEvent(
      new KeyboardEventCtor("keydown", { key: "Enter", bubbles: true }),
    );

    // the pane renders the selected page
    expect(container.textContent).toContain(STATEMENT);

    // and DOM focus moved off the nav control onto the pane heading
    const active = await waitForHeadingFocus(doc, control, TARGET);
    expect(active).not.toBeNull();
    expect(active).not.toBe(control);
    expect(raw(active!).textContent).toBe(TARGET);
    // the heading is focusable without joining the tab order, and it
    // stands for the heading role it is drawn as
    expect(raw(active!).getAttribute("tabindex")).toBe("-1");
    expect(raw(active!).getAttribute("role")).toBe("heading");

    docs.unmount();
  });
});
