// Purpose: executable contract tests for the example-file_selector spec.
// Responsibilities: encode the spec rows' generators and predicates as
//   vitest + fast-check properties, one test per converted property.
// Rationale: openspec/specs/example-file_selector/spec.md is the design authority;
//   each predicate here mirrors a Properties row (provenance:
//   src/membrane/example/file_selector.clj, see TRACEABILITY.md).

import { expect, it } from "vitest";
import fc from "fast-check";

import {
  fileSelector,
  itemRow,
  itemSelector,
  SELECTED_PATH,
  STR_FILTER_PATH,
} from "../src/examples/file_selector/fileSelector.ts";
import { type Node } from "../src/views/model.ts";
import { dispatch } from "../src/events/dispatch.ts";
import { mouseDown } from "../src/events/event.ts";
import {
  bounds,
  isGroup,
  type CheckboxNode,
  type Elem,
  type HandlerNode,
  type Label,
  type SpacerNode,
  type TranslateNode,
} from "../src/views/model.ts";
import { select, type Path } from "../src/effects/paths.ts";

// The row's own selected? path, as plain data (a scratch key of the
// row's call site in the corpus run; any path the caller supplies).
const ROW_SELECTED: Path = [["keypath", "selected?"]];
// The selector's state paths: the selected set and the filter text.
const SEL = SELECTED_PATH;

// The row's layout, unwrapped from the mouse-down handler node.
function rowLayout(row: HandlerNode): readonly Elem[] {
  return row.drawables[0] as readonly Elem[];
}

// A point inside the row whose label reads name, found by walking the
// tree with accumulated translate offsets (a tap on the label is inside
// the row handler's bounds).
function findPoint(elem: Elem, name: string, acc: readonly [number, number] = [0, 0]): readonly [number, number] {
  if (elem == null) throw new Error(`no row labelled ${name}`);
  if (isGroup(elem)) return findInChildren(elem, name, acc);
  return findPointNode(elem as Node, name, acc);
}

function findPointNode(elem: Node, name: string, acc: readonly [number, number]): readonly [number, number] {
  if (elem.type === "translate") {
    return findPoint((elem as { drawable: Elem }).drawable, name, [acc[0] + (elem as { x: number }).x, acc[1] + (elem as { y: number }).y]);
  }
  return findPointWrapper(elem, name, acc);
}

function findPointWrapper(elem: Node, name: string, acc: readonly [number, number]): readonly [number, number] {
  const wrapped = drawablesOfWrapper(elem);
  if (wrapped) return findInChildren(wrapped, name, acc);
  return findLabelPoint(elem, name, acc);
}

function findLabelPoint(elem: Node, name: string, acc: readonly [number, number]): readonly [number, number] {
  if (elem.type === "label" && elem.text === name) return acc;
  throw new Error(`no row labelled ${name}`);
}

// The wrapper node kinds whose drawables the point search descends into.
const WRAPPER_KINDS: ReadonlySet<string> = new Set([
  "handler",
  "with-color",
  "with-style",
  "with-stroke-width",
]);

// The wrapper node kinds' drawables, or null when the node is not a
// wrapper the point search descends into.
function drawablesOfWrapper(elem: Node): readonly Elem[] | null {
  if (!WRAPPER_KINDS.has(elem.type)) return null;
  return (elem as { drawables: readonly Elem[] }).drawables;
}

// The children are searched in order; the first child that yields a
// point wins, a child with no such row falls through.
function findInChildren(children: readonly Elem[], name: string, acc: readonly [number, number]): readonly [number, number] {
  for (const child of children) {
    try {
      return findPoint(child, name, acc);
    } catch {
      continue;
    }
  }
  throw new Error(`no row labelled ${name}`);
}

// One node's contribution to a row's (name, checked): the checkbox
// reports its checked flag, the first label the row's name.
function recordLeaf(node: Node, info: { name: string | null; checked: boolean }): void {
  if ((node as { type: string }).type === "checkbox") {
    info.checked = (node as { checked: boolean }).checked;
    return;
  }
  recordLabel(node, info);
}

