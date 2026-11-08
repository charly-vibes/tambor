// @vitest-environment node
// Purpose: curated-guide substance contract tests (add-docs-site tasks
//   9.3/9.4) — every guide page declares its Diátaxis kind and the
//   evidence that kind requires (D7): a tutorial is a quickstart under
//   the 15-minute bar whose snippets name compiled sample modules under
//   src/docs/samples/, a how-to declares one named task and a
//   verifiable outcome, an explanation states prerequisites up front.
//   The suite is RED until task 9.4 authors the registry (empty today:
//   src/docs/content/guides.ts exports `guides = []`) and implements
//   checkGuideSubstance (a throwing stub in check.ts today).
// Responsibilities: regenerate the gitignored corpus content (the
//   docs-guide-links precedent), then assert the real registry carries
//   exactly the quadrant-evidence contract above and that every
//   quickstart snippet resolves to a real sample module node's type
//   stripping can import (D2: extracted, type-checked, runnable), and
//   exercise checkGuideSubstance pure over synthetic fixtures for each
//   failure mode (unknown snippet id, missing outcome) plus a fully
//   compliant set that must pass once the stub is replaced.
// Rationale: openspec/changes/add-docs-site/specs/docs-site/spec.md
//   "Tutorial and how-to guides" is the design authority — the quickstart
//   reaches a working todo result within 15 minutes with every snippet
//   type-checked by the build, how-tos end in a verifiable outcome.
//   Sample modules are resolved at runtime (fs readdir + one spawned
//   `node` process per suite run): vitest resolves literal dynamic
//   imports at transform time, so a static import of a sample module
//   path that does not exist yet would crash the whole file instead of
//   failing one test (gotcha 127a3ff6).

import { describe, expect, it } from "vitest";
// @ts-expect-error node:child_process has no type declarations here
import { spawnSync } from "node:child_process";
// @ts-expect-error node:fs has no type declarations here
import { existsSync, readdirSync } from "node:fs";
// @ts-expect-error node:path has no type declarations here
import { join, resolve } from "node:path";
import type { GuideKind } from "../src/docs/content/guides.ts";
import type { GuideSubstance } from "../src/docs/content/check.ts";

const TOOL_PY = resolve("tools/gen_docs_content.py");
const CORPUS = resolve("openspec/specs");
const GENERATED = resolve("src/docs/content/generated");
const SAMPLES_DIR = resolve("src/docs/samples");

// Generate the build-time content (the docs-guide-links precedent),
// then import the module under test. Static imports would hoist past
// the generation and fail on a fresh checkout where build-spa has not
// run yet; the check module has no generated dependency but is imported
// dynamically anyway so this file dies per-assertion, never at load.
const gen = spawnSync(
  "python3",
  [TOOL_PY, "--corpus", CORPUS, "--out", GENERATED],
  { encoding: "utf8" },
);
if (gen.status !== 0) throw new Error(`content generator failed: ${gen.stderr}`);

const { checkGuideSubstance: runCheck } = await import(
  "../src/docs/content/check.ts"
);
const { guides } = await import("../src/docs/content/guides.ts");

// The sample ids the build tool derives from the samples dir listing
// (a missing dir — task 9.4 authors the modules — yields []).
function sampleStems(dir: string): string[] {
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return [];
  }
  return files
    .filter((f) => f.endsWith(".ts"))
    .map((f) => f.slice(0, -3))
    .sort();
}
const realSampleIds = sampleStems(SAMPLES_DIR);

// One synthetic guide fixture: minimum substance shape, declared
// evidence only.
function substance(
  id: string,
  kind: GuideKind,
  extra: Partial<GuideSubstance> = {},
): GuideSubstance {
  return { id, kind, ...extra };
}

// Every snippet id every tutorial page declares, deduped in registry
// order — the ids the quickstart builds on.
function tutorialSnippetIds(pages: readonly GuideSubstance[]): string[] {
  return [
    ...new Set(
      pages
        .filter((g) => g.kind === "tutorial")
        .flatMap((g) => g.snippets ?? []),
    ),
  ];
}

