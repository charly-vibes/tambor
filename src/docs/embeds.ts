// Purpose: the docs demo-embed seam (add-docs-site task 7.2) — the
//   resolution seam that maps a page's declared demo onto the gallery
//   registry, plus the host mount that puts the resolved demo inside
//   a docs page.
// Responsibilities: resolveDemo(page) — read-only over the gallery
//   DEMOS registry: no declaration resolves to null, an unknown id
//   fails loud naming it; wireDocsEmbed(doc, container, docs) — the
//   host seam that keeps one demo mounted over the drawn slot: it
//   reuses the gallery mount pattern wholesale (mountDemo), positions
//   the embed host over the slot the view reserved, re-syncs after
//   every backend draw (page swap, body arrival, resize re-derivation)
//   and disposes the demo + host element on unmount.
// Rationale: openspec/changes/add-docs-site/specs/docs-site/spec.md
//   "Demo embeds" — the example module resolves through a dynamic
//   import and the drawn demo appears in the page without any example
//   module in the initial chunk. The registry stays synchronous and
//   read-only (the gallery's add-spa-delivery boundary); the corpus
//   tree cannot express mounts or DOM queries, so the mount is a host
//   seam like the focus and sizing seams before it (dom.ts, host.ts).

import { DEMOS, type DemoDef } from "../spa/gallery.ts";
import { mountDemo, type SpaHandle } from "../spa/mount.ts";
import { VIEWPORT } from "../spa/viewport.ts";
import type { HostDoc, HostElement } from "../interop/domhost.ts";
import type { Elem } from "../views/model.ts";
import type { PageData } from "./page.ts";
import { PAGE_DEMOS } from "./content/demos.ts";

// The slot reserves the gallery viewport height — the size every
// gallery demo derives against (VIEWPORT), so the mounted demo draws
// exactly as it does in the gallery.
export const EMBED_SLOT_HEIGHT: number = VIEWPORT[1];

// The band marker the view draws above the slot — the label text is
// the band's identity in the drawn DOM (tests and the host seam both
// read it).
export function embedMarker(id: string): string {
  return `demo: ${id}`;
}

// The registry lookup, read-only: the docs site never mutates DEMOS.
function demoDef(id: string): DemoDef {
  const def = DEMOS.find((d) => d.id === id);
  if (def === undefined) {
    throw new Error(`docs: unknown demo '${id}'`);
  }
  return def;
}

// A page declaring a demo resolves to its registry entry; a page
// declaring none resolves to null.
export function resolveDemo(page: PageData): DemoDef | null {
  return page.demo === undefined ? null : demoDef(page.demo);
}

// The one mounted demo per docs mount (closure-owned cell — the
// wireExtentSizing precedent; no module-level lets).
interface EmbedCell {
  id: string | null;
  loading: string | null;
  handle: SpaHandle | null;
}

// The drawn slot's box. The mount surface host ALWAYS carries the
// 300px inline height too (attachInputSurface sizes it to VIEWPORT,
// and extent sizing only re-sizes it once the drawn extent exceeds
// that), so a height-only scan matches the wrong element (A-CORR-001):
// the slot is disambiguated through the band MARKER span — the slot
// rect is the first height-300 div that FOLLOWS the marker in document
// order (the marker and the slot are siblings in the drawn column, and
// the surface host precedes the marker, so it never matches).
function slotBox(
  container: HostElement,
  marker: string,
): {
  top: string;
  left: string;
  width: string;
} | null {
  let markerEl: HostElement | null = null;
  for (const span of container.querySelectorAll("span")) {
    if (span.textContent === marker) {
      markerEl = span;
      break;
    }
  }
  if (markerEl === null) return null;
  for (const div of container.querySelectorAll("div")) {
    if (div.style.getPropertyValue("height") !== `${EMBED_SLOT_HEIGHT}px`) {
      continue;
    }
    if (!follows(markerEl, div)) continue;
    const offsets = rowOffsets(div, container);
    return {
      top: offsets.top,
      left: offsets.left,
      width: div.style.getPropertyValue("width"),
    };
  }
  return null;
}

// DOCUMENT_POSITION_FOLLOWING (4): `other` comes after `node` in
// document order — the drawn slot rect's row follows the marker's.
function follows(node: HostElement, other: HostElement): boolean {
  const cmp = (
    node as unknown as { compareDocumentPosition?(o: HostElement): number }
  ).compareDocumentPosition;
  return cmp !== undefined && (cmp.call(node, other) & 4) !== 0;
}

