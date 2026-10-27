#!/usr/bin/env node
// Purpose: the demo SPA build (tambor-dfk, add-spa-delivery) — bundles
//   the gallery entry, the service worker and the two demo workers into
//   demo-dist/ with minification and per-example code splitting, then
//   emits the PWA shell artifacts (web manifest, icon, asset manifest,
//   shell index.html) from the esbuild metafile.
// Responsibilities: one esbuild API invocation per pass (minified, ESM,
//   splitting with content-hashed chunk names, stable entry names);
//   write manifest.webmanifest + icon.svg + asset-manifest.json +
//   demo-dist/index.html (root index.html with the bundle path rewritten
//   and the manifest link injected); print the shipped-size summary.
// Rationale: openspec/changes/add-spa-delivery is the design authority
//   (D1 minify everywhere, D2 dynamic import boundaries at the example
//   registry, D3 network-first navigation / cache-first hashed assets).
//   demo-dist/ is outside the npm files allowlist (dist/) — PWA
//   artifacts are demo-shell concerns, never package artifacts. No new
//   dependencies: esbuild is an existing devDependency.

import { build } from "esbuild";
import { readFileSync, writeFileSync, rmSync } from "node:fs";

const OUTDIR = "demo-dist";

rmSync(OUTDIR, { recursive: true, force: true });
// migration + hygiene: the pre-add-spa-delivery CLI build dropped bundles
// into dist/ (inside the npm files allowlist) — a stale one would ship in
// the tarball. The library emit owns dist/; demo artifacts live here.
for (const stale of [
  "dist/spa.js",
  "dist/worker.js",
  "dist/notebook-worker.js",
  "dist/meta.json",
]) {
  rmSync(stale, { force: true });
}

const result = await build({
  // explicit out labels: the two worker entries share the basename
  // worker.ts — [name] would collide them onto demo-dist/worker.js
  entryPoints: [
    { in: "src/spa/main.ts", out: "spa" },
    { in: "src/spa/sw.ts", out: "sw" },
    { in: "src/examples/logo/worker.ts", out: "worker" },
    { in: "src/examples/notebook/worker.ts", out: "notebook-worker" },
  ],
  outdir: OUTDIR,
  bundle: true,
  format: "esm",
  splitting: true,
  minify: true,
  // stable entry names — index.html and the worker clients reference
  // ./spa.js, ./worker.js, ./notebook-worker.js; chunks carry the
  // content hashes (cache-first assets)
  entryNames: "[name]",
  chunkNames: "chunks/[name]-[hash]",
  metafile: true,
  logLevel: "silent",
});

const outputs = result.metafile.outputs;

// asset manifest: the URL list the service worker precaches; the bytes
// feed the content-derived cache version (src/spa/sw.ts cacheNameFor).
// JS outputs come from the metafile; the shell artifacts are written
// below and measured from disk so every entry carries real bytes.
const jsAssets = Object.entries(outputs)
  .filter(([path]) => path.startsWith(`${OUTDIR}/`) && path.endsWith(".js"))
  .map(([path, out]) => ({
    url: `./${path.slice(OUTDIR.length + 1)}`,
    bytes: out.bytes,
  }));

const manifest = {
  name: "tambor — gallery",
  short_name: "tambor",
  description:
    "Interactive demos of tambor, a strict-TypeScript mobile-first UI library — every element drawn by the corpus DomBackend.",
  start_url: "./",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: "#1a1a2e",
  icons: [{ src: "./icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
};
const manifestJson = JSON.stringify(manifest, null, 2);
writeFileSync(`${OUTDIR}/manifest.webmanifest`, manifestJson);

writeFileSync(
  `${OUTDIR}/icon.svg`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" rx="12" fill="#1a1a2e"/>` +
    `<path d="M12 44 L32 14 L52 44" fill="none" stroke="#7dd3fc" stroke-width="6" ` +
    `stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="32" cy="14" r="5" fill="#f87171"/></svg>`,
);

// the shell page: the root index.html with the bundle path rewritten to
// the shell-local one and the manifest link injected
const root = readFileSync("index.html", "utf8");
const shell = root
  .replace(
    `./${OUTDIR}/spa.js`,
    "./spa.js",
  )
  .replace(
    '<meta name="viewport"',
    '<link rel="manifest" href="./manifest.webmanifest" />\n    <meta name="theme-color" content="#1a1a2e" />\n    <meta name="viewport"',
  );
if (shell === root) {
  throw new Error("shell rewrite matched nothing — root index.html drifted");
}
writeFileSync(`${OUTDIR}/index.html`, shell);

const assets = [
  ...jsAssets,
  { url: "./index.html", bytes: Buffer.byteLength(shell) },
  { url: "./manifest.webmanifest", bytes: Buffer.byteLength(manifestJson) },
];
writeFileSync(
  `${OUTDIR}/asset-manifest.json`,
  JSON.stringify(assets, null, 2),
);

const totalKb =
  Object.values(outputs).reduce((sum, out) => sum + out.bytes, 0) / 1024;
// the metafile is the docs stamp's size source (tools/stamp-docs.sh) and
// the chunk-graph contract's fixture (tests/spa-delivery.test.ts)
writeFileSync(`${OUTDIR}/meta.json`, JSON.stringify(result.metafile));
const chunkCount = Object.keys(outputs).filter((p) => p.includes("/chunks/")).length;
console.log(
  `spa build: ${Object.keys(outputs).length} outputs (${chunkCount} chunks), ${totalKb.toFixed(1)} kB total`,
);
