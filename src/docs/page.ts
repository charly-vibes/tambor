// Purpose: the docs page-view renderer (add-docs-site task 2.3) — one
//   Elem shape for every docs page, generated and curated alike.
// Responsibilities: PageData — the data contract a docs page module
//   conforms to (identity fields plus optional loaded body);
//   pageView(page, body) renders it as tambor elems: title, statement,
//   description, then the verbatim body lines when loaded.
// Rationale: generated registry rows and hand-written guide modules
//   (tasks 4-5) must render through the same renderer so the docs
//   chrome cannot fork per source — the Elem shape is the contract.

import { label, withColor } from "../views/nodes.ts";
import type { Elem } from "../views/model.ts";
import { ambientColor } from "./theme.ts";

// The page data shape: generated registry rows carry all identity
// fields; guide modules (tasks 4-5) conform to the same contract.
export interface PageData {
  readonly title: string;
  readonly statement: string;
  readonly description: string;
}

export function pageView(page: PageData, body: string | null): Elem[] {
  // Roles, not colors (task 5.2): the title speaks the heading role,
  // the metadata lines and verbatim body speak the body role — both
  // resolved through the ambient theme. Inside the layout's translate
  // wrappers the with-color wrappers paint ink only (tambor-2jz).
  const head = [
    withColor(ambientColor("heading"), label(page.title)),
    withColor(ambientColor("body"), label(page.statement)),
    withColor(ambientColor("body"), label(page.description)),
  ];
  const lines =
    body === null
      ? []
      : body.split("\n").map((l) => withColor(ambientColor("body"), label(l)));
  return [...head, ...lines];
}
