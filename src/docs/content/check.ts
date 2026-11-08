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

// ──────────────────────────────────────────────────────────────────────
// Guide links (add-docs-site task 9) — shared by the vitest suite and
// the build-time tool tools/check_docs_content.mjs (which imports this
// module through node's native TS type stripping): every link a curated
// guide declares is either a typed page id resolving against the
// generated registry ∪ the other guide ids, or a well-formed external
// http(s) URL extracted into the link inventory CI verifies (D8).

// The minimal link-declaration surface the check needs — GuidePage
// (content/guides.ts) conforms structurally, so fixtures and the real
// guides share one validator.
export interface GuideLinks {
  readonly id: string;
  readonly links: readonly string[];
}

// One inventory row: the URL and every guide that declares it, so CI
// verification failures name their sources. build/docs-link-inventory.json
// is the serialized LinkInventory.
export interface LinkInventoryEntry {
  readonly url: string;
  readonly guides: readonly string[];
}

export interface LinkInventory {
  readonly links: readonly LinkInventoryEntry[];
}

interface GuideLinkFailure {
  readonly guide: string;
  readonly what: string;
}

// A well-formed external http(s) URL: scheme + host, no whitespace or
// markup delimiters — the inventory's universe (D8: CI verifies these
// resolve; the build itself stays offline-safe).
const HTTP_URL = /^https?:\/\/[^\s<>"']+$/i;
// Any scheme:// prefix: a URL-shaped link that fails HTTP_URL is a
// malformed external URL (empty host, whitespace, non-http scheme) —
// nothing the http(s)-only inventory can carry or CI can verify.
const SCHEME_URL = /^[a-z][a-z0-9+.-]*:\/\//i;

// The link's role: a well-formed external URL (extract), a URL-shaped
// but malformed one (fail naming page + link), or a typed page id.
function classifyLink(link: string): "url" | "malformed" | "id" {
  if (HTTP_URL.test(link)) return "url";
  if (SCHEME_URL.test(link)) return "malformed";
  return "id";
}

// Every failure collected into one message — fail-loud with the full
// report naming each guide and its offending id or URL.
function guideLinkFailure(failures: readonly GuideLinkFailure[]): Error {
  return new Error(
    `content check: guide link failures: ${failures
      .map((f) => `guide ${f.guide} ${f.what}`)
      .join("; ")}`,
  );
}

// Scan one guide's links and identity into the shared report, and its
// well-formed URLs into the per-URL source map.
function scanGuide(
  page: GuideLinks,
  generated: ReadonlySet<string>,
  guideIds: readonly string[],
  byUrl: Map<string, string[]>,
  failures: GuideLinkFailure[],
): void {
  if (generated.has(page.id)) {
    failures.push({
      guide: page.id,
      what: "collides with a generated page id",
    });
  }
  for (const link of page.links) {
    const kind = classifyLink(link);
    if (kind === "url") {
      byUrl.set(link, [...(byUrl.get(link) ?? []), page.id]);
    } else if (kind === "malformed") {
      failures.push({
        guide: page.id,
        what: `carries a malformed external URL: ${link}`,
      });
    } else if (!(generated.has(link) || guideIds.indexOf(link) !== -1)) {
      failures.push({
        guide: page.id,
        what: `references unknown page id: ${link}`,
      });
    }
  }
}

// The typed-graph gate over curated guides (D2/D8): every link is a
// typed page id resolving against the generated registry ∪ the other
// guide ids, or a well-formed external http(s) URL extracted into the
// link inventory. Guide ids cannot collide with a generated id or
// repeat. Returns the deduped, sorted inventory of external URLs.
export function checkGuideLinks(
  guides: readonly GuideLinks[],
  generatedIds: readonly string[],
): LinkInventory {
  const generated = new Set(generatedIds);
  const guideIds = guides.map((g) => g.id);
  const byUrl = new Map<string, string[]>();
  const failures: GuideLinkFailure[] = [];
  for (const page of guides) {
    scanGuide(page, generated, guideIds, byUrl, failures);
  }
  for (const id of new Set(guideIds)) {
    if (guideIds.indexOf(id) !== guideIds.lastIndexOf(id)) {
      failures.push({ guide: id, what: "is declared by more than one guide" });
    }
  }
  if (failures.length > 0) throw guideLinkFailure(failures);
  return {
    links: [...byUrl.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([url, pages]) => ({ url, guides: [...new Set(pages)].sort() })),
  };
}