function recordLabel(node: Node, info: { name: string | null; checked: boolean }): void {
  if (node.type !== "label" || info.name !== null) return;
  info.name = node.text;
}

// Descend into translate/wrapper nodes; record leaf contributions.
function walkNodeRow(e: Node, info: { name: string | null; checked: boolean }): void {
  if (e.type === "translate") {
    walkRow((e as { drawable: Elem }).drawable, info);
    return;
  }
  const wrapped = drawablesOfWrapper(e);
  if (wrapped) {
    wrapped.forEach((child) => walkRow(child, info));
    return;
  }
  recordLeaf(e, info);
}

// One element of the row tree: null, group, or drawable node.
function walkRow(e: Elem, info: { name: string | null; checked: boolean }): void {
  if (e == null) return;
  if (isGroup(e)) {
    e.forEach((child) => walkRow(child, info));
    return;
  }
  walkNodeRow(e as Node, info);
}

// The visible rows of a rendered selector, in order: each row's name
// and whether its checkbox is checked. The first child is the filter
// textarea, not a row.
function visibleRows(view: readonly Elem[]): readonly { name: string; checked: boolean }[] {
  const info = (elem: Elem): { name: string; checked: boolean } | null => {
    const acc: { name: string | null; checked: boolean } = { name: null, checked: false };
    walkRow(elem, acc);
    return acc.name === null ? null : { name: acc.name, checked: acc.checked };
  };
  const rows: { name: string; checked: boolean }[] = [];
  for (const child of view.slice(1)) {
    const r = info(child);
    if (r !== null) rows.push(r);
  }
  return rows;
}

const NAMES = ["a.txt", "B.md", "notes"];
// The intercept generator's names include the tapped item b.
const INTERCEPT_NAMES = ["a.txt", "b"];

// p_row_layout — derives_from: example.file_selector.row_layout
// generator: one row — predicate: checkbox at origin [5, 5], then
// spacer, then label in order
it("p_row_layout: checkbox at origin [5, 5], then spacer, then label in order", () => {
  // The spec's example value must hold verbatim.
  const row = itemRow("notes.txt", false, ROW_SELECTED) as HandlerNode;
  const [cb, sp, lbl] = rowLayout(row) as [TranslateNode, TranslateNode, TranslateNode];
  expect(cb.type).toBe("translate");
  expect([cb.x, cb.y]).toEqual([5, 5]);
  expect((cb.drawable as CheckboxNode).type).toBe("checkbox");
  expect((cb.drawable as CheckboxNode).checked).toBe(false);
  expect((sp.drawable as SpacerNode).type).toBe("spacer");
  expect((lbl.drawable as Label).type).toBe("label");
  expect((lbl.drawable as Label).text).toBe("notes.txt");

  // Generalized property: the order and the checkbox origin hold for
  // every name and both checked states.
  fc.assert(
    fc.property(fc.string({ minLength: 1 }), fc.boolean(), (name, selected) => {
      const r = itemRow(name, selected, ROW_SELECTED) as HandlerNode;
      const [c, s, l] = rowLayout(r) as [TranslateNode, TranslateNode, TranslateNode];
      expect([c.x, c.y]).toEqual([5, 5]);
      expect((c.drawable as CheckboxNode).type).toBe("checkbox");
      expect((c.drawable as CheckboxNode).checked).toBe(selected);
      expect((s.drawable as SpacerNode).type).toBe("spacer");
      expect((l.drawable as Label).text).toBe(name);
    }),
  );
});

// p_row_default — derives_from: example.file_selector.row_default_toggle
// generator: a row alone — predicate: the intent is update with the
// selected? path and not
it("p_row_default: the intent is update with the selected? path and not", () => {
  // The spec's example value must hold verbatim.
  const row = itemRow("b", false, ROW_SELECTED) as HandlerNode;
  const [w, h] = bounds(row);
  const intents = dispatch(row, mouseDown([w / 2, h / 2]));
  expect(intents).toHaveLength(1);
  const [type, path, fn] = intents[0] as [string, Path, (x: unknown) => unknown];
  expect(type).toBe("update");
  expect(path).toEqual(ROW_SELECTED);
  // logical not
  expect(fn(true)).toBe(false);
  expect(fn(false)).toBe(true);

  // Generalized property: for every name and checked state, a pointer
  // down on a row alone returns exactly that built-in update.
  fc.assert(
    fc.property(fc.string({ minLength: 1 }), fc.boolean(), (name, selected) => {
      const r = itemRow(name, selected, ROW_SELECTED) as HandlerNode;
      const [bw, bh] = bounds(r);
      const res = dispatch(r, mouseDown([bw / 2, bh / 2]));
      expect(res).toHaveLength(1);
      const [t, p, f] = res[0] as [string, Path, (x: unknown) => unknown];
      expect(t).toBe("update");
      expect(p).toEqual(ROW_SELECTED);
      expect(f(selected)).toBe(!selected);
    }),
  );
});

