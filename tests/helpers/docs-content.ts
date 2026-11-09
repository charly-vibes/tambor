// Purpose: the SINGLE home for the docs build-time content
//   regeneration (add-docs-site B-0x review resolution) — the
//   copy-pasted regen block that used to open every docs-*.test.ts:
//   spawn tools/gen_docs_content.py over the corpus into the
//   gitignored generated dir (fresh checkouts have none until
//   build-spa runs), strict — any non-zero exit throws.
// Responsibilities: regenerateDocsContent() — one idempotent call a
//   test file makes at module top-level BEFORE its dynamic imports
//   (static imports would hoist past the generation; the docs-shell
//   precedent). Shared by every docs test suite AND the docs-delivery
//   suite, so a generator change behind the invocation stays pinned in
//   the same contract everywhere it runs.
// Rationale: A-DRAFT-ish dedup — the block was identical across
//   eight files and drifted (one accepted a non-zero exit silently);
//   one helper keeps the STRICT semantics in one place.

// @ts-expect-error node builtin (tsconfig types exclude node)
import { spawnSync } from "node:child_process";
// @ts-expect-error node builtin (tsconfig types exclude node)
import { resolve } from "node:path";

const TOOL = resolve("tools/gen_docs_content.py");
const CORPUS = resolve("openspec/specs");
const GENERATED = resolve("src/docs/content/generated");

// Generate the build-time content (atomic publication — the generator
// owns its out dir) and fail loud on any non-zero exit; the strict
// variant, so a silent generator failure never seeds the tests.
export function regenerateDocsContent(): void {
  const gen = spawnSync(
    "python3",
    [TOOL, "--corpus", CORPUS, "--out", GENERATED],
    { encoding: "utf8" },
  );
  if (gen.status !== 0) throw new Error(`content generator failed: ${gen.stderr}`);
}