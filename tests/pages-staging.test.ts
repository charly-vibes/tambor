// @vitest-environment node
// Purpose: Pages staging contract (add-docs-site D6 — the Pages artifact
//   serves the docs index at /docs/): tools/stage-pages.mjs builds the
//   _pages/ artifact root from index.html + demo-dist/ + ai/, and LIFTS
//   the docs site to /docs/ at the site root — demo-dist stays byte-
//   identical so the npm tarball and spa-delivery contracts never see
//   the staging layout; docs-only chunks are rewritten from ../chunks/
//   to ./chunks/ (their gallery-shared siblings stay verbatim).
// Responsibilities: run build:spa (fresh inputs), run the stager with
//   OUT=_pages target, then over the staged tree: assert /docs/ serves
//   the shell referencing ./main.js, /docs/main.js serves and imports
//   ./chunks/ only, every ./chunks ref in it resolves on disk, and the
//   gallery shell still resolves at /demo-dist/spa.js.
// Rationale: review found the spec scenario true only under a
//   demo-dist-rooted server (the serve-smoke's root) — live Pages 404s
//   /docs/. This file pins the staging layout that makes the scenario
//   true against the SITE ROOT; the CI workflow is a one-line call of
//   the same script, so the gate tests exactly what ships.

// @ts-expect-error node builtin (tsconfig types exclude node; repo
// test-local pin convention, e.g. spa-delivery.test.ts)
import { spawnSync } from "node:child_process";
// @ts-expect-error node builtin (tsconfig types exclude node)
import { existsSync, readFileSync, rmSync } from "node:fs";
// @ts-expect-error node builtin (tsconfig types exclude node)
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const proc = globalThis as unknown as {
  process: { readonly env: Record<string, string | undefined> };
};

const ROOT = resolve("target/ro5-pages-test/_pages");

// Heavy discipline: this file runs build:spa (wipes demo-dist) — it
// takes the file-wide heavy lock like the other destructive files
// (tests/vitest-config.test.ts pins the HEAVY_FILES list).
import { acquireHeavyLock, type HeavyRelease } from "./helpers/heavy-lock.ts";

let release: HeavyRelease | undefined;

beforeAll(async () => {
  release = await acquireHeavyLock();
  const build = spawnSync("node", ["scripts/build-spa.mjs"], { encoding: "utf8" });
  if (build.status !== 0) throw new Error(`build:spa failed: ${build.stderr}`);
  const staged = spawnSync("node", ["tools/stage-pages.mjs"], {
    encoding: "utf8",
    env: { ...proc.process.env, OUT: ROOT },
  });
  if (staged.status !== 0) throw new Error(`stager failed: ${staged.stderr}`);
}, 420_000);

afterAll(() => {
  rmSync("target/ro5-pages-test", { recursive: true, force: true });
  release?.();
});

function stagedFile(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

describe("pages staging — p_pages_docs_served_at_site_root", () => {
  it("p_pages_docs_index_at_root_serves_docs_shell", () => {
    expect(existsSync(resolve(ROOT, "docs/index.html"))).toBe(true);
    const html = stagedFile("docs/index.html");
    expect(html).toContain("./main.js");
  });

  it("p_pages_docs_main_imports_local_chunks", () => {
    const js = stagedFile("docs/main.js");
    expect(js).toContain("./chunks/");
    expect(js).not.toContain("../chunks/");
  });

  it("p_pages_all_docs_chunk_refs_resolve", () => {
    const refs = docsChunkRefs();
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(existsSync(resolve(ROOT, "docs", ref))).toBe(true);
    }
  });

  it("p_pages_gallery_shell_unchanged_under_demo_dist", () => {
    expect(existsSync(resolve(ROOT, "demo-dist/spa.js"))).toBe(true);
    expect(existsSync(resolve(ROOT, "index.html"))).toBe(true);
  });
});

// The ./chunks/… literals in the staged docs entry, as import sites.
function docsChunkRefs(): string[] {
  const js = stagedFile("docs/main.js");
  const refs = new Set<string>();
  for (const match of js.matchAll(/"\.\/chunks\/[^"]+"/g)) {
    refs.add(match[0].slice(1, -1));
  }
  return [...refs];
}