// p_intercept — derives_from: example.file_selector.set_intercept
// generator: selected set empty then containing b — predicate: tapping b
// yields add then remove, and the boolean path is never touched
it("p_intercept: tapping b yields add then remove, and the boolean path is never touched", () => {
  // selected set empty: tapping b adds b
  const empty = itemSelector(INTERCEPT_NAMES, { selected: new Set<string>(), $selected: SEL }) as readonly Elem[];
  const [type, path, fn] = dispatch(empty, mouseDown(findPoint(empty, "b")))[0] as [
    string,
    Path,
    (set: unknown) => unknown,
  ];
  expect(type).toBe("update");
  expect(path).toEqual(SEL);
  expect(fn(new Set<string>())).toEqual(new Set(["b"]));

  // selected set containing b: tapping b removes it
  const containing = itemSelector(INTERCEPT_NAMES, { selected: new Set(["b"]), $selected: SEL }) as readonly Elem[];
  const intents = dispatch(containing, mouseDown(findPoint(containing, "b")));
  expect(intents).toHaveLength(1);
  const [type2, path2, fn2] = intents[0] as [string, Path, (set: unknown) => unknown];
  expect(type2).toBe("update");
  expect(path2).toEqual(SEL);
  expect(fn2(new Set(["b"]))).toEqual(new Set<string>());
  // the boolean path is never touched: the only intent is the set
  // update — the built-in update of the row's selected? path never
  // reaches the dispatcher
  expect(path2).not.toEqual(ROW_SELECTED);
});

// p_filter — derives_from: example.file_selector.filter_matches
// generator: names a.txt, B.md, notes with filter b and filter t —
// predicate: b shows B.md and a.txt does not match, t shows a.txt and notes
it("p_filter: b shows B.md and a.txt does not match, t shows a.txt and notes", () => {
  // The spec's example values must hold verbatim.
  const withB = itemSelector(NAMES, { strFilter: "b" }) as readonly Elem[];
  expect(visibleRows(withB).map((r) => r.name)).toEqual(["B.md"]);
  const withT = itemSelector(NAMES, { strFilter: "t" }) as readonly Elem[];
  expect(visibleRows(withT).map((r) => r.name)).toEqual(["a.txt", "notes"]);

  // Generalized property: an item is shown exactly when its lower-cased
  // name contains the filter text as a substring — the filter is
  // matched against the lower-cased name as given.
  fc.assert(
    fc.property(
      fc.array(fc.string({ minLength: 1 }), { minLength: 0, maxLength: 8 }),
      fc.string(),
      (names, filter) => {
        const view = itemSelector(names, { strFilter: filter }) as readonly Elem[];
        expect(visibleRows(view).map((r) => r.name)).toEqual(
          names.filter((n) => n.toLowerCase().includes(filter)),
        );
      },
    ),
  );
});

// p_defaults — derives_from: example.file_selector.filter_defaults
// generator: no props besides names — predicate: all names shown and the
// selected set is empty
it("p_defaults: all names shown and the selected set is empty", () => {
  // The spec's example value must hold verbatim.
  const view = itemSelector(NAMES) as readonly Elem[];
  expect(visibleRows(view)).toEqual([
    { name: "a.txt", checked: false },
    { name: "B.md", checked: false },
    { name: "notes", checked: false },
  ]);
  // the filter textarea is shown above the rows
  expect(view[0]).toBeDefined();

  // Generalized property: with no props besides names every name shows,
  // unchecked, for any list of names.
  fc.assert(
    fc.property(fc.array(fc.string({ minLength: 1 }), { minLength: 0, maxLength: 8 }), (names) => {
      expect(visibleRows(itemSelector(names) as readonly Elem[])).toEqual(
        names.map((name) => ({ name, checked: false })),
      );
    }),
  );
});

