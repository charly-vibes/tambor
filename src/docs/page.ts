// Purpose: the docs page-view renderer (add-docs-site task 2.3) — one
//   Elem shape for every docs page, generated and curated alike.
// Responsibilities: PageData — the data contract a docs page module
//   conforms to (identity fields plus optional loaded body);
//   pageView(page, body, maxWidth) renders it as tambor elems — title,
//   statement, description, then the verbatim body lines when loaded —
//   wrapping prose at the container width so the rendered page never
//   overflows its column (task 6, design D3).
// Rationale: generated registry rows and hand-written guide modules
//   (tasks 4-5) must render through the same renderer so the docs
//   chrome cannot fork per source — the Elem shape is the contract.
//   Wrapping is not re-derived here: prose goes through the view layer's
//   one wrap rule (views/fit.ts `wrapText`), so the docs and the demos
//   cannot drift on where lines break or whether the joining space
//   survives into the drawn spans.

import { label, withColor } from "../views/nodes.ts";
import type { Elem } from "../views/model.ts";
import { wrapText } from "../views/fit.ts";
import { VIEWPORT } from "../spa/viewport.ts";
import { ambientColor } from "./theme.ts";

// The page data shape: generated registry rows carry all identity
// fields; guide modules (tasks 4-5) conform to the same contract.
export interface PageData {
  readonly title: string;
  readonly statement: string;
  readonly description: string;
  // The gallery demo this page embeds (task 7) — the id resolves
  // through the gallery demo registry read-only, behind the
  // dynamic-import boundary; pages that declare none render prose only.
  readonly demo?: string;
}

// One coloured body-role label per fitted line: the lines come from the
// view layer's single wrap rule, so this file owns no wrap loop.
function wrappedRole(text: string, role: "heading" | "body", maxWidth: number): Elem[] {
  return wrapText(text, maxWidth).map((line) =>
    withColor(ambientColor(role), label(line)),
  );
}

export function pageView(
  page: PageData,
  body: string | null,
  maxWidth: number = VIEWPORT[0],
): Elem[] {
  // Roles, not colors (task 5.2): the title speaks the heading role,
  // the metadata lines and verbatim body speak the body role — both
  // resolved through the ambient theme. Prose wraps at the container
  // width (responsive re-derivation: the width rides the derivation).
  const head = [
    ...wrappedRole(page.title, "heading", maxWidth),
    ...wrappedRole(page.statement, "body", maxWidth),
    ...wrappedRole(page.description, "body", maxWidth),
  ];
  const lines =
    body === null
      ? []
      : body.split("\n").flatMap((l) => wrappedRole(l, "body", maxWidth));
  return [...head, ...lines];
}
