// Purpose: shared spawned-tsc drivers for the typing-model contract
//   tests — running the TypeScript compiler over the library or over
//   generated fixtures and asserting on the reported diagnostics.
// Responsibilities: runTsc shells out to tsc with explicit args and
//   captures the exit code plus diagnostics text; fixture writes a
//   fixture module under target/typing-fixtures and returns its path;
//   STRICT_FLAGS is the strict-flag set the typing.model
//   strict_compiler row lists, as CLI flags for fixture runs.
// Rationale: openspec/specs/typing-model/spec.md is the design authority; tambor-272
//   redistributed the monolithic tests/typing-model.test.ts into topic
//   files, and every spawned-tsc test (p_strict, p_no_any, p_core_dom,
//   p_union, p_type_tests, p_esm) shares these drivers. The Node
//   builtins are typed at the use site — @types/node is not a project
//   dependency (typing.model: no any in public signatures; these are
//   test-local pins).

// @ts-expect-error node:child_process has no type declarations here
import { execSync } from "node:child_process";
// @ts-expect-error node:fs has no type declarations here
import { mkdirSync, writeFileSync } from "node:fs";

// A helper spawn: run tsc with explicit args, capture diagnostics.
export function runTsc(args: string): { code: number; out: string } {
  try {
    execSync(`npx tsc ${args}`, { stdio: "pipe" });
    return { code: 0, out: "" };
  } catch (e) {
    const err = e as { status?: number; stdout?: unknown; stderr?: unknown };
    const out = `${String(err.stdout ?? "")}${String(err.stderr ?? "")}`;
    return { code: err.status ?? 1, out };
  }
}

// Write a fixture under target/ and return its path. Imports inside
// fixtures reach src via ../../src/ (relative to the fixture dir).
export function fixture(name: string, source: string): string {
  mkdirSync("target/typing-fixtures", { recursive: true });
  const file = `target/typing-fixtures/${name}.ts`;
  writeFileSync(file, source);
  return file;
}

// The strict-flag set the typing.model strict_compiler row lists, as
// CLI flags for fixture runs (the project tsconfig carries the same
// set for the library itself).
export const STRICT_FLAGS =
  "--noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes " +
  "--noImplicitOverride --target ES2022 --module ESNext --moduleResolution bundler " +
  "--lib ES2022 --allowImportingTsExtensions --skipLibCheck --pretty false";
