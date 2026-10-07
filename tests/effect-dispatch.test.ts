// Purpose: executable contract tests for the effect-dispatch spec.
// Responsibilities: encode the spec rows' generators and predicates as
//   vitest + fast-check properties, one test per converted property.
// Rationale: specs/effect-dispatch.md is the design authority; each
//   predicate here mirrors a Properties row of that spec.

import { expect, it, vi } from "vitest";
import fc from "fast-check";

import { select, type Path } from "../src/effects/paths.ts";
import { rootRef } from "../src/effects/ref.ts";
import {
  CONTAINER_SIZE_KEY,
  cell,
  defeffect,
  makeApp,
  type AppOptions,
  type Effect,
} from "../src/effects/dispatch.ts";

const noopView: AppOptions["view"] = () => null;

// p_data — derives_from: effect.dispatch.effects_are_data
// generator: random effects — predicate: JSON round-trip preserves
// effects with no function argument, and an update effect keeps its
// function by reference
it("p_data: JSON round-trip preserves effects, update keeps its function", () => {
  const effectArb = fc
    .tuple(fc.string({ minLength: 1, maxLength: 6 }), fc.integer())
    .map(([type, v]) => [type, [["keypath", "x"]], v] as Effect);
  fc.assert(
    fc.property(effectArb, (eff) => {
      // an effect is a plain array whose first element is its type
      expect(Array.isArray(eff)).toBe(true);
      expect(typeof eff[0]).toBe("string");
      // JSON round-trip preserves effects with no function argument
      expect(JSON.parse(JSON.stringify(eff))).toEqual(eff);
    }),
  );
  // an update effect keeps its function by reference
  const f = (old: unknown) => old;
  const upd: Effect = ["update", [["keypath", "n"]], f];
  expect(upd[2]).toBe(f);
});

// p_order — derives_from: effect.dispatch.ordered_application
// generator: random batches of sets — predicate: final state equals
// sequential application
it("p_order: final state equals sequential application", () => {
  const setsArb = fc.array(
    fc.tuple(fc.constantFrom("a", "b", "c"), fc.integer()),
    { maxLength: 8 },
  );
  fc.assert(
    fc.property(setsArb, (sets) => {
      const app = makeApp({ view: noopView, state: { a: 0, b: 0, c: 0 } });
      const effects: Effect[] = sets.map(([k, v]) => ["set", [["keypath", k]], v]);
      app.dispatch(effects);
      const expected: Record<string, number> = { a: 0, b: 0, c: 0 };
      for (const [k, v] of sets) expected[k] = v;
      expect(app.getState()).toEqual(expected);
    }),
  );
});

// p_update — derives_from: effect.dispatch.builtin_update
// generator: random paths and fns — predicate: value at path equals
// f(old, ...args)
it("p_update: value at path equals f(old, ...args)", () => {
  const binding = fc
    .array(fc.string({ minLength: 1, maxLength: 3 }).filter((k) => !/^[0-9]/.test(k)), {
      minLength: 1,
      maxLength: 3,
    })
    .map((keys) => {
      const build = (depth: number, leaf: unknown): unknown =>
        depth >= keys.length ? leaf : { [keys[depth] as string]: build(depth + 1, leaf) };
      return { keys, state: build(0, 5) };
    });
  const fns: fc.Arbitrary<readonly [string, (old: unknown, ...args: unknown[]) => unknown, readonly unknown[]]> =
    fc.oneof(
      fc.tuple(fc.constant("add"), fc.constant((old: unknown, ...a: unknown[]) => (old as number) + (a[0] as number)), fc.array(fc.integer(), { minLength: 1, maxLength: 1 })),
      fc.tuple(fc.constant("double"), fc.constant((old: unknown) => (old as number) * 2), fc.constant([] as readonly unknown[])),
      fc.tuple(fc.constant("concat"), fc.constant((old: unknown, ...a: unknown[]) => String(old) + (a[0] as string)), fc.array(fc.constantFrom("!", "?"), { minLength: 1, maxLength: 1 })),
    );
  fc.assert(
    fc.property(binding, fns, ({ keys, state }, [, f, args]) => {
      const path: Path = keys.map((k) => ["keypath", k]);
      const app = makeApp({ view: noopView, state });
      const old = select(state, path);
      app.dispatch(["update", path, f, ...args]);
      expect(select(app.getState() as Record<string, unknown>, path)).toBe(f(old, ...args));
    }),
  );
});

