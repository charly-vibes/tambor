// Purpose: the bench-scale tripwire for the memo kit ticket (tambor-54j.8.4)
//   — over the keyed-table bench app's op cycle, the public memo
//   boundary around the per-row subtree must derive ONLY rows whose
//   identity is actually fresh, and the paired op-cost meter is printed
//   for the record (unasserted).
// Responsibilities: the deterministic tripwire — count rowLabel
//   invocations per op from a fresh seeded state (replace 10% → exactly
//   100 fresh identities, swap → 0, remove 100th → 0, append 1k →
//   exactly 1000; the unmemoized renderer would re-derive the whole
//   stack each op) — machine-independent, so it holds on CI-shaped
//   2-core runners where the wall-clock ratio cannot. The interleaved
//   paired meter (both arms share each contention slice, arm order
//   alternates, fresh seed per sample so the table never grows across
//   samples) prints the median ratio for the record.
// Rationale: the route-time cache (tambor-8xm) skips derivation only
//   when NO state changed; the ops scenario changes state every op, so
//   the whole 1000-row view re-derives even though most row objects are
//   identity-preserved by the ops. Memo keyed on row-object identity
//   skips the unchanged rows' derivation; the drawn output is unchanged
//   (the same plain immutable view data). The original wall-clock
//   median tripwire (after < before * 0.8) flaked three ways: the
//   sequential two-arm design biased whole arms (ratio 0.77-1.00
//   across five CI-shaped runs); interleaved 16-sample medians flipped
//   on a single arm's GC tail (one run measured 1.26); and the meter
//   never reseeded, so append grew the table 1000→~9700 across samples
//   and the win diluted toward 1.0 (run 39282222146). Recorded medians
//   land in benchmarks/findings-kit.md (0.63-0.78 quiet machine,
//   tambor-54j.8.4); the browser keyed-table-ops meter is honestly NULL
//   (DOM draw floor dominates) — that finding is unchanged.

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

// Fresh identities each op introduces when applied to the seeded
// 1000-row state: replace re-objects every 10th row (100), swap
// reorders preserved identities (0), remove drops rows (0), append
// adds 1000 brand-new rows.
const FRESH_PER_OP: readonly number[] = [100, 0, 0, 1000];

// The drawn row: the same label the bench app draws. Counted — the
// tripwire reads the invocation count per op (the memo arm must skip
// every identity-preserved row).
let deriveCalls = 0;
function countedRowLabel(row: KeyedRow): Elem {
  deriveCalls++;
  return labelNode(`row ${row.id} — ${row.label}`);
}

// The memo arm's row renderer: identity-keyed per row object. Created
// once — the memoized function owns the cache, the view body stays
// pure (the React memo/useCallback shape without a macro).
const rowNode = memo(countedRowLabel);

// The memo view: the bench app's row stack with the memoized renderer;
// the drawn shape matches the bench app's row region (a vertical stack
// of row labels under a spacer).
function keyedTableViewMemo(state: KeyedTableState): Elem {
  const rows = (verticalLayout(state.rows.map(rowNode)) ?? []) as readonly Elem[];
  return (verticalLayout([spacer(0, 10), ...rows]) ??
    (rows[0] as Elem)) as Elem;
}

// Quantile with linear interpolation (the GC-robust meter statistic).
function quantile(xs: readonly number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const pos = q * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi
    ? (s[lo] as number)
    : (s[lo] as number) * (hi - pos) + (s[hi] as number) * (pos - lo);
}

function median(xs: readonly number[]): number {
  return quantile(xs, 0.5);
}

// One steady-state op sample: fresh seeded rows, ONE op applied
// (cycling through the op list), full op measured (view derive + draw).
// Reseeding per sample keeps the table at 1000-2090 rows — the
// never-reseeded variant let appendRows grow it toward ~9700 and the
// draw floor diluted the memo ratio toward 1.0.
function opSample(
  view: (state: KeyedTableState) => Elem,
  backend: DomBackend,
  opIndex: number,
): number {
  const rows = buildRows(keyedTableState().rows);
  const next = OPS[opIndex % OPS.length]!(rows);
  const t0 = performance.now();
  backend.draw(view({ rows: next }));
  return performance.now() - t0;
}

// Interleaved paired meter: per sample, both arms run the SAME op on
// identically seeded fresh states back to back, with the first arm
// alternating per sample — machine contention (thermal, GC, scheduler)
// hits both arms in the same slice and arm position cancels, instead
// of biasing a whole contiguous arm run.
function runInterleaved(
  warmups: number,
  measures: number,
): { plain: number[]; memo: number[] } {
  const plainBackend = new DomBackend({ containerSize: VIEWPORT });
  const memoBackend = new DomBackend({ containerSize: VIEWPORT });
  const plain: number[] = [];
  const memo: number[] = [];
  const total = warmups + measures;
  for (let i = 0; i < total; i++) {
    const memoFirst = i % 2 === 1;
    const tPlain = opSample(keyedTableView, plainBackend, i);
    const tMemo = opSample(keyedTableViewMemo, memoBackend, i);
    if (i >= warmups) {
      (memoFirst ? memo : plain).push(tPlain);
      (memoFirst ? plain : memo).push(tMemo);
    }
  }
  return { plain, memo };
}

test("memo derives only fresh row identities across the keyed-table op cycle", () => {
  // Warm the memo so the tripwire measures steady-state skip behavior,
  // not first-derive misses (the seed draw below derives all 1000).
  const seeded = buildRows(keyedTableState().rows);
  const memoBackend = new DomBackend({ containerSize: VIEWPORT });
  memoBackend.draw(keyedTableViewMemo({ rows: seeded }));
  expect(deriveCalls).toBe(1000); // first derive: every row is fresh

  // Each op from the seeded state: the memo arm must derive exactly
  // the fresh identities (replace's every-10th re-objects, swap and
  // remove preserve every identity, append's 1000 new rows) — not the
  // whole stack the unmemoized renderer would re-derive (1000, 1000,
  // 990, 1990 drawn rows respectively).
  let rows = seeded;
  for (let i = 0; i < OPS.length; i++) {
    rows = OPS[i]!(rows);
    deriveCalls = 0;
    memoBackend.draw(keyedTableViewMemo({ rows }));
    expect(
      deriveCalls,
      `op ${i}: derive calls must equal the op's fresh-identity count`,
    ).toBe(FRESH_PER_OP[i]);
  }
});

test("paired meter record: interleaved op medians (printed, unasserted)", () => {
  const WARM = 4;
  const N = 32;
  const { plain, memo: memoArm } = runInterleaved(WARM, N);
  const before = median(plain);
  const after = median(memoArm);
  const beforeQ1 = quantile(plain, 0.25);
  const afterQ1 = quantile(memoArm, 0.25);
  console.log(
    `MEMO-METER plain ${before.toFixed(2)} ms/op, memo ${after.toFixed(2)} ms/op, median ratio ${(after / before).toFixed(3)}` +
      ` | q1 plain ${beforeQ1.toFixed(2)}, memo ${afterQ1.toFixed(2)}, ratio ${(afterQ1 / beforeQ1).toFixed(3)}`,
  );
  // evidence, not a tripwire: wall-clock ratios flip on CI-shaped
  // runners (see file header). The deterministic skip tripwire lives in
  // the test above; this meter is recorded for findings-kit.md.
  expect(true).toBe(true);
});
