// Purpose: the docs-bundle-delivery budget seam (add-docs-site task
//   10.1) — the single source for the initial docs shell's gzip
//   ceiling, imported by the delivery RED test; from task 10.2 the
//   build records its measured baseline and asserts it in
//   scripts/build-spa.mjs (design D6).
// Responsibilities: export the ceiling in bytes and the shell-account
//   file set; carry the not-implemented marker 10.2 flips when the
//   build-side assertion lands.
// Rationale: design D6 — the docs shell stays within an explicit gzip
//   budget; the ceiling is the demo shell's measured 38.6 KB gzip
//   ("until measured" in the design language), and the recorded
//   baseline replaces this constant as the assertable ceiling.

// Initial docs shell gzip ceiling: the recorded baseline measured at
// task 10.2 — 30132 B (the demo shell's 38.6 KB gzip was the
// "until measured" placeholder per design D6). scripts/build-spa.mjs
// hardcodes this same number next to its build-side assertion; the
// two are twins (the build cannot import this .ts seam).
export const DOCS_SHELL_GZIP_CEILING_BYTES = 30132;

// The shell file set for gzip accounting: the docs entry output +
// every output in its static-import transitive closure (shared chunks
// ride the initial load) + demo-dist/docs/index.html.
export const DOCS_SHELL_ACCOUNTED_FILES =
  "entry + static-closure JS outputs + docs index.html" as const;

// Task 10.2 marker: scripts/build-spa.mjs asserts the recorded
// baseline after the metafile write (design D6: "the build asserts the
// recorded baseline holds") — the RED test and the build are the two
// enforcement gates over the same number.
export const buildAssertsDocsBudget = true;