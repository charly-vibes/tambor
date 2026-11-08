// @vitest-environment node
// Purpose: curated-guide content-check contract tests (add-docs-site
//   tasks 9.1/9.2) — guide modules resolve every typed page id against
//   the generated registry ∪ the other guide ids, declare a journey
//   group, and external http(s) URLs are extracted: an unresolved id
//   fails the build naming the guide and the id, a malformed external
//   URL fails naming the page and the URL, and well-formed URLs land
//   in the link inventory (build/docs-link-inventory.json) the CI step
//   verifies. The check is exercised pure over synthetic guide fixtures
//   (the starter guides are authored in task 9.4) and over the real
//   tree through the build tool (tools/check_docs_content.mjs) spawned
//   like the generator tests.
// Responsibilities: regenerate the gitignored corpus content (fresh
//   checkouts have none until build-spa runs, docs-shell precedent),
//   then run checkGuideLinks/checkGroups over synthetic fixtures for
//   each failure mode, run the real registry through both checks, and
//   spawn the build tool over the real tree (green, inventory written)
//   and over a malformed fixture module (red, naming page + URL).
// Rationale: openspec/changes/add-docs-site/specs/docs-site/spec.md
//   "Curated guides with validated links" is the design authority —
//   unresolved guide links and malformed external URLs fail the build;
//   well-formed URLs feed a link inventory CI verifies. Design D8
//   owns the stance: the typed-id graph eliminates internal link rot
//   by construction and extraction is deterministic, while the build
//   itself stays offline-safe (only the CI step touches the network).

import { describe, expect, it } from "vitest";
// @ts-expect-error node:child_process has no type declarations here
import { spawnSync } from "node:child_process";
// @ts-expect-error node:fs has no type declarations here
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
// @ts-expect-error node:os has no type declarations here
import { tmpdir } from "node:os";
// @ts-expect-error node:path has no type declarations here
import { join, resolve } from "node:path";
import type { GuidePage } from "../src/docs/content/guides.ts";
import {
  checkGroups,
  type LinkInventoryEntry,
} from "../src/docs/content/check.ts";

const TOOL = resolve("tools/check_docs_content.mjs");
const TOOL_PY = resolve("tools/gen_docs_content.py");
const CORPUS = resolve("openspec/specs");
const GENERATED = resolve("src/docs/content/generated");
const INVENTORY = resolve("build/docs-link-inventory.json");

// Generate the build-time content (atomic publication — the generator
// owns its out dir), then import the modules under test. Static
// imports would hoist past the generation and fail on a fresh checkout
// where build-spa has not run yet (docs-shell precedent).
const gen = spawnSync(
  "python3",
  [TOOL_PY, "--corpus", CORPUS, "--out", GENERATED],
  { encoding: "utf8" },
);
if (gen.status !== 0) throw new Error(`content generator failed: ${gen.stderr}`);

const { checkGuideLinks: runCheck } = await import(
  "../src/docs/content/check.ts"
);
const { generatedPages } = await import(
  "../src/docs/content/generated/registry.ts"
);
const { guides } = await import("../src/docs/content/guides.ts");

const generatedIds = generatedPages.map((p) => p.id);

// One synthetic guide-page fixture: minimum shape, declared links only.
function guide(id: string, links: string[], group = "getting-started"): GuidePage {
  return {
    id,
    title: id,
    statement: "statement",
    description: "description",
    group,
    links,
    content: "",
  };
}

