// Purpose: executable contract tests for the typing.model spec — the
//   compile-time node and path contracts (readonly nodes and effect
//   tuples, vec tuple positions, typed path composition, path
//   mismatch rejection, and the navigator type table).
// Responsibilities: encode each converted row's generator and
//   predicate as a vitest test — expectTypeOf pins in-file plus
//   ts-expect-error pins for the rejected programs (type_tests_in_ci;
//   p_strict's project tsc run includes this file).
// Rationale: openspec/specs/typing-model/spec.md is the design authority; tambor-272
//   redistributed the monolithic tests/typing-model.test.ts into topic
//   files, keeping every it name byte-identical for the
//   --testNamePattern contract bindings. Types erase at runtime, so
//   the runtime assertions here never depend on a type (types_erased);
//   the type-level assertions live in the tsc gates.

import { expect, expectTypeOf, it } from "vitest";
import {
  rectangle,
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
import type { Effect } from "../src/typing/effects.ts";

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
  const arr: readonly number[] = [1, 2];
  // @ts-expect-error a plain number array is not a position
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
  expectTypeOf($collected).toEqualTypeOf<CollectPath<Todos, readonly string[], string>>();
  const state: Todos = { todos: ["a", "b"], count: 2 };
  const next = update(state, $collected, (collected, old) => {
    expectTypeOf(collected).toEqualTypeOf<readonly string[]>();
    expectTypeOf(old).toEqualTypeOf<string>();
    return collected.length > 0 ? `${old}!` : old;
  });
  expect(next.todos).toEqual(["a!", "b"]);
});
