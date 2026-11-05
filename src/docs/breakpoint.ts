// Purpose: the docs breakpoint vocabulary (add-docs-site task 6.2) —
//   the one module that owns the width where the docs shell collapses.
// Responsibilities: DOCS_BREAKPOINT — the sidebar-to-top-bar threshold;
//   collapsedNav — the pure branch predicate the shell view derives on.
// Rationale: openspec/changes/add-docs-site/design.md D3 — "Breakpoints
//   are pure functions of the container width the view already
//   receives" — and the tasks.md clause that the breakpoint constant
//   lives in one module, so the shell view, the tests and any later
//   adopter (the gallery, design D3's adopt-not-move note) read the
//   same number.

// Below this width the nav collapses to a top-bar dropdown and demo
// embeds stack above prose; at or above it the sidebar + content pane
// render (and showcase pages pin — task 8).
export const DOCS_BREAKPOINT = 600;

// The pure branch the docs shell view derives on (responsive
// re-derivation: view re-derivation, not CSS).
export function collapsedNav(width: number): boolean {
  return width < DOCS_BREAKPOINT;
}
