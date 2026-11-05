// Purpose: the vitest config's serialisation contract (tambor CI-red
//   42082454763 follow-up) — the suite must never run test files
//   concurrently, and the junit wiring testaruda ingests must stay
//   intact across any config change.
// Responsibilities: pin, against the config file's text, that (1)
//   fileParallelism is disabled — several files mutate or pack shared
//   trees (dist/ via npm pack + prepack tsc, demo-dist/ via build-spa,
//   src/docs/content/generated/ via the docs generator) and CI run
//   42082454763 failed spa-delivery's tarball check on exactly that
//   interleaving; (2) the file set stays the full tests glob (no file
//   silently drops out); (3) the junit reporter keeps its per-reporter
//   outputFile (tambor-8rq) on the path the testaruda adapter ingests.
// Rationale: the shared-state files — distribution-packaging, spa-
//   delivery, spa-bundle, docs-shell, docs-keyboard, typing-strict —
//   cannot be isolated into a serial vitest *project*, because per-
//   project junit reporters clobber the single target/test-results.xml
//   the adapter ingests (verified: both projects writing left a 40-byte
//   header-only file). Global serialisation is the only vitest-native
//   lever that both stops the races and keeps the report merge intact.
//   CI's cold tsc (~10-20s emit vs ~1.5s warm locally) widens the race
//   windows so local green can never prove their absence — only this
//   config contract can. The config is asserted as text, NOT imported:
//   importing vitest.config.ts inside a vitest worker re-enters
//   vitest/config and deadlocks ah check --run-tests's invocation
//   (verified live during this change — plain vitest survives it, ah's
//   runner does not).

// @ts-expect-error node builtin (tsconfig types exclude node; same
// test-local pin as spa-delivery.test.ts)
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CONFIG_TEXT = readFileSync("vitest.config.ts", "utf8");

describe("vitest config — suite_files_serialisation", () => {
  it("disables file parallelism suite-wide", () => {
    expect(CONFIG_TEXT).toMatch(/fileParallelism:\s*false/);
  });

  it("keeps the whole tests glob so no file drops out of the suite", () => {
    expect(CONFIG_TEXT).toMatch(/include:\s*\[\s*"tests\/\*\*\/\*\.test\.ts"\s*\]/);
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
