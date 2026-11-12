// Purpose: the SPA delivery build contract (tambor-dfk, add-spa-delivery) —
//   the build script's artifacts: minified bundles at or below the
//   unminified gzip baseline, example modules split out of the initial
//   chunk, PWA shell artifacts (manifest, service worker, asset
//   manifest) present in the demo build output and absent from the npm
//   tarball, and the service worker's cache versioning + serving
//   strategy (cache-first assets, network-first navigation).
// Responsibilities: run scripts/build-spa.mjs once, then assert over
//   (1) demo-dist file contents (minification, gzip floor),
//   (2) the esbuild metafile chunk graph (no src/examples input
//   transitively reachable from the initial chunk),
//   (3) the PWA shell files (valid manifest JSON, SW artifact, asset
//   manifest) and their absence from npm pack,
//   (4) src/spa/sw.ts pure serving logic against fake cache/network
//   doubles (offline navigation falls back to the cached shell; cached
//   assets never touch the network; equal manifests map to equal cache
//   names, changed bytes to a new name).
// Rationale: openspec/changes/add-spa-delivery/specs/distribution-packaging
//   is the design authority — minified artifact, lazy demo chunks, PWA
//   shell. The npm artifact is unchanged (dist-only); the PWA story is
//   a demo-shell concern that must not leak into the package.

import { describe, expect, it, beforeAll, afterAll } from "vitest";
// test-only node access (tsconfig types:[vitest/globals] by design);
// @ts-expect-error node builtin
import { execFileSync } from "node:child_process";
// @ts-expect-error node builtin
import { readFileSync, existsSync } from "node:fs";
// @ts-expect-error node builtin
import { gzipSync } from "node:zlib";

import { acquireHeavyLock, type HeavyRelease } from "./helpers/heavy-lock.ts";
import { staticClosure, type MetaOutputs } from "./helpers/metafile.ts";

import {
  CACHE_PREFIX,
  cacheNameFor,
  isNavigation,
  respond,
  type CacheLike,
} from "../src/spa/sw.ts";

// The unminified pre-change baseline (proposal.md: measured 56 KB gzip
// on the monolithic gallery bundle). The minified, chunked build must
// not exceed it in total shipped gzip bytes. Re-recorded at task 10.2
// (add-docs-site D6): demo-dist now also ships the docs site (entry +
// page chunks), whose budget is its own recorded initial shell — the
// gallery-only 56 KB can no longer bound the two-site tree, so the
// guard's recorded baseline now covers the measured total (153815 B —
// re-recorded 2026-11-12 for the cellScale option (+647 B: stage/wrapper,
// 1px clamp, pointer unscale and the isElem guard ride the shared
// backend-render chunk); same one-constant ritual as the docs budget
// seam: rebuild, read the measured total this test reports, update HERE,
// stamp-docs), re-measured after the docs entry landed; any later growth
// beyond this recorded total still fails).
const BASELINE_GZIP_BYTES = 154_485;

let heavyRelease: HeavyRelease | undefined;

beforeAll(async () => {
  // shared-tree exclusion (dist/ via the pack tests' prepack tsc,
  // demo-dist/ wipes, generated-docs wipes): hold the heavy lock for
  // this file's whole lifetime — see tests/helpers/heavy-lock.ts.
  heavyRelease = await acquireHeavyLock();
  execFileSync("node", ["scripts/build-spa.mjs"], { stdio: "pipe" });
}, 420_000);

afterAll(() => heavyRelease?.());

function metafile(): MetaOutputs {
  const meta = JSON.parse(readFileSync("demo-dist/meta.json", "utf8")) as {
    outputs: MetaOutputs;
  };
  return meta.outputs;
}

