// Purpose: the failing-before meter for the memo kit ticket (tambor-54j.8.4)
//   — a paired in-process meter over the keyed-table bench app that
//   measures the full per-op cost (view derive + DOM draw) with and
//   without the public memo boundary around the per-row subtree, and
//   asserts the memo win.
// Responsibilities: the paired meter — both arms run the identical op
//   cycle (replace 10%, swap, remove 10, append 1k — the
//   keyed-table-ops scenario's cycle) from an identical seeded state,
//   so the only variable is the memo boundary; the memo arm wraps the
//   row-label derive with memo (identity-keyed, module-level memoized
//   function) and the assertion pins the paired median ratio.
// Rationale: the route-time cache (tambor-8xm) skips derivation only
//   when NO state changed; the ops scenario changes state every op, so
//   the whole 1000-row view re-derives even though most row objects are
//   identity-preserved by the ops (only replaceEveryTenth's every-10th
//   row is a fresh object). Memo keyed on row-object identity skips the
//   unchanged rows' derivation; the drawn output is unchanged (the same
//   plain immutable view data). The paired ratio is asserted instead of
//   an absolute threshold so machine load cancels; the recorded
//   absolute medians land in benchmarks/findings-kit.md.

import { expect, test } from "vitest";
// @ts-expect-error node:perf_hooks has no type declarations here
import { performance } from "node:perf_hooks";
import {
  buildRows,
  keyedTableState,
  keyedTableView,
  replaceEveryTenth,
  removeEveryHundredth,
  swapFirstTwo,
  appendRows,
  type KeyedRow,
  type KeyedTableState,
} from "../src/examples/bench/keyed-table.ts";
import { memo } from "../src/components/memo/memo.ts";
import { label as labelNode, spacer, type Elem } from "../src/views/model.ts";
import { verticalLayout } from "../src/views/layout.ts";
import { DomBackend } from "../src/render/dom.ts";
import { VIEWPORT } from "../src/spa/viewport.ts";

// The keyed-table-ops scenario's op cycle, in its order.
const OPS: readonly ((rows: readonly KeyedRow[]) => readonly KeyedRow[])[] = [
  replaceEveryTenth,
  swapFirstTwo,
  removeEveryHundredth,
  appendRows,
];

// The drawn row: the same label the bench app draws.
function rowLabel(row: KeyedRow): Elem {
  return labelNode(`row ${row.id} — ${row.label}`);
}

// The memo arm's row renderer: identity-keyed per row object. Created
// once — the memoized function owns the cache, the view body stays
// pure (the React memo/useCallback shape without a macro).
const rowNode = memo(rowLabel);

// The memo view: the bench app's row stack with the memoized renderer;
// the drawn shape matches the bench app's row region (a vertical stack
// of row labels under a spacer).
function keyedTableViewMemo(state: KeyedTableState): Elem {
  const rows = (verticalLayout(state.rows.map(rowNode)) ?? []) as readonly Elem[];
  return (verticalLayout([spacer(0, 10), ...rows]) ??
    (rows[0] as Elem)) as Elem;
}

// Median of n samples.
function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 1
    ? (s[mid] as number)
    : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

// One arm: seed 1000 rows, run the op cycle measuring the full op
// (derive + draw) per step against a fresh backend.
function runArm(
  view: (state: KeyedTableState) => Elem,
  warmups: number,
  measures: number,
): number[] {
  const backend = new DomBackend({ containerSize: VIEWPORT });
  let rows = buildRows(keyedTableState().rows);
  backend.draw(view({ rows }));
  const samples: number[] = [];
  for (let i = 0; i < warmups + measures; i++) {
    const next = OPS[i % OPS.length]!(rows);
    const t0 = performance.now();
    const drawn = view({ rows: next });
    backend.draw(drawn);
    const t1 = performance.now();
    if (i >= warmups) samples.push(t1 - t0);
    rows = next;
  }
  return samples;
}

test("memo around the unchanged per-row subtree drops the keyed-table op median", () => {
  const WARM = 4;
  const N = 16;
  const before = median(runArm(keyedTableView, WARM, N));
  const after = median(runArm(keyedTableViewMemo, WARM, N));
  console.log(
    `MEMO-METER plain ${before.toFixed(2)} ms/op, memo ${after.toFixed(2)} ms/op, ratio ${(after / before).toFixed(3)}`,
  );
  // the memo arm must win measurably; the paired ratio cancels machine
  // load. The unchanged rows are ~90% of the stack (only every 10th is
  // refreshed by replace), so the derive half of the op mostly skips.
  expect(after).toBeLessThan(before * 0.8);
});
