// Purpose: the spatial-index router wiring (tambor-54j.3 Phase 4 /
//   tambor-54j.10) — pointer delivery over a large group consults a
//   bounds index over the children and yields the intents of the
//   reverse linear walk byte-identically; groups whose subtree
//   contains a bubble or wrap node keep the linear walk (a bubble or
//   wrap may synthesize intents from empty children, which a bounds
//   pre-filter would wrongly skip).
// Responsibilities: verify pointer_group_index in
//   openspec/specs/event-model/spec.md — equivalence against the naive
//   child loop (first non-empty result scanning from the end), the
//   synthesis carve-out, and the steady-state meter (printed, generous
//   ceiling asserted — machine load makes tight bounds flaky).
// Rationale: the linear walk's rule is "first non-empty child from the
//   end"; a bounds index can only ever SKIP children whose bounds do
//   not contain the position — and every bounds-gated node would fail
//   its own gate anyway — so skipping them is invisible, except where
//   a bubble/wrap applies its function to empty child results. The
//   index is cached per group identity (the route-time view cache
//   makes group identity stable across a no-change event stream, the
//   same trust 8xm's view cache holds).

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { dispatch } from "../src/events/dispatch.ts";
import { mouseDown, mouseMove, type TamborEvent } from "../src/events/event.ts";
import {
  button,
  on,
  rectangle,
  translate,
  type Elem,
  type Vec2,
} from "../src/views/model.ts";
import type { IntentList } from "../src/core.ts";
import { onBubble } from "../src/events/bubble.ts";
// `performance` is untyped under the vitest/globals types (the 54j.11
// pattern): import from node:perf_hooks
 
// @ts-expect-error node builtin without type roots
import { performance } from "node:perf_hooks";

// The dispatchGroup threshold (pointer_group_index pins 64): groups at
// or above it take the index path.
const THRESHOLD = 64;

// The naive child loop — the linear walk's rule stated directly:
// dispatch each child last to first, the first non-empty list wins.
function linearChildLoop(
  elems: readonly Elem[],
  event: TamborEvent,
): IntentList {
  for (let i = elems.length - 1; i >= 0; i--) {
    const res = dispatch(elems[i]!, event);
    if (res.length > 0) return res;
  }
  return [];
}

// A scene of n interactive children: rectangles (some wrapped in
// handlers, some in buttons, some plain leaves), a few nested in
// translates. Overlaps happen naturally (same sizes at nearby coords).
// Builder table (the pretender cyclomatic floor on switches).
const BUILDERS: readonly ((i: number, x: number, y: number) => Elem)[] = [
  (i, x, y) => translate(x, y, on("mouse-move", (pos: unknown) => [["pick", i, pos]], rectangle(30, 20))),
  (i, x, y) => translate(x, y, button(`b${i}`, (pos: unknown) => [["pick", i, pos]])),
  (i, x, y) => translate(x, y, on("mouse-down", (pos: unknown) => [["pick", i, pos]], rectangle(30, 20))),
  // a nested group: the handler sits one level deeper
  (i, x, y) => translate(x, y, [on("mouse-down", (pos: unknown) => [["pick", i, pos]], rectangle(30, 20))]),
  // a plain leaf: yields nothing, the walk must skip it cheaply
  (_i, x, y) => translate(x, y, rectangle(30, 20)),
];

function scene(n: number, seed: number): readonly Elem[] {
  const elems: Elem[] = [];
  for (let i = 0; i < n; i++) {
    elems.push(BUILDERS[i % BUILDERS.length]!(i, (i * 7 + seed) % 200, (i * 11 + seed) % 200));
  }
  return elems;
}

describe("dispatch hit index (tambor-54j.3 Phase 4)", () => {
  it("p_pointer_index_equiv: indexed pointer delivery equals the reverse linear walk", () => {
    const events = [mouseDown([10, 10]), mouseMove([150, 80]), mouseDown([199, 199]), mouseMove([0, 0])];
    // deterministic scene sweep: five seeds × the four probe events,
    // deep-equal intents against the naive child loop
    for (let seed = 0; seed < 5; seed++) {
      const elems = scene(80, seed);
      for (const ev of events) {
        expect(dispatch(elems, ev)).toEqual(linearChildLoop(elems, ev));
      }
    }
    // randomized cross-check on generated scenes and positions
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 0, max: 250 }),
        fc.integer({ min: 0, max: 250 }),
        (seed, px, py) => {
          const elems = scene(THRESHOLD + 16, seed);
          const ev = seed % 2 === 0 ? mouseDown([px, py]) : mouseMove([px, py]);
          return JSON.stringify(dispatch(elems, ev)) === JSON.stringify(linearChildLoop(elems, ev));
        },
      ),
      { numRuns: 100 },
    );
  });

  it("p_pointer_index_bubble: bubble and wrap synthesis keep the linear walk", () => {
    // the synthesizing child sits at a position the probe does NOT
    // hit: a bounds pre-filter would skip it, the linear walk must not
    // the event-layer nodes are not Elem — they reach dispatch (which
    // walks them) through the cast; the view model cannot express them
    const farAway = translate(500, 500, onBubble(
      (intents) => (intents.length === 0 ? [["synth", "bubble"]] : intents),
      rectangle(10, 10),
    ) as never);
    const synthesizingWrap = translate(600, 600, {
      type: "wrap",
      eventType: "mouse-move",
      handler: (_defaultHandler: unknown) => [["synth", "wrap"]],
      drawables: [rectangle(10, 10)],
    } as never);
    const near = translate(10, 10, on("mouse-down", () => [["real"]], rectangle(20, 20)));
    const elems: Elem[] = [];
    for (let i = 0; i < THRESHOLD; i++) elems.push(translate(300 + i, 0, rectangle(5, 5)));
    // the synthesizers sit BOTTOM (pushed first), the real handler TOP:
    // a bubble node applies its function to every event, so on a
    // mouse-down inside the real child the first-match walk must stop
    // at the topmost child and never reach the synthesizers
    elems.push(farAway, synthesizingWrap, near);

    // the probe misses every real child: the answer comes from the
    // synthesizers, which no bounds containment justifies
    const probe = mouseMove([199, 199]);
    const res = dispatch(elems, probe);
    expect(res.some((intent) => (intent as unknown[])[0] === "synth")).toBe(true);
    // and the topmost real child still wins where it is hit
    expect(dispatch(elems, mouseDown([15, 15]))).toEqual([["real"]]);
  });

  it("p_pointer_index_equiv: steady-state pointer-move meter over a 10k group", () => {
    // 10k interactive children (the whiteboard profile): the first
    // event pays the index build, the stream rides the cache
    const elems = scene(10_000, 3);
    const probes: readonly Vec2[] = [[10, 10], [150, 80], [42, 133], [199, 60]];
    dispatch(elems, mouseMove([10, 10])); // build
    const samples: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      dispatch(elems, mouseMove(probes[i % probes.length]!));
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)]!;
    // generous ceiling (machine load 3–5.7 makes tight bounds flaky):
    // the corpus index meter (54j.10) put the bucket query at ~2.4µs;
    // the routed dispatch adds the bounds gates of the probe's cell
     
    console.log(`pointer-move over 10k group: median ${median.toFixed(3)}ms`);
    expect(median).toBeLessThan(10);
  });
});
