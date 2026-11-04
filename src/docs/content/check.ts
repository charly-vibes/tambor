// Purpose: the docs content check (add-docs-site D7, scenario
//   ungrouped_page_fails) — every page module declares its journey
//   group, and a page assigned to no group fails naming the module.
// Responsibilities: checkGroups(pages) throws naming the offending
//   modules when a page's group is missing or empty; the docs shell
//   runs it at mount (fail-loud before any nav render) and the build
//   wiring calls it over the emitted registry (task 9).
// Rationale: a page no nav group claims is unreachable through the
//   navigation alone, which the shell spec forbids — silent omission
//   is exactly the failure mode this check exists to prevent.

export interface GroupedPage {
  readonly name: string;
  readonly group?: string;
}

export function checkGroups(pages: readonly GroupedPage[]): void {
  const ungrouped = pages.filter(
    (p) => typeof p.group !== "string" || p.group.length === 0,
  );
  if (ungrouped.length > 0) {
    throw new Error(
      `content check: page module declares no journey group: ${ungrouped
        .map((p) => p.name)
        .join(", ")}`,
    );
  }
}
