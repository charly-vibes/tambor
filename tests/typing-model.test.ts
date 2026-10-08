// Purpose: executable contract tests for the typing.model spec — the
//   strict-TypeScript type system contracts (typed lens paths, derived
//   dollar props, defaults, context, the effect union, dispatch, event
//   handler signatures, intercept typing, generic components, ESM
//   packaging and effect serialisability).
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
//   Compile-time properties are encoded twice over: as expectTypeOf /
//   @ts-expect-error pins in this file (type_tests_in_ci) — enforced by
//   p_strict's project tsc run, which includes this file — and, where
//   the row's generator names tsc over a fixture, as a spawned tsc run
//   asserting the reported diagnostics.
// Rationale: specs/typing-model.md is the design authority. Types erase
//   at runtime, so the runtime assertions here never depend on a type
//   (types_erased); the type-level assertions live in the tsc gates.
//   Module augmentations below (theme, add-todo, select) mirror the
//   corpus generators: applications extend the context and the
//   EffectMap interfaces by declaration merging.

import { expect, expectTypeOf, it } from "vitest";
import fc from "fast-check";

// The Node builtins the spawned-tsc tests need, typed at the use site —
// @types/node is not a project dependency (typing.model: no any in
// public signatures; these are test-local pins).
// @ts-expect-error node:child_process has no type declarations here
import { execSync } from "node:child_process";
// @ts-expect-error node:fs has no type declarations here
import { mkdirSync, writeFileSync } from "node:fs";

import {
  label as labelNode,
  rectangle,
  translate,
  type Label,
  type Rectangle,
  type TranslateNode,
  type Vec2,
} from "../src/views/model.ts";
import {
  collectOne,
  compose,
  drop,
  filter,
  key,
  nilToVal,
  nth,
  root,
  select,
  set,
  take,
  update,
  type CollectPath,
  type Path,
} from "../src/typing/path.ts";
import type { AppContext } from "../src/typing/context.ts";
import {
  dispatch,
  on,
  toRaw,
  type Effect,
  type FunctionBearing,
} from "../src/typing/effects.ts";
import { defui, type CallProps } from "../src/typing/component.ts";
import type {
  DefaultHandler,
  MouseDownHandler,
  WrapOnHandler,
} from "../src/typing/handlers.ts";

// p_context — applications extend the context type by declaration
// merging (context_augmentable).
declare module "../src/typing/context.ts" {
  interface AppContext {
    readonly theme: string;
  }
}

// p_effect_union / p_intercept — applications register custom effects
// by extending the EffectMap interface (effect_union): the todo
// example's add-todo and the dropdown's select intent.
declare module "../src/typing/effects.ts" {
  interface EffectMap {
    "add-todo": [path: Path<unknown, unknown>, todo: string];
    select: [path: Path<unknown, unknown>, value: number];
  }
}

// The todos state the path rows use.
interface Todos {
  readonly todos: readonly string[];
  readonly count: number | undefined;
}

// The app state the dollar-props rows use.
interface RootState {
  readonly num: number;
  readonly nums: readonly number[];
}

// A helper spawn: run tsc with explicit args, capture diagnostics.
function runTsc(args: string): { code: number; out: string } {
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
function fixture(name: string, source: string): string {
  mkdirSync("target/typing-fixtures", { recursive: true });
  const file = `target/typing-fixtures/${name}.ts`;
  writeFileSync(file, source);
  return file;
}

// The strict-flag set the typing.model strict_compiler row lists, as
// CLI flags for fixture runs (the project tsconfig carries the same
// set for the library itself).
const STRICT_FLAGS =
  "--noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes " +
  "--noImplicitOverride --target ES2022 --module ESNext --moduleResolution bundler " +
  "--lib ES2022 --allowImportingTsExtensions --skipLibCheck --pretty false";

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
    .filter((f) => f.length > 0);
  expect(listing.length).toBeGreaterThan(0);
  for (const file of listing) {
    const source = execSync(`cat ${file}`).toString();
    // strip comments: only signatures are scanned
    const stripped = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*/g, "");
    const hits = stripped.match(/\bany\b/);
    expect(hits, `${file} mentions any: ${stripped.slice(0, 200)}`).toBeNull();
  }
});

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

