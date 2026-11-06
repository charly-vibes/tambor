// Purpose: curated demo declarations (add-docs-site task 7) — the
//   generated reference pages are corpus-derived data and cannot carry
//   hand-authored fields, so the docs site declares which page embeds
//   which gallery demo here, beside the guides that will own their
//   own declarations (task 9).
// Responsibilities: PAGE_DEMOS — docs page name → gallery demo id; the
//   shell view reserves the embed band from it and the host seam
//   resolves and mounts the demo through it.
// Rationale: design D2 keeps generated modules pure data; a curated
//   map module is the guide-style home for hand-authored declarations
//   until the guide modules (task 9) fold the declarations into the
//   pages proper. The ids name gallery DEMOS entries, so a typo fails
//   loud at resolve time (embeds.ts), not silently.

// Which generated reference page embeds which gallery demo.
export const PAGE_DEMOS: Readonly<Record<string, string>> = {
  "example-counter": "counter",
  "example-todo": "todo",
};
