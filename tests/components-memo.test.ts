// Purpose: the contract tests for the memo component
//   (openspec/specs/components-memo/spec.md — tambor-54j.8.4).
// Responsibilities: identity invalidation (state change → re-derive,
//   no change → skipped), the no-deep-equality rule (a structurally
//   equal but distinct key re-derives), the object-key-only contract,
//   and the cell-writeback closure interaction (a memoized subtree's
//   writeback closure keeps routing through dispatch and survives
//   sibling state changes by identity).
// Rationale: memo is identity-keyed because state changes only through
//   dispatch (including writeback closures) and every dispatch produces
//   fresh identity for changed slices with structural sharing for
//   unchanged ones — the same soundness 8xm's route-time cache rides.

import { describe, expect, it } from "vitest";
import { memo, createSelector } from "../src/components/memo/memo.ts";
import {
  label as labelNode,
  button,
  type ButtonNode,
  type Elem,
} from "../src/views/model.ts";
import type { IntentList } from "../src/events/bubble.ts";

// A keyed row: the same shape the keyed-table bench app uses.
interface Row {
  readonly id: number;
  readonly label: string;
}

describe("memo identity invalidation", () => {
  it("p_identity_hit: same key object → cached subtree, build called once", () => {
    const row: Row = { id: 1, label: "a" };
    let builds = 0;
    const node = memo((r: Row) => {
      builds++;
      return labelNode(`row ${r.id} — ${r.label}`);
    });
    const first = node(row);
    const second = node(row);
    expect(builds).toBe(1);
    expect(second).toBe(first);
  });

  it("p_invalidate: state change (fresh key object) → re-derive with the new key", () => {
    let builds = 0;
    const node = memo((r: Row) => {
      builds++;
      return labelNode(`row ${r.id} — ${r.label}`);
    });
    // the immutable-update shape a dispatch produces: a new object for
    // the changed slice, identity-preserved objects elsewhere.
    const before: Row = { id: 1, label: "a" };
    const after: Row = { ...before, label: "a!" };
    node(before);
    node(after);
    expect(builds).toBe(2);
    expect(node(after)).toBe(node(after));
  });

  it("p_sibling_share: unchanged sibling slice → skipped (structural sharing hits)", () => {
    let builds = 0;
    const node = memo((r: Row) => {
      builds++;
      return labelNode(`row ${r.id} — ${r.label}`);
    });
    const untouched: Row = { id: 7, label: "keep" };
    const rows1 = [untouched, { id: 2, label: "x" }];
    // a dispatch-style update replacing only row 2: row 7 is reused
    const rows2 = [untouched, { id: 2, label: "y" }];
    for (const rows of [rows1, rows2, rows2]) {
      for (const r of rows) node(r);
    }
    // row 7 built once; row 2 rebuilt for its fresh object; the second
    // rows2 pass is all hits.
    expect(builds).toBe(3);
  });

  it("p_no_deep: structurally equal but distinct key → re-derive (identity, not deep equality)", () => {
    let builds = 0;
    const node = memo((r: Row) => {
      builds++;
      return labelNode(String(r.id));
    });
    node({ id: 3, label: "same" });
    node({ id: 3, label: "same" });
    expect(builds).toBe(2);
  });

  it("p_keys_only: object-key-only — a primitive key is rejected loudly", () => {
    const node = memo((k: object) => String(k));
    expect(() => node(1 as unknown as object)).toThrow(TypeError);
    expect(() => node("x" as unknown as object)).toThrow(TypeError);
    expect(() => node(null as unknown as object)).toThrow(TypeError);
  });
});

