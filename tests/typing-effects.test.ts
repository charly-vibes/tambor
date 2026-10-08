// Purpose: executable contract tests for the typing.model spec — the
//   effect and handler contracts (the augmentable EffectMap union,
//   dispatch argument checking, mouse-down handler signatures, the
//   typed intercept/on handler, and effect serialisability).
// Responsibilities: encode each converted row's generator and
//   predicate as a vitest test — expectTypeOf pins in-file plus
//   ts-expect-error pins for the rejected programs (type_tests_in_ci;
//   p_strict's project tsc run includes this file). The module
//   augmentation below mirrors the corpus generators: applications
//   register custom effects by extending the EffectMap interface by
//   declaration merging (the todo example's add-todo and the
//   dropdown's select intent).
// Rationale: specs/typing-model.md is the design authority;
//   tambor-272 redistributed the monolithic tests/typing-model.test.ts
//   into topic files, keeping every it name byte-identical for the
//   --testNamePattern contract bindings.

import { expect, expectTypeOf, it } from "vitest";
import type { Vec2 } from "../src/views/model.ts";
import { key, root, type Path } from "../src/typing/path.ts";
import {
  dispatch,
  on,
  toRaw,
  type Effect,
  type FunctionBearing,
} from "../src/typing/effects.ts";
import type {
  DefaultHandler,
  MouseDownHandler,
  WrapOnHandler,
} from "../src/typing/handlers.ts";

// p_effect_union / p_intercept — applications register custom effects
// by extending the EffectMap interface (effect_union): the todo
// example's add-todo and the dropdown's select intent.
declare module "../src/typing/effects.ts" {
  interface EffectMap {
    "add-todo": [path: Path<unknown, unknown>, todo: string];
    select: [path: Path<unknown, unknown>, value: number];
  }
}

// The app state the dollar-props rows use.
interface RootState {
  readonly num: number;
  readonly nums: readonly number[];
}

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
  // an unknown effect type and a wrong argument are compile errors —
  // the pins live in never-invoked code: types erase at runtime, so
  // the runtime dispatcher never sees them (types_erased)
  function neverDispatched(): void {
    // @ts-expect-error dispatching an unregistered effect type is a
    // compile error
    dispatch([["nope", 1]]);
    // @ts-expect-error a wrong update argument is a compile error
    dispatch([["update", $count, "not a function"]]);
  }
  expectTypeOf(neverDispatched).returns.toBeVoid();
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
