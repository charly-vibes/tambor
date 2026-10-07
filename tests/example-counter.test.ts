// Purpose: executable contract tests for the example-counter spec.
// Responsibilities: encode the spec rows' generators and predicates as
//   vitest + fast-check properties, one test per converted property.
// Rationale: specs/example-counter.md is the design authority; each
//   predicate here mirrors a Properties row (p_label first — tracer).

import { expect, it } from "vitest";
import fc from "fast-check";

import { label } from "../src/label.ts";
import { bounds, type Elem, type Node, type TranslateNode } from "../src/views/model.ts";
import { counter, counterCounter } from "../src/views/counter.ts";

// p_label — derives_from: example.counter.label_shows_number
// generator: num 10 — predicate: label text is the decimal string of num
it("p_label: label text is the decimal string of num", () => {
  // The spec's example value must hold verbatim.
  expect(label(10)).toBe("10");

  // Generalized property: decimal string for every non-negative num.
  const num = fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER });
  fc.assert(
    fc.property(num, (n) => {
      expect(label(n)).toBe(n.toString(10));
    }),
  );
});

// p_layout — derives_from: example.counter.counter_layout
// generator: num 10 — predicate: child 0 is the button and child 1 is
// the label with x offset greater than the button width
it("p_layout: child 0 is the button and child 1 is the label with x offset greater than the button width", () => {
  // The spec's example value must hold verbatim.
  const rows = counter(10);
  expect(rows[0]).toMatchObject({ type: "button" });
  const second = rows[1] as TranslateNode;
  expect(second.type).toBe("translate");
  expect(second.drawable).toMatchObject({ type: "label", text: "10" });
  expect(second.x).toBeGreaterThan(bounds(rows[0] as Node)[0]);

  // Generalized property: the label sits past the button width for
  // every non-negative num.
  const num = fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER });
  fc.assert(
    fc.property(num, (n) => {
      const row = counter(n);
      const btn = row[0] as Node;
      const lbl = row[1] as TranslateNode;
      expect(btn.type).toBe("button");
      expect(lbl.type).toBe("translate");
      expect((lbl.drawable as Node).type).toBe("label");
      expect(lbl.x).toBeGreaterThan(bounds(btn)[0]);
    }),
  );
});

// p_stack — derives_from: example.counter.stack_layout
// generator: nums 0, 1, 2 — predicate: four rows, button first then
// three counters
it("p_stack: four rows, button first then three counters", () => {
  // The spec's example value must hold verbatim.
  const rows = counterCounter([0, 1, 2]) as readonly Elem[];
  expect(rows).toHaveLength(4);
  expect(rows[0]).toMatchObject({ type: "button" });
  // each counter row is translated into place by the vertical layout;
  // its drawable is the horizontal counter group
  for (const [i, row] of (rows.slice(1) as readonly TranslateNode[]).entries()) {
    expect(row.type).toBe("translate");
    const counterRow = row.drawable as readonly Elem[];
    expect(Array.isArray(counterRow)).toBe(true);
    const [btn, lbl] = [counterRow[0] as Node, counterRow[1] as TranslateNode];
    expect(btn.type).toBe("button");
    expect(lbl.type).toBe("translate");
    expect(lbl.drawable).toMatchObject({ type: "label", text: String(i) });
  }

  // Generalized property: one counter row per entry, in order.
  fc.assert(
    fc.property(fc.array(fc.integer({ min: 0, max: 999 }), { minLength: 0, maxLength: 8 }), (nums) => {
      const stack = counterCounter(nums) as readonly Elem[];
      // the Add Counter button row is always present
      expect(stack).toHaveLength(nums.length + 1);
      expect(stack[0]).toMatchObject({ type: "button" });
    }),
  );
});