describe("memo × cell-writeback closure", () => {
  it("p_writeback: a memoized subtree's writeback closure routes through dispatch and survives sibling changes", () => {
    // The writeback shape: the subtree carries a handler closing over
    // its key (the row) that writes back through the dispatcher — the
    // cell-writeback pattern. Memo must not break it: the cached
    // subtree's closure stays valid for as long as the row identity
    // lives, and the writeback still produces the dispatch-shaped
    // immutable update.
    const builds: number[] = [];
    const rowNode = memo((r: Row): Elem => {
      builds.push(r.id);
      return button(`touch ${r.id}`, (): IntentList => [
        [
          "update",
          [["keypath", "rows"]],
          (rows: unknown) =>
            (rows as readonly Row[]).map((x) =>
              x.id === r.id ? { ...x, label: "touched" } : x,
            ),
        ],
      ]);
    });

    const rowA: Row = { id: 1, label: "a" };
    const rowB: Row = { id: 2, label: "b" };
    const nodeA = rowNode(rowA);
    const nodeB = rowNode(rowB);

    // the cached subtrees carry handlers (the writeback closures)
    const nodeA2 = nodeA as ButtonNode;
    const nodeB0 = nodeB as ButtonNode;
    expect(typeof nodeA2.onClick).toBe("function");

    // the writeback closure closes over the memo KEY, not over render
    // time: applying it is the dispatch-shaped immutable update, and it
    // preserves the identity of every untouched row — so the memoized
    // sibling (rowB) is reused after the writeback lands.
    const rows1: readonly Row[] = [rowA, rowB];
    const handler = nodeA2.onClick as (...a: readonly unknown[]) => unknown;
    const intent = handler() as IntentList;
    const step = intent[0]![2] as (rs: readonly Row[]) => readonly Row[];
    const rows2 = step(rows1);
    expect(rows2[0]).toEqual({ id: 1, label: "touched" });
    expect(rows2[1]).toBe(rowB);

    // re-deriving after the writeback: rowA is a fresh object →
    // rebuild; rowB kept its identity → cache hit, closure intact.
    const nodeA3 = rowNode(rows2[0]!);
    const nodeB2 = rowNode(rows2[1]!);
    expect(builds).toEqual([1, 2, 1]);
    expect(nodeB2).toBe(nodeB);
    expect(nodeA3).not.toBe(nodeA);
    void nodeB0;
  });

  it("p_pure: the cached subtree is dispatchable data, re-derivable at any render", () => {
    // the memoized subtree is plain view data: deriving it twice for
    // the same key yields the same node, so the route-time cache and
    // the draw path see an ordinary elem (no hidden render-time state).
    const node = memo((r: Row) => button(String(r.id), () => []));
    const row: Row = { id: 9, label: "z" };
    expect(node(row)).toBe(node(row));
  });
});

describe("components-memo — createSelector (add-keyed-dom-reconciliation §4)", () => {
  interface Slice {
    readonly n: number;
  }
  it("4.0 an identity-unchanged picked slice runs build once and returns the same derived value", () => {
    let builds = 0;
    const slice: Slice = { n: 1 };
    const sel = createSelector(
      (state: { s: Slice }) => state.s,
      (picked: Slice) => {
        builds++;
        return `n=${picked.n}`;
      },
    );
    const first = sel({ s: slice });
    const second = sel({ s: slice });
    const third = sel({ s: slice });
    expect(first).toBe(second);
    expect(first).toBe(third);
    expect(first).toBe("n=1");
    expect(builds).toBe(1);
  });

  it("4.0 a changed picked slice rebuilds exactly once and the new answer is cached", () => {
    let builds = 0;
    const sel = createSelector(
      (state: { s: Slice }) => state.s,
      (picked: Slice) => {
        builds++;
        return `n=${picked.n}`;
      },
    );
    sel({ s: { n: 1 } });
    const changedState = { s: { n: 2 } };
    const changed = sel(changedState);
    const again = sel(changedState);
    expect(changed).toBe("n=2");
    expect(again).toBe(changed);
    expect(builds).toBe(2);
  });

  it("4.0 a non-object picked value throws the memo TypeError", () => {
    // the runtime contract survives the compile-time P extends object
    // guard: reach it through the memo tests' unknown cast precedent
    const sel = createSelector(
      (state: { v: number }) => state.v as unknown as Slice,
      (picked: Slice) => picked,
    );
    expect(() => sel({ v: 1 })).toThrowError(TypeError);
    expect(() => sel({ v: 1 })).toThrowError(/identity is the invalidation signal/);
    const nullSel = createSelector(
      (state: { v: null }) => state.v as unknown as Slice,
      (picked: Slice) => picked,
    );
    expect(() => nullSel({ v: null })).toThrowError(/identity is the invalidation signal/);
  });

  it("4.0 build receives the picked slice and the whole state as context", () => {
    const sel = createSelector(
      (state: { s: Slice; tag: string }) => state.s,
      (picked: Slice, state: { tag: string }) => `${state.tag}:${picked.n}`,
    );
    expect(sel({ s: { n: 7 }, tag: "t" })).toBe("t:7");
  });
});
