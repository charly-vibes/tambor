// Purpose: the docs ENTRY self-boot contract (live Pages incident
//   2026-11-10): demo-dist/docs/index.html loads main.js as
//   <script type="module"> and nothing calls mountDocs — importing the
//   entry must mount the shell into #app by itself (the gallery
//   spa/main.ts precedent), and a non-browser import (no document)
//   must stay side-effect-free.
// Responsibilities: one jsdom test that pre-installs the container and
//   the mock resize observer, then imports the entry fresh and asserts
//   the shell drew (nav buttons present); the module graph is per-file
//   in vitest, so the import executes the boot block exactly once.
// Rationale: every existing suite mounts through explicit mountDocs
//   calls, which hid the missing bootstrap — the deployed page rendered
//   its static chrome and an empty #app with zero console errors. This
//   file pins the browser loading contract itself.

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { regenerateDocsContent } from "./helpers/docs-content.ts";
import type { HostDoc, HostElement } from "../src/interop/domhost.ts";
import { waitFor } from "./helpers/wait.ts";
import { lastObserver, MockResizeObserver } from "./helpers/mock-ro.ts";

(globalThis as { ResizeObserver?: unknown }).ResizeObserver =
  MockResizeObserver;
regenerateDocsContent();

describe("docs boot — p_docs_entry_self_mounts", () => {
  it("p_docs_entry_self_mounts_the_container", async () => {
    const doc = (globalThis as { document?: unknown }).document as HostDoc;
    const container = doc.createElement("div");
    container.setAttribute("id", "app");
    doc.body.appendChild(container);
    // The entry runs its boot block at module evaluation — no explicit
    // mountDocs call anywhere in this test.
    const mod = await import("../src/docs/main.ts");
    expect(
      typeof mod.mountDocs,
      "entry still exports the explicit mount seam",
    ).toBe("function");
    lastObserver().fire([{ contentRect: { width: 900, height: 700 } }]);
    const booted = await waitFor(() => childCount(container) > 0);
    expect(booted, "self-boot drew into #app").toBeTruthy();
    const html = (container as unknown as { innerHTML: string }).innerHTML;
    expect(html).toContain("<button");
  });
});

function childCount(el: HostElement): number {
  return [...el.childNodes].length;
}
