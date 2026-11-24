// Purpose: the keyed DOM reconciliation tests (add-keyed-dom-reconciliation)
//   — the pure reconcile(prev, next, key) plan function first (§1), then the
//   painter wiring observable through a real-DOM mount (§2).
// Responsibilities: pin the per-next-child plan — reuse(prevIndex) or build —
//   for keyed reorder/insert/remove, the identity guard (key locates, inner
//   Elem identity confirms), duplicate-key first-donation degradation, and
//   the unkeyed positional fallback byte-equal to M1's rule.
// Rationale: openspec/changes/add-keyed-dom-reconciliation/spec.md is the
//   contract authority; §1 tests are pure (no DOM, no elements touched) so
//   the plan function is testable without a backend. Static test titles only
//   (the testaruda store drifts on dynamic titles). Splitting point if the
//   400-line test-file gate trips: §2 painter tests move to their own file.
import { describe, expect, it } from "vitest";

import { reconcile } from "../src/render/dom-painters.ts";
import { keyed, label } from "../src/views/nodes.ts";
import type { AnyDraw } from "../src/render/primitives.ts";
import {
  bounds,
  children,
  isElem,
  makeNode,
  origin,
  width,
  height,
} from "../src/views/model.ts";
import { accessibilityTree } from "../src/render/a11y.ts";
import { button, defaultMeasure, rectangle, translate } from "../src/views/nodes.ts";

// A memo-stable row fixture: the SAME inner Elem object flows into both
// frames (memo's contract — the wrapper keyed() wraps is fresh per call,
// the inner drawable is the identity signal M1 pins).
function row(id: string): AnyDraw {
  return keyed(id, label(`row-${id}`));
}

describe("keyed-dom-reconciliation — reconcile plan (add-keyed-dom-reconciliation §1)", () => {
  it("1.0 plans keyed reorder as reuse of the previous indexes with zero build steps", () => {
    // prev [k1, k2, k3], next [k3, k1, k2] — every inner Elem identity-stable.
    const k1 = row("k1");
    const k2 = row("k2");
    const k3 = row("k3");
    const prev: readonly AnyDraw[] = [k1, k2, k3];
    const next: readonly AnyDraw[] = [k3, k1, k2];
    // The key extractor defaults to reading the declared `key` field
    // (keyed(k, drawable) declares it) — no third argument here.
    expect(reconcile(prev, next)).toEqual([
      { op: "reuse", prevIndex: 2 },
      { op: "reuse", prevIndex: 0 },
      { op: "reuse", prevIndex: 1 },
    ]);
  });

  it("1.2 plans a keyed insert as a build for the fresh row only and a keyed remove with no step for the dropped row", () => {
    const a = row("a");
    const b = row("b");
    const c = row("c");
    const fresh = row("x");
    // keyed insert mid-list: exactly one build (x), the rest reuse.
    expect(reconcile([a, b, c], [fresh, a, b, c])).toEqual([
      { op: "build" },
      { op: "reuse", prevIndex: 0 },
      { op: "reuse", prevIndex: 1 },
      { op: "reuse", prevIndex: 2 },
    ]);
    // keyed remove: b's range simply has no step — reuse 0 and 2 only.
    expect(reconcile([a, b, c], [a, c])).toEqual([
      { op: "reuse", prevIndex: 0 },
      { op: "reuse", prevIndex: 2 },
    ]);
  });

  it("1.3 plans build for a key match with a fresh Elem and never throws on duplicate keys (first match donates)", () => {
    const a = row("k1");
    const b = row("k2");
    const c = row("k3");
    // The key locates k1 but the Elem is fresh — identity confirms, so
    // that row builds (never splice); the stable siblings reuse.
    const freshElem = keyed("k1", label("row-k1"));
    expect(reconcile([a, b, c], [freshElem, b, c])).toEqual([
      { op: "build" },
      { op: "reuse", prevIndex: 1 },
      { op: "reuse", prevIndex: 2 },
    ]);
    // Duplicate keys: the first same-key child (same inner Elem as the
    // previous candidate) donates; further same-key children never
    // splice (they build — Pins: drawn output never depends on key
    // hygiene). No throw.
    const dupInner = label("dup");
    const first = keyed("dup", dupInner);
    const second = keyed("dup", label("second"));
    const prevOnly = keyed("dup", dupInner);
    expect(reconcile([prevOnly], [first, second])).toEqual([
      { op: "reuse", prevIndex: 0 },
      { op: "build" },
    ]);
  });

  it("1.4 plans unkeyed children exactly as M1's positional rule and keyed wrappers build like unkeyed ones", () => {
    const a = label("a");
    const b = label("b");
    const c = label("c");
    // Unkeyed reorder: every index mismatches identity — all build
    // (byte-equal to today's conservative rebuild).
    expect(reconcile([a, b, c], [c, a, b])).toEqual([
      { op: "build" },
      { op: "build" },
      { op: "build" },
    ]);
    // Unkeyed same-order identity: positional reuse fires.
    expect(reconcile([a, b, c], [a, b, c])).toEqual([
      { op: "reuse", prevIndex: 0 },
      { op: "reuse", prevIndex: 1 },
      { op: "reuse", prevIndex: 2 },
    ]);
    // A keyed wrapper builds identically to the unkeyed drawable: the
    // plan step targets the INNER Elem, so parallel frames get equal
    // steps (painter-level output equality is §2's spy assertion).
    const keyedRow = keyed("r1", a);
    expect(reconcile([keyedRow], [keyed("r1", a)])).toEqual(
      reconcile([a], [a]),
    );
    expect(reconcile([keyedRow], [keyed("r1", a)])).toEqual([
      { op: "reuse", prevIndex: 0 },
    ]);
  });
});

