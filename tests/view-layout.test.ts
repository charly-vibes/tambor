// Purpose: executable contract tests for the view-layout spec.
// Responsibilities: encode the spec rows' generators and predicates as
//   vitest + fast-check properties, one test per converted property.
// Rationale: specs/view-layout.md is the design authority; each
//   predicate here mirrors a Properties row of that spec.

import { expect, it } from "vitest";
import fc from "fast-check";

import {
  bounds,
  children,
  origin,
  rectangle,
  roundedRectangle,
  spacer,
  translate,
  withColor,
  withStyle,
  type Elem,
  type Node,
  type Vec2,
} from "../src/views/model.ts";
import {
  center,
  horizontalLayout,
  resolveStretch,
  tableLayout,
  verticalLayout,
} from "../src/views/layout.ts";

// Row offsets of a layout result: untranslated children sit at 0,
// translated ones carry their offset as origin.
function offsets(rows: readonly Elem[] | null, axis: 0 | 1): number[] {
  if (rows === null) return [];
  return rows.map((row) => origin(row)[axis]);
}

// Count nodes that still report a stretch flag after resolution.
function stretchCount(elem: Elem): number {
  if (elem == null) return 0;
  return stretchCountOf(elem);
}

function stretchCountOf(elem: Elem): number {
  if (Array.isArray(elem)) {
    return elem.reduce((sum: number, child) => sum + stretchCount(child), 0);
  }
  let total: number = flagsOf(elem as Node);
  for (const child of children(elem)) total += stretchCount(child);
  return total;
}

// The node's two stretch flags as a 0..2 count.
function flagsOf(node: Node): number {
  return (
    (stretchFlagOf(node, "stretchWidth") ? 1 : 0) +
    (stretchFlagOf(node, "stretchHeight") ? 1 : 0)
  );
}

function stretchFlagOf(node: Node, key: "stretchWidth" | "stretchHeight"): boolean {
  return key in node && (node as unknown as Record<string, unknown>)[key] === true;
}

// p_vstack — derives_from: view.layout.vstack_offsets
// generator: random child sizes — predicate: children are ordered with
// no vertical overlap, and sizes 10, 20, 30 give offsets 0, 11 and 32
it("p_vstack: children are ordered with no vertical overlap, and sizes 10, 20, 30 give offsets 0, 11 and 32", () => {
  const example = verticalLayout([
    rectangle(1, 10),
    rectangle(1, 20),
    rectangle(1, 30),
  ]);
  expect(offsets(example, 1)).toEqual([0, 11, 32]);

  fc.assert(
    fc.property(fc.array(fc.nat(200), { minLength: 1, maxLength: 12 }), (sizes) => {
      const rows = verticalLayout(sizes.map((h) => rectangle(1, h)));
      const ys = offsets(rows, 1);
      expect(ys[0]).toBe(0);
      for (let i = 1; i < ys.length; i++) {
        // no vertical overlap: next offset is at least previous bottom
        expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1]! + (sizes[i - 1] ?? 0));
      }
    }),
  );
});

// p_hstack — derives_from: view.layout.hstack_offsets
// generator: random child sizes — predicate: no horizontal overlap, and
// widths 10, 20 give offsets 0 and 11
it("p_hstack: no horizontal overlap, and widths 10, 20 give offsets 0 and 11", () => {
  const example = horizontalLayout([rectangle(10, 1), rectangle(20, 1)]);
  expect(offsets(example, 0)).toEqual([0, 11]);

  fc.assert(
    fc.property(fc.array(fc.nat(200), { minLength: 1, maxLength: 12 }), (sizes) => {
      const cols = horizontalLayout(sizes.map((w) => rectangle(w, 1)));
      const xs = offsets(cols, 0);
      expect(xs[0]).toBe(0);
      for (let i = 1; i < xs.length; i++) {
        expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]! + (sizes[i - 1] ?? 0));
      }
    }),
  );
});

// p_empty — derives_from: view.layout.layout_empty_nil
// generator: no children — predicate: result is nil and nothing throws
it("p_empty: result is nil and nothing throws", () => {
  expect(verticalLayout([])).toBe(null);
  expect(horizontalLayout([])).toBe(null);
});

// p_spacer — derives_from: view.layout.spacer_occupies
// generator: random spacer sizes — predicate: spacer(0, 5) between two
// rows pushes the second row down by 5 plus gaps
it("p_spacer: spacer(0, 5) between two rows pushes the second row down by 5 plus gaps", () => {
  fc.assert(
    fc.property(fc.nat(200), (h1) => {
      const first = rectangle(1, h1);
      const second = rectangle(1, 7);

      // a spacer(x, y) has bounds [x, y] and draws nothing
      const gap = spacer(0, 5);
      expect(bounds(gap)).toEqual([0, 5]);
      expect(children(gap)).toEqual([]);

      const withSpacer = verticalLayout([first, gap, second]);
      const withoutSpacer = verticalLayout([first, second]);
      const ys = offsets(withSpacer, 1);
      const baseYs = offsets(withoutSpacer, 1);
      // spacer sits after the first row plus the gap...
      expect(ys[1]!).toBe(h1 + 1);
      // ...and pushes the second row down by its size plus the gaps
      expect(ys[2]!).toBe(h1 + 1 + 5 + 1);
      expect(ys[2]! - (baseYs[1] ?? 0)).toBe(5 + 1);
    }),
  );
});