// One spawned `node` process imports every declared sample module
// through the native type-stripping pipeline (node ≥ 23.6 default, the
// .mjs tool precedent) and asserts the documented `run` export — a
// single spawn proves erasable syntax and top-level import safety for
// all ids at once.
interface SpawnResult {
  readonly status: number | null;
  readonly stderr: string;
}
function samplesNodeCheck(sampleIds: readonly string[]): SpawnResult {
  const script = [
    "import { pathToFileURL } from 'node:url';",
    "for (const id of process.argv.slice(1)) {",
    `  const ns = await import(pathToFileURL(\`${SAMPLES_DIR}/\${id}.ts\`).href);`,
    "  if (typeof ns.run !== 'function') throw new Error(`sample ${id}: missing run export`);",
    "}",
    "",
  ].join("\n");
  return spawnSync(
    "node",
    ["--input-type=module", "-e", script, ...sampleIds],
    { encoding: "utf8" },
  ) as SpawnResult;
}

describe("docs guide substance — Tutorial and how-to guides", () => {
  it("p_docs_guides_substance_one_quickstart: the registry carries exactly one tutorial-kind quickstart with group, links, snippets and a sub-15-minute duration", () => {
    const quickstarts = guides.filter((g) => g.kind === "tutorial");
    expect(quickstarts).toHaveLength(1);
    const qs = quickstarts[0];
    expect(qs?.group.length).toBeGreaterThan(0);
    expect(qs?.links.length).toBeGreaterThan(0);
    expect(qs?.snippets?.length ?? 0).toBeGreaterThan(0);
    expect(qs?.durationMinutes).toBeGreaterThan(0);
    expect(qs?.durationMinutes ?? 0).toBeLessThanOrEqual(15);
  });

  it("p_docs_guides_substance_howtos_complete: every how-to page declares a named task and a verifiable outcome", () => {
    const howTos = guides.filter((g) => g.kind === "how-to");
    expect(howTos.length).toBeGreaterThan(0);
    for (const how of howTos) {
      expect(how.task?.trim().length ?? 0).toBeGreaterThan(0);
      expect(how.outcome?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });

  it("p_docs_guides_substance_explanations_state_prerequisites: every explanation page declares non-empty prerequisites", () => {
    const explanations = guides.filter((g) => g.kind === "explanation");
    expect(explanations.length).toBeGreaterThan(0);
    for (const ex of explanations) {
      expect(ex.prerequisites?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("p_docs_guides_substance_check_passes_real_tree: the real registry passes the substance check and every quickstart snippet node-imports its run export", () => {
    expect(() => runCheck(guides, realSampleIds)).not.toThrow();
    for (const id of tutorialSnippetIds(guides)) {
      expect(existsSync(join(SAMPLES_DIR, `${id}.ts`))).toBe(true);
    }
    const node = samplesNodeCheck(tutorialSnippetIds(guides));
    expect(node.status, node.stderr).toBe(0);
  }, 30_000);

  it("p_docs_guides_substance_unknown_snippet_fails: a tutorial naming an unknown snippet id fails naming the page and the id", () => {
    const fixture = [
      substance("quickstart", "tutorial", {
        durationMinutes: 10,
        snippets: ["no.such.snippet"],
      }),
    ];
    expect(() => runCheck(fixture, ["counter"])).toThrow(/quickstart/);
    expect(() => runCheck(fixture, ["counter"])).toThrow(/no\.such\.snippet/);
  });

  it("p_docs_guides_substance_howto_missing_outcome_fails: a how-to without an outcome fails naming the page", () => {
    expect(() =>
      runCheck(
        [substance("how-to-compose-form", "how-to", { task: "compose a form" })],
        [],
      ),
    ).toThrow(/how-to-compose-form/);
  });

  it("p_docs_guides_substance_compliant_fixtures_pass: a fully compliant fixture set passes the substance check", () => {
    expect(() =>
      runCheck(
        [
          substance("quickstart", "tutorial", {
            durationMinutes: 10,
            snippets: ["counter"],
          }),
          substance("how-to-drag-scroll", "how-to", {
            task: "wire drag-scrolling",
            outcome: "content pans by wheel and touch",
          }),
          substance("explanation-core-model", "explanation", {
            prerequisites: ["strict TypeScript"],
          }),
        ],
        ["counter"],
      ),
    ).not.toThrow();
  });
});