// p_readonly — derives_from: typing.model.readonly_nodes
// generator: assign to a node field — predicate: tsc reports an error
it("p_readonly: assigning to a node or effect field is a compile error", () => {
  const node: Rectangle = rectangle(10, 10);
  expect(node.width).toBe(10);
  function mutate(assigned: Rectangle): void {
    // @ts-expect-error node fields are readonly — assigning is a
    // compile error
    assigned.width = 20;
  }
  // deeply readonly: a nested drawable too
  function mutateDrawable(assigned: TranslateNode): void {
    // @ts-expect-error node fields are deeply readonly — nested
    // drawables too
    (assigned.drawable as Rectangle).width = 21;
  }
  // effect tuples are readonly
  const $count = key(root<RootState>(), "num");
  const eff: Effect = ["update", $count, (n: number) => n];
  function mutateEffect(assigned: Effect): void {
    // @ts-expect-error effect tuples are readonly
    assigned[0] = "set";
  }
  expect(eff.length).toBe(3);
  expectTypeOf(mutate).returns.toBeVoid();
  expectTypeOf(mutateDrawable).returns.toBeVoid();
  expectTypeOf(mutateEffect).returns.toBeVoid();
});

// p_vec — derives_from: typing.model.vec_tuples
// generator: pass three numbers and a number array as a position —
// predicate: both are errors
it("p_vec: a three-element or array argument as a position is a compile error", () => {
  const pos: Vec2 = [1, 2];
  expect(pos.length).toBe(2);
  function place(p: Vec2): Vec2 {
    return p;
  }
  expect(place(pos)).toEqual([1, 2]);
  // @ts-expect-error a three-element tuple is not a position
  place([1, 2, 3]);
  // @ts-expect-error a plain number array is not a position
  const arr: readonly number[] = [1, 2];
  place(arr);
});

// p_path — derives_from: typing.model.typed_path
// generator: compose Path<S, A> with Path<A, B> — predicate: the
// result has type Path<S, B> and select returns B
it("p_path: composing Path<S,A> with Path<A,B> yields Path<S,B> and select returns B", () => {
  const state: Todos = { todos: ["milk", "eggs"], count: 2 };
  // Path<S, A>: the todos array, from the root state
  const $todos = key(root<Todos>(), "todos");
  // Path<A, B>: the first element, from the array itself
  const $firstOfArray = nth(root<readonly string[]>(), 0);
  const $first = compose($todos, $firstOfArray);
  expectTypeOf($first).toEqualTypeOf<Path<Todos, string>>();
  expectTypeOf(select(state, $first)).toEqualTypeOf<string>();
  expect(select(state, $first)).toBe("milk");
  // set requires a T
  const next = set(state, $first, "butter");
  expect(select(next, $first)).toBe("butter");
  expect(state.todos[0]).toBe("milk");
});

// p_mismatch — derives_from: typing.model.path_mismatch_rejected
// generator: set a string through Path<S, number> — predicate: tsc
// reports an error
it("p_mismatch: setting a string through Path<S, number> is a compile error", () => {
  interface State {
    readonly count: number;
  }
  const $count = key(root<State>(), "count");
  const state: State = { count: 0 };
  // @ts-expect-error setting a string through a number path is a
  // compile error
  set(state, $count, "many");
});

// p_navigators — derives_from: typing.model.navigator_types
// generator: each navigator on a todos array state — predicate: the
// inferred types match the documented table
it("p_navigators: the inferred navigator types match the documented table", () => {
  const $s = root<Todos>();
  // key narrows to the property type
  const $todos = key($s, "todos");
  expectTypeOf($todos).toEqualTypeOf<Path<Todos, readonly string[]>>();
  // nth narrows to the element type
  const $first = nth($todos, 0);
  expectTypeOf($first).toEqualTypeOf<Path<Todos, string>>();
  // filter, take and drop keep the array type
  expectTypeOf(filter($todos, (t) => t.length > 0)).toEqualTypeOf<
    Path<Todos, readonly string[]>
  >();
  expectTypeOf(take($todos, 2)).toEqualTypeOf<Path<Todos, readonly string[]>>();
  expectTypeOf(drop($todos, 1)).toEqualTypeOf<Path<Todos, readonly string[]>>();
  // nilToVal removes undefined
  const $count = key($s, "count");
  expectTypeOf(nilToVal($count, 0)).toEqualTypeOf<Path<Todos, number>>();
  // collectOne prepends the collected type to the update function
  // parameters
  const $collected = compose(collectOne($todos), $first);
  expectTypeOf($collected).toEqualTypeOf<CollectPath<Todos, string>>();
  const state: Todos = { todos: ["a", "b"], count: 2 };
  const next = update(state, $collected, (collected, old) => {
    expectTypeOf(collected).toEqualTypeOf<readonly string[]>();
    expectTypeOf(old).toEqualTypeOf<string>();
    return collected.length > 0 ? `${old}!` : old;
  });
  expect(next.todos).toEqual(["a!", "b"]);
});

