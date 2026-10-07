// Purpose: executable contract tests for the example-counter spec.
// Responsibilities: encode the spec rows' generators and predicates as
//   vitest + fast-check properties, one test per converted property.
// Rationale: specs/example-counter.md is the design authority; each
//   predicate here mirrors a Properties row (p_label first — tracer).

import { expect, it } from "vitest";
import fc from "fast-check";

import { label } from "../src/label.ts";

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
