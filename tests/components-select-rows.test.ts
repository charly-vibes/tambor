// Purpose: the components.select geometry and touch-target contract
//   tests — p_geometry (list_geometry) and p_touch_rows (touch_rows).
// Responsibilities: encode each converted row's generator and
//   predicate as a vitest + fast-check property: the open list box
//   carries the row width (max label width plus 24) and the default
//   measure heights, and a touch-device row's hit extent floors at 44
//   while a pointer row stays at the default 5.
// Rationale: openspec/specs/components-select/spec.md is the design
//   authority; each predicate here mirrors a Properties row (generator
//   + predicate text) of that spec. Split from
//   tests/components-select.test.ts when the 400-line test-file gate
//   tripped; the shared fixture and traversal live in
//   tests/helpers/select-view.ts.

import { expect, it } from "vitest";
import fc from "fast-check";

import { call, render } from "../src/model/component.ts";
import { dropdownList } from "../src/components/select/list.ts";
import { bounds, type Elem, type Node } from "../src/views/model.ts";
import {
  collect,
  isListNode,
  listView,
  type Option,
  $SELECTED,
} from "./helpers/select-view.ts";

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
      const rowNodes = collect(
        view,
        (n): n is Node & { type: "handler"; eventType: string } => n.type === "handler",
      ).filter((n) => n.eventType === "mouse-down");
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
