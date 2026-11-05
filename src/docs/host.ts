// Purpose: the docs sizing host seam (add-docs-site task 4.2) — the
//   live size source the SPA mount otherwise pins as a constant:
//   observe the mount container and feed every observed box change
//   into the corpus render wire.
// Responsibilities: wireDocsHost(container, backend, derive) observes
//   the mount container with a ResizeObserver; on every observed box
//   change it calls backend.resize([width, height]) — the corpus
//   resize state (resize_redraws) — and then backend.draw(derive()),
//   the re-derived tree at the new size; it returns the disposer the
//   mount drops on unmount. The seam is docs-agnostic: the derive
//   callback is supplied by the caller, so the gallery can adopt the
//   same wiring later (design D3 clause) without moving this module.
// Rationale: openspec/changes/add-docs-site/design.md D3 — the corpus
//   way is backend.render.resize_redraws (DomBackend.resize relayouts
//   and redraws), but the demo mount hosts no runtime view on the
//   backend, so resize alone re-derives nothing: the seam drives the
//   redraw through the caller's derive. The observer is a host
//   capability the corpus tree cannot express (it cannot observe the
//   DOM container). The core keeps no lib.dom types, so
//   ResizeObserver is reached structurally through the global. An
//   environment without one (jsdom) degrades to the static mount
//   viewport — the domMeasure fallback precedent (tambor-0rp: jsdom
//   has no canvas 2D context, measurement falls back); every real
//   browser ships ResizeObserver, and the sizing contract itself is
//   pinned by tests/docs-host-sizing.test.ts with the mock installed.

import type { DomBackend } from "../render/dom.ts";
import type { Elem } from "../views/model.ts";
import type { HostElement } from "../interop/domhost.ts";

// The structural ResizeObserver surface (no lib.dom): one callback
// over entries, each carrying the observed content box, plus the
// observe/unobserve/disconnect controls.
interface ObservedBox {
  readonly width: number;
  readonly height: number;
}

interface ResizeEntry {
  readonly contentRect: ObservedBox;
}

interface ResizeObserverLike {
  observe(target: HostElement): void;
  unobserve(target: HostElement): void;
  disconnect(): void;
}

export function wireDocsHost(
  container: HostElement,
  backend: DomBackend,
  derive: () => Elem,
): () => void {
  const Observer = (
    globalThis as {
      ResizeObserver?: new (
        callback: (entries: readonly ResizeEntry[]) => void,
      ) => ResizeObserverLike;
    }
  ).ResizeObserver;
  if (Observer === undefined) {
    // No observer implementation (jsdom): no live size source — the
    // shell keeps the mount viewport (the domMeasure fallback shape).
    return () => {};
  }
  const observer = new Observer((entries) => {
    // The last entry is the most recent box observation; a callback
    // with no entries delivers nothing.
    const box = entries[entries.length - 1]?.contentRect;
    if (box === undefined) return;
    // resize_redraws: record the new size, then re-derive and redraw —
    // one draw per observation, the tree derived at the live size.
    backend.resize([box.width, box.height]);
    backend.draw(derive());
  });
  observer.observe(container);
  return () => observer.disconnect();
}
