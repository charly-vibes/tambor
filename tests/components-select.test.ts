// Purpose: executable contract tests for the components.select spec — the
//   dropdown/dropdown-list port from basic_components.cljc.
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property,
//   plus the drawn-layout check that the open list is translated below
//   the header (bare sequence children share the origin).
// Rationale: openspec/specs/components-select/spec.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate
//   text) of that spec. No vacuous predicates: every check encodes its
//   row's stated behavior.

import { expect, it } from "vitest";
import fc from "fast-check";

import { contrast } from "./e2e/audit-color.ts";
import { call, render } from "../src/model/component.ts";
import { makeApp } from "../src/effects/dispatch.ts";
import { select as selectPath, type Path } from "../src/effects/paths.ts";
import { dispatch as dispatchEvent } from "../src/events/dispatch.ts";
import { mouseDown, mouseMove, mouseMoveGlobal } from "../src/events/event.ts";
import { HOVER_FILL, SELECTED_FILL, WHITE } from "../src/components/select/list.ts";
import { hoverKey } from "../src/components/select/hover.ts";
import type { Elem } from "../src/views/model.ts";
import { dropdown } from "../src/components/select/dropdown.ts";
import {
  applyEffects,
  collect,
  colorsEqual,
  dropdownView,
  isLabel,
  isListNode,
  isRect,
  isTranslate,
  isWithColor,
  listView,
  placedNodes,
  type Option,
  $SELECTED,
} from "./helpers/select-view.ts";

// ---------------------------------------------------------------------------
// cycle 1 — header
// ---------------------------------------------------------------------------

// p_header_toggle — derives_from: components.select.header_toggles
// generator: open? false then true
// predicate: the effect flips open?
it("p_header_toggle: the effect flips open?", () => {
  const state: Record<string, unknown> = { selected: "this", "::extra": {} };
  const intents = dispatchEvent(dropdownView(state, state["selected"]), mouseDown([0, 0]));
  expect(intents.length).toBe(1);
  const intent = intents[0] as unknown[];
  // the effect updates open?
  expect(intent[0]).toBe("update");
  // ...at the dropdown's open? scratch
  const path = intent[1] as Path;
  expect(path[path.length - 1]).toEqual(["keypath", "open?"]);
  // open? false then true: the update function is logical not
  const fn = intent[2] as (old: unknown) => unknown;
  expect(fn(false)).toBe(true);
  expect(fn(true)).toBe(false);
});

