// Purpose: the docs-bundle-delivery budget seam (add-docs-site task
//   10.1, C-1 review resolution) — the SINGLE home for the initial
//   docs shell's gzip ceiling and its measurement walk, imported by the
//   delivery RED test AND by scripts/build-spa.mjs (which asserts the
//   recorded baseline after the metafile write, design D6). The build
//   loads this .ts seam natively (node >= 23.6 type stripping; CI pins
//   node 24); vitest resolves it like any test helper.
// Responsibilities: export DOCS_SHELL_GZIP_CEILING_BYTES and
//   measuredDocsShellGzip(entry, outputs) — the static-closure gzip
//   sum plus the docs index.html, the exact accounting both gates share.
// Rationale: design D6 — the docs shell stays within an explicit gzip
//   budget. Before this seam, build script and test each hardcoded
//   30132 and walked the metafile with their own twin traversal; a
//   drift would silently weaken or hard-break the gate (C-1: one
//   source, one measured number, one walk).

// @ts-expect-error node builtin (tsconfig types exclude node)
import { readFileSync } from "node:fs";
// @ts-expect-error node builtin (tsconfig types exclude node)
import { gzipSync } from "node:zlib";

import { staticClosure, type MetaOutputs } from "./metafile.ts";

// Initial docs shell gzip ceiling: the recorded baseline — task 10.2
// measured 30132 B (the demo shell's 38.6 KB gzip was the "until
// measured" placeholder per design D6); re-recorded 2026-11-09 to
// 30267 B after the review-fix wave moved the embed host onto the
// drawn slot (src/docs/embeds.ts slotBox disambiguation).
// Re-record ritual: when the docs entry or content ships a bigger
// measured shell — run the build, read the measured gzip the test
// reports, update THIS ONE constant, and run tools/stamp-docs.sh if
// the demo-dist total changed too (it stamps README/EVALUATION from
// the same metafile).
export const DOCS_SHELL_GZIP_CEILING_BYTES = 30628;

// The measured shell gzip for a docs entry output: the gzip of every
// file in its static-import closure (shared chunks ride the initial
// load) plus demo-dist/docs/index.html — the same accounting
// scripts/build-spa.mjs asserts against the ceiling.
export function measuredDocsShellGzip(
  entry: string,
  outputs: MetaOutputs,
): number {
  let total = 0;
  for (const file of staticClosure(entry, outputs)) {
    total += gzipSync(readFileSync(file)).length;
  }
  return total + gzipSync(readFileSync("demo-dist/docs/index.html")).length;
}