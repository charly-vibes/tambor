// Purpose: the curated guide registry (add-docs-site task 9) — the
//   hand-written complement to the generated reference pages: typed TS
//   data modules (D2, no new esbuild loader) conforming to one shape,
//   declared here so the content check (check.ts), the build-time tool
//   (tools/check_docs_content.mjs) and — once they exist — the nav
//   consume them through a single seam.
// Responsibilities: GuidePage — the shape every guide module conforms
//   to (identity fields, the journey group every page must declare, the
//   typed-link edge list, the prose body); guides — the exported
//   registry. Authored in task 9.4 (quickstart tutorial, how-tos,
//   explanations); the registry starts empty so the check seam lands
//   before the content the check protects.
// Rationale: D2 — guides are hand-written alongside the generated
//   pages, typed with no new loader; guide→reference links are typed
//   page ids resolved against the registry ∪ the other guide ids, and
//   external http(s) URLs ride the link list into the CI-verified
//   inventory (D8), so no new link syntax or runtime parser appears.

export interface GuidePage {
  readonly id: string;
  readonly title: string;
  readonly statement: string;
  readonly description: string;
  // The journey group the shell nav renders the page under (D7);
  // a guide declaring none fails the content check (checkGroups).
  readonly group: string;
  // The typed-link edge list: page ids (generated or guide) plus any
  // external http(s) URLs — the content check resolves the ids and
  // extracts the URLs deterministically (D8), so prose can never rot
  // a link the check does not see.
  readonly links: readonly string[];
  readonly content: string;
}

export const guides: readonly GuidePage[] = [];