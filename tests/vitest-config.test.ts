// Purpose: the serialisation contract for the vitest suite (tambor
//   CI-red 42082454763 follow-up) — the five heavy files that mutate
//   or pack shared build trees must exclude each other via the
//   cross-process heavy lock, while the suite keeps default file
//   parallelism, and the junit wiring testaruda ingests must survive
//   any config change.
// Responsibilities: pin, as text assertions, that (1) vitest.config.ts
//   does NOT disable fileParallelism — global serialisation inflates
//   ah check --run-tests's single batched CI invocation past the step
//   timeout and silently drops it into per-binding batch-fallback
//   storms (CI run 42115074478 wedged >2h on exactly that); (2) each
//   of the five heavy files imports the heavy-lock helper (the
//   exclusion primitive for the dist/, demo-dist/ and generated-docs
//   races); (3) the junit reporter keeps its per-reporter outputFile
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

// The files that mutate or pack a shared tree: dist/ (npm pack +
// prepack tsc), demo-dist/ (build-spa wipes + rebuilds), and
// src/docs/content/generated/ (the generator wipes its outdir).
// typing-strict deliberately is NOT here: it emits to its own
// target/typing-dts — isolated, no shared tree.
const HEAVY_FILES = [
  "tests/distribution-packaging.test.ts",
  "tests/docs-keyboard.test.ts",
  "tests/docs-shell.test.ts",
  "tests/spa-bundle.test.ts",
  "tests/spa-delivery.test.ts",
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
});

describe("vitest config — junit_report_wiring", () => {
  it("keeps the junit reporter on the path testaruda ingests", () => {
    expect(CONFIG_TEXT).toMatch(/reporters:\s*\[\s*"default",\s*"junit"\s*\]/);
    expect(CONFIG_TEXT).toMatch(
      /outputFile:\s*\{\s*junit:\s*"target\/test-results\.xml"\s*\}/,
    );
  });
});
