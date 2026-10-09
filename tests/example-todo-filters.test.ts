// Purpose: executable contract tests for the example-todo spec's
//   filter toggle and filter behavior — the toggle's render and click
//   effects, the default filter, the filter fns, and the unknown-filter
//   advisory.
// Responsibilities: encode the spec rows' generators and predicates as
//   vitest + fast-check properties, one test per converted property.
// Rationale: openspec/specs/example-todo/spec.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate
//   text). No vacuous predicates: every test carries the spec's example
//   value verbatim plus a generalized fast-check property where the row
//   states a general rule. Split out of the former monolithic
//   tests/example-todo.test.ts (tambor-272).

import { expect, it } from "vitest";
import fc from "fast-check";

import {
  bounds,
  type Elem,
  type HandlerNode,
  type Label,
  type Node,
  type SpacerNode,
  type TranslateNode,
  type WithColorNode,
} from "../src/views/model.ts";
import { dispatch } from "../src/events/dispatch.ts";
import { mouseDown } from "../src/events/event.ts";
import {
  FILTER_OPTIONS,
  FILTER_PATH,
  filterFn,
  todoApp,
  todoState,
  toggle,
} from "../src/examples/todo/todo.ts";
import { findNode, scanOf } from "./helpers/scan.ts";
import {
  arbTodoItem,
  listGroupOf,
  rowDescriptionsOf,
  stateWithoutFilter,
} from "./helpers/todo.ts";

// A translate wrapping the 5 px interposed spacer's drawable: a
// non-array node whose type is spacer.
function isSpacerDrawable(drawable: unknown): boolean {
  return (
    !Array.isArray(drawable) &&
    (drawable as Node | null) !== null &&
    (drawable as Node).type === "spacer"
  );
}

// A list child that is a translate wrapping the 5 px interposed spacer
// rather than a row group.
function isSpacerRow(el: unknown): boolean {
  if (Array.isArray(el)) return false;
  const t = el as TranslateNode;
  return t.type === "translate" && isSpacerDrawable(t.drawable);
}

// The number of visible rows in the app's list.
function rowCountOf(appView: Elem): number {
  const list = listGroupOf(appView);
  if (list == null) return 0;
  // every list child is a row group or a translate wrapping the 5 px
  // interposed spacer
  return (list as readonly Elem[]).filter((el) => !isSpacerRow(el)).length;
}

// p_toggle_render — derives_from: example.todo.toggle_render
// generator: options all, active, complete with selected active —
// predicate: active is plain and the other two are gray and clickable
it("p_toggle_render: active is plain and the other two are gray and clickable", () => {
  // The spec's example value must hold verbatim.
  const t = toggle(FILTER_OPTIONS, "active", FILTER_PATH);
  const labels = scanOf(t).filter((f) => f.node.type === "label");
  expect(labels.map((f) => (f.node as Label).text)).toEqual(["all", "active", "complete"]);
  const byText = (text: string) => labels.find((f) => (f.node as Label).text === text)!;
  // the selected option is a plain label
  const active = byText("active");
  expect(active.underColor).toBe(false);
  expect(active.underHandler).toBe(false);
  // every other option is a clickable label in gray [0.8, 0.8, 0.8],
  // separated by 5 px spacers
  const colorWrap = scanOf(t).find((g) => g.node.type === "with-color")!.node as WithColorNode;
  expect(colorWrap.color).toEqual([0.8, 0.8, 0.8]);
  for (const text of ["all", "complete"]) {
    const f = byText(text);
    expect(f.underColor).toBe(true);
    expect(f.underHandler).toBe(true);
  }
  const spacers = scanOf(t).filter((f) => f.node.type === "spacer");
  expect(spacers).toHaveLength(2);
  for (const s of spacers) expect((s.node as SpacerNode).x).toBe(5);

  // Generalized property: for every choice of selected option, exactly
  // one label is plain and the rest are gray and clickable.
  fc.assert(
    fc.property(fc.constantFrom(...FILTER_OPTIONS), (selected) => {
      const tg = toggle(FILTER_OPTIONS, selected, FILTER_PATH);
      const ls = scanOf(tg).filter((f) => f.node.type === "label");
      const plain = ls.filter((f) => !f.underColor && !f.underHandler);
      expect(plain).toHaveLength(1);
      expect((plain[0]!.node as Label).text).toBe(selected);
      expect(ls.filter((f) => f.underColor && f.underHandler)).toHaveLength(2);
    }),
  );
});

