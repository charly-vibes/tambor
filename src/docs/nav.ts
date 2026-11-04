// Purpose: the docs nav registry (add-docs-site task 2.3) — the journey
//   groups typed once, consumed by the shell view and later by the
//   responsive variants (task 6) so the D7 order lives in one module.
// Responsibilities: NavGroup — a journey group id and its rendered
//   header; NAV — the four groups in D7 reader order (getting started
//   → guides → reference → examples).
// Rationale: openspec/changes/add-docs-site/design.md D7 — nav groups
//   follow the reader journey, not the registry's flat order; curated
//   groups are reserved headers until their pages land (tasks 4-8).

export interface NavGroup {
  readonly id: string;
  readonly header: string;
}

export const NAV: readonly NavGroup[] = [
  { id: "getting-started", header: "Getting started" },
  { id: "guides", header: "Guides" },
  { id: "reference", header: "Reference" },
  { id: "examples", header: "Examples" },
];