describe("keyed-dom-reconciliation — view-model transparency (add-keyed-dom-reconciliation §1.5)", () => {
  // A translate row with real extent: geometry through the wrapper must
  // equal geometry of the inner node (the key is metadata).
  const inner = translate(5, 7, rectangle(10, 4));

  it("1.5 a keyed wrapper's origin and bounds equal the inner node's", () => {
    const wrapped = keyed("r", inner);
    expect(origin(wrapped)).toEqual(origin(inner));
    expect(bounds(wrapped)).toEqual(bounds(inner));
    expect([width(wrapped), height(wrapped)]).toEqual([width(inner), height(inner)]);
  });

  it("1.5 a keyed wrapper's children are the inner drawable and makeNode roundtrips", () => {
    const wrapped = keyed("r", inner);
    expect(children(wrapped)).toEqual([inner]);
    expect(makeNode(wrapped, [inner])).toEqual(keyed("r", inner));
  });

  it("1.5 keyed rows participate in groups: isElem true and group bounds match the unkeyed tree", () => {
    const list = [label("a"), keyed("r", inner)];
    expect(isElem(list)).toBe(true);
    expect(bounds(list)).toEqual(bounds([label("a"), inner]));
  });

  it("1.5 nested keyed wrappers are rejected loudly", () => {
    expect(() => keyed("outer", keyed("inner", label("x")))).toThrow(TypeError);
  });

  it("1.6 invalid keys are rejected loudly: empty string, object, NaN, and bare groups throw at construction", () => {
    expect(() => keyed("", label("x"))).toThrow(TypeError);
    expect(() => keyed({ id: "k" } as unknown as string, label("x"))).toThrow(
      TypeError,
    );
    expect(() => keyed(null as unknown as string, label("x"))).toThrow(
      TypeError,
    );
    expect(() => keyed(Number.NaN, label("x"))).toThrow(TypeError);
    expect(() => keyed(Infinity, label("x"))).toThrow(TypeError);
    expect(() => keyed("g", [label("a"), label("b")] as AnyDraw)).toThrow(
      TypeError,
    );
  });

  it("1.5 keyed rows keep the a11y mirror: the wrapper walks through to the inner node", () => {
    expect(accessibilityTree([keyed("k", button("Save"))])).toEqual([
      { role: "button", label: "Save" },
    ]);
  });

  it("1.5 reconcile honors an explicit key extractor", () => {
    // Rows carrying their own key domain (plain data, no keyed wrapper):
    // the explicit extractor extends reconcile to it.
    const mk = (id: string): AnyDraw =>
      ({ type: "label", text: id, measure: defaultMeasure, id }) as unknown as AnyDraw;
    const extract = (c: AnyDraw): string | number | undefined =>
      (c as { id?: string }).id;
    const a = mk("a");
    const b = mk("b");
    expect(reconcile([a, b], [b, a], extract)).toEqual([
      { op: "reuse", prevIndex: 1 },
      { op: "reuse", prevIndex: 0 },
    ]);
  });
});