describe("docs guide links — Curated guides with validated links", () => {
  it("p_docs_guides_resolve_typed_ids: every typed id resolves against the registry and other guides", () => {
    const fixture = [
      guide("quickstart", [
        "tambor",
        "how-to-drag-scroll",
        "https://www.typescriptlang.org/",
      ]),
      guide("how-to-drag-scroll", ["app.toplevel"]),
    ];
    const inventory = runCheck(fixture, generatedIds);
    expect(inventory.links.map((l) => l.url)).toEqual([
      "https://www.typescriptlang.org/",
    ]);
    expect(inventory.links[0]?.guides).toEqual(["quickstart"]);
  });

  it("p_docs_guides_unresolved_id_fails: an unknown page id fails naming the guide and the id", () => {
    expect(() =>
      runCheck([guide("quickstart", ["tambor", "no.such.page"])], generatedIds),
    ).toThrow(/quickstart/);
    expect(() =>
      runCheck([guide("quickstart", ["no.such.page"])], generatedIds),
    ).toThrow(/no\.such\.page/);
  });

  it("p_docs_guides_collision_fails: a guide id colliding with a generated page id fails", () => {
    expect(() => runCheck([guide("tambor", [])], generatedIds)).toThrow(
      /tambor/,
    );
  });

  it("p_docs_guides_duplicate_id_fails: two guides sharing an id fail", () => {
    expect(() =>
      runCheck(
        [guide("quickstart", []), guide("quickstart", [])],
        generatedIds,
      ),
    ).toThrow(/quickstart/);
  });

  it("p_docs_guides_ungrouped_declaration_fails: a guide with no journey group fails naming it", () => {
    expect(() => checkGroups([{ name: "quickstart", group: "" }])).toThrow(
      /quickstart/,
    );
    expect(() =>
      checkGroups([
        ...generatedPages.map((p) => ({ name: p.name, group: p.group })),
        ...guides.map((g) => ({ name: g.id, group: g.group })),
      ]),
    ).not.toThrow();
  });

  it("p_docs_guides_malformed_url_fails: a malformed external URL fails naming the page and the URL", () => {
    expect(() =>
      runCheck([guide("quickstart", ["http://"])], generatedIds),
    ).toThrow(/quickstart/);
    expect(() =>
      runCheck([guide("quickstart", ["https://bad url"])], generatedIds),
    ).toThrow(/bad url/);
    expect(() =>
      runCheck([guide("quickstart", ["ftp://example.com/x"])], generatedIds),
    ).toThrow(/ftp:\/\/example\.com/);
  });

  it("p_docs_guides_inventory_deterministic: well-formed URLs are deduped and sorted across guides", () => {
    const fixture = [
      guide("quickstart", ["https://www.typescriptlang.org/"]),
      guide("core-model", [
        "https://www.typescriptlang.org/",
        "https://phronmophobic.com/",
      ]),
    ];
    const inventory = runCheck(fixture, generatedIds);
    expect(inventory.links.map((l) => l.url)).toEqual([
      "https://phronmophobic.com/",
      "https://www.typescriptlang.org/",
    ]);
    expect(inventory.links[1]?.guides).toEqual(["core-model", "quickstart"]);
  });

  it("p_docs_content_check_tool_passes: the build tool passes the real tree and writes the inventory", () => {
    const run = spawnSync("node", [TOOL], { encoding: "utf8" });
    expect(run.status, run.stderr).toBe(0);
    const inventory = JSON.parse(readFileSync(INVENTORY, "utf8")) as {
      links: LinkInventoryEntry[];
    };
    // No guides are authored yet (task 9.4) — the check over the real
    // tree passes with an empty inventory, still emitting the file.
    expect(inventory.links).toEqual([]);
  }, 30_000);

  it("p_docs_content_check_tool_fails: the build tool fails naming page and URL on a malformed fixture", () => {
    const dir = mkdtempSync(join(tmpdir(), "docs-guides-"));
    try {
      const fixture = join(dir, "fixture-guides.ts");
      writeFileSync(
        fixture,
        [
          "export const guides = [",
          '  { id: "quickstart", title: "q", statement: "s", description: "d",',
          '    group: "getting-started", links: ["http://"], content: "" },',
          "];",
          "",
        ].join("\n"),
      );
      const run = spawnSync(
        "node",
        [TOOL, "--guides", fixture, "--out", join(dir, "inventory.json")],
        { encoding: "utf8" },
      );
      expect(run.status, run.stderr).not.toBe(0);
      expect(run.stderr).toMatch(/quickstart/);
      expect(run.stderr).toMatch(/malformed/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});