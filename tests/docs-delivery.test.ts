// @vitest-environment node
// Purpose: the docs-bundle-delivery build contract (add-docs-site
//   task 10.1 RED) — running the real scripts/build-spa.mjs must land
//   demo-dist/docs/ with the docs index using relative chunk paths,
//   keep every generated page body behind a dynamic import (nothing
//   under src/docs/content/generated rides the initial chunk's static
//   closure), hold the initial docs shell within the declared gzip
//   ceiling, and serve the index at /docs/ from the demo-dist tree.
// Responsibilities: run build-spa once under the heavy lock (demo-dist
//   is a shared wiped tree), then assert over (1) demo-dist/docs/
//   artifacts + relative asset refs, (2) the metafile static-import
//   closure of the docs entry, (3) the initial-shell gzip budget from
//   the budget seam, (4) a static server smoke GET /docs/.
// Rationale: openspec/changes/add-docs-site/specs/distribution-packaging
//   "Docs bundle delivery" is the design authority (relative chunk
//   paths, content behind dynamic imports, recorded baseline, Pages
//   artifact serves /docs/); design.md D6 sets the ceiling at the demo
//   shell's 38.6 KB gzip until measured. The metafile traversal and
//   heavy-lock discipline mirror tests/spa-delivery.test.ts and
//   tests/docs-embeds-chunk.test.ts; the server mirrors tests/e2e/serve.mjs.
//   RED today: build-spa has no docs entry yet, so every assertion
//   fails on demo-dist/docs/ absence — never a module-load crash (no
//   static import of docs sources).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error node:child_process has no type declarations here
import { spawnSync } from "node:child_process";
// @ts-expect-error node:fs has no type declarations here
import { existsSync, readFileSync } from "node:fs";
// @ts-expect-error node:fs/promises has no type declarations here
import { readFile } from "node:fs/promises";
// @ts-expect-error node:http has no type declarations here
import { createServer, get as httpRequest } from "node:http";
// @ts-expect-error node:path has no type declarations here
import { join, resolve } from "node:path";
// @ts-expect-error node:zlib has no type declarations here
import { gzipSync } from "node:zlib";

import { acquireHeavyLock, type HeavyRelease } from "./helpers/heavy-lock.ts";
import { DOCS_SHELL_GZIP_CEILING_BYTES } from "./helpers/docs-delivery-budget.ts";

// demo-dist is a shared wiped tree with the other heavy files: hold
// the heavy lock for this file's whole lifetime (spa-delivery
// precedent) — it rebuilds the demo shell every run.
let heavyRelease: HeavyRelease | undefined;

beforeAll(async () => {
  heavyRelease = await acquireHeavyLock();
  const build = spawnSync("node", ["scripts/build-spa.mjs"], { encoding: "utf8" });
  if (build.status !== 0) {
    throw new Error(`scripts/build-spa.mjs failed: ${build.stderr}`);
  }
}, 420_000);

afterAll(() => heavyRelease?.());

// --- metafile helpers (spa-delivery / docs-embeds-chunk idiom) --------

interface MetaImport {
  readonly path: string;
  readonly external?: boolean;
  readonly kind?: string;
}

interface MetaOutput {
  readonly bytes: number;
  readonly entryPoint?: string;
  readonly imports?: readonly MetaImport[];
  readonly inputs?: Readonly<Record<string, unknown>>;
}

interface MetaFile {
  readonly outputs: Record<string, MetaOutput>;
}

function metafileOutputs(): MetaFile["outputs"] {
  const meta = JSON.parse(readFileSync("demo-dist/meta.json", "utf8")) as MetaFile;
  return meta.outputs;
}

function docsEntryOutput(outputs: MetaFile["outputs"]): string | undefined {
  return Object.keys(outputs).find(
    (path) => outputs[path]?.entryPoint === "src/docs/main.ts",
  );
}

// A static-import edge rides the chunk's closure: locals only, and only
// the eager import-statement kind — dynamic import() edges are the lazy
// path that keeps generated page bodies out of the initial chunk.
function isStaticImport(imp: MetaImport): boolean {
  return (
    imp.external !== true &&
    (imp.kind === undefined || imp.kind === "import-statement")
  );
}

function staticClosure(entry: string, outputs: MetaFile["outputs"]): Set<string> {
  const seen = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const imp of outputs[current]?.imports ?? []) {
      if (isStaticImport(imp) && !seen.has(imp.path)) {
        seen.add(imp.path);
        queue.push(imp.path);
      }
    }
  }
  return seen;
}

// A generated page body — the registry (the loader table) legitimately
// rides the shell, the page modules do not (docs-embeds-chunk split).
function isPageBody(input: string): boolean {
  return (
    input.includes("src/docs/content/generated/") &&
    !input.endsWith("src/docs/content/generated/registry.ts")
  );
}

function initialShellGzipBytes(entry: string, outputs: MetaFile["outputs"]): number {
  const files = [...staticClosure(entry, outputs)];
  let total = 0;
  for (const file of files) {
    total += gzipSync(readFileSync(file)).length;
  }
  return total + gzipSync(readFileSync("demo-dist/docs/index.html")).length;
}

