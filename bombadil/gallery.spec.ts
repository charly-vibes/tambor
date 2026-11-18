// Purpose: the gallery shell's expected-pass geometry properties
//   (add-demo-visual-polish 5.1/5.2) — every nav chip meets the corpus
//   44px mobile_first floor, and the drawn root sits centred with equal
//   viewport gutters instead of floating top-left.
// Responsibilities: extract the nav buttons' count and minimum box, and
//   `#demo > div`'s left/right gutters; assert the 44px floor (vacuous
//   with no chips) and the 2px centring tolerance on every captured
//   state; export the shared safety properties and the stage actions.
// Rationale: this spec covers the SHELL, not one demo — nav, `#demo`
//   container and the fixture's stage CSS are identical whichever demo
//   mounts, so one spec covers the geometry every demo inherits. The
//   runner keys a spec by demo name (`just bombadil gallery` sends
//   `?demo=gallery`), and an unknown id boots the first registry entry
//   (boot-selection.ts), so the run still mounts a real demo (`todo`)
//   behind the same shell. The tolerances mirror the deterministic check
//   in tests/e2e/gallery.spec.ts ("nav targets meet 44px and the stage is
//   centred"): 44px is the corpus mobile_first target floor, and 2px
//   absorbs subpixel rounding of the stage's auto inline margins.
//   Extractor values must be JSON (Bombadil serialises every snapshot),
//   so both snapshots carry numbers and null only — never a DOM node or
//   a rect.

import { always, now } from "@antithesishq/bombadil";
import { extract } from "@antithesishq/bombadil/browser";
import type { State } from "@antithesishq/bombadil/browser";
import { STAGE_SELECTOR } from "./lib/stage.ts";

// The safety properties (noConsoleErrors, noUncaughtExceptions, ...) and
// the composite stage-scoped action generator. Default action generators
// are deliberately not exported — they would click the demo nav.
export {
  noConsoleErrors,
  noHttpErrorCodes,
  noUncaughtExceptions,
  noUnhandledPromiseRejections,
  stageActions,
} from "./lib/actions.ts";

// The corpus mobile_first target floor and the fixture's gutter
// tolerance (tests/e2e/gallery.spec.ts: |left - right| <= 2).
const MIN_TARGET = 44;
const CENTRE_TOLERANCE = 2;

// The smallest nav chip box. `count` is 0 before the shell builds its
// nav, which the property treats as vacuously true.
type NavBoxes = {
  readonly count: number;
  readonly minW: number;
  readonly minH: number;
};

// Runs inside the page once per captured state.
function readNavBoxes(state: State): NavBoxes {
  const buttons = state.document.querySelectorAll("nav button");
  let minW = Number.POSITIVE_INFINITY;
  let minH = Number.POSITIVE_INFINITY;
  for (const button of buttons) {
    const rect = button.getBoundingClientRect();
    minW = Math.min(minW, rect.width);
    minH = Math.min(minH, rect.height);
  }
  return buttons.length === 0
    ? { count: 0, minW: 0, minH: 0 }
    : { count: buttons.length, minW, minH };
}

const navBoxes = extract<NavBoxes>(readNavBoxes);

// The drawn root's viewport gutters: the gap on the left, and the gap on
// the right (viewport width minus the root's right edge). Both null
// while the selected demo has not mounted (the `loading …` placeholder
// has no `#demo > div`).
type StageGutters = {
  readonly left: number | null;
  readonly right: number | null;
};

function readStageGutters(state: State): StageGutters {
  const root = state.document.querySelector(STAGE_SELECTOR);
  if (root === null) return { left: null, right: null };
  const rect = root.getBoundingClientRect();
  // The content box, not the window: a page taller than the viewport
  // reserves a classic scrollbar, so innerWidth overstates the usable
  // width by ~15px and the right gutter would read 15px too large on
  // every mounted state (the fixture is always taller than 768px).
  const contentWidth = state.document.documentElement.clientWidth;
  return {
    left: rect.left,
    right: contentWidth - rect.right,
  };
}

const stageGutters = extract<StageGutters>(readStageGutters);

// Every nav chip is a real target: the shell owns the nav, so a chip
// below 44px on either axis is the shell's regression, not a demo's.
export const navTargets = always(
  now(() => {
    const { count, minW, minH } = navBoxes.current;
    return count === 0 || (minW >= MIN_TARGET && minH >= MIN_TARGET);
  }),
);

// The drawn root sits centred: equal gutters within subpixel tolerance.
// Pre-mount states pass (no root to measure).
export const stageCentred = always(
  now(() => {
    const { left, right } = stageGutters.current;
    return (
      left === null ||
      right === null ||
      Math.abs(left - right) <= CENTRE_TOLERANCE
    );
  }),
);