// p_header_label — derives_from: components.select.header_label
// generator: options this, that, the-other and selected that
// predicate: label is That, and with nil it is no selection
it("p_header_label: label is That, and with nil it is no selection", () => {
  // selected that → the header shows the matching option's label
  const selected = dropdownView({ "::extra": {} }, "that");
  const texts = collect(selected, isLabel).map((l) => l.text);
  expect(texts).toContain("That");
  expect(texts).not.toContain("no selection");

  // selected nil → gray "no selection" (gray: r = g = b)
  const nil = dropdownView({ "::extra": {} }, null);
  const nilLabels = collect(nil, isLabel).map((l) => l.text);
  expect(nilLabels).toContain("no selection");
  expect(nilLabels).not.toContain("That");
  const grays = collect(nil, isWithColor)
    .filter((w) => w.color.length === 3 && w.color[0] === w.color[1] && w.color[1] === w.color[2]);
  expect(grays.length).toBeGreaterThan(0);
  // the gray is characterized by the accessibility floor, not a literal
  // (add-demo-visual-polish D1): contrast ≥ 4.5:1 against the
  // light-shell white
  for (const w of grays) {
    const ink8bit: readonly [number, number, number] = [
      Math.round(w.color[0]! * 255),
      Math.round(w.color[1]! * 255),
      Math.round(w.color[2]! * 255),
    ];
    expect(contrast(ink8bit, [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
  }
  expect(
    grays.some((w) => collect(w.drawables as Elem, isLabel).some((l) => l.text === "no selection")),
  ).toBe(true);

  // the first option whose value equals selected wins
  fc.assert(
    fc.property(fc.string(), fc.string(), (first, second) => {
      if (first === second) return; // need distinct labels
      const dup: readonly Option[] = [
        ["dup", first],
        ["dup", second],
      ];
      const view = render(
        call(dropdown, { selected: "dup", options: dup, $selected: $SELECTED }, {}),
      ) as Elem;
      expect(collect(view, isLabel).map((l) => l.text)).toContain(first);
      expect(collect(view, isLabel).map((l) => l.text)).not.toContain(second);
    }),
  );
});

// ---------------------------------------------------------------------------
// cycle 2 — open, choose, close
// ---------------------------------------------------------------------------

// p_list_open — derives_from: components.select.list_when_open
// generator: open? both values
// predicate: list nodes exist only when open
it("p_list_open: list nodes exist only when open", () => {
  fc.assert(
    fc.property(fc.boolean(), (open) => {
      const view = dropdownView({ "::extra": {} }, null, open ? { "open?": true } : {});
      const listNodes = collect(view, isListNode);
      // the box and the option rows exist only when open
      expect(listNodes.length > 0).toBe(open);
      expect(collect(view, isLabel).map((l) => l.text).includes("The Other")).toBe(open);
    }),
  );
});

// p_list_offset — derives_from: components.select.list_when_open
// generator: open? true
// predicate: the list starts below the header label
it("p_list_offset: the open list starts below the header label", () => {
  // the header label's own measured height (the renderer's measure)
  const closed = dropdownView({ "::extra": {} }, "that");
  const headerLabel = collect(closed, isLabel)[0]!;
  const headerHeight = headerLabel.measure(headerLabel.text)[1];

  const open = dropdownView({ "::extra": {} }, "that", { "open?": true });
  // the translate carrying the list box: a bare-sequence child would
  // share the header's origin, so the list only sits below the header
  // when a translate precedes it
  const list = placedNodes(open, isTranslate).find(
    (p) => collect(p.node.drawable, isListNode).length === 1,
  );
  expect(list).toBeDefined();
  // a 4 px gap below the header's bottom edge
  expect(list!.y).toBeGreaterThanOrEqual(headerHeight + 4);

  // every row label is drawn below the header's bottom edge
  const rows = placedNodes(list!.node.drawable, isLabel, list!.y);
  expect(rows.map((p) => p.node.text)).toEqual(["This", "That", "The Other"]);
  for (const row of rows) {
    expect(row.y).toBeGreaterThanOrEqual(headerHeight + 4);
  }

  // closed: no list, the header alone at the origin
  expect(collect(closed, isListNode).length).toBe(0);
});

// p_row_effect — derives_from: components.select.row_select_effect
// generator: click second row
// predicate: effect is select with the selected path and that
it("p_row_effect: effect is select with the selected path and that", () => {
  // default measure: labels are 1 tall, rows 5 tall; the second row
  // spans y = 8 + 5 .. 8 + 10 (box has 8 padding on y)
  const intents = dispatchEvent(listView(null), mouseDown([5, 8 + 5 + 2]));
  expect(intents).toEqual([["select", $SELECTED, "that"]]);
});

// p_select_closes — derives_from: components.select.select_closes
// generator: a select intent
// predicate: output is select then set open? false
it("p_select_closes: output is select then set open? false", () => {
  const view = dropdownView({ "::extra": {} }, null, { "open?": true });
  // the dropdown's open? scratch is wherever the header toggle writes
  const $open = (dispatchEvent(view, mouseDown([0, 0]))[0] as unknown[])[1] as Path;
  // a select intent through the open dropdown comes out expanded — the
  // click targets the "that" row where the translate draws it
  const that = placedNodes(view, isLabel).find((p) => p.node.text === "That")!;
  const intents = dispatchEvent(view, mouseDown([5, that.y + 2]));
  expect(intents).toEqual([
    ["select", $SELECTED, "that"],
    ["set", $open, false],
  ]);
});

// p_select_sets — derives_from: components.select.select_sets_value
// generator: select then read
// predicate: the selected path holds the value
it("p_select_sets: the selected path holds the value", () => {
  // the this/that scenario: the select effect sets the path, a read
  // through the same path returns the value
  fc.assert(
    fc.property(fc.string({ minLength: 1 }), fc.jsonValue(), (key, value) => {
      const path: Path = [["keypath", key]];
      const app = makeApp({ view: () => null, state: {} });
      app.dispatch(["select", path, value]);
      expect(selectPath(app.getState() as Record<string, unknown>, path)).toEqual(value);
    }),
  );
  // and the corpus scenario reads back "that" at the selected path
  const app = makeApp({ view: () => null, state: { selected: null } });
  app.dispatch(["select", $SELECTED, "that"]);
  expect(app.getState()).toEqual({ selected: "that" });
});

// p_row_visuals — derives_from: components.select.row_visuals
// generator: selected and hovered rows
// predicate: fills and label colors match
it("p_row_visuals: fills and label colors match", () => {
  // "this" is hovered (its extra flag set), "that" is selected
  const view = listView("that", { [hoverKey("this")]: true });

  // the selected row: a blue fill and a white label
  const blues = collect(view, isWithColor).filter((w) => colorsEqual(w.color, SELECTED_FILL));
  expect(blues.length).toBe(1);
  expect(collect(blues[0]!.drawables as Elem, isRect).length).toBe(1);
  const whites = collect(view, isWithColor).filter((w) => colorsEqual(w.color, WHITE));
  expect(whites.length).toBe(1);
  expect(collect(whites[0]!.drawables as Elem, isLabel).map((l) => l.text)).toEqual(["That"]);

  // the white label must read on the accent fill: the WCAG AA text
  // floor (tambor-bc2) — the corpus-pinned light accent meets it
  const accent8bit: readonly [number, number, number] = [
    Math.round(SELECTED_FILL[0]! * 255),
    Math.round(SELECTED_FILL[1]! * 255),
    Math.round(SELECTED_FILL[2]! * 255),
  ];
  expect(contrast(accent8bit, [255, 255, 255])).toBeGreaterThanOrEqual(4.5);

  // the hovered row: a light gray fill over its row rectangle
  const grays = collect(view, isWithColor).filter((w) => colorsEqual(w.color, HOVER_FILL));
  expect(grays.length).toBe(1);
  expect(collect(grays[0]!.drawables as Elem, isRect).length).toBe(1);

  // plain rows: no fill at all around their label
  const coloredLabels = collect(view, isWithColor)
    .flatMap((w) => collect(w.drawables as Elem, isLabel))
    .map((l) => l.text);
  expect(coloredLabels).not.toContain("The Other");
});

// p_row_hover — derives_from: components.select.row_hover_keyed
// generator: hover two different rows
// predicate: two distinct extra keys
it("p_row_hover: two distinct extra keys", () => {
  const view = listView(null);
  // hover the first row, then the second: each row's flag is a set of
  // its own extra key to true
  const first = dispatchEvent(view, mouseMove([5, 8 + 2])) as readonly unknown[];
  const second = dispatchEvent(view, mouseMove([5, 8 + 5 + 2])) as readonly unknown[];
  expect(first.length).toBe(1);
  expect(second.length).toBe(1);
  const [pathA, pathB] = [
    (first[0] as unknown[])[1],
    (second[0] as unknown[])[1],
  ] as [Path, Path];
  // the keys are made of the hover marker and the row value, so two
  // different rows carry two distinct extra keys
  const keyA = (pathA[pathA.length - 1] as readonly unknown[])[1] as string;
  const keyB = (pathB[pathB.length - 1] as readonly unknown[])[1] as string;
  expect(keyA).toBe(hoverKey("this"));
  expect(keyB).toBe(hoverKey("that"));
  expect(keyA).not.toBe(keyB);
  // the effects are sets of the flags to true, and applying them
  // leaves both rows hovered at their own keys
  let state: Record<string, unknown> = { "::extra": {} };
  state = applyEffects(state, first) as Record<string, unknown>;
  state = applyEffects(state, second) as Record<string, unknown>;
  expect(selectPath(state, pathA)).toBe(true);
  expect(selectPath(state, pathB)).toBe(true);
  // leaving: a global move outside a hovered row clears its flag
  const hoveredView = listView(null, { [hoverKey("this")]: true });
  const leave = dispatchEvent(hoveredView, mouseMoveGlobal([-1, -1])) as readonly unknown[];
  expect(leave.length).toBe(1);
  expect((leave[0] as unknown[])[0]).toBe("set");
});

