#!/usr/bin/env node
// Purpose: the docs content check (add-docs-site task 9.2) — the
//   build-time gate over the curated guides + generated registry:
//   every page declares a journey group (checkGroups), every guide
//   link is a typed page id resolving against the registry ∪ the other
//   guide ids or a well-formed external http(s) URL (checkGuideLinks),
//   and the well-formed URLs land in a link inventory
//   (build/docs-link-inventory.json) for CI verification. With
//   --verify the tool additionally fetches every inventory URL — the
//   CI-only networked step; the build itself stays offline-safe (D8).
// Responsibilities: import the TS data modules through node's native
//   type stripping (node ≥ 23.6, unflagged; CI pins node 24); fail
//   loud naming the check that broke; write the deduped/sorted
//   inventory JSON; with --verify, HEAD-fetch each URL (GET fallback
//   for 405s) under a bounded timeout with one retry, naming the URL
//   and its guides on failure. --guides and --out override the module
//   and destination for the fixture-driven suite.
// Rationale: openspec/changes/add-docs-site design D2/D8 — guides are
//   typed TS data modules the check consumes directly (no new link
//   syntax or loader); the typed-id graph eliminates internal link rot
//   by construction while external URLs are deterministically extracted
//   into an inventory CI can verify without the build ever touching the
//   network.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
// Node type stripping (default since 23.6): .ts imports with explicit
// extensions, erasable syntax only.
import { checkGroups, checkGuideLinks } from "../src/docs/content/check.ts";
import { generatedPages } from "../src/docs/content/generated/registry.ts";
import { guides } from "../src/docs/content/guides.ts";

// The one generated module everything assumes exists — fail loud with
// the fix when the content generator has not run yet.
if (!existsSync(resolve("src/docs/content/generated/registry.ts"))) {
  throw new Error(
    "docs content check: generated registry missing — run tools/gen_docs_content.py first",
  );
}

// --- argument parsing ---------------------------------------------------

function parseArgs(argv) {
  const opts = { out: "build/docs-link-inventory.json", verify: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--verify") {
      opts.verify = true;
    } else if (arg === "--guides" || arg === "--out") {
      opts[arg.slice(2)] = argv[++i];
      if (opts[arg.slice(2)] === undefined) {
        throw new Error(`docs content check: ${arg} needs a value`);
      }
    } else {
      throw new Error(`docs content check: unknown argument ${arg}`);
    }
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

// The guide registry to check: the real one by default, a fixture
// module when the suite says so (--guides names a .ts module path).
const guidePages =
  opts.guides !== undefined
    ? (await import(pathToFileURL(resolve(opts.guides)).href)).guides
    : guides;

// --- checks --------------------------------------------------------------

const generated = generatedPages.map((p) => ({ name: p.name, group: p.group }));
const guideNames = guidePages.map((p) => ({ name: p.id, group: p.group }));
checkGroups([...generated, ...guideNames]);
const inventory = checkGuideLinks(
  guidePages,
  generatedPages.map((p) => p.id),
);

// --- inventory ------------------------------------------------------------

const out = resolve(opts.out);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(
  `docs content check: ${guidePages.length} guide(s) checked, ${inventory.links.length} external URL(s) in inventory -> ${out}`,
);

// --- live verification (CI only) -----------------------------------------

// HEAD a URL (GET fallback for servers that 405 HEAD) with a bounded
// timeout and one retry — a target that flakes red names itself.
async function urlResolves(url, attempt = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    if (res.status === 405) {
      const res2 = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      });
      return res2.status < 400;
    }
    return res.status < 400;
  } catch {
    if (attempt < 1) return urlResolves(url, attempt + 1);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function verifyLinks(entries) {
  for (const entry of entries) {
    const ok = await urlResolves(entry.url);
    if (!ok) {
      console.error(
        `docs content check: external URL failed verification: ${entry.url} (guides: ${entry.guides.join(", ")})`,
      );
      process.exitCode = 1;
    }
  }
}

if (opts.verify) {
  await verifyLinks(inventory.links);
  if (process.exitCode === 1) {
    throw new Error(
      "docs content check: one or more inventory URLs failed live verification",
    );
  }
}