// p_membership — derives_from: example.file_selector.selected_membership
// generator: selected set containing a.txt — predicate: only that row is
// checked
it("p_membership: only that row is checked", () => {
  // The spec's example value must hold verbatim.
  const view = itemSelector(NAMES, { selected: new Set(["a.txt"]), $selected: SEL }) as readonly Elem[];
  expect(visibleRows(view)).toEqual([
    { name: "a.txt", checked: true },
    { name: "B.md", checked: false },
    { name: "notes", checked: false },
  ]);

  // Generalized property: a row's selected? is whether the name is a
  // member of the selected set, for every subset of the names.
  fc.assert(
    fc.property(fc.shuffledSubarray(NAMES, { minLength: 0, maxLength: 3 }), (picked) => {
      const v = itemSelector(NAMES, { selected: new Set(picked), $selected: SEL }) as readonly Elem[];
      expect(visibleRows(v)).toEqual(
        NAMES.map((name) => ({ name, checked: picked.includes(name) })),
      );
    }),
  );
});

// p_persist — derives_from: example.file_selector.selection_persists_under_filter
// generator: select a.txt then filter to nothing then clear — predicate:
// a.txt is still selected
it("p_persist: a.txt is still selected", () => {
  // The spec's example value must hold verbatim: select a.txt, then
  // filter to nothing, then clear the filter.
  const session = fileSelector(NAMES);
  session.send(mouseDown(findPoint(session.render(), "a.txt")));
  // filter to nothing: nothing matches, but the selection is untouched
  session.dispatch([["set", STR_FILTER_PATH, "zzz"]]);
  expect(visibleRows(session.render() as readonly Elem[]).map((r) => r.name)).toEqual([]);
  // clear the filter: every row is back and a.txt is still selected
  session.dispatch([["set", STR_FILTER_PATH, ""]]);
  expect(visibleRows(session.render() as readonly Elem[]).map((r) => r.name)).toEqual(NAMES);
  expect(session.stop()).toEqual(new Set(["a.txt"]));

  // Generalized property: changing the filter never changes the
  // selected set, for any filter applied after any selection.
  fc.assert(
    fc.property(fc.string(), (filter) => {
      const s = fileSelector(NAMES);
      s.send(mouseDown(findPoint(s.render(), "a.txt")));
      s.dispatch([["set", STR_FILTER_PATH, filter]]);
      expect(s.stop()).toEqual(new Set(["a.txt"]));
    }),
  );
});

// p_result — derives_from: example.file_selector.result_is_state
// generator: select two items and stop — predicate: the returned set
// equals the state set
it("p_result: the returned set equals the state set", () => {
  // The spec's example value must hold verbatim: select two items and
  // stop; the returned set is read from the state, as file-selector does.
  const session = fileSelector(NAMES);
  session.send(mouseDown(findPoint(session.render(), "a.txt")));
  session.send(mouseDown(findPoint(session.render(), "B.md")));
  const returned = session.stop();
  expect(returned).toEqual(new Set(["a.txt", "B.md"]));
  // it is the state's own set, not parallel bookkeeping
  expect(returned).toEqual(select(session.getState(), SEL) as ReadonlySet<string>);

  // Generalized property: for any two distinct items, stopping after
  // selecting both returns the state's set of both.
  fc.assert(
    fc.property(fc.constantFrom("a.txt", "B.md", "notes", "b"), fc.constantFrom("a.txt", "B.md", "notes", "b"), (x, y) => {
      if (x === y) return;
      const s = fileSelector(["a.txt", "B.md", "notes", "b"]);
      s.send(mouseDown(findPoint(s.render(), x)));
      s.send(mouseDown(findPoint(s.render(), y)));
      expect(s.stop()).toEqual(new Set([x, y]));
    }),
  );
});
