// Purpose: showcase contract tests (add-docs-site task 8.1) — at or
//   above the breakpoint a page that embeds a demo pins the demo at a
//   constant viewport position while its section's prose scrolls, and
//   releases it at the boundary's end in the same frame (release
//   continuity — the very next derived frame already rides native
//   flow); below the breakpoint the same page stacks the demo above its
//   prose with no pin activation at any offset. The pin activation
//   formula (start ≤ offset.y ≤ end) is asserted at the boundary
//   offsets: the demo is pinned exactly across the pin's window and in
//   native flow everywhere outside it.
// Responsibilities: inject a real-ish label measure (8px/char, 16px
//   line — the text_measure_injected pattern; the unit default makes
//   prose a handful of 1px lines, too short for a sweep), sweep the
//   docs view's derivation across the ambient scroll offset (driven
//   through the state, exactly the wheel path of the mounted app),
//   track the demo band marker's and the page statement's screen
//   positions through the shared screen walk (tests/helpers/pin.ts),
//   then assert the pin window, its boundary formula, and the narrow
//   branch's pinning absence.
// Rationale: openspec/changes/add-docs-site/specs/docs-site/spec.md
//   "Scrollytelling showcase layout" is the design authority; design D5
//   composes scrollview + scrollytelling pin inside the content pane, so
//   the derivation responds to the pane's own scroll offset (state.offset
//   — the wheel intents of the showcase scrollview update exactly this
//   path, and the view plugs it into context.scroll for the pin). The
//   tests are behavioral — they read only marker/prose screen positions,
//   never the composition's internal shape — asserting the piecewise
//   law: native flow (exact −step per sample) before and after the pin
//   window, a constant pinned position across it, and no lingering
//   stale position in the first frame past the boundary.

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
// @ts-expect-error node:child_process has no type declarations here
import { spawnSync } from "node:child_process";
// @ts-expect-error node:path has no type declarations here
import { resolve } from "node:path";
import { CONTAINER_SIZE_KEY } from "../src/effects/dispatch.ts";
import { screenPos, type Positioned } from "./helpers/pin.ts";
import { configureLabelMeasure } from "../src/views/nodes.ts";

const TOOL = resolve("tools/gen_docs_content.py");
const CORPUS = resolve("openspec/specs");
const GENERATED = resolve("src/docs/content/generated");

// Real-ish metrics so prose spans a measurable scroll: 8px per
// character, a 16px line box (the corpus unit default of 1px/char makes
// the whole page ≈ 10 lines tall — the pin window would be sub-sample).
// Every label built during the derivations captures this measure
// (text_measure_injected); the navigation buttons grow with it too.
configureLabelMeasure((text) => [text.length * 8, 16]);

const gen = spawnSync("python3", [TOOL, "--corpus", CORPUS, "--out", GENERATED], {
  encoding: "utf8",
});
if (gen.status !== 0) throw new Error(`content generator failed: ${gen.stderr}`);

const PAGE = "example-counter";
const PROSE_PREFIX = "WHEN the user presses more";
const STEP = 10;
const MIN_RUN = 3;

interface Sample {
  readonly oy: number;
  readonly markerY: number;
  readonly proseY: number;
}

interface StateShape {
  readonly page: string;
  readonly body: string | null;
  readonly focus: string | null;
  readonly "open?": boolean;
  readonly "::extra": Record<string, unknown>;
  readonly offset: readonly [number, number];
}

function textOf(leaf: Positioned): string | undefined {
  return (leaf.node as { text?: string }).text;
}

function markerLeaf(leaves: readonly Positioned[], marker: string): Positioned {
  const hit = leaves.find(
    (l) => l.node.type === "label" && textOf(l) === marker,
  );
  if (hit === undefined) throw new Error("demo band marker not drawn");
  return hit;
}

function proseLeaf(leaves: readonly Positioned[]): Positioned {
  const hit = leaves.find(
    (l) => l.node.type === "label" && textOf(l)?.startsWith(PROSE_PREFIX) === true,
  );
  if (hit === undefined) throw new Error("page statement line not drawn");
  return hit;
}

// One derived frame at (width, scroll offset): the offset is state —
// the showcase scrollview's wheel intents address exactly this path in
// the mounted app, so driving it here is the real input path, not a
// test seam.
async function deriveSample(width: number, oy: number): Promise<Sample> {
  const { docsView } = await import("../src/docs/main.ts");
  const { embedMarker } = await import("../src/docs/embeds.ts");
  const state: StateShape = {
    page: PAGE,
    body: null,
    focus: null,
    "open?": false,
    "::extra": {},
    offset: [0, oy],
  };
  const view = docsView(state, { [CONTAINER_SIZE_KEY]: [width, 700] });
  const leaves = screenPos(view);
  const marker = markerLeaf(leaves, embedMarker("counter"));
  const prose = proseLeaf(leaves);
  return { oy, markerY: marker.pos[1], proseY: prose.pos[1] };
}

async function sweep(
  width: number,
  maxOy: number,
  step: number,
): Promise<Sample[]> {
  const samples: Sample[] = [];
  for (let oy = 0; oy <= maxOy; oy += step) {
    samples.push(await deriveSample(width, oy));
  }
  return samples;
}

// The demo marker is constant across the whole run.
function markerHeld(samples: readonly Sample[], i: number, j: number): boolean {
  for (let k = i + 1; k <= j; k++) {
    if (samples[k]!.markerY !== samples[i]!.markerY) return false;
  }
  return true;
}

