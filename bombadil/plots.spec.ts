// Purpose: the plots demo's expected-pass property (add-bombadil-
//   exploration task 5.2) — the two linked charts draw the same band
//   count, that count stays inside the full-domain band grid, and a
//   drawn window with zero bands coincides with the `no data` summary
//   (design D2: properties ship green at HEAD, so a red run is a new
//   finding).
// Responsibilities: project `__tambor.state()` to `drawA.length` and
//   `drawB.length` and read the drawn chart titles (`A 800 bands`) plus
//   the summary line (`no data` / `pts …`) as the fallback binding;
//   assert the three invariants on EVERY captured state under any op
//   ordering, with no ordering precondition; keep the observation from
//   going silently vacuous once the demo is on screen; export the
//   shared stage actions and safety properties.
// Rationale: the defect this demo exists for — Pan/Zoom naive before
//   Load — is an ORDERING bug, and a randomized trace can never be
//   required to sample a particular ordering. That ordering is pinned
//   deterministically by tests/bench-plots.test.ts (`the naive ops
//   before Load (empty-state totality, tambor-yew)`: both naive ops
//   return plotState() unchanged and a following Load is the normal
//   loaded state). This property is the universal half: it must hold
//   on every state the trace happens to visit — including the empty
//   mounted state, which the mounted gate guarantees is captured before
//   the first action — so a red run means the app, not the sample, is
//   wrong.

import { always, now } from "@antithesishq/bombadil";
import { extract } from "@antithesishq/bombadil/browser";
import { BAND_COUNT } from "../src/examples/bench/plot-points.ts";
import { handle } from "./lib/model.ts";
import { STAGE_SELECTOR } from "./lib/stage.ts";

// The safety properties (noConsoleErrors, noUncaughtExceptions, ...) and
// the stage-scoped action generators. Default action generators are
// deliberately not exported — they would click the demo nav.
export * from "./lib/actions.ts";

// The summary line's two shapes (plot-points.ts `summaryLine`). The
// empty state's exact text is the invariant's anchor; the loaded shape
// is only recognized so "not `no data`" is observable, never parsed.
const SUMMARY_NO_DATA = "no data";
const SUMMARY_LOADED_PREFIX = "pts ";

// A chart title: `A 800 bands` (plots.ts `plotsView`). The `no data`
// title form (`A no data`) means that chart drew zero bands.
const BANDS_TITLE = /^([AB]) (\d+) bands$/;

// One captured state's plots reading. Every field is JSON (number,
// string or null) because Bombadil serializes each extractor result, and
// null is the pre-mount "nothing observable" value.
type PlotsObservation = {
  /** Bands drawn by the A chart: `drawA.length`, or the drawn title. */
  readonly bandsA: number | null;
  /** Bands drawn by the B chart: `drawB.length`, or the drawn title. */
  readonly bandsB: number | null;
  /** The drawn summary line, null while no stage is drawn yet. */
  readonly summary: string | null;
};

// The leaf texts of the drawn root. The chart titles and the summary
// line are leaf spans (dom-painters buildLabel), so no structure walk is
// needed — the same flat text scan the counter fallback uses.
function leafTexts(root: Element): string[] {
  const texts: string[] = [];
  for (const element of root.querySelectorAll("*")) {
    if (element.childElementCount > 0) continue;
    const text = element.textContent?.trim() ?? "";
    if (text.length > 0) texts.push(text);
  }
  return texts;
}

// The summary line among the drawn labels: the only leaf that is either
// the exact empty text or starts with the loaded `pts ` prefix.
function drawnSummary(texts: readonly string[]): string | null {
  for (const text of texts) {
    if (text === SUMMARY_NO_DATA || text.startsWith(SUMMARY_LOADED_PREFIX)) {
      return text;
    }
  }
  return null;
}

// One chart's drawn band count from its title; null when the title is
// absent (pre-mount) or unexpectedly shaped.
function drawnCount(texts: readonly string[], series: "A" | "B"): number | null {
  for (const text of texts) {
    if (text === `${series} ${SUMMARY_NO_DATA}`) return 0;
    const match = BANDS_TITLE.exec(text);
    if (match === null || match[1] !== series) continue;
    const count = Number.parseInt(match[2]!, 10);
    if (Number.isFinite(count)) return count;
  }
  return null;
}

// `drawA`/`drawB` projected to their lengths. A non-array (or a handle
// naming another demo) reads as absent rather than as zero bands.
function bandLength(
  state: Record<string, unknown>,
  key: "drawA" | "drawB",
): number | null {
  const value = state[key];
  return Array.isArray(value) ? value.length : null;
}

// The model half: `__tambor.state()`'s two drawn-window arrays. The
// handle is a structural seam (add-spa-test-seams), so a missing or
// partial handle degrades to null instead of breaking the run.
function modelBands(): { readonly a: number | null; readonly b: number | null } {
  const current = handle();
  if (current === null) return { a: null, b: null };
  const state: unknown = current.state();
  if (typeof state !== "object" || state === null) return { a: null, b: null };
  const record = state as Record<string, unknown>;
  return { a: bandLength(record, "drawA"), b: bandLength(record, "drawB") };
}

// One snapshot per captured state: the model's counts first (the
// authoritative source, design D5), the drawn titles second, so the
// property still observes bands in a bundle built without the debug
// seam — the counter property's fallback shape.
function observePlots(document: Document): PlotsObservation {
  const root = document.querySelector(STAGE_SELECTOR);
  const texts = root === null ? [] : leafTexts(root);
  const model = modelBands();
  return {
    bandsA: model.a ?? drawnCount(texts, "A"),
    bandsB: model.b ?? drawnCount(texts, "B"),
    summary: root === null ? null : drawnSummary(texts),
  };
}

const plots = extract<PlotsObservation>((state) => observePlots(state.document));

// The invariants of task 5.2, evaluated on every captured state:
//  1. both linked charts draw the same band count;
//  2. that count is within 0..BAND_COUNT (the full-domain grid is the
//     hard ceiling on any drawn window);
//  3. zero bands coincide with the `no data` summary — both directions,
//     so a stale summary or a silent zero-window draw is caught.
// The null guard covers the loading placeholder and a mid-run unmount;
// `plotsObservable` below keeps that guard from making the whole thing
// vacuous.
export const plotsChartsAgree = always(
  now(() => {
    const observed = plots.current;
    const bandsA = observed.bandsA;
    const bandsB = observed.bandsB;
    if (bandsA === null || bandsB === null) return true;
    if (bandsA !== bandsB) return false;
    if (bandsA < 0 || bandsA > BAND_COUNT) return false;
    if (bandsB < 0 || bandsB > BAND_COUNT) return false;
    if (observed.summary === null) return true;
    return (bandsA === 0) === (observed.summary === SUMMARY_NO_DATA);
  }),
);

// Coverage, not a second app property: whenever the plots stage is
// drawn, both band counts must be readable. A suite whose property
// silently skips every state is green and worthless (design: a green run
// means little if properties are weak), so an unreadable mounted state
// is a violation in its own right.
export const plotsObservable = always(
  now(() => {
    const observed = plots.current;
    if (observed.summary === null) return true;
    return observed.bandsA !== null && observed.bandsB !== null;
  }),
);