// Purpose: the stage-scoped action generators of the bombadil suite —
//   clicks, drags, scrolls and key presses that stay inside the drawn
//   root, never the page chrome (design D1/D4).
// Responsibilities: extract the clickable targets (the stage surface plus
//   each real interactive element) with `getFingerprint`; generate Click,
//   MouseDrag, ScrollUp/Down and PressKey templates from cells only; reject
//   every point outside the stage or viewport; return [] (and gate with
//   `.when(mounted)`) until the stage exists. The safety properties are
//   re-exported here so a spec can pick up both with one `export *`.
// Rationale: action thunks run outside the page, so they must not query
//   the DOM — the extractor is the single DOM read (manual: generators
//   should depend on cells and validate actions before returning them).
//   The default action generators (clicks/inputs/scroll/navigation) are
//   never exported: they would click the demo nav and leave the selected
//   demo, breaking every per-demo property.

import {
  actions,
  extract,
  getFingerprint,
  weighted,
} from "@antithesishq/bombadil/browser";
import type {
  ActionTemplate,
  Fingerprint,
  State,
} from "@antithesishq/bombadil/browser";
import {
  mounted,
  readStageGeometry,
  stage,
  validStagePoint,
  visibleStageRect,
  STAGE_SELECTOR,
  type StageGeometry,
  type StagePoint,
} from "./stage.ts";

// The safety properties every spec inherits (no console errors, no
// uncaught exceptions, no unhandled rejections, no HTTP 4xx/5xx).
// Selectively re-exported from defaults/properties: `export *` from
// browser/defaults would also re-export `defaultActions`, which clicks
// the demo nav.
export {
  noConsoleErrors,
  noHttpErrorCodes,
  noUncaughtExceptions,
  noUnhandledPromiseRejections,
} from "@antithesishq/bombadil/browser/defaults/properties";

// The drawn tree emits real <button>/<textarea> elements (tambor-huu) and
// role-bearing rows for selectable lists; these are the targets a user
// can actually click.
const INTERACTIVE_SELECTOR = [
  "button",
  "textarea",
  "input",
  "select",
  "a[href]",
  "[role='button']",
  "[role='option']",
  "[role='checkbox']",
  "[role='tab']",
  "[contenteditable='true']",
].join(", ");

type ClickTarget = {
  readonly fingerprint: Fingerprint;
  readonly point: StagePoint;
};

function clickTargetFor(
  element: Element,
  geometry: StageGeometry,
): ClickTarget | null {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const point: StagePoint = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
  if (!validStagePoint(point, geometry)) return null;
  return { fingerprint: getFingerprint(element), point };
}

// Runs inside the page once per captured state. The stage root itself is
// a target (geometry clicks anywhere on the drawn surface); each
// interactive descendant contributes its own fingerprinted centre.
function collectClickTargets(state: State): ClickTarget[] {
  const geometry = readStageGeometry(state);
  const root = state.document.querySelector(STAGE_SELECTOR);
  if (root === null) return [];
  const targets: ClickTarget[] = [];
  const surface = clickTargetFor(root, geometry);
  if (surface !== null) targets.push(surface);
  for (const element of root.querySelectorAll(INTERACTIVE_SELECTOR)) {
    const target = clickTargetFor(element, geometry);
    if (target !== null) targets.push(target);
  }
  return targets;
}

const clickTargets = extract<ClickTarget[]>(collectClickTargets);

// A uniform point inside the visible part of the stage.
function randomStagePoint(geometry: StageGeometry): StagePoint | null {
  const rect = visibleStageRect(geometry);
  if (rect === null) return null;
  const point: StagePoint = {
    x: rect.x + Math.random() * rect.width,
    y: rect.y + Math.random() * rect.height,
  };
  return validStagePoint(point, geometry) ? point : null;
}

const clickActions = actions((): ActionTemplate[] => {
  if (!mounted.current) return [];
  return clickTargets.current.map((target) => ({
    Click: { fingerprint: target.fingerprint, point: target.point },
  }));
});

const dragActions = actions((): ActionTemplate[] => {
  const geometry = stage.current;
  if (!mounted.current || geometry.stage === null) return [];
  const from = randomStagePoint(geometry);
  const to = randomStagePoint(geometry);
  if (from === null || to === null) return [];
  return [{ MouseDrag: { from, to, steps: 8, delayMillis: 16 } }];
});

const scrollActions = actions((): ActionTemplate[] => {
  const geometry = stage.current;
  if (!mounted.current) return [];
  const origin = randomStagePoint(geometry);
  if (origin === null) return [];
  const distance = 80 + Math.floor(Math.random() * 160);
  return [
    { ScrollDown: { origin, distance } },
    { ScrollUp: { origin, distance } },
  ];
});

// Navigation/edit keys only: Space and PageDown would scroll the page
// itself and confuse the stage-relative coordinates. Every key is
// harmless to the counter and meaningful to the textarea demos.
const KEY_CODES = [37, 38, 39, 40, 8, 13, 9] as const;

const keyActions = actions((): ActionTemplate[] => {
  if (!mounted.current) return [];
  return KEY_CODES.map((code) => ({ PressKey: { code } }));
});

export const stageClicks = clickActions.when(mounted);
export const stageDrag = dragActions.when(mounted);
export const stageScroll = scrollActions.when(mounted);
export const stageKeys = keyActions.when(mounted);

// A pre-mount placeholder: Bombadil aborts a run with "no actions
// available" when every exported generator is gated on `mounted` and the
// first captured state is the `loading …` shell — the logo demo's
// dynamic chunk lost that race. `Wait` is inert and disappears the
// moment the draw lands, so the normal exploration stays click-driven.
const waitForMount = actions((): ActionTemplate[] =>
  mounted.current ? [] : ["Wait"],
);

// The composite a spec normally exports: clicks dominate (the reachable
// state space of the demos is click-driven), with drag/scroll/keys for
// texture. The individual generators stay exported for narrower specs.
// The composite itself is NOT gated: every member gates on `mounted`
// individually, and `waitForMount` covers the pre-mount state.
export const stageActions = weighted([
  [8, stageClicks],
  [2, stageDrag],
  [2, stageScroll],
  [1, stageKeys],
  [1, waitForMount],
]);