// The prose strictly scrolls across the run (content moves up by the
// step on every sample).
function proseScrolls(samples: readonly Sample[], i: number, j: number): boolean {
  for (let k = i; k < j; k++) {
    if (samples[k]!.proseY <= samples[k + 1]!.proseY) return false;
  }
  return true;
}

// The run [i, j] is a pin window: the demo holds position while the
// prose scrolls, for the whole run.
function isPinnedRun(samples: readonly Sample[], i: number, j: number): boolean {
  return markerHeld(samples, i, j) && proseScrolls(samples, i, j);
}

// The widest end of the pinned run starting at i: extend j while the
// run keeps holding (the loop-condition conjunction is the helper's
// only decision).
function pinnedRunEnd(
  samples: readonly Sample[],
  i: number,
  j: number,
): number {
  let end = j;
  while (end + 1 < samples.length && isPinnedRun(samples, i, end + 1)) {
    end++;
  }
  return end;
}

// The widest pin window [i, j]: the demo holds a constant viewport
// position while the prose scrolls. Null when no such window exists.
function findPinWindow(samples: readonly Sample[]): [number, number] | null {
  let best: [number, number] | null = null;
  for (let i = 0; i + MIN_RUN <= samples.length; i++) {
    const first = i + MIN_RUN - 1;
    if (!isPinnedRun(samples, i, first)) continue;
    const j = pinnedRunEnd(samples, i, first);
    if (best === null || j - i > best[1] - best[0]) best = [i, j];
  }
  return best;
}

// Native flow: the marker rides the content up one step per sample.
function nativeFlow(samples: readonly Sample[], lo: number, hi: number): boolean {
  for (let k = lo; k < hi; k++) {
    if (samples[k]!.markerY - samples[k + 1]!.markerY !== STEP) return false;
  }
  return true;
}

describe("docs showcase — p_docs_showcase_pins_during_section_scroll", () => {
  it("p_docs_showcase_pins: at ≥600px the demo holds a constant viewport position while its section's prose scrolls", async () => {
    const rest = await deriveSample(600 + 300, 0);
    // The demo's natural slot: its rest position in content space (the
    // pin activates as its slot approaches the pane top). The sweep
    // covers from the top of the content down past the slot, so the
    // pin window — the last proseHeight of scroll before the slot — is
    // interior with native-flow samples on both sides.
    const maxOy = rest.markerY + 40;
    const samples = await sweep(600 + 300, maxOy, STEP);
    const win = findPinWindow(samples);
    expect(
      win,
      "a pin window: constant demo position while prose scrolls",
    ).not.toBeNull();
    if (win === null) return;
    const [i, j] = win;
    // Interior: the window must sit strictly inside the sweep.
    expect(i, "a native-flow sample before the window").toBeGreaterThan(0);
    expect(j, "a released sample after the window").toBeLessThan(
      samples.length - 1,
    );
    for (let k = i; k <= j; k++) {
      expect(samples[k]!.markerY).toBe(samples[i]!.markerY);
    }
  });

  it("p_docs_showcase_pins: the activation formula holds at the boundary offsets (native to the window, release at the end in the same frame)", async () => {
    const rest = await deriveSample(600 + 300, 0);
    const samples = await sweep(600 + 300, rest.markerY + 40, STEP);
    const win = findPinWindow(samples);
    expect(win, "pin window from the sibling test").not.toBeNull();
    if (win === null) return;
    const [i, j] = win;
    expect(i, "a native-flow sample before the window").toBeGreaterThan(0);
    expect(j, "a released sample after the window").toBeLessThan(
      samples.length - 1,
    );
    // Before the window the demo is in native flow: it rides the
    // content up one step per sample (no activation below the
    // boundary — the formula's `offset.y < start` branch). Up to, not
    // including, the boundary sample — the delta across the boundary
    // itself is the activation jump.
    expect(nativeFlow(samples, 0, i - 1), "native flow below the start").toBe(true);
    // The activation itself: between the last native sample and the
    // first pinned one the marker is NOT one step apart — it jumps to
    // the pinned position exactly when the boundary is crossed
    // (activation formula: pinned iff start ≤ offset.y ≤ end).
    expect(samples[i]!.markerY - samples[i - 1]!.markerY).not.toBe(STEP);
    // The release happens at the boundary's end in the same frame: the
    // very next sample already rides native flow — one step below the
    // pinned value at most (release_continuous — the released position
    // coincides with the pinned position exactly at the boundary, so
    // no rendered discontinuity can hide inside a sweep step), and the
    // flow resumes with the exact step deltas afterwards (past the
    // boundary the demo scrolls with the content again).
    expect(
      samples[j]!.markerY - samples[j + 1]!.markerY,
      "release within one sweep step, no lingering stale position",
    ).toBeLessThanOrEqual(STEP);
    expect(nativeFlow(samples, j + 1, samples.length - 1), "native flow after the end").toBe(true);
  });
});

describe("docs showcase — p_docs_showcase_stacks_below_breakpoint", () => {
  it("p_docs_showcase_stacks: below 600px the demo stacks above its prose and no pin activation occurs at any offset", async () => {
    const samples = await sweep(320, 300, 30);
    for (const s of samples) {
      expect(s.markerY, `stacks above prose at offset ${s.oy}`).toBeLessThan(
        s.proseY,
      );
    }
    expect(
      findPinWindow(samples),
      "no pin activation at any offset below the breakpoint",
    ).toBeNull();
  });
});