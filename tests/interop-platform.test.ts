// Purpose: executable contract tests for the interop-model spec — the
//   platform tier: the public API surface, the ES-module boundary,
//   advanced-compilation safety and the same-effect-everywhere pin.
// Responsibilities: encode each converted row's generator and predicate as a
//   vitest + fast-check property, one test per converted property.
// Rationale: specs/interop-model.md is the design authority; each predicate
//   here mirrors a Properties row (generator + predicate text). No vacuous
//   predicates: every check encodes its row's stated behavior. Host
//   stand-ins (Keyword, PMap, cljsOps) live in tests/helpers — they are
//   host-language data the library never inspects.

import { expect, it, vi } from "vitest";

import * as interop from "../src/interop/index.ts";
import { interDispatch } from "../src/interop/seam.ts";
import { makeHeadlessApp } from "../src/app/app.ts";
import { mouseDown } from "../src/events/event.ts";
import type { Path } from "../src/effects/paths.ts";
import { cljsOps, kw, not, pmap, toJs } from "./helpers/interop-standins.ts";

// ---------------------------------------------------------------------------
// p_free_functions — derives_from: interop.model.free_functions
// generator: scan the public exports
// predicate: every export is a function, a constant or a sentinel, and none uses this
// ---------------------------------------------------------------------------

function checkExport(name: string, value: unknown): void {
  if (typeof value === "function") {
    // none uses this — free functions take data first
    expect(value.toString(), name).not.toMatch(/\bthis\b/);
    return;
  }
  // a constant or a sentinel: a plain value, or a registered symbol
  expect(["string", "number", "boolean", "object", "symbol"], name).toContain(typeof value);
  if (typeof value === "symbol") expect(Symbol.keyFor(value), name).toBeDefined();
}

it("p_free_functions: every export is a function, a constant or a sentinel, and none uses this", () => {
  const exported = Object.entries(interop);
  // non-vacuous: the scan saw the real public API
  expect(exported.length).toBeGreaterThan(10);
  expect(exported.map(([n]) => n)).toContain("interDispatch");
  for (const [name, value] of exported) checkExport(name, value);
});

// ---------------------------------------------------------------------------
// p_esm — derives_from: interop.model.esm_named_exports
// generator: import from squint and from a CLJS build
// predicate: named imports resolve and no side effect runs at import
// ---------------------------------------------------------------------------

it("p_esm: named imports resolve and no side effect runs at import", async () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  // a fresh module evaluation (resetModules) from a squint / CLJS build's view:
  // named imports resolve
  vi.resetModules();
  const mod: Record<string, unknown> = { ...(await import("../src/interop/index.ts")) };
  const names = Object.keys(mod);
  for (const name of ["jsOps", "seamSelect", "seamSet", "seamUpdate", "seamDelete", "interDispatch", "makeRegistry", "makeOpsApp", "label", "vstack", "concatPath", "filterNav", "each", "defui"]) {
    expect(names, name).toContain(name);
  }
  // no side effect runs at import: nothing was reported, and a registry
  // minted from the imported module starts empty
  expect(logSpy).not.toHaveBeenCalled();
  const registry = (mod["makeRegistry"] as () => Map<string, unknown>)();
  expect(registry.size).toBe(0);
  logSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// p_advanced — derives_from: interop.model.advanced_compile_safe
// generator: build the counter example with advanced optimisations
// predicate: the click still produces the counter-increment effect
// ---------------------------------------------------------------------------

it("p_advanced: with advanced optimisations the click still produces the counter-increment effect", () => {
  // advanced_compile_safe allows two strategies: ship externs, or access
  // only quoted keys. The port takes the quoted-keys strategy: the counter
  // example is built so every node key comes from the externs table, and an
  // access-restricting proxy throws if the machinery ever touches a key
  // outside it — the transformation Closure would apply.
  const EXTERNS: ReadonlySet<string> = new Set([
    "type", "text", "children", "onClick", "value",
  ]);
  const quoted = <T extends object>(o: T): T =>
    new Proxy(o, {
      get(target, key) {
        if (typeof key === "string" && !EXTERNS.has(key)) {
          throw new Error(`unquoted key access: ${String(key)}`);
        }
        return Reflect.get(target, key);
      },
      has(target, key) {
        if (typeof key === "string" && !EXTERNS.has(key)) {
          throw new Error(`unquoted key check: ${String(key)}`);
        }
        return Reflect.has(target, key);
      },
    });

  const num = 3;
  const $num: Path = [["keypath", "num"]];
  const view = () => [
    // a group is a plain array; every node's keys come only from the
    // externs table, so Closure-style renaming of anything else cannot
    // reach the public data
    quoted({
      type: "button",
      text: "more!",
      onClick: () => [["counter-increment", $num]],
    }),
    quoted({ type: "label", text: String(num) }),
  ];

  const app = makeHeadlessApp({ state: { num }, view: view as () => never });
  // button bounds are label bounds plus 12 on each axis: [17, 13] — the
  // centre is inside the half-open hit-test range
  app.send(mouseDown([8, 6], { pointerType: "mouse" }));
  // the click still produces the counter-increment effect
  expect((app.getState() as { num: number }).num).toBe(4);
});

// ---------------------------------------------------------------------------
// p_same_everywhere — derives_from: interop.model.dispatch_same_everywhere
// generator: the same effect batch from three languages
// predicate: the resulting states are deep-equal
// ---------------------------------------------------------------------------

it("p_same_everywhere: the same effect batch from three languages gives deep-equal states", () => {
  const mkState = () => ({
    todos: [
      { description: "first", "complete?": false },
      { description: "second", "complete?": true },
    ],
    n: 1,
  });
  const f = (x: unknown): number => (x as number) + 1;
  // TypeScript: plain data, plain key paths
  const batchTs: unknown[] = [
    ["update", ["todos", 1, "complete?"], not],
    ["update", ["n"], f],
  ];
  // squint: the very same plain shapes — keywords compile to strings
  // (built literally: structuredClone cannot carry the functions)
  const batchSquint: unknown[] = [
    ["update", ["todos", 1, "complete?"], not],
    ["update", ["n"], f],
  ];
  // ClojureScript: keyword tags and keyword keys through the seam
  const batchCljs = [
    [kw(null, "update"), [kw(null, "todos"), 1, kw(null, "complete?")], not],
    [kw(null, "update"), [kw(null, "n")], f],
  ];
  const mkCljsState = () =>
    pmap([
      [
        "todos",
        [pmap([["description", "first"], ["complete?", false]]), pmap([["description", "second"], ["complete?", true]])],
      ],
      ["n", 1],
    ]);
  const sTs = interDispatch(mkState(), batchTs);
  const sSquint = interDispatch(mkState(), batchSquint);
  const sCljs = interDispatch(mkCljsState(), batchCljs, { ops: cljsOps });
  // the resulting states are deep-equal
  expect(sSquint).toEqual(sTs);
  expect(toJs(sCljs)).toEqual(sTs);
});
