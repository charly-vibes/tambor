// Purpose: the serialisation contract for the vitest suite (tambor
//   CI-red 42082454763 follow-up) — the heavy files that mutate
//   or pack shared build trees must exclude each other via the
//   cross-process heavy lock, while the suite keeps default file
//   parallelism, and the junit wiring testaruda ingests must survive
//   any config change.
// Responsibilities: pin, as text assertions, that (1) vitest.config.ts
//   does NOT disable fileParallelism — global serialisation inflates
//   ah check --run-tests's single batched CI invocation past the step
//   timeout and silently drops it into per-binding batch-fallback
//   storms (CI run 42115074478 wedged >2h on exactly that); (2) each
//   of the four heavy files imports the heavy-lock helper (the
//   exclusion primitive for the dist/ and demo-dist/ races); (3) the junit reporter keeps its per-reporter outputFile
//   (tambor-8rq) on the path the testaruda adapter ingests.
// Rationale: the races are real (npm pack walks dist/ while another
//   worker's prepack tsc writes it — the tarball check failed on that
//   interleaving at the no-op mirror commit; warm-local tsc hides the
//   windows, CI's cold emit exposes them), but the fix must be scoped
//   to the contending files: only whole-suite serialisation was fast
//   enough for ah's CI step budget when parallel, and slow enough to
//   break it when serial. Lock-in-heavy-files + parallel-everything-
//   else is the point both constraints agree on.

// @ts-expect-error node builtin (tsconfig types exclude node; repo
// test-local pin convention, e.g. spa-delivery.test.ts)
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const CONFIG_TEXT = readFileSync("vitest.config.ts", "utf8");

// The files that mutate or pack a shared tree non-atomically: dist/
// (npm pack walks it while prepack tsc writes; build-spa prunes stale
// bundles from it) and demo-dist/ (build-spa rmtree + rebuild while
// other files read the bundle; docs-delivery is the 4th demo-dist
// rebuild under the lock — spa-bundle/spa-delivery precedent). The
// docs-content pair no longer needs the lock:
// tools/gen_docs_content.py publishes atomically (pages via tmp+rename,
// registry LAST as the publication point), so readers resolve either the
// whole old or whole new module set — verified under concurrency by
// tests/docs-content-generator.test.ts.
const HEAVY_FILES = [
  "tests/distribution-packaging.test.ts",
  "tests/spa-bundle.test.ts",
  "tests/spa-delivery.test.ts",
  "tests/docs-delivery.test.ts",
] as const;

describe("vitest config — heavy_files_lock_and_parallel", () => {
  it("keeps default file parallelism (global serial breaks ah's CI batch budget)", () => {
    expect(CONFIG_TEXT).not.toMatch(/fileParallelism:\s*false/);
  });

  it("every heavy file imports the cross-process heavy lock", () => {
    for (const file of HEAVY_FILES) {
      const text = readFileSync(file, "utf8");
      expect(
        text.includes("helpers/heavy-lock.ts"),
        `${file} must acquire the heavy lock`,
      ).toBe(true);
    }
  });

  it("the ah runner is marked AH_RUNNER=1 (lock no-ops under ah's batch budget)", () => {
    const toml = readFileSync(".espectacular/config.toml", "utf8");
    expect(toml).toMatch(
      /vitest\s*=\s*\[\s*"env",\s*"AH_RUNNER=1",\s*"npx",\s*"vitest",\s*"run"\s*\]/,
    );
  });
});

describe("vitest config — junit_report_wiring", () => {
  it("keeps the junit reporter on the path testaruda ingests", () => {
    expect(CONFIG_TEXT).toMatch(/reporters:\s*\[\s*"default",\s*"junit"\s*\]/);
    expect(CONFIG_TEXT).toMatch(
      /outputFile:\s*\{\s*junit:\s*"target\/test-results\.xml"\s*\}/,
    );
  });
});