// p_dollar — derives_from: typing.model.dollar_keys_derived
// generator: a component with props num and nums — predicate: the
// props type has dollar-num as Path<Root, number> and dollar-nums as
// Path<Root, number[]>, and omitting one errors
it("p_dollar: dollar props are derived with key remapping and are required", () => {
  const $num = key(root<RootState>(), "num");
  const $nums = key(root<RootState>(), "nums");
  type CounterProps = CallProps<
    { readonly num: number; readonly nums: readonly number[] },
    Record<never, never>,
    RootState
  >;
  expectTypeOf<CounterProps["$num"]>().toEqualTypeOf<Path<RootState, number>>();
  expectTypeOf<CounterProps["$nums"]>().toEqualTypeOf<Path<RootState, number[]>>();
  const Counter = defui(
    (props: { readonly num: number; readonly nums: readonly number[] }) =>
      labelNode(String(props.num + props.nums.length)),
  );
  const el = Counter({
    num: 1,
    nums: [2, 3],
    $num,
    $nums,
  }) as Label;
  expect(el.type).toBe("label");
  expect(el.text).toBe("3");
  // omitting a dollar prop errors
  // @ts-expect-error omitting a dollar prop fails to compile
  Counter({ num: 1, nums: [2] });
});

// p_defaults — derives_from: typing.model.defaults_typed
// generator: selected-filter with a default — predicate: the call site
// may omit it and the body sees a defined value
it("p_defaults: a declared default is optional at the call site and defined in the body", () => {
  interface FilterState {
    readonly default: string;
  }
  const $default = key(root<FilterState>(), "default");
  const SelectedFilter = defui(
    (props: { readonly default: string }, context: AppContext) => {
      // the body sees a defined value
      expectTypeOf(props.default).toEqualTypeOf<string>();
      return labelNode(props.default);
    },
    { default: "filter" },
  );
  // the call site may omit it
  const el = SelectedFilter({ $default }, { focus: undefined }) as Label;
  expect(el.type).toBe("label");
  expect(el.text).toBe("filter");
});

// p_context — derives_from: typing.model.context_augmentable
// generator: augment context with a theme field — predicate: the field
// is typed in every component
it("p_context: the context interface is augmentable and the built-in focus is present", () => {
  const $num = key(root<RootState>(), "num");
  const Context = defui(
    (props: { readonly num: number }, context: AppContext) => {
      // the augmented field is typed in the component
      expectTypeOf(context.theme).toEqualTypeOf<string>();
      return labelNode(context.theme);
    },
  );
  const el = Context(
    { num: 0, $num },
    { focus: undefined, theme: "dark" },
  ) as Label;
  expect(el.text).toBe("dark");
  // the built-in focus member is present in the base interface
  expectTypeOf<AppContext["focus"]>().toEqualTypeOf<unknown>();
});

// p_effect_union — derives_from: typing.model.effect_union
// generator: register a custom add-todo effect — predicate: it appears
// in the union with its argument types
it("p_effect_union: a registered custom effect appears in the union with its argument types", () => {
  const $todos = key(root<RootState>(), "nums");
  // it appears in the union with its argument types
  type AddTodo = Extract<Effect, readonly ["add-todo", unknown, unknown]>;
  expectTypeOf<AddTodo["1"]>().toEqualTypeOf<Path<unknown, unknown>>();
  expectTypeOf<AddTodo["2"]>().toEqualTypeOf<string>();
  const eff: Effect = ["add-todo", $todos, "milk"];
  expect(eff.length).toBe(3);
  expect((eff as readonly unknown[])[2]).toBe("milk");
});

// p_dispatch — derives_from: typing.model.dispatch_checked
// generator: dispatch an unknown type and a wrong argument —
// predicate: both are compile errors
it("p_dispatch: dispatch accepts only union members with the right arguments", () => {
  const $count = key(root<RootState>(), "num");
  // registered builtins dispatch and apply through the typed paths
  dispatch([["update", $count, (n: number) => n + 1], ["set", $count, 5]]);
  // an unknown effect type is a compile error
  // @ts-expect-error dispatching an unregistered effect type is a
  // compile error
  dispatch([["nope", 1]]);
  // a wrong argument is a compile error
  // @ts-expect-error a wrong update argument is a compile error
  dispatch([["update", $count, "not a function"]]);
});