// p_toggle — derives_from: example.todo.toggle_sets_filter
// generator: click on the active label — predicate: effect is set
// selected-filter to active, and a click on the selected label returns
// nothing
it("p_toggle: effect is set selected-filter to active, and a click on the selected label returns nothing", () => {
  // The spec's example value must hold verbatim.
  const t = toggle(FILTER_OPTIONS, "all", FILTER_PATH);
  const found = scanOf(t).find(
    (f) => f.node.type === "handler" && scanOf(f.node as Elem).some((g) => g.node.type === "label" && (g.node as Label).text === "active"),
  )!;
  const activeHandler = found.node as HandlerNode;
  const [w, h] = bounds(activeHandler);
  expect(dispatch(t, mouseDown([found.x + w / 2, found.y + h / 2]))).toEqual([
    ["set", FILTER_PATH, "active"],
  ]);
  // a click on the selected option's plain label returns nothing
  const allPlain = findNode(t, (f) => f.node.type === "label" && (f.node as Label).text === "all")!;
  const [aw, ah] = bounds(allPlain.node);
  expect(dispatch(t, mouseDown([allPlain.x + aw / 2, allPlain.y + ah / 2]))).toEqual([]);

  // Generalized property: clicking any non-selected option returns set
  // with the selected path and that option; clicking the selected
  // option returns nothing.
  fc.assert(
    fc.property(fc.constantFrom(...FILTER_OPTIONS), fc.constantFrom(...FILTER_OPTIONS), (selected, clicked) => {
      const tg = toggle(FILTER_OPTIONS, selected, FILTER_PATH);
      const found = scanOf(tg).find(
        (f) => f.node.type === "handler" && scanOf(f.node as Elem).some((g) => g.node.type === "label" && (g.node as Label).text === clicked),
      );
      if (found !== undefined) {
        // a non-selected option is gray and clickable
        const [cw, ch] = bounds(found.node as Node);
        expect(dispatch(tg, mouseDown([found.x + cw / 2, found.y + ch / 2]))).toEqual([
          ["set", FILTER_PATH, clicked],
        ]);
      } else {
        // the selected option is plain and handles nothing
        const plain = scanOf(tg).find(
          (f) => f.node.type === "label" && (f.node as Label).text === clicked && !f.underColor && !f.underHandler,
        );
        expect(plain).toBeDefined();
        const [pw, ph] = bounds(plain!.node);
        expect(dispatch(tg, mouseDown([plain!.x + pw / 2, plain!.y + ph / 2]))).toEqual([]);
      }
    }),
  );
});

// p_filter_default — derives_from: example.todo.filter_default
// generator: no selected-filter — predicate: the unfiltered option is
// selected and three rows render
it("p_filter_default: the unfiltered option is selected and three rows render", () => {
  // The spec's example value must hold verbatim.
  const app = todoApp(stateWithoutFilter(), {});
  expect(rowCountOf(app)).toBe(3);
  expect(rowDescriptionsOf(app)).toEqual(["first", "second", "third"]);
  // the toggle shows "all" as the plain (selected) option
  const all = scanOf(app).find((f) => f.node.type === "label" && (f.node as Label).text === "all")!;
  expect(all.underColor).toBe(false);
  expect(all.underHandler).toBe(false);

  // Generalized property: whatever the todos, a missing selected-filter
  // shows every row.
  fc.assert(
    fc.property(fc.array(arbTodoItem, { minLength: 0, maxLength: 5 }), (items) => {
      const view = todoApp({ todos: items, "next-todo-text": "" }, {});
      expect(rowDescriptionsOf(view)).toEqual(items.map((t) => t.description));
    }),
  );
});

// p_filter_fns — derives_from: example.todo.filter_fns
// generator: todos first, second, third with third complete —
// predicate: unfiltered shows 3, active shows first and second,
// complete shows third
it("p_filter_fns: unfiltered shows 3, active shows first and second, complete shows third", () => {
  // The spec's example value must hold verbatim.
  for (const [sel, expected] of [
    ["all", ["first", "second", "third"]],
    ["active", ["first", "second"]],
    ["complete", ["third"]],
  ] as const) {
    const view = todoApp({ ...todoState(), "selected-filter": sel }, {});
    expect(rowDescriptionsOf(view)).toEqual(expected);
  }
  // the complete view really renders only the third row
  expect(rowCountOf(todoApp({ ...todoState(), "selected-filter": "complete" }, {}))).toBe(1);

  // Generalized property: the filter fns partition the todos — active
  // shows exactly those with complete? false, complete exactly those
  // with complete? true, unfiltered everything.
  fc.assert(
    fc.property(fc.array(arbTodoItem, { minLength: 0, maxLength: 8 }), (items) => {
      const shown = (name: string) => items.filter(filterFn(name)).map((t) => t.description);
      expect(shown("all")).toEqual(items.map((t) => t.description));
      expect(shown("active")).toEqual(items.filter((t) => t["complete?"] !== true).map((t) => t.description));
      expect(shown("complete")).toEqual(items.filter((t) => t["complete?"] === true).map((t) => t.description));
    }),
  );
});

// p_unknown_filter — derives_from: example.todo.unknown_filter_all (the
// advisory: the port shows all, the original hid everything)
// generator: selected-filter bogus — predicate: three rows render
it("p_unknown_filter: three rows render", () => {
  // The spec's example value must hold verbatim.
  const view = todoApp({ ...todoState(), "selected-filter": "bogus" }, {});
  expect(rowCountOf(view)).toBe(3);
  expect(rowDescriptionsOf(view)).toEqual(["first", "second", "third"]);

  // Generalized property: any unknown filter name shows all todos.
  fc.assert(
    fc.property(
      fc.string({ minLength: 1, maxLength: 10 }).filter((s) => !["all", "active", "complete"].includes(s)),
      fc.array(arbTodoItem, { minLength: 1, maxLength: 4 }),
      (bogus, items) => {
        const view2 = todoApp({ todos: items, "next-todo-text": "", "selected-filter": bogus }, {});
        expect(rowDescriptionsOf(view2)).toEqual(items.map((t) => t.description));
      },
    ),
  );
});
