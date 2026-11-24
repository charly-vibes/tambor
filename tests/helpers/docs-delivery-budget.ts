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
// drawn slot (src/docs/embeds.ts slotBox disambiguation); re-recorded
// 2026-11-16 to 31495 B after tambor-v3s made the docs entry await the
// shell font before view construction (whenHostFontsReady), the button
// text now inherits the measured font, and the docs shell gained the
// @font-face declaration; re-recorded 2026-11-16 to 31584 B after
// add-spa-test-seams added the query-string boot selection and the
// opt-in debug snapshot to the SPA entry the docs bundle shares; the
// same change's pre-commit complexity split (helpers extracted from
// mountAvailable/mountDemo) re-measured at 31596 B; re-recorded
// 2026-11-18 to 31599 B after add-demo-visual-polish D2 floored
// button_bounds at 44px/axis (the shared geometry helper adds ~3 B
// gzipped to the shared bundle); re-recorded 2026-11-21 to 34309 B
// against the in-flight working tree (the tambor-ilc sw change itself
// is outside the docs entry's static closure — sw.js is a standalone
// entry with no importers — so this bump comes from other spa edits
// riding the same build); re-recorded 2026-11-21 again to 34464 B for
// add-frame-coalescing (tambor-bva): the mount-boundary coalescer,
// wireSurface paint seam, and boot-selection mode parsing ship in the
// shared spa bundle the docs shell loads (mount.ts is the npm ./spa
// subpath and initial chunk by design, add-spa-delivery); re-recorded
// 2026-11-21 once more to 34490 B for the RO5U fixes (unmount drop
// guard on the coalescer rides the same shared bundle); re-recorded
// re-recorded 2026-11-23 to 34844 B for the ChangeSet/DispatchCommit
// publication + App.subscribe (§1/§2 of the same change, shared
// effects/dispatch chunk); re-recorded 2026-11-23 again to 35588 B for
// §3/§4 (whole-view short-circuit, per-child identity reuse machinery,
// and the opt-in counters riding the shared dom chunk); re-recorded
// 2026-11-23 to 35805 B for the RO5U fixes (throw isolation, counter
// miss-only semantics, subscribe-optional plumbing); re-recorded
// 2026-11-23 to 35874 B after the pretender-gate module splits (mount-wire/
// mount-debug/mount-counters/dom-reuse/dom-fill extraction — same code,
// different chunk boundaries); re-recorded 2026-11-24 to 35927 B for
// add-keyed-dom-reconciliation §1 (the keyed declaration helpers ship
// through the views barrel into the shared chunk); re-recorded
// 2026-11-24 again to 36186 B for the §1.5 RO5U fix (Elem admits the
// keyed wrapper + geometry read-through entries in the origin/bounds/
// children/makeNode tables); re-recorded 2026-11-24 to 36187 B when
// the B2 bench vehicle gained the insert-first op (keyed-table band3);
// re-recorded 2026-11-24 to 36709 B for §2 painter wiring (keyed
// records through BuildCtx, buildArrayChildren + reconcile plan
// consumption in the shared dom chunk); re-recorded 2026-11-24 to
// 36937 B for §3 the by-key state-path navigator (paths-walk-keyed
// handler in the shared effects chunk); re-recorded 2026-11-24 to
// 36950 B for the §3 tidy split (matchIndexAndCount helper — same
// code, different function shapes); re-recorded 2026-11-24 to 36951 B
// for §4 createSelector (the selector in the shared memo chunk).
// Re-record ritual: when the docs entry or content ships a bigger
// measured shell — run the build, read the measured gzip the test
// reports, update THIS ONE constant, and run tools/stamp-docs.sh if
// the demo-dist total changed too (it stamps README/EVALUATION from
// the same metafile).
export const DOCS_SHELL_GZIP_CEILING_BYTES = 36951;

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