// p_handlers — derives_from: typing.model.handler_signatures
// generator: a mouse-down handler with the wrong parameter —
// predicate: tsc reports an error
it("p_handlers: a mouse-down handler takes a Vec2 and returns readonly Effect[]", () => {
  const $count = key(root<RootState>(), "num");
  const handler: MouseDownHandler = (pos: Vec2) => [["set", $count, pos[0]]];
  expect(handler([3, 4]).length).toBe(1);
  // @ts-expect-error a mouse-down handler with a wrong parameter is a
  // compile error
  const bad: MouseDownHandler = (pos: string) => [];
  expect(bad).toBeDefined();
  // a wrap-on handler receives the typed default handler first
  const wrap: WrapOnHandler = (defaultHandler, pos) =>
    [defaultHandler({ num: pos[0] }, [["set", $count, pos[0]]])] as Effect[];
  expectTypeOf<WrapOnHandler>().parameter(0).toEqualTypeOf<DefaultHandler>();
  expect(wrap.length).toBe(2);
});

// p_intercept — derives_from: typing.model.intercept_typed
// generator: on select with the wrong parameter types — predicate:
// tsc reports an error
it("p_intercept: on infers the handler parameters from the registered effect type", () => {
  // the handler parameters infer from the registered effect type
  const pair = on("select", (path, value) => [["set", path, value + 1]]);
  expectTypeOf(pair[0]).toEqualTypeOf<"select">();
  expect(pair[0]).toBe("select");
  // wrong parameter types are a compile error
  // @ts-expect-error on select with the wrong parameter types is a
  // compile error
  on("select", (path: string, value: number) => []);
  // @ts-expect-error the value parameter is checked too
  on("select", (path, value: string) => []);
});

// p_generic — derives_from: typing.model.component_generic
// generator: call counter with no num and with an extra prop —
// predicate: both are compile errors
it("p_generic: defui infers the props type; missing and extra props fail to compile", () => {
  const $num = key(root<RootState>(), "num");
  const Counter = defui((props: { readonly num: number }) => labelNode(String(props.num)));
  const el = Counter({ num: 3, $num }) as Label;
  expect(el.text).toBe("3");
  // @ts-expect-error calling with no num is a compile error
  Counter({ $num });
  // @ts-expect-error calling with an extra unknown prop is a compile
  // error
  Counter({ num: 1, $num, extra: 2 });
});

// p_erased — derives_from: typing.model.types_erased
// generator: strip annotations and rerun the behaviour suite —
// predicate: results are identical
it("p_erased: stripping the annotations leaves behaviour unchanged", () => {
  // the typed implementation…
  function typedLength(texts: readonly string[]): number {
    return texts.reduce((sum, text) => sum + text.length, 0);
  }
  // …and its annotation-stripped twin: the same body as plain
  // JavaScript, no annotations anywhere
  const erasedLength = new Function(
    "texts",
    "return texts.reduce(function (sum, text) { return sum + text.length; }, 0);",
  ) as (texts: readonly string[]) => number;
  fc.assert(
    fc.property(
      fc.array(fc.string({ maxLength: 8 }), { maxLength: 6 }),
      (texts) => {
        expect(erasedLength(texts)).toBe(typedLength(texts));
      },
    ),
  );
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

// p_serialisable — derives_from: typing.model.serialisable_effects
// generator: add-todo and update with a function — predicate:
// add-todo round-trips through JSON and the update effect is marked
// function-bearing
it("p_serialisable: add-todo round-trips through JSON; update is function-bearing", () => {
  const $todos = key(root<RootState>(), "nums");
  // effect arguments other than update functions and filter predicates
  // are JSON-serialisable values
  const raw = toRaw([["add-todo", $todos, "milk"]]);
  expect(JSON.parse(JSON.stringify(raw))).toEqual(raw);
  // the type system marks function-bearing effects
  expectTypeOf<FunctionBearing<"update">>().toEqualTypeOf<true>();
  expectTypeOf<FunctionBearing<"add-todo">>().toEqualTypeOf<false>();
});
