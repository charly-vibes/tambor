// Purpose: executable contract tests for the typing.model spec — the
//   spawned-tsc gates (strict compilation over the library, no-any
//   scan of the emitted declarations, core-without-DOM, node-union
//   exhaustiveness, the deliberate type-gate break, and ESM
//   packaging / tree-shaking).
// Responsibilities: encode each converted row's generator and
//   predicate as a vitest test that drives the TypeScript compiler
//   (via tests/helpers/tsc.ts) or the bundler and asserts on its
//   output.
// Rationale: specs/typing-model.md is the design authority;
//   tambor-272 redistributed the monolithic tests/typing-model.test.ts
//   into topic files, keeping every it name byte-identical for the
//   --testNamePattern contract bindings.

import { expect, it } from "vitest";
// @ts-expect-error node:child_process has no type declarations here
import { execSync } from "node:child_process";
import { fixture, runTsc, STRICT_FLAGS } from "./helpers/tsc.ts";

// p_strict — derives_from: typing.model.strict_compiler
// generator: tsc over the library with the listed flags — predicate:
// zero diagnostics
it("p_strict: tsc strict flags over the library give zero diagnostics", () => {
  const { code, out } = runTsc("-p tsconfig.json --noEmit");
  expect(out, out).toBe("");
  expect(code).toBe(0);
});

// p_no_any — derives_from: typing.model.no_any_public
// generator: scan the emitted declaration files — predicate: no
// exported symbol mentions any
it("p_no_any: no exported symbol in the emitted declarations mentions any", () => {
  // the declarations of the library (src/ only — the tests import test
  // tooling whose own types are out of scope)
  runTsc(
    "-p tsconfig.json --noEmit false --declaration --emitDeclarationOnly " +
      "--outDir target/typing-dts",
  );
  const listing = execSync("find target/typing-dts/src -name '*.d.ts'")
    .toString()
    .split("\n")
    .filter((f: string) => f.length > 0);
  expect(listing.length).toBeGreaterThan(0);
  for (const file of listing) {
    expectDeclarationMentionsNoAny(file);
  }
});

// One declaration file's stripped signatures mention no any.
function expectDeclarationMentionsNoAny(file: string): void {
  const source = execSync(`cat ${file}`).toString();
  // strip comments: only signatures are scanned
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*/g, "");
  const hits = stripped.match(/\bany\b/);
  expect(hits, `${file} mentions any: ${stripped.slice(0, 200)}`).toBeNull();
}

// p_core_dom — derives_from: typing.model.core_without_dom
// generator: add document to a core file — predicate: tsc reports an
// error
it("p_core_dom: a document reference in core fails to compile", () => {
  const file = fixture(
    "core-dom",
    `import { rectangle } from "../../src/views/model.ts";
const el = rectangle(10, 10);
const d = document;`,
  );
  const { code, out } = runTsc(`${STRICT_FLAGS} ${file}`);
  expect(code).not.toBe(0);
  expect(out).toContain("document");
});

// p_union — derives_from: typing.model.node_union
// generator: a switch missing the Scale case — predicate: tsc reports
// an error on the never check
it("p_union: a switch missing a case of the node union errors on the never check", () => {
  // The spine's Node union has no Scale port (membrane.ui's Scale is
  // not among the node types the spine landed); the exhaustiveness
  // mechanics are identical for any union member, so the generator's
  // missing case is the union's "checkbox".
  const file = fixture(
    "union-missing-case",
    `import type { Node } from "../../src/views/model.ts";
function describe(node: Node): string {
  switch (node.type) {
    case "label":
      return node.text;
    case "rectangle":
      return "rect";
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}`,
  );
  const { code, out } = runTsc(`${STRICT_FLAGS} ${file}`);
  expect(code).not.toBe(0);
  expect(out).toContain("never");
});

// p_type_tests — derives_from: typing.model.type_tests_in_ci
// generator: break a type on purpose — predicate: the CI type-test
// job fails
it("p_type_tests: a deliberately broken expectTypeOf pin fails the type gate", () => {
  const file = fixture(
    "broken-pin",
    `import { expectTypeOf } from "vitest";
expectTypeOf<number>().toEqualTypeOf<string>();`,
  );
  const { code, out } = runTsc(`${STRICT_FLAGS} ${file}`);
  expect(code).not.toBe(0);
  expect(out.length).toBeGreaterThan(0);
});

// p_esm — derives_from: typing.model.esm_with_declarations
// generator: import one component into a bundler — predicate: unused
// components are absent from the bundle
it("p_esm: importing one component into a bundler tree-shakes the unused ones", () => {
  // the package is ESM and ships declaration files
  const pkg = JSON.parse(execSync("cat package.json").toString()) as {
    type: string;
  };
  expect(pkg.type).toBe("module");
  runTsc(
    "-p tsconfig.json --noEmit false --declaration --emitDeclarationOnly " +
      "--outDir target/typing-dts",
  );
  // import one component into a bundler: counter from views/counter
  // (the same module also exports counterCounter, which must be
  // dropped)
  const entry = fixture(
    "esm-entry",
    `import { counter } from "../../src/views/counter.ts";
export const app = counter(1);`,
  );
  execSync(
    `npx rolldown ${entry} --file target/typing-bundle.js --format esm`,
    { stdio: "pipe" },
  );
  const bundle = execSync("cat target/typing-bundle.js").toString();
  // the imported component is in the bundle
  expect(bundle).toContain("more!");
  // the unused one is absent (tree-shaken, side-effect-free modules)
  expect(bundle).not.toContain("Add Counter");
});
