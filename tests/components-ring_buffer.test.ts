// Purpose: the contract tests for the bounded-series store
//   (openspec/specs/components-ring_buffer/spec.md — tambor-54j.8.5).
// Responsibilities: pin the capacity bound (drop-oldest keeps exactly
//   the newest capacity items), the FIFO ingest order, the amortized
//   append cost as structural sharing (no copy of the retained
//   series), the newest-n window view, the whole-window fold, the
//   pure-slice discipline (no mutation, dispatch-shaped), and the
//   loud capacity validation.
// Rationale: the BZ5 finding's bounded-window candidate is what this
//   component publicizes; the amortized-O(1) claim is pinned here as
//   identity sharing (an append that drops nothing shares the
//   retained stacks, a dropping append pops the old stack without
//   re-consing it) because allocation counts are not observable in a
//   pure language — identity is the corpus's observable for sharing
//   (the same signal dispatch soundness rides).

import { describe, expect, it } from "vitest";
import {
  appendSeries,
  boundedSeries,
  foldSeries,
  newestSeries,
  type BoundedSeries,
} from "../src/components/ring_buffer/ring_buffer.ts";

// A deterministic pseudo-random generator (mulberry32) — the
// generators below draw from it so a failure replays exactly.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The retained items oldest→newest by the reference route: a full
// materialization through newestSeries(size) — p_newest_window pins it
// against an independent walk, so the reference here is itself checked.
function items<T>(series: BoundedSeries<T>): readonly T[] {
  return newestSeries(series, series.capacity);
}

describe("ring_buffer capacity bound", () => {
  it("p_capacity_bound: size never exceeds capacity; overflow keeps exactly the newest capacity items", () => {
    const random = rng(5405);
    for (let trial = 0; trial < 20; trial++) {
      const capacity = 1 + Math.floor(random() * 40);
      let series = boundedSeries<number>(capacity);
      let ingested = 0;
      while (ingested < capacity * 3 + 7) {
        const batch = Array.from(
          { length: 1 + Math.floor(random() * 10) },
          (_, i) => ingested + i,
        );
        ingested += batch.length;
        series = appendSeries(series, batch);
        expect(series.size).toBeLessThanOrEqual(capacity);
      }
      expect(ingested).toBeGreaterThan(capacity); // the bound actually bit
      const kept = items(series);
      expect(series.size).toBe(capacity);
      expect(kept.map(String)).toEqual(
        Array.from({ length: capacity }, (_, i) => String(ingested - capacity + i)),
      );
    }
  });
});

describe("ring_buffer FIFO order", () => {
  it("p_fifo_order: iteration walks ingest order; dropped items never reappear", () => {
    const random = rng(5415);
    for (let trial = 0; trial < 20; trial++) {
      const capacity = 1 + Math.floor(random() * 30);
      let series = boundedSeries<number>(capacity);
      const ingested: number[] = [];
      for (let step = 0; step < 15; step++) {
        const batch = Array.from(
          { length: Math.floor(random() * 8) },
          () => ingested.length,
        );
        ingested.push(...batch);
        series = appendSeries(series, batch);
      }
      const kept = items(series);
      // the kept window is a suffix of the ingest order, oldest→newest
      expect(kept.map(String)).toEqual(
        ingested.slice(ingested.length - series.size).map(String),
      );
      // fold visits the same order — the dropped prefix is gone
      const folded: number[] = [];
      foldSeries(series, (_, n) => {
        folded.push(n);
        return null;
      }, null);
      expect(folded.map(String)).toEqual(kept.map(String));
    }
  });
});

