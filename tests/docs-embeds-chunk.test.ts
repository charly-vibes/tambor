// Purpose: docs-entry chunk-graph contract (add-docs-site task 7.1) —
//   the metafile half of the "Demo embeds" spec scenario: no example
//   module rides the docs entry's initial chunk, while the demo
//   example modules ride content-hashed lazy chunks behind the
//   dynamic-import boundary.
// Responsibilities: generate the corpus content into the gitignored
//   generated dir (fresh checkouts have none until build-spa runs),
//   esbuild-bundle the docs entry in memory (write:false — the
//   delivery build itself is task 10's), then walk the metafile's
//   static-import closure of the entry output asserting no
//   src/examples input is reachable, and assert at least one lazy
//   chunk carries example inputs — the positive proof the boundary
//   exists rather than the demos being absent.
// Rationale: openspec/changes/add-docs-site/specs/docs-site/spec.md
//   "Demo embeds" — page content modules ride the initial chunk
//   without any demo example code; the gallery's add-spa-delivery
//   precedent (tests/spa-delivery.test.ts's traversal idiom) is the
//   mechanism. Runs in the node environment: esbuild's realm
//   invariant (TextEncoder/Uint8Array) breaks under jsdom, and the
//   chunk graph is a build contract that needs no DOM.

import { describe, expect, it } from "vitest";
// @ts-expect-error node:child_process has no type declarations here
import { spawnSync } from "node:child_process";
// @ts-expect-error node:path has no type declarations here
import { resolve } from "node:path";
import { build } from "esbuild";

const TOOL = resolve("tools/gen_docs_content.py");
const CORPUS = resolve("openspec/specs");
const GENERATED = resolve("src/docs/content/generated");

// Generate the build-time content (atomic publication — the generator
// owns its out dir), then bundle. The docs entry imports the registry,
// so the content modules must exist first (docs-shell precedent).
const gen = spawnSync("python3", [TOOL, "--corpus", CORPUS, "--out", GENERATED], {
  encoding: "utf8",
});
if (gen.status !== 0) throw new Error(`content generator failed: ${gen.stderr}`);

// The metafile output slice this file traverses — the same shape
// tests/spa-delivery.test.ts asserts over.
interface MetaOutput {
  readonly bytes: number;
  readonly entryPoint?: string;
  readonly imports?: readonly { path: string; external?: boolean; kind?: string }[];
  readonly inputs?: Readonly<Record<string, unknown>>;
}

describe("docs embeds — p_docs_embeds_example_modules_split_out_of_initial_docs_chunk", () => {
  it("p_docs_embeds_split: no src/examples input rides the docs entry's static-import closure; examples ride lazy chunks", async () => {
    const result = await build({
      entryPoints: ["src/docs/main.ts"],
      bundle: true,
      splitting: true,
      format: "esm",
      write: false,
      metafile: true,
      logLevel: "silent",
      outdir: "out",
      chunkNames: "chunks/[name]-[hash]",
    });
    const outputs = (result.metafile as { outputs: Record<string, MetaOutput> })
      .outputs;
    const entry = Object.keys(outputs).find(
      (p) => outputs[p]!.entryPoint === "src/docs/main.ts",
    );
    expect(entry, "docs entry output in metafile").toBeTruthy();

    // The static-import closure of the initial docs chunk — only
    // static edges count, the demo chunks hang off dynamic-import
    // edges (that IS the lazy boundary; spa-delivery's traversal).
    const seen = new Set<string>([entry!]);
    const queue = [entry!];
    while (queue.length > 0) {
      const current = queue.pop()!;
      for (const imp of outputs[current]?.imports ?? []) {
        if (imp.external === true || seen.has(imp.path)) continue;
        if (imp.kind !== undefined && imp.kind !== "import-statement") continue;
        seen.add(imp.path);
        queue.push(imp.path);
      }
    }
    for (const path of seen) {
      for (const input of Object.keys(outputs[path]?.inputs ?? {})) {
        expect(
          input.includes("src/examples/"),
          `example module ${input} reachable from the initial docs chunk (via ${path})`,
        ).toBe(false);
      }
    }

    // The positive proof the boundary exists: the demo example
    // modules ride content-hashed lazy chunks — not nothing.
    const lazyExampleChunks = Object.entries(outputs).filter(
      ([path, out]) =>
        !seen.has(path) &&
        Object.keys(out.inputs ?? {}).some((i) => i.includes("src/examples/")),
    );
    expect(
      lazyExampleChunks.length,
      "no lazy chunk carries example modules — the embed boundary is missing",
    ).toBeGreaterThan(0);
  }, 120_000);
});
