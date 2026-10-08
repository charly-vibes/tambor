// Purpose: executable contract tests for the components.select spec — the
//   dropdown/dropdown-list port from basic_components.cljc.
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: specs/components-select.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate
//   text) of that spec. No vacuous predicates: every check encodes its
//   row's stated behavior.

import { expect, it } from "vitest";
import fc from "fast-check";

import { call, render } from "../src/model/component.ts";
import { defaultHandler, makeApp, type Effect } from "../src/effects/dispatch.ts";
import { select as selectPath, type Path } from "../src/effects/paths.ts";
import { dispatch as dispatchEvent } from "../src/events/dispatch.ts";
import { mouseDown, mouseMove, mouseMoveGlobal } from "../src/events/event.ts";
import { dropdownList, HOVER_FILL, SELECTED_FILL, WHITE } from "../src/components/select/list.ts";
import { hoverKey } from "../src/components/select/hover.ts";
import {
  bounds,
  children,
  isGroup,
  type Color,
  type Elem,
  type Label,
  type Node,
  type WithColorNode,
} from "../src/views/model.ts";
import { dropdown } from "../src/components/select/dropdown.ts";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// options is a vector of [value, label] pairs — the corpus scenario's
// "this, that, the-other".
type Option = readonly [value: unknown, label: string];
const OPTIONS: readonly Option[] = [
  ["this", "This"],
  ["that", "That"],
  ["the-other", "The Other"],
];
const $SELECTED: Path = [["keypath", "selected"]];
const EXTRA_ROOT: Path = [["keypath", "::extra"]];

// Render the dropdown against an app state whose scratch trees are the
// root ::extra entries (component.model top-level-ui semantics).
function dropdownView(
  state: unknown,
  selected: unknown,
  extraArgs: Record<string, unknown> = {},
): Elem {
  const s = state as Record<string, unknown>;
  return render(
    call(
      dropdown,
      { selected, options: OPTIONS, $selected: $SELECTED, ...extraArgs },
      { extra: s["::extra"], $extra: EXTRA_ROOT },
    ),
  ) as Elem;
}

// Apply a returned effect batch to an app state (the dispatcher's
// builtin handler).
function applyEffects(state: unknown, effects: readonly unknown[]): unknown {
  return defaultHandler(state, effects as readonly Effect[], {});
}

// Render the dropdown-list on its own (the raw row effects are visible
// before the dropdown's interception).
function listView(
  selected: unknown,
  extra: Record<string, unknown> = {},
  touch = false,
): Elem {
  return render(
    call(dropdownList, { selected, options: OPTIONS, $selected: $SELECTED, touch, extra, $extra: EXTRA_ROOT }),
  ) as Elem;
}

// Every node in the tree satisfying pred, collected via children().
function collect<T extends Node>(elem: Elem, pred: (n: Node) => n is T): T[] {
  const out: T[] = [];
  const walk = (e: Elem): void => {
    if (e == null) return;
    if (!isGroup(e) && pred(e)) out.push(e);
    for (const child of children(e)) walk(child);
  };
  walk(elem);
  return out;
}

const isListNode = (n: Node): n is Node & { type: "rounded-rectangle" } =>
  n.type === "rounded-rectangle";
const isLabel = (n: Node): n is Label => n.type === "label";
const isWithColor = (n: Node): n is WithColorNode => n.type === "with-color";

function colorsEqual(a: Color, b: Color): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// ---------------------------------------------------------------------------
// cycle 1 — header
// ---------------------------------------------------------------------------

// p_header_toggle — derives_from: components.select.header_toggles
// generator: open? false then true
// predicate: the effect flips open?
it("p_header_toggle: the effect flips open?", () => {
  const state: Record<string, unknown> = { selected: "this", "::extra": {} };
  const intents = dispatchEvent(dropdownView(state, state.selected), mouseDown([0, 0]));
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
  // a select intent through the open dropdown comes out expanded
  const intents = dispatchEvent(view, mouseDown([5, 8 + 5 + 2]));
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
  expect(collect(blues[0]!.drawables as Elem, (n): n is Node & { type: "rectangle" } => n.type === "rectangle").length).toBe(1);
  const whites = collect(view, isWithColor).filter((w) => colorsEqual(w.color, WHITE));
  expect(whites.length).toBe(1);
  expect(collect(whites[0]!.drawables as Elem, isLabel).map((l) => l.text)).toEqual(["That"]);

  // the hovered row: a light gray fill over its row rectangle
  const grays = collect(view, isWithColor).filter((w) => colorsEqual(w.color, HOVER_FILL));
  expect(grays.length).toBe(1);
  expect(
    collect(
      grays[0]!.drawables as Elem,
      (n): n is Node & { type: "rectangle" } => n.type === "rectangle",
    ).length,
  ).toBe(1);

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

// ---------------------------------------------------------------------------
// cycle 4 — geometry, touch
// ---------------------------------------------------------------------------

// p_geometry — derives_from: components.select.list_geometry
// generator: labels of three widths
// predicate: row width equals max plus 24
it("p_geometry: row width equals max plus 24", () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 1, maxLength: 12 }),
      fc.string({ minLength: 1, maxLength: 12 }),
      fc.string({ minLength: 1, maxLength: 12 }),
      (a, b, c) => {
        const options: readonly Option[] = [["a", a], ["b", b], ["c", c]];
        const view = render(
          call(dropdownList, { selected: null, options, $selected: $SELECTED }, {}),
        ) as Elem;
        // the box carries the row width; rows are label height plus 4
        // tall and the box has 8 padding on y (default measure: labels
        // are 1 tall, rows 5)
        const box = collect(view, isListNode)[0]!;
        expect(box.width).toBe(Math.max(a.length, b.length, c.length) + 24);
        expect(box.height).toBe(2 * 8 + 3 * 5);
        expect(box.radius).toBe(4);
      },
    ),
  );
});

// p_touch_rows — derives_from: components.select.touch_rows
// generator: touch device
// predicate: row height is at least 44
it("p_touch_rows: row height is at least 44", () => {
  fc.assert(
    fc.property(fc.boolean(), (touch) => {
      const view = listView(null, {}, touch);
      // a row's hit extent is the handler node wrapping its visuals
      const rowNodes = collect(view, (n): n is Node & { type: "handler" } => n.type === "handler")
        .filter((n) => n.eventType === "mouse-down");
      expect(rowNodes.length).toBe(3);
      for (const row of rowNodes) {
        // the row's extent is its hit area: the handler's bounds
        const [, h] = bounds(row);
        if (touch) expect(h).toBeGreaterThanOrEqual(44);
        else expect(h).toBe(5);
      }
    }),
  );
});
