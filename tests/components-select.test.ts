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
import { defaultHandler, type Effect } from "../src/effects/dispatch.ts";
import { select as selectPath, type Path } from "../src/effects/paths.ts";
import { dispatch as dispatchEvent } from "../src/events/dispatch.ts";
import { mouseDown } from "../src/events/event.ts";
import { children, isGroup, type Color, type Elem, type Label, type Node } from "../src/views/model.ts";
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

// Every node in the tree satisfying pred, collected via children().
function collect(elem: Elem, pred: (n: Node) => boolean): Node[] {
  const out: Node[] = [];
  const walk = (e: Elem): void => {
    if (e == null) return;
    if (!isGroup(e) && pred(e)) out.push(e);
    for (const child of children(e)) walk(child);
  };
  walk(elem);
  return out;
}

const isListNode = (n: Node): boolean => n.type === "rounded-rectangle";
const isLabel = (n: Node): n is Label => n.type === "label";
const isWithColor = (n: Node): boolean => n.type === "with-color";

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
    .map((n) => n as { color: Color; drawables: readonly Elem[] })
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
