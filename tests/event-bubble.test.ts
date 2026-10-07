// Purpose: executable contract tests for the event-bubble spec.
// Responsibilities: encode the spec rows' generators and predicates as
//   vitest + fast-check properties, one test per converted property.
// Rationale: specs/event-bubble.md is the design authority; each
//   predicate here mirrors a Properties row of that spec — bubbling is
//   how a deep child asks an ancestor for something it cannot do
//   itself.

import { expect, it } from "vitest";
import fc from "fast-check";

import { on, spacer, type Handler, type HandlerNode } from "../src/views/model.ts";
import { mouseDown, keyPress } from "../src/events/event.ts";
import { onBubble, onPairs, wrapOn, type Intent } from "../src/events/bubble.ts";
import { dispatch } from "../src/events/dispatch.ts";

// The default-handler shape wrap-on handlers receive: callable with the
// event arguments, returning the wrapped default effects.
type DefaultHandler = (...args: readonly unknown[]) => readonly Intent[];

// A leaf that emits the given intents on a mouse-down inside its bounds.
function emitter(intents: readonly Intent[]): HandlerNode {
  return on("mouse-down", () => intents, spacer(10, 10));
}

// p_intercept — derives_from: event.bubble.intercept_by_type
// generator: intents including request-focus
// predicate: a request-focus intent becomes the set-focus intent from
// the textarea example
it("p_intercept: a request-focus intent becomes the set-focus intent from the textarea example", () => {
  // textarea returns [::request-focus]; the wrapper rewrites it to
  // [:set $focus true]
  const focusPath = ["focus"];
  const inner = emitter([["request-focus"]]);
  const view = on("request-focus", () => [["set", focusPath, true]], inner);
  expect(dispatch(view, mouseDown([5, 5]))).toEqual([["set", ["focus"], true]]);

  // Generalized property: every matching intent is replaced, whatever
  // it carries.
  fc.assert(
    fc.property(fc.nat(9), (n) => {
      const row = emitter([["request-focus", n]]);
      const wrapped = on("request-focus", (v: unknown) => [["set", ["focus"], v]], row);
      expect(dispatch(wrapped, mouseDown([5, 5]))).toEqual([["set", ["focus"], n]]);
    }),
  );
});

// p_args — derives_from: event.bubble.intercept_args_spread
// generator: select with path and value
// predicate: the handler is called with exactly path and value
it("p_args: the handler is called with exactly path and value", () => {
  const calls: unknown[][] = [];
  const inner = emitter([["select", ["files", "a.txt"], 2]]);
  const view = on("select", (...args: unknown[]) => {
    calls.push(args);
    return [];
  }, inner);
  expect(dispatch(view, mouseDown([5, 5]))).toEqual([]);
  expect(calls).toEqual([[["files", "a.txt"], 2]]);

  // Generalized property: the intent arguments arrive positionally.
  fc.assert(
    fc.property(fc.nat(50), fc.nat(50), (a, b) => {
      const seen: unknown[][] = [];
      const wrapped = on("select", (...args: unknown[]) => {
        seen.push(args);
        return [];
      }, emitter([["select", a, b]]));
      dispatch(wrapped, mouseDown([5, 5]));
      expect(seen).toEqual([[a, b]]);
    }),
  );
});

// p_pass — derives_from: event.bubble.other_intents_pass
// generator: mixed intent lists
// predicate: non-matching intents keep identity and order
it("p_pass: non-matching intents keep identity and order", () => {
  const intents: readonly Intent[] = [
    ["before", 1],
    ["select", "x"],
    ["middle", 2],
    ["select", "y"],
    ["after", 3],
  ];
  const view = on("select", (v: unknown) => [["picked", v]], emitter(intents));
  expect(dispatch(view, mouseDown([5, 5]))).toEqual([
    ["before", 1],
    ["picked", "x"],
    ["middle", 2],
    ["picked", "y"],
    ["after", 3],
  ]);

  // Generalized property: identity is preserved for non-matching
  // intents regardless of the generated mix.
  fc.assert(
    fc.property(fc.array(fc.nat(20), { maxLength: 8 }), (nums) => {
      const mixed: readonly Intent[] = nums.map((n) => (n % 2 === 0 ? ["keep", n] : ["pick", n]));
      const wrapped = on("pick", (n: unknown) => [["got", n]], emitter(mixed));
      const expected: readonly Intent[] = nums.map((n) =>
        n % 2 === 0 ? ["keep", n] : ["got", n]);
      expect(dispatch(wrapped, mouseDown([5, 5]))).toEqual(expected);
    }),
  );
});

