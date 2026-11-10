// Purpose: the Pages staging script (add-docs-site D6) — builds the
//   artifact root the workflow uploads, and LIFTS the docs site to the
//   site root so /docs/ serves the docs index (the scenario the
//   delivery spec promises; the pre-lift layout only served it under
//   /demo-dist/docs/).
// Responsibilities: copy the verbatim site (index.html, demo-dist/ —
//   the untouched add-spa-delivery layout, ai/), then stage docs/ at
//   the artifact root: shell + entry + docs-OWNED chunks. Every chunk
//   ref in the staged entry is repointed: docs-owned chunks ride
//   ./chunks/ next to the entry, shared/gallery chunks resolve back
//   into /demo-dist/chunks/ (../demo-dist/…), which is also where the
//   untouched dynamic edges of lifted page-body chunks land at runtime.
// Rationale: demo-dist/ stays byte-identical (npm tarball, spa
//   contracts, SW precache all see the build layout, never the staging
//   layout); only the entry's literal refs are rewritten, and the
//   rewrite is staging-only. The lifted set follows BOTH static and
//   dynamic edges from the docs entry (page bodies are dynamic targets
//   that must come along, or their ./chunks/-relative siblings would
//   miss); chunks shared with the gallery stay verbatim under
//   /demo-dist/ and the entry reaches them via ../demo-dist/chunks/.
//   OUT env overrides the
//   artifact dir for tests (default _pages, workflow call unchanged).

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const OUT = process.env.OUT ?? "_pages";
const DIST = "demo-dist";
const DOCS_ENTRY_POINT = "src/docs/main.ts";
// "../chunks/X" and "./chunks/X" spellings (import AND URL contexts),
// one capture group around the chunk name.
const CHUNK_REF = /"(?:\.\.+|[.])\/chunks\/([^"]+)"/g;

function fail(msg) {
  console.error(`stage-pages: ${msg}`);
  process.exit(1);
}

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else copyFileSync(from, to);
  }
}

if (!existsSync(join(DIST, "meta.json"))) {
  fail("run build:spa first — demo-dist/meta.json missing");
}

// 1. The verbatim site (the workflow's previous staging, in one place).
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
copyFileSync("index.html", join(OUT, "index.html"));
copyDir(DIST, join(OUT, DIST));
if (existsSync("ai")) copyDir("ai", join(OUT, "ai"));

// 2. Lift the docs site to /docs/: shell + entry + docs-owned chunks.
const meta = JSON.parse(readFileSync(join(DIST, "meta.json"), "utf8"));
const outputs = meta.outputs;
const entryKey = keyWhere(outputs, (o) => o.entryPoint === DOCS_ENTRY_POINT);
if (entryKey === undefined) fail("no docs entry in the metafile");
const gallery = galleryClosure(outputs);
const owned = new Set(
  closureOf(entryKey, outputs)
    .filter((key) => isChunk(key) && !gallery.has(key))
    .map(shortName),
);

const docsOut = join(OUT, "docs");
mkdirSync(docsOut, { recursive: true });
copyFileSync(join(DIST, "docs/index.html"), join(docsOut, "index.html"));
if (owned.size > 0) {
  mkdirSync(join(docsOut, "chunks"), { recursive: true });
  for (const name of owned) {
    copyFileSync(join(DIST, "chunks", name), join(docsOut, "chunks", name));
  }
}const rewritten = rewriteEntryRefs(readFileSync(entryKey, "utf8"), owned);
assertAllRefsCopied(rewritten, owned, docsOut);
writeFileSync(join(docsOut, "main.js"), rewritten);
console.log(
  `stage-pages: ${OUT}/ — docs lifted at /docs/ (${owned.size} owned chunks; ` +
    `${count(rewritten, /"\/?\.\/chunks\//g)} local refs, ` +
    `${count(rewritten, /"\.\.\/demo-dist\/chunks\//g)} back-refs to demo-dist)`,
);

// ── chunk graph helpers ───────────────────────────────────────────────
function keyWhere(outputs, pred) {
  return Object.keys(outputs).find((key) => pred(outputs[key]));
}

// Static AND dynamic closure over metafile outputs: the docs entry's
// page bodies ride dynamic edges and must be lifted with their refs,
// or a lazy import from /docs/main.js would fetch a /demo-dist/ chunk
// whose sibling-relative imports point at unlifted docs bodies.
function closureOf(startKey, outputs) {
  const seen = new Set([startKey]);
  const stack = [startKey];
  while (stack.length > 0) {
    const key = stack.pop();
    for (const imp of outputs[key]?.imports ?? []) {
      if (imp.external === true) continue;
      if (!seen.has(imp.path)) {
        seen.add(imp.path);
        stack.push(imp.path);
      }
    }
  }
  return [...seen];
}

// Chunks reachable STATICALLY from any NON-docs js entry (gallery,
// workers, sw): they must keep serving from /demo-dist/ verbatim.
function galleryClosure(outputs) {
  const set = new Set();
  const docsKey = keyWhere(outputs, (o) => o.entryPoint === DOCS_ENTRY_POINT);
  for (const key of Object.keys(outputs)) {
    const o = outputs[key];
    if (o.entryPoint === undefined || key === docsKey) continue;
    if (!String(o.kind).startsWith("js")) continue;
    for (const reached of staticClosure(key, outputs)) set.add(reached);
  }
  return set;
}

function staticClosure(startKey, outputs) {
  const seen = new Set([startKey]);
  const stack = [startKey];
  while (stack.length > 0) {
    const key = stack.pop();
    for (const imp of outputs[key]?.imports ?? []) {
      if (imp.external === true || imp.kind !== "import-statement") continue;
      if (!seen.has(imp.path)) {
        seen.add(imp.path);
        stack.push(imp.path);
      }
    }
  }
  return [...seen];
}

function isChunk(key) {
  return key.startsWith(`${DIST}/chunks/`);
}

function shortName(key) {
  return key.slice(`${DIST}/chunks/`.length);
}

// ── entry ref rewrite ─────────────────────────────────────────────────
function rewriteEntryRefs(text, owned) {
  return text.replace(CHUNK_REF, (whole, name) =>
    owned.has(name) ? `"./chunks/${name}"` : `"../demo-dist/chunks/${name}"`,
  );
}

function count(text, re) {
  return (text.match(re) ?? []).length;
}

// Fail loud if a ref names a chunk neither lifted locally nor present
// under the artifact's demo-dist (a closure bug would ship a 404).
function assertAllRefsCopied(text, owned, docsDir) {
  for (const match of text.matchAll(/"(?:[.][.]+|[.])\/(?:demo-dist\/)?chunks\/([^"]+)"/g)) {
    const name = match[1];
    const local = owned.has(name) && existsSync(join(docsDir, "chunks", name));
    const backRef = existsSync(join(OUT, DIST, "chunks", name));
    if (!local && !backRef) fail(`staged entry refs an absent chunk: ${name}`);
  }
}