// p_center — derives_from: view.layout.center_exact
// generator: random sizes — predicate: offsets equal half the free space
it("p_center: offsets equal half the free space", () => {
  fc.assert(
    fc.property(
      fc.tuple(fc.nat(500), fc.nat(500), fc.nat(500), fc.nat(500)),
      ([w, h, ew, eh]) => {
        const node = center(rectangle(ew, eh), [w, h]) as {
          x: number;
          y: number;
        };
        expect(node.x).toBe((w - ew) / 2);
        expect(node.y).toBe((h - eh) / 2);
      },
    ),
  );
});

// p_table — derives_from: view.layout.table_columns_aligned
// generator: random tables — predicate: columns and rows align
it("p_table: columns and rows align", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.array(fc.tuple(fc.nat(50), fc.nat(50)), { minLength: 1, maxLength: 5 }),
        { minLength: 1, maxLength: 5 },
      ),
      (specs) => {
        const table = specs.map((row) =>
          row.map(([w, h]) => rectangle(w, h)),
        );
        const cells = tableLayout(table);
        // the flat cell list is row-major; walk it with a cursor so
        // ragged tables keep their (row, column) attribution
        const ysByRow: number[][] = [];
        const xsByCol: number[][] = [];
        let k = 0;
        table.forEach((row, i) => {
          ysByRow[i] = ysByRow[i] ?? [];
          row.forEach((_, j) => {
            const cell = cells[k++] as Elem;
            (ysByRow[i] as number[]).push(origin(cell)[1]);
            xsByCol[j] = xsByCol[j] ?? [];
            xsByCol[j].push(origin(cell)[0]);
          });
        });
        for (const ys of ysByRow) expect(new Set(ys).size).toBe(1);
        for (const xs of xsByCol) expect(new Set(xs).size).toBe(1);
      },
    ),
  );
});

// p_stretch — derives_from: view.layout.stretch_resolved
// generator: random container sizes — predicate: no stretch node
// remains after resolution
it("p_stretch: no stretch node remains after resolution", () => {
  fc.assert(
    fc.property(
      fc.tuple(fc.nat(500), fc.nat(500), fc.nat(200), fc.nat(200)),
      fc.constantFrom(true, false),
      fc.constantFrom(true, false),
      ([cw, ch, w, h], wantWidth, wantHeight) => {
        const stretch: { stretchWidth?: true; stretchHeight?: true } = {};
        if (wantWidth) stretch.stretchWidth = true;
        if (wantHeight) stretch.stretchHeight = true;
        const tree = translate(3, 4, withColor([1, 1, 1], rectangle(w, h, stretch)));

        const resolved = resolveStretch(tree, [cw, ch]);
        expect(stretchCount(resolved)).toBe(0);

        // a flagged node is resolved against the container size
        const inner = (resolved as { drawable: Node }).drawable;
        const rect = children(inner)[0] as Node;
        const expectedW = wantWidth ? cw : w;
        const expectedH = wantHeight ? ch : h;
        expect(bounds(rect)).toEqual([expectedW, expectedH]);
      },
    ),
  );
});

// p_layout_pure — derives_from: view.layout.layout_pure
// generator: headless runtime — predicate: layout runs with no DOM
it("p_layout_pure: layout runs with no DOM", () => {
  const g = globalThis as { document?: unknown };
  const hadDocument = g.document !== undefined;
  g.document = new Proxy(
    {},
    {
      get() {
        throw new Error("layout accessed the DOM");
      },
      has() {
        throw new Error("layout accessed the DOM");
      },
    },
  );
  try {
    const rows = verticalLayout([rectangle(1, 10), rectangle(1, 20)]);
    const cols = horizontalLayout([rectangle(10, 1), rectangle(20, 1)]);
    const centered = center(rectangle(5, 5), [100, 100]);
    const cells = tableLayout([[rectangle(1, 1), rectangle(2, 1)]]);
    const resolved = resolveStretch(
      translate(0, 0, rectangle(1, 1, { stretchWidth: true })),
      [100, 50],
    );
    expect(bounds(rows)).toEqual([1, 31]);
    expect(bounds(cols)).toEqual([31, 1]);
    expect(origin(centered)).toEqual([47.5, 47.5]);
    expect(cells).toHaveLength(2);
    expect(bounds(resolved)).toEqual([100, 1]);
  } finally {
    if (!hadDocument) delete g.document;
  }
  expect(g.document).toBeUndefined();
});

// p_reflow — derives_from: view.layout.layout_reflows
// generator: widths 320 then 768 — predicate: the second layout differs
// and is not a cached copy of the first
it("p_reflow: the second layout differs and is not a cached copy of the first", () => {
  const content = [
    rectangle(10, 10, { stretchWidth: true }),
    translate(0, 11, roundedRectangle(10, 10, 2)),
  ];
  const first = resolveStretch(content, [320, 100]);
  const second = resolveStretch(content, [768, 100]);
  expect(bounds(first)).not.toEqual(bounds(second));
  expect(Object.is(first, second)).toBe(false);
  // layout is a pure function of container size and content: no stale
  // cache — the same input reproduces the same layout
  expect(resolveStretch(content, [320, 100])).toEqual(first);
});