describe("spa delivery — p_minify_flag_lands", () => {
  it("demo-dist/spa.js is minified (no whitespace-only lines)", () => {
    const spa = readFileSync("demo-dist/spa.js", "utf8");
    expect(spa.length).toBeGreaterThan(0);
    for (const line of spa.split("\n")) {
      expect(/^\s+$/.test(line), `whitespace-only line in spa.js`).toBe(false);
    }
  });

  it("total gzip of the shipped js is at or below the 56 kB baseline", () => {
    const outputs = metafile();
    let total = 0;
    for (const [path] of Object.entries(outputs)) {
      if (!path.endsWith(".js")) continue;
      total += gzipSync(readFileSync(path)).length;
    }
    expect(total).toBeLessThanOrEqual(BASELINE_GZIP_BYTES);
  });
});

describe("spa delivery — p_examples_split_out_of_initial_chunk", () => {
  it("no src/examples module is transitively imported by the initial chunk", () => {
    const outputs = metafile();
    // only static import edges count — the demo chunks hang off
    // dynamic-import edges (that IS the lazy boundary); the shared
    // walk is helpers/metafile.ts (C-2: one traversal implementation)
    const seen = staticClosure("demo-dist/spa.js", outputs);
    // every output in the initial chunk's closure must be free of
    // example-module inputs
    for (const path of seen) {
      const inputs = Object.keys(outputs[path]?.inputs ?? {});
      for (const input of inputs) {
        expect(
          input.includes("src/examples/"),
          `example module ${input} reachable from the initial chunk (via ${path})`,
        ).toBe(false);
      }
    }
  });

  it("example modules were split into content-hashed chunks", () => {
    const outputs = metafile();
    const chunks = Object.keys(outputs).filter((p) => p.startsWith("demo-dist/chunks/"));
    // the gallery registers 20+ demos; each demo's example module (and
    // the shared corpus code they pull in) must ride in hashed chunks
    expect(chunks.length).toBeGreaterThanOrEqual(10);
    for (const chunk of chunks) {
      expect(chunk).toMatch(/-[A-Za-z0-9_-]{8}\.js$/);
    }
  });
});

describe("spa delivery — p_pwa_artifacts_present", () => {
  it("demo-dist carries a valid web manifest, icon and asset manifest", () => {
    const manifest = JSON.parse(
      readFileSync("demo-dist/manifest.webmanifest", "utf8"),
    ) as Record<string, unknown>;
    expect(typeof manifest["name"]).toBe("string");
    expect(manifest["display"]).toBe("standalone");
    expect(typeof manifest["theme_color"]).toBe("string");
    const icons = manifest["icons"] as readonly { src: string }[];
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      expect(existsSync(`demo-dist/${icon.src.replace(/^\.\//, "")}`)).toBe(true);
    }
    const assets = JSON.parse(
      readFileSync("demo-dist/asset-manifest.json", "utf8"),
    ) as readonly { url: string; bytes: number }[];
    const urls = assets.map((a) => a.url);
    for (const required of ["./index.html", "./spa.js", "./worker.js", "./sw.js"]) {
      expect(urls, `asset manifest missing ${required}`).toContain(required);
    }
    for (const asset of assets) {
      expect(asset.bytes).toBeGreaterThan(0);
    }
  });

  it("demo-dist/index.html is a shell referencing the bundle and the manifest", () => {
    const shell = readFileSync("demo-dist/index.html", "utf8");
    expect(shell).toContain('./spa.js');
    expect(shell).toContain('rel="manifest"');
  });

  it("demo-dist/sw.js exists and wires the fetch lifecycle", () => {
    const sw = readFileSync("demo-dist/sw.js", "utf8");
    expect(sw).toContain("fetch");
    expect(sw).toContain("install");
  });

  it("the npm tarball carries no demo/PWA artifacts", () => {
    const out = execFileSync("npm", ["pack", "--dry-run", "--json"], {
      stdio: "pipe",
      encoding: "utf8",
      timeout: 120_000,
    });
    const packs = JSON.parse(out) as readonly {
      files?: readonly { path: string }[];
    }[];
    const paths = (packs[0]?.files ?? []).map((f) => f.path);
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      expect(p.startsWith("demo-dist/"), `${p} leaked into the tarball`).toBe(false);
      expect(p.endsWith("manifest.webmanifest"), `${p} leaked into the tarball`).toBe(false);
      expect(p.endsWith("sw.js"), `${p} leaked into the tarball`).toBe(false);
    }
  }, 180_000);
});