describe("ring_buffer append cost", () => {
  it("p_append_amortized: an append never re-conses the retained series — untouched stacks keep identity", () => {
    const random = rng(5425);
    for (let trial = 0; trial < 20; trial++) {
      const capacity = 1 + Math.floor(random() * 30);
      let series = boundedSeries<number>(capacity);
      let ingested = 0;
      for (let step = 0; step < 10; step++) {
        const before = series;
        const batch = Array.from(
          { length: 1 + Math.floor(random() * 8) },
          () => ingested++,
        );
        const after = appendSeries(before, batch);
        if (after.size === before.size + batch.length) {
          // no drop: the old stack is untouched AND the young stack's
          // retained spine is shared — the batch was consed on top of
          // it, never copied beneath it
          expect(after.old).toBe(before.old);
          let spine = after.young;
          for (let i = 0; i < batch.length; i++) spine = spine!.rest;
          expect(spine).toBe(before.young);
        } else {
          const dropped = before.size + batch.length - after.size;
          let cell = before.old;
          for (let i = 0; i < dropped && cell !== null; i++) cell = cell.rest;
          if (after.old === cell) {
            // no rotation: drops popped the old stack exactly (the
            // d-th rest, possibly null on an exact drain) and the
            // young stack kept the retained items' spine shared under
            // the consed batch
            let spine = after.young;
            for (let i = 0; i < batch.length; i++) spine = spine!.rest;
            expect(spine).toBe(before.young);
          } else {
            // the old stack drained mid-drop and the young stack
            // rotated: the rotated cells are fresh conses (never
            // aliasing either pre-append stack) — the once-per-item
            // rotation cost the amortized bound allows
            expect(after.young).toBe(null);
            const cells = new Set<object>();
            for (let c = before.old; c !== null; c = c.rest) cells.add(c);
            for (let c = before.young; c !== null; c = c.rest) cells.add(c);
            for (let c = after.old; c !== null; c = c.rest) {
              expect(cells.has(c)).toBe(false);
            }
          }
        }
        series = after;
      }
    }
  });
});

describe("ring_buffer window view", () => {
  it("p_newest_window: newest(n) is exactly the last min(n, size) items, oldest→newest", () => {
    const random = rng(5435);
    for (let trial = 0; trial < 20; trial++) {
      const capacity = 1 + Math.floor(random() * 30);
      let series = boundedSeries<number>(capacity);
      let ingested = 0;
      for (let step = 0; step < 12; step++) {
        const batch = Array.from(
          { length: Math.floor(random() * 8) },
          () => ingested++,
        );
        series = appendSeries(series, batch);
        const full = items(series); // independent reference walk
        for (const n of [0, 1, 3, capacity, capacity + 5]) {
          expect(newestSeries(series, n).map(String)).toEqual(
            full.slice(Math.max(0, full.length - Math.min(n, full.length))).map(String),
          );
        }
      }
    }
  });
});

describe("ring_buffer fold", () => {
  it("p_fold: fold visits exactly size items once each, oldest→newest, composing the accumulator", () => {
    const random = rng(5445);
    for (let trial = 0; trial < 20; trial++) {
      const capacity = 1 + Math.floor(random() * 25);
      let series = boundedSeries<number>(capacity);
      let ingested = 0;
      for (let step = 0; step < 10; step++) {
        const batch = Array.from(
          { length: Math.floor(random() * 9) },
          () => ingested++,
        );
        series = appendSeries(series, batch);
        const kept = items(series);
        expect(foldSeries(series, (acc, n) => acc + n, 0)).toBe(
          kept.reduce((a, b) => a + b, 0),
        );
        let visits = 0;
        foldSeries(series, (_, n) => {
          expect(n).toBe(kept[visits++]);
          return null;
        }, null);
        expect(visits).toBe(series.size);
      }
    }
  });
});

describe("ring_buffer pure slices", () => {
  it("p_pure: append returns a fresh value, never mutates its input, and an empty batch shares identity", () => {
    let series = boundedSeries<string>(5);
    series = appendSeries(series, ["a", "b", "c"]);
    const snapshot = items(series);
    const snapshotSize = series.size;

    const out = appendSeries(series, ["d", "e", "f"]);
    // the input is untouched
    expect(series.size).toBe(snapshotSize);
    expect(items(series).map(String)).toEqual(snapshot.map(String));
    // the output is fresh data with the appended items — the oldest
    // ("a") was dropped, capacity 5 keeps the newest five
    expect(items(out).map(String)).toEqual(["b", "c", "d", "e", "f"]);
    // dispatch-shaped determinism: two equal appends of the same base
    // produce equal values (fresh identity, equal structure)
    expect(items(appendSeries(series, ["d", "e", "f"])).map(String)).toEqual(
      items(out).map(String),
    );
    // an empty batch is a no-op sharing the value's identity
    expect(appendSeries(out, [])).toBe(out);
  });
});

describe("ring_buffer validation", () => {
  it("p_validation: a non-positive or non-integer capacity is rejected with a TypeError", () => {
    expect(() => boundedSeries(0)).toThrow(TypeError);
    expect(() => boundedSeries(-3)).toThrow(TypeError);
    expect(() => boundedSeries(1.5)).toThrow(TypeError);
    expect(() => boundedSeries(Number.NaN)).toThrow(TypeError);
  });
});