// p_expand — derives_from: event.bubble.intercept_may_expand
// generator: handler returning two intents
// predicate: both appear in place of the original
it("p_expand: both appear in place of the original", () => {
  const view = on("select", () => [["one"], ["two"]], emitter([["select", "a"]]));
  expect(dispatch(view, mouseDown([5, 5]))).toEqual([["one"], ["two"]]);

  // Generalized property: the handler's output is spliced in place of
  // the original intent — zero, one or many.
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 4 }), (count) => {
      const produced: readonly Intent[] = Array.from({ length: count }, (_, i) => ["out", i]);
      const wrapped = on("select", () => produced, emitter([["select", "a"]]), spacer(1, 1));
      expect(dispatch(wrapped, mouseDown([5, 5]))).toEqual(produced);
    }),
  );
});

// p_innermost — derives_from: event.bubble.innermost_first
// generator: two nested interceptors for one type
// predicate: the inner one rewrites it first and the outer never sees
// the original
it("p_innermost: the inner one rewrites it first and the outer never sees the original", () => {
  const outerCalls: unknown[][] = [];
  const innerNode = on("select", (v: unknown) => [["select", `inner:${String(v)}`]],
    emitter([["select", "orig"]]));
  const view = on("select", (...args: unknown[]) => {
    outerCalls.push(args);
    return [["select", `outer:${String(args[0])}`]];
  }, innerNode);
  expect(dispatch(view, mouseDown([5, 5]))).toEqual([["select", "outer:inner:orig"]]);
  // the outer handler never saw the original argument
  expect(outerCalls).toEqual([["inner:orig"]]);
});

// p_middleware — derives_from: event.bubble.wrap_on_middleware
// generator: todo-app enter key wrapper
// predicate: enter with non-empty default effects returns add-todo then
// set next-todo-text to empty, any other key returns the default effects
it("p_middleware: enter with non-empty default effects returns add-todo then set next-todo-text to empty, any other key returns the default effects", () => {
  // the default handler is the wrapped key-press handling of the body
  const body = on("key-press", (key: unknown) =>
    key === "Enter" ? [["default-effect"]] : [], spacer(1, 1));
  const view = wrapOn([["key-press", (def: DefaultHandler, key: unknown) => {
    const defaultEffects = def(key);
    if (key === "Enter" && defaultEffects.length > 0) {
      return [["add-todo"], ["set", ["next-todo-text"], ""]];
    }
    return defaultEffects;
  }]], body);
  expect(dispatch(view, keyPress("Enter"))).toEqual([
    ["add-todo"],
    ["set", ["next-todo-text"], ""],
  ]);
  // any other key returns the default effects
  expect(dispatch(view, keyPress("a"))).toEqual([]);

  // Generalized property: a middleware may skip the default handler or
  // pass it through, per key.
  fc.assert(
    fc.property(fc.constantFrom("Enter", "a", "b"), (key) => {
      const bodyNode = on("key-press", () => [["default-effect"]], spacer(1, 1));
      const wrapped = wrapOn([
        ["key-press", (def: DefaultHandler, k: unknown) =>
          k === "Enter" ? [["handled"]] : def(k)],
      ], bodyNode);
      const expected = key === "Enter" ? [["handled"]] : [["default-effect"]];
      expect(dispatch(wrapped, keyPress(key))).toEqual(expected);
    }),
  );
});