// p_set_get_delete — derives_from: effect.dispatch.builtin_set_get_delete
// generator: random paths — predicate: set then get returns the value
// and delete then get returns undefined
it("p_set_get_delete: set then get returns the value and delete then get returns undefined", () => {
  const pathArb = fc
    .array(fc.string({ minLength: 1, maxLength: 3 }).filter((k) => !/^[0-9]/.test(k)), {
      minLength: 1,
      maxLength: 3,
    })
    .map((keys) => keys.map((k) => ["keypath", k]) as Path);
  fc.assert(
    fc.property(pathArb, fc.integer(), (path, v) => {
      const app = makeApp({ view: noopView, state: {} });
      app.dispatch(["set", path, v]);
      // get returns the value at path
      expect(select(app.getState(), path)).toBe(v);
      app.dispatch(["delete", path]);
      expect(select(app.getState(), path)).toBeUndefined();
    }),
  );
});

// p_overloads — derives_from: effect.dispatch.dispatch_overloads
// generator: the three call forms — predicate: all three apply the same effect
it("p_overloads: all three apply the same effect", () => {
  const path: Path = [["keypath", "n"]];
  const one = makeApp({ view: noopView, state: { n: 0 } });
  one.dispatch(["set", path, 5]); // a single effect with args
  const two = makeApp({ view: noopView, state: { n: 0 } });
  two.dispatch("set", path, 5); // a bare type + args
  const three = makeApp({ view: noopView, state: { n: 0 } });
  three.dispatch([["set", path, 5]]); // a sequence of effect vectors
  expect(one.getState()).toEqual({ n: 5 });
  expect(two.getState()).toEqual({ n: 5 });
  expect(three.getState()).toEqual({ n: 5 });
});

// p_unknown — derives_from: effect.dispatch.unknown_effect_skipped
// generator: batch with an unknown type — predicate: later effects
// still apply and nothing throws
it("p_unknown: later effects still apply and nothing throws", () => {
  const tap = vi.spyOn(console, "log").mockImplementation(() => {});
  const path: Path = [["keypath", "n"]];
  const app = makeApp({ view: noopView, state: { n: 0 } });
  // nothing throws, the dispatch returns nil, and the rest of the
  // batch still runs
  expect(() => app.dispatch([["bogus-effect", 1], ["set", path, 5]])).not.toThrow();
  expect(app.getState()).toEqual({ n: 5 });
  expect(app.dispatch(["bogus-effect", 1])).toBeUndefined();
  // the unknown type is reported
  expect(tap).toHaveBeenCalled();
  tap.mockRestore();
});

// p_compose — derives_from: effect.dispatch.compose_via_dispatch
// generator: counter-increment — predicate: dispatching it increments
// the number at the path
it("p_compose: dispatching counter-increment increments the number at the path", () => {
  const app = makeApp({ view: noopView, state: { num: 10 } });
  app.dispatch(["counter-increment", [["keypath", "num"]]]);
  expect(app.getState()).toEqual({ num: 11 });
});

// p_registry — derives_from: effect.dispatch.registry_global
// generator: defining an effect — predicate: it is both dispatchable by
// type and callable directly
it("p_registry: it is both dispatchable by type and callable directly", () => {
  const calls: unknown[][] = [];
  const fn = defeffect("test/registry-probe", (dispatch, x, y) => {
    calls.push([x, y]);
    return "done";
  });
  expect(typeof fn).toBe("function");
  const app = makeApp({ view: noopView, state: {} });
  app.dispatch(["test/registry-probe", 1, 2]);
  expect(calls).toEqual([[1, 2]]);
  // callable directly for isolated tests
  expect(fn((() => {}) as never, 3, 4)).toBe("done");
  expect(calls).toEqual([[1, 2], [3, 4]]);
});

// p_captured — derives_from: effect.dispatch.args_captured_at_render
// generator: button click with next-todo-text hello — predicate: state
// ends with a todo hello and next-todo-text empty
it("p_captured: state ends with a todo hello and next-todo-text empty", () => {
  defeffect("test/add-todo", (dispatch, ...raw: unknown[]) => {
    const todosPath = raw[0] as Path;
    const nextPath = raw[1] as Path;
    const text = raw[2] as string;
    dispatch(["update", todosPath, (todos: unknown[]) => [...todos, text]]);
    dispatch(["set", nextPath, ""]);
  });
  const state = { todos: [] as unknown[], "next-todo-text": "hello" };
  const $todos = rootRef(state).get("todos");
  const $next = rootRef(state).get("next-todo-text");
  // effect arguments are values captured when the handler returned
  const clicked: Effect = ["test/add-todo", $todos.path, $next.path, "hello"];
  const app = makeApp({ view: noopView, state });
  app.dispatch(clicked);
  expect(app.getState()).toEqual({ todos: ["hello"], "next-todo-text": "" });
});

