// Purpose: the bounded-series store (components.ring_buffer) — a pure,
//   fixed-capacity FIFO of items with drop-oldest, appended O(1)
//   amortized and never copying the retained series (tambor-54j.8.5,
//   the public promotion of the BZ5 log-stream candidate).
// Responsibilities: boundedSeries(capacity) builds the empty series
//   (capacity validated loudly); appendSeries(series, batch) returns
//   the series with the batch ingested and the overflow's oldest items
//   dropped; newestSeries(series, n) materializes the newest n items
//   oldest→newest; foldSeries(series, f, seed) folds the whole
//   retained window oldest→newest. The capacity, drop-oldest and
//   amortized-cost contracts live in its doc and the spec corpus.
// Rationale: openspec/specs/components-ring_buffer/spec.md is the
//   design authority. The BZ5 finding (benchmarks/findings-bz.md §BZ5)
//   measured the naive per-line ingest climbing ~+70 ms per extra 1000
//   lines — every append copying the whole ever-growing corpus — while
//   a bounded window held flat (83 ms); the inline pattern
//   (src/examples/bench/log-stream.ts ringAppendOp) proved the
//   bound inside the bench app by slicing the newest capacity items
//   per append, which is allocation-bounded but still O(capacity) per
//   append. This component keeps the slice discipline's state shape
//   (plain immutable data usable directly as an app-state slice —
//   state changes only through dispatch, structural sharing preserved)
//   without the per-append capacity copy: a persistent two-stack
//   queue. The young stack holds the newest items (head = newest); the
//   old stack holds the oldest items (head = the next to drop).
//   Appending conses the batch onto the young stack and pops the
//   overflow's oldest items off the old stack; when the old stack
//   empties mid-drop it is refilled by reversing the young stack once.
//   Each item is consed at most twice over the stream (once onto the
//   young stack, once more only if rotation moves it to the old stack)
//   and dropped at most once — O(1) amortized per appended item, no
//   immutable copy of the retained series, memory bounded by capacity.
//   A mutating array ring would meet the same bound but would add
//   mutability the corpus does not have (state changes only through
//   dispatch); the slice-based copy the inline pattern used is
//   allocation-bounded but O(capacity) per append, not O(1) amortized —
//   the two-stack queue is the pure point between them.

// One cons cell of an immutable stack. Plain data — a stack is a
// linked chain of these, so popping (taking .rest) and consing share
// structure instead of copying.
interface Cell<T> {
  readonly head: T;
  readonly rest: Cell<T> | null;
}

// A bounded series: plain immutable data, directly usable as an app
// state slice (updates through dispatch produce a fresh value; the
// stacks a change does not touch keep their identity). `old` holds the
// oldest items oldest-first (head = the next item drop-oldest pops);
// `young` holds the newest items newest-first (head = the newest).
// Both stacks together are the retained window, oldest→newest.
export interface BoundedSeries<T> {
  readonly capacity: number;
  readonly size: number;
  /** internal — the oldest-first stack (head = the next item to drop) */
  readonly old: Cell<T> | null;
  /** internal — the newest-first stack (head = the newest item) */
  readonly young: Cell<T> | null;
}

// The empty series. The capacity is the window's hard bound — a
// non-positive or non-integer capacity would silently mis-bound every
// later append, so it is rejected loudly (the memo component's
// object-keys-only rule: a contract that cannot hold is a TypeError,
// never a silent mis-key).
export function boundedSeries<T>(capacity: number): BoundedSeries<T> {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new TypeError(
      "boundedSeries: capacity must be a positive integer",
    );
  }
  return { capacity, size: 0, old: null, young: null };
}

// Ingest a batch: the batch is consed onto the young stack newest-first
// and exactly max(0, size + b - capacity) items are dropped oldest-first
// off the old stack (refilling it from the young stack once, reversed,
// if it empties mid-drop). Returns a fresh series; nothing the append
// does not touch is copied or re-consed.
export function appendSeries<T>(
  series: BoundedSeries<T>,
  batch: readonly T[],
): BoundedSeries<T> {
  if (batch.length === 0) return series;
  // cons the batch in forward order so the young stack's head ends up
  // holding the batch's LAST item — the youngest (head = newest)
  let young = series.young;
  for (let i = 0; i < batch.length; i++) {
    young = { head: batch[i]!, rest: young };
  }
  let old = series.old;
  let size = series.size + batch.length;
  let overflow = size - series.capacity;
  while (overflow > 0) {
    if (old === null) {
      // the old stack is drained — the young stack's items (oldest
      // first after reversing) become the drop frontier; each item is
      // consed here at most once over the stream
      old = reverse(young);
      young = null;
    }
    old = old!.rest;
    overflow--;
    size--;
  }
  return { capacity: series.capacity, size, old, young };
}

// Reverse a stack (head = newest) into its oldest-first order. The
// rotation behind the amortized bound: each cell is consed here at
// most once over the stream.
function reverse<T>(stack: Cell<T> | null): Cell<T> | null {
  let out: Cell<T> | null = null;
  for (let cell = stack; cell !== null; cell = cell.rest) {
    out = { head: cell.head, rest: out };
  }
  return out;
}

// The newest n items in oldest→newest order — exactly the last
// min(n, size) items of the ingest order. The window must not pay for
// what it excludes: the walk starts at the young stack's head (the
// newest) and only reaches into the old stack when the window spans
// the rotation seam; the full walk is bounded by the retained window
// (≤ capacity), never by the ingest history.
export function newestSeries<T>(
  series: BoundedSeries<T>,
  n: number,
): readonly T[] {
  const newest: T[] = [];
  for (
    let cell = series.young, taken = 0;
    cell !== null && taken < n;
    cell = cell.rest, taken++
  ) {
    newest.push(cell.head);
  }
  if (newest.length === n || series.old === null) {
    return newest.reverse();
  }
  // the window reaches back past the young stack: walk the old stack
  // (bounded by capacity) and take its last n - newest.length items
  const older: T[] = [];
  for (let cell = series.old; cell !== null; cell = cell.rest) {
    older.push(cell.head);
  }
  return [...older.slice(Math.max(0, older.length - (n - newest.length))), ...newest.reverse()];
}

// Fold the whole retained window oldest→newest: exactly size visits,
// one per retained item, in ingest order — the summary-state read
// (a histogram, a match count) over the bounded store.
export function foldSeries<T, A>(
  series: BoundedSeries<T>,
  fold: (acc: A, item: T) => A,
  seed: A,
): A {
  let acc = seed;
  for (let cell = series.old; cell !== null; cell = cell.rest) {
    acc = fold(acc, cell.head);
  }
  // the young stack is newest-first — reverse-walk it by re-walking
  // its cells into oldest-first order (bounded by capacity)
  const young: T[] = [];
  for (let cell = series.young; cell !== null; cell = cell.rest) {
    young.push(cell.head);
  }
  for (let i = young.length - 1; i >= 0; i--) {
    acc = fold(acc, young[i]!);
  }
  return acc;
}