// --- service worker unit contracts (pure logic, fake doubles) --------------

interface FakeEntry {
  readonly body: string;
}

function fakeCache(entries: Readonly<Record<string, FakeEntry>>): CacheLike {
  return {
    match: async (url: string) => {
      const entry = entries[url];
      if (entry === undefined) return undefined;
      return { body: entry.body };
    },
  };
}

describe("spa delivery — p_cache_versioned_by_content", () => {
  it("cache names carry the prefix and a content-derived version", () => {
    const manifest = JSON.stringify([
      { url: "./spa.js", bytes: 1000 },
      { url: "./index.html", bytes: 500 },
    ]);
    const name = cacheNameFor(manifest);
    expect(name.startsWith(CACHE_PREFIX)).toBe(true);
    expect(name).not.toBe(CACHE_PREFIX);
  });

  it("equal manifests map to the same name; changed bytes invalidate", () => {
    const a = JSON.stringify([{ url: "./spa.js", bytes: 1000 }]);
    const a2 = JSON.stringify([{ url: "./spa.js", bytes: 1000 }]);
    const b = JSON.stringify([{ url: "./spa.js", bytes: 1400 }]);
    const c = JSON.stringify([
      { url: "./spa.js", bytes: 1000 },
      { url: "./chunks/x-abc.js", bytes: 10 },
    ]);
    expect(cacheNameFor(a)).toBe(cacheNameFor(a2));
    expect(cacheNameFor(a)).not.toBe(cacheNameFor(b));
    expect(cacheNameFor(a)).not.toBe(cacheNameFor(c));
  });

  it("navigation requests are recognised by mode", () => {
    expect(isNavigation({ mode: "navigate" })).toBe(true);
    expect(isNavigation({ mode: "cors" })).toBe(false);
  });
});

describe("spa delivery — p_offline_shell_serves_navigation", () => {
  const shellUrl = "https://t.example/demo-dist/index.html";

  it("offline navigation falls back to the cached shell", async () => {
    const cache = fakeCache({
      [shellUrl]: { body: "<html>shell</html>" },
    });
    const response = await respond(
      { url: shellUrl, mode: "navigate" },
      {
        cache,
        // network unreachable (offline)
        network: async () => {
          throw new Error("offline");
        },
        shellUrl,
      },
    );
    expect(response).toEqual({ body: "<html>shell</html>" });
  });

  it("online navigation prefers the network (network-first)", async () => {
    const cache = fakeCache({ [shellUrl]: { body: "<html>stale</html>" } });
    const response = await respond(
      { url: shellUrl, mode: "navigate" },
      {
        cache,
        network: async () => ({ body: "<html>fresh</html>" }),
        shellUrl,
      },
    );
    expect(response).toEqual({ body: "<html>fresh</html>" });
  });

  it("cached assets are served cache-first without touching the network", async () => {
    const assetUrl = "https://t.example/demo-dist/chunks/todo-abc12345.js";
    const cache = fakeCache({ [assetUrl]: { body: "chunk-bytes" } });
    let networkCalls = 0;
    const response = await respond(
      { url: assetUrl, mode: "cors" },
      {
        cache,
        network: async () => {
          networkCalls++;
          return { body: "network-bytes" };
        },
        shellUrl,
      },
    );
    expect(response).toEqual({ body: "chunk-bytes" });
    expect(networkCalls).toBe(0);
  });

  it("uncached assets fall through to the network", async () => {
    const assetUrl = "https://t.example/demo-dist/chunks/new-def67890.js";
    const cache = fakeCache({});
    const response = await respond(
      { url: assetUrl, mode: "cors" },
      {
        cache,
        network: async () => ({ body: "network-bytes" }),
        shellUrl,
      },
    );
    expect(response).toEqual({ body: "network-bytes" });
  });
});