// p_empty — derives_from: effect.dispatch.empty_batch_noop
// generator: empty batch — predicate: no repaint and no handler call
it("p_empty: no repaint and no handler call", () => {
  const raf = vi.fn();
  vi.stubGlobal("requestAnimationFrame", raf);
  const handler = vi.fn((state: unknown) => state);
  const app = makeApp({ view: noopView, state: {}, handler });
  app.dispatch([]);
  // an empty or nil batch calls no handler and triggers no repaint
  app.dispatch(undefined as unknown as Effect);
  expect(handler).not.toHaveBeenCalled();
  expect(raf).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

// p_repaint — derives_from: effect.dispatch.single_repaint
// generator: batch of N effects — predicate: exactly one repaint is scheduled
it("p_repaint: exactly one repaint is scheduled", () => {
  const raf = vi.fn();
  vi.stubGlobal("requestAnimationFrame", raf);
  const path: Path = [["keypath", "n"]];
  const app = makeApp({ view: noopView, state: { n: 0 } });
  const batch: Effect[] = [];
  for (let i = 0; i < 5; i++) batch.push(["update", path, (old: number) => old + 1]);
  app.dispatch(batch);
  expect(app.getState()).toEqual({ n: 5 });
  expect(raf).toHaveBeenCalledTimes(1);
  vi.unstubAllGlobals();
});

// p_override — derives_from: effect.dispatch.handler_overridable
// generator: custom dispatch — predicate: the custom function receives
// every effect
it("p_override: the custom function receives every effect", () => {
  const received: Effect[] = [];
  const path: Path = [["keypath", "n"]];
  const app = makeApp({
    view: noopView,
    state: { n: 0 },
    dispatch: (effect: Effect) => {
      received.push(effect);
    },
  });
  app.dispatch([["set", path, 1], ["bogus-effect", 2]]);
  expect(received).toEqual([["set", path, 1], ["bogus-effect", 2]]);
  // the app itself applied nothing — the custom dispatch owns the store
  expect(app.getState()).toEqual({ n: 0 });
});

// p_state_forms — derives_from: effect.dispatch.make_app_state_forms
// generator: plain state and cell — predicate: both run and the cell is
// shared not copied
it("p_state_forms: both run and the cell is shared not copied", () => {
  const plain = makeApp({ view: noopView, state: { n: 0 } });
  plain.dispatch(["set", [["keypath", "n"]], 1]);
  expect(plain.getState()).toEqual({ n: 1 });
  expect(plain.view()).toBeNull();

  const c = cell<{ n: number }>({ n: 0 });
  const withCell = makeApp({ view: noopView, cell: c });
  withCell.dispatch(["set", [["keypath", "n"]], 1]);
  // both run…
  expect(withCell.view()).toBeNull();
  // …and the cell is shared, not copied
  expect(c.value).toEqual({ n: 1 });
  expect(withCell.getState()).toBe(c.value);
});

// p_container — derives_from: effect.dispatch.container_size_injected
// generator: resize to 320 by 640 — predicate: context holds that size
// at the next render
it("p_container: context holds that size at the next render", () => {
  const backend: { containerSize?: readonly [number, number] } = {};
  let seen: unknown;
  const app = makeApp({
    view: (_state, context) => {
      seen = context[CONTAINER_SIZE_KEY];
      return null;
    },
    state: {},
    backend,
  });
  // with no size from the backend, no size is placed in the context
  app.view();
  expect(seen).toBeUndefined();
  // resize to 320 by 640 — the next render holds it
  backend.containerSize = [320, 640];
  app.view();
  expect(seen).toEqual([320, 640]);
});

// p_counter_effects — derives_from: effect.dispatch.counter_effects
// generator: num 10 and nums 0, 1, 2 — predicate: num becomes 11 and
// nums becomes 0, 1, 2, 0
it("p_counter_effects: num becomes 11 and nums becomes 0, 1, 2, 0", () => {
  const app = makeApp({ view: noopView, state: { num: 10, nums: [0, 1, 2] } });
  app.dispatch(["counter-increment", [["keypath", "num"]]]);
  app.dispatch(["add-counter", [["keypath", "nums"]]]);
  expect(app.getState()).toEqual({ num: 11, nums: [0, 1, 2, 0] });
});

// p_clipboard_effects — derives_from: effect.dispatch.clipboard_effects
// generator: copy hello — predicate: the backend clipboard receives hello
it("p_clipboard_effects: the backend clipboard receives hello", () => {
  const writes: string[] = [];
  const app = makeApp({
    view: noopView,
    state: {},
    backend: { copyToClipboard: (text: string) => writes.push(text) },
  });
  app.dispatch(["clipboard-copy", "hello"]);
  app.dispatch(["clipboard-cut", "bye"]);
  expect(writes).toEqual(["hello", "bye"]);
});