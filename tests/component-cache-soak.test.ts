// Purpose: soak + key-cost profile of the component render cache
//   (tambor-54j.11) — the profiling evidence the eviction-policy
//   decision must be recorded against.
// Responsibilities: (a) bounded-variant soak: 1M render() calls through
//   the public entry with fresh call objects whose props come from a
//   bounded state space (the realistic long-session regime — an app's
//   state cardinality bounds its distinct rendered props maps), so the
//   retained cache plateaus and heap stays flat; (b) hazard probe: the
//   unbounded-key regime (props that never repeat) grows the cache
//   linearly, and any component redefinition resets it — documented as
//   the existing bound, not asserted as desired behavior; (c) key-cost:
//   amortized ns/op of the cache-hit path (canonical serialization plus
//   the two map lookups), printed for the record.
// Rationale: the tambor-54j.11 acceptance bar — memory flat across 1M
//   dispatches, key-construction cost reported, eviction policy decided
//   and recorded. renderCacheStats() is a diagnostic introspection seam
//   only (component-cache.ts sits outside the public barrel, so this is
//   not an app-facing API change).

// @ts-expect-error node:process has no type declarations here
import { memoryUsage } from "node:process";
// @ts-expect-error node:perf_hooks has no type declarations here
import { performance } from "node:perf_hooks";
import { describe, it, expect } from "vitest";
import {
  cachedRender,
  clearRenderCache,
  renderCacheStats,
} from "../src/model/component-cache.ts";
import { call, defineComponent, render } from "../src/model/component.ts";

function heapUsed(): number {
  // gc() is only defined under --expose-gc; when absent the assertion
  // leans on the deterministic entry plateau plus a generous heap guard.
  (globalThis as { gc?: () => void }).gc?.();
  return memoryUsage().heapUsed;
}

// A tiny stateful component: props = {n, label} drawn from bounded sets,
// body renders a plain-data line (cheap, deterministic).
const line = defineComponent(
  "soak-line",
  [{ keys: ["n", "label"] }],
  (props) => {
    const p = props as Record<string, unknown>;
    return { type: "line", n: p["n"], label: p["label"] };
  },
);

describe("component render cache soak (tambor-54j.11)", { timeout: 180_000 }, () => {
  it("bounded-variant soak: 1M renders through the public entry — entries plateau, heap flat", () => {
    clearRenderCache();
    const NS = 97; // coprime strides so n and label span independently
    const LABELS = ["a", "b", "c", "d", "e"];
    const VARIANTS = NS * LABELS.length;
    const TOTAL = 1_000_000;

    const startHeap = heapUsed();
    let minHeap = startHeap;
    let maxHeap = startHeap;
    for (let i = 0; i < TOTAL; i++) {
      // fresh call object per dispatch, props from the bounded space —
      // the realistic regime: distinct rendered props == distinct states
      const c = call(line, {
        n: i % NS,
        label: LABELS[i % LABELS.length],
      });
      render(c);
      if (i % 100_000 === 0) {
        const h = memoryUsage().heapUsed;
        minHeap = Math.min(minHeap, h);
        maxHeap = Math.max(maxHeap, h);
      }
    }

    const stats = renderCacheStats();
    // plateau: every distinct props map is cached exactly once
    expect(stats.entries).toBe(VARIANTS);

    // heap sanity: sampled live heap (garbage included) grows by less
    // than the soak's working-set noise, not by retention
    const endHeap = heapUsed();
    const growth = endHeap - startHeap;
     
    console.log(
      `soak: entries=${stats.entries} components=${stats.components} ` +
        `heap start=${(startHeap / 1e6).toFixed(1)}MB end=${(endHeap / 1e6).toFixed(1)}MB ` +
        `growth=${(growth / 1e6).toFixed(1)}MB sampled-min=${(minHeap / 1e6).toFixed(1)}MB max=${(maxHeap / 1e6).toFixed(1)}MB`,
    );
    // The deterministic flatness proof is the entry plateau above: the
    // cache's retained memory is exactly its entries (name -> props-key
    // -> render), so 485 entries cannot grow. The heap guard only has
    // to catch a real leak — unbounded entry retention over this soak
    // would retain hundreds of MB, not noise. 64MB absorbs uncollected
    // garbage (no gc under plain vitest) and parallel-worker jitter.
    expect(growth).toBeLessThan(64 * 1024 * 1024);
  });

  it("hazard probe: ever-changing props keys grow linearly; redefinition resets (the existing bound)", () => {
    clearRenderCache();
    const DISTINCT = 50_000;
    for (let i = 0; i < DISTINCT; i++) {
      render(call(line, { n: i, label: "unique" }));
    }
    expect(renderCacheStats().entries).toBe(DISTINCT);

    // any redefinition resets the whole cache (render_cached)
    defineComponent("soak-line", [{ keys: ["n", "label"] }], (props) => props);
    expect(renderCacheStats().entries).toBe(0);
  });

  it("key-cost: amortized cache-hit path cost, printed for the record", () => {
    clearRenderCache();
    const c = call(line, { n: 7, label: "hit" });
    render(c); // populate
    const WARM = 1_000;
    for (let i = 0; i < WARM; i++) render(c);
    const N = 200_000;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) render(c);
    const nsPerOp = ((performance.now() - t0) * 1e6) / N;
     
    console.log(
      `key-cost: cache-hit path (canonical serialization + lookups) ` +
        `~${nsPerOp.toFixed(0)} ns/op`,
    );
    // tripwire, not the meter: the report line above is the evidence.
    // 100µs absorbs machine-load jitter (measured ~5µs quiet); a real
    // key-cost regression (serialization blowing up on big props) trips.
    expect(nsPerOp).toBeLessThan(100_000);
  });

  it("cachedRender bypass: unserializable props (function values) skip the cache entirely", () => {
    clearRenderCache();
    const before = renderCacheStats().entries;
    let resolved = 0;
    // a function-valued prop makes canonical() return null -> no caching
    const withFn = call(line, { n: 2, label: () => "fn" });
    cachedRender(withFn, () => {
      resolved++;
      return null;
    });
    cachedRender(withFn, () => {
      resolved++;
      return null;
    });
    expect(resolved).toBe(2);
    expect(renderCacheStats().entries).toBe(before);
  });
});