// --- static server (tests/e2e/serve.mjs idiom, rooted at demo-dist) ---

interface HttpRequestLike {
  readonly url?: string;
}

interface HttpResponseLike {
  writeHead(
    status: number,
    headers?: Readonly<Record<string, string>>,
  ): HttpResponseLike;
  end(body?: unknown): void;
}

interface HttpServerResponseLike extends HttpResponseLike {
  readonly statusCode?: number;
  on(event: "data" | "end", listener: (chunk?: unknown) => void): void;
}

function serveDir(root: string): Promise<{ port: number; close: () => Promise<void> }> {
  const server = createServer((req: HttpRequestLike, res: HttpResponseLike) => {
    let rel = decodeURIComponent((req.url ?? "/").split("?")[0]!);
    if (rel.endsWith("/")) rel += "index.html";
    const file = join(root, rel);
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    readFile(file)
      .then((body: unknown) => {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(body);
      })
      .catch(() => {
        res.writeHead(404).end("not found");
      });
  });
  return new Promise((resolvePromise) => {
    server.listen(0, "127.0.0.1", () => {
      resolvePromise({
        port: (server.address() as { port: number }).port,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

function httpGet(
  port: number,
  path: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolvePromise, reject) => {
    const request = httpRequest(
      { host: "127.0.0.1", port, path },
      (res: HttpServerResponseLike) => {
        const chunks: string[] = [];
        res.on("data", (chunk: unknown) => {
          chunks.push(String(chunk));
        });
        res.on("end", () => {
          resolvePromise({ status: res.statusCode ?? 0, body: chunks.join("") });
        });
      },
    );
    request.on("error", reject);
  });
}

// --- the delivery contract ----------------------------------------------

describe("docs delivery — p_docs_artifact_under_docs", () => {
  it("p_docs_artifact: demo-dist/docs/ lands with the docs index and every ref is relative + resolves", () => {
    const indexFile = "demo-dist/docs/index.html";
    expect(
      existsSync(indexFile),
      `${indexFile} built — the docs entry is missing from build-spa`,
    ).toBe(true);
    if (!existsSync(indexFile)) return;
    const html = readFileSync(indexFile, "utf8");
    expect(html).not.toContain("/demo-dist/");
    for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
      const ref = match[1]!;
      if (ref.startsWith("http") || ref.startsWith("#") || ref.startsWith("data:")) {
        continue;
      }
      expect(ref.startsWith("/"), `host-rooted ref ${ref} breaks under a /docs/ base`).toBe(
        false,
      );
      if (ref.startsWith(".")) {
        expect(
          existsSync(resolve("demo-dist/docs", ref)),
          `docs ref ${ref} does not resolve on disk`,
        ).toBe(true);
      }
    }
  });
});

describe("docs delivery — p_docs_pages_split_out_of_initial_chunk", () => {
  it("p_docs_pages_split: no generated page body rides the docs entry's static closure; pages ride lazy chunks", () => {
    const outputs = metafileOutputs();
    const entry = docsEntryOutput(outputs);
    expect(entry, "docs entry output in demo-dist/meta.json — build-spa has no docs entry").toBeTruthy();
    if (entry === undefined) return;
    const closure = staticClosure(entry, outputs);
    for (const outputPath of closure) {
      for (const input of Object.keys(outputs[outputPath]?.inputs ?? {})) {
        expect(
          isPageBody(input),
          `page body ${input} rides the initial docs chunk (via ${outputPath})`,
        ).toBe(false);
      }
    }
    const lazyPageChunks = Object.entries(outputs).filter(
      ([path, out]) =>
        !closure.has(path) &&
        Object.keys(out.inputs ?? {}).some((input) => isPageBody(input)),
    );
    expect(
      lazyPageChunks.length,
      "no lazy chunk carries a generated page — the content boundary is missing",
    ).toBeGreaterThan(0);
  });
});

describe("docs delivery — p_docs_initial_shell_stays_in_budget", () => {
  it("p_docs_shell_budget: initial docs shell gzip (entry + static closure + docs index.html) stays within the declared ceiling", () => {
    const outputs = metafileOutputs();
    const entry = docsEntryOutput(outputs);
    expect(entry, "docs entry output in demo-dist/meta.json").toBeTruthy();
    if (entry === undefined) return;
    expect(initialShellGzipBytes(entry, outputs)).toBeLessThanOrEqual(
      DOCS_SHELL_GZIP_CEILING_BYTES,
    );
  });
});

describe("docs delivery — p_docs_index_serves_at_docs_path", () => {
  it("p_docs_serve_smoke: a static server over demo-dist serves /docs/ with the docs index", async () => {
    const { port, close } = await serveDir("demo-dist");
    try {
      const response = await httpGet(port, "/docs/");
      expect(response.status).toBe(200);
      expect(response.body).toContain("<html");
    } finally {
      await close();
    }
  });
});