// p_wrap_order — derives_from: event.bubble.wrap_on_ordering
// generator: two pairs
// predicate: the first pair wraps the second
it("p_wrap_order: the first pair wraps the second", () => {
  const body = on("key-press", () => [["body"]], spacer(1, 1));
  const view = wrapOn([
    ["key-press", (def: DefaultHandler) => [...def(), ["outer"]]],
    ["key-press", (def: DefaultHandler) => [...def(), ["inner"]]],
  ], body);
  // the first pair is outermost: its contribution lands last
  expect(dispatch(view, keyPress("Enter"))).toEqual([["body"], ["inner"], ["outer"]]);
});

// p_multi — derives_from: event.bubble.on_multi_pairs
// generator: on with three handlers
// predicate: equals three nested single-pair nodes
it("p_multi: equals three nested single-pair nodes", () => {
  const h1 = () => [["one"]];
  const h2 = () => [["custom-select", "x"]];
  const h3 = (v: unknown) => [["got", v]];
  const pairs: readonly (readonly [string, Handler])[] = [
    ["mouse-down", h1],
    ["key-press", h2],
    ["custom-select", h3],
  ];
  const multi = onPairs(pairs, spacer(10, 10));
  const nested = on("mouse-down", h1,
    on("key-press", h2,
      on("custom-select", h3, spacer(10, 10))));

  // behavioral equivalence under every relevant event; the key-press
  // handler's own result is appended after the children — it does not
  // re-descend through the nested custom-select interceptor
  expect(dispatch(multi, mouseDown([5, 5]))).toEqual(dispatch(nested, mouseDown([5, 5])));
  expect(dispatch(multi, mouseDown([5, 5]))).toEqual([["one"]]);
  expect(dispatch(multi, keyPress("a"))).toEqual(dispatch(nested, keyPress("a")));
  expect(dispatch(multi, keyPress("a"))).toEqual([["custom-select", "x"]]);
});

// p_raw_bubble — derives_from: event.bubble.on_bubble_raw
// generator: handler dropping all intents
// predicate: result is empty
it("p_raw_bubble: result is empty", () => {
  const view = onBubble(() => [], emitter([["whatever"], ["else"]]));
  expect(dispatch(view, mouseDown([5, 5]))).toEqual([]);

  // Generalized property: whatever the children produce, the raw
  // bubble's return value replaces the whole list.
  fc.assert(
    fc.property(fc.array(fc.nat(9), { maxLength: 5 }), (nums) => {
      const childIntents: readonly Intent[] = nums.map((n) => ["child", n]);
      const replacement: readonly Intent[] = [["replaced"]];
      const tree = onBubble(() => replacement, emitter(childIntents));
      expect(dispatch(tree, mouseDown([5, 5]))).toEqual(replacement);
    }),
  );
});

// p_builtin — derives_from: event.bubble.intercept_builtin_effects
// generator: a row returning update of selected? with not under an on
// update wrapper
// predicate: the wrapper replaces it with the set-membership update and
// the original never reaches the dispatcher
it("p_builtin: the wrapper replaces it with the set-membership update and the original never reaches the dispatcher", () => {
  // the file selector keeps a set of selected paths; a row toggles its
  // membership with an update of not, which the wrapper rewrites into
  // a set of the new membership
  const membership = { selected: new Set<string>(["a.txt"]) };
  const inner = emitter([["update", "a.txt", (inSet: boolean) => !inSet]]);
  const view = on("update", (path: unknown, f: unknown) => {
    const toggle = f as (v: boolean) => boolean;
    const after = toggle(membership.selected.has(path as string));
    if (after) membership.selected.add(path as string);
    else membership.selected.delete(path as string);
    return [["set", ["membership"], after]];
  }, inner);
  expect(dispatch(view, mouseDown([5, 5]))).toEqual([["set", ["membership"], false]]);
  // the original update intent never reached the dispatcher
  expect(membership.selected.has("a.txt")).toBe(false);

  // the other built-in effect types intercept like any custom type
  const setView = on("set", () => [["intercepted-set"]], emitter([["set", ["k"], 1]]));
  expect(dispatch(setView, mouseDown([5, 5]))).toEqual([["intercepted-set"]]);
  const deleteView = on("delete", () => [["intercepted-delete"]], emitter([["delete", ["k"]]]));
  expect(dispatch(deleteView, mouseDown([5, 5]))).toEqual([["intercepted-delete"]]);
});