// The slot rect's bearing offsets in the drawn column: the rect rides
// inside 0-origin wrappers (atOrigin/with-color) under the translate
// that carries the row's offset, so climb to the first ancestor with a
// non-zero left/top; every 0-origin wrapper and the unpositioned root
// contribute nothing (all zero → the slot sits at the column origin,
// e.g. the showcase pin at offset 0 — the correct placement).
function rowOffsets(
  el: HostElement,
  container: HostElement,
): { top: string; left: string } {
  let parent = (
    el as unknown as { parentElement?: HostElement | null }
  ).parentElement;
  while (parent !== undefined && parent !== null && parent !== container) {
    const left = parent.style.getPropertyValue("left");
    const top = parent.style.getPropertyValue("top");
    if (left !== "" || top !== "") {
      if (left !== "0px" || top !== "0px") return { top, left };
    }
    parent = (
      parent as unknown as { parentElement?: HostElement | null }
    ).parentElement;
  }
  return { top: "0px", left: "0px" };
}

// The current page's declared demo, if any.
function currentDemo(docs: SpaHandle): string | undefined {
  const state = docs.app.getState() as { page?: unknown };
  return typeof state.page === "string" ? PAGE_DEMOS[state.page] : undefined;
}

// The embed host element: a CONTAINER sibling, hidden until a slot is
// drawn — backend.draw rebuilds the drawn root's children per redraw,
// so anything mounted inside the root would not survive the next draw.
function makeEmbedHost(doc: HostDoc, container: HostElement): HostElement {
  const host = doc.createElement("div");
  host.style.setProperty("position", "absolute");
  host.style.setProperty("display", "none");
  container.appendChild(host);
  return host;
}

// The mounted demo goes away; the next sync mounts the replacement.
function dropDemo(cell: EmbedCell): void {
  cell.handle?.unmount();
  cell.handle = null;
  cell.id = null;
}

// Kick the registry load once per demo id: load() resolves the
// example module behind the dynamic import (the gallery's boundary);
// a rejection stays unhandled — loud, the fail-loud house rule. A
// page swap or unmount while the import is in flight wins — nothing
// mounts for a page no longer drawn.
function startLoad(
  cell: EmbedCell,
  demo: string,
  doc: HostDoc,
  host: HostElement,
): void {
  cell.loading = demo;
  void demoDef(demo)
    .load()
    .then((app) => {
      if (cell.loading !== demo) return;
      dropDemo(cell);
      cell.handle = mountDemo(doc, host, () => app);
      cell.id = demo;
      cell.loading = null;
    });
}

// Position the host over the drawn slot (no-op while no slot is
// drawn); the display toggle is the band's visible switch.
function placeEmbed(
  host: HostElement,
  container: HostElement,
  marker: string,
): void {
  const box = slotBox(container, marker);
  if (box === null) return;
  host.style.setProperty("display", "");
  host.style.setProperty("top", box.top);
  host.style.setProperty("left", box.left);
  host.style.setProperty("width", box.width);
  host.style.setProperty("height", `${EMBED_SLOT_HEIGHT}px`);
}

// One sync pass per draw: the current page names its demo through
// PAGE_DEMOS; a page without a demo hides the host and drops any
// mounted demo, a page with one kicks the registry load once and
// positions the host over the drawn slot.
function syncEmbed(
  cell: EmbedCell,
  docs: SpaHandle,
  doc: HostDoc,
  host: HostElement,
  container: HostElement,
): void {
  const demo = currentDemo(docs);
  if (demo === undefined) {
    host.style.setProperty("display", "none");
    if (cell.handle !== null) dropDemo(cell);
    return;
  }
  if (cell.id !== demo && cell.loading !== demo) {
    startLoad(cell, demo, doc, host);
  }
  placeEmbed(host, container, embedMarker(demo));
}

// Wire the embed seam for one docs mount; returns the disposer the
// mount drops on unmount.
export function wireDocsEmbed(
  doc: HostDoc,
  container: HostElement,
  docs: SpaHandle,
): () => void {
  const host = makeEmbedHost(doc, container);
  const cell: EmbedCell = { id: null, loading: null, handle: null };
  const sync = (): void => syncEmbed(cell, docs, doc, host, container);

  // The post-draw hook: wrap backend.draw (the wireExtentSizing
  // precedent) so page swaps, body arrivals and resize re-derivations
  // all re-sync the embed.
  const rawDraw = docs.backend.draw.bind(docs.backend);
  docs.backend.draw = (view: Elem) => {
    const drawn = rawDraw(view);
    sync();
    return drawn;
  };
  sync();

  return () => {
    // Restore the raw draw: a post-unmount draw must not re-sync — a
    // stray draw after the mount dropped would otherwise remount the
    // demo (A-EDGE-003).
    docs.backend.draw = rawDraw;
    cell.loading = null;
    dropDemo(cell);
    container.removeChild(host);
  };
}
