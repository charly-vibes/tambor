// Purpose: the dropdown demo's expected-pass properties — the option rows
//   are part of the drawn tree exactly while the model's `open?` flag is
//   true, and the drawn text stays readable, unclipped and tappable
//   (design D2: properties ship green at HEAD, so a red run is a new
//   finding).
// Responsibilities: extract the model's open flag (`__tambor.state()`'s
//   `open?`) and, from the same captured state, the labels drawn inside
//   the open list; assert the two agree on every state; assert the visual
//   floors from lib/visual.ts (`contrastViolations === 0`,
//   `undersizedTargets === 0`, `clippedTexts === 0`) with the one
//   documented corpus carve-out below; export the shared safety
//   properties, the stage actions, and a select-scoped click generator
//   (the header has no interactive DOM element, so the stage's
//   button/role targeting alone can never open the list).
// Rationale: the dropdown draws its header always and appends
//   dropdown-list only when open? (list_when_open), so option labels are
//   the per-state witness of the model flag. The list's rows are
//   translate wrappers offset below the header (list_geometry), which is
//   the DOM shape that separates a row label from the header label even
//   when both carry the same option text. Extractors must return JSON:
//   they project numbers, strings and fingerprints, never DOM nodes. The
//   text rules matter most here: the header renders a gray no-selection
//   label, and rows are one-line labels whose box must not clip them.
//
// Carve-out — the selected row's label. `components.select.row_visuals`
// pins a WHITE label on the blue `[0, 0.48, 1]` row fill (SELECTED_FILL,
// emitted as rgb(0, 122, 255)); that combination measures 4.02:1, below
// the 4.5:1 floor. It is a corpus accessibility defect, not a demo
// regression, so the extractor skips contrast on that one surface and
// asserts every other text box strictly. The exemption is keyed on the
// painted surface colour, so a future row that repaints on a different
// fill is measured again.

import { always, now } from "@antithesishq/bombadil";
import { actions, extract, getFingerprint } from "@antithesishq/bombadil/browser";
import type {
  ActionTemplate,
  Fingerprint,
  State,
} from "@antithesishq/bombadil/browser";
import { SELECTED_FILL } from "../src/components/select/list.ts";
import { handle } from "./lib/model.ts";
import { readVisualFacts, type VisualFacts } from "./lib/visual.ts";
import {
  mounted,
  readStageGeometry,
  validStagePoint,
  STAGE_SELECTOR,
  type StageGeometry,
} from "./lib/stage.ts";

// The safety properties (noConsoleErrors, noUncaughtExceptions, ...), the
// stage-scoped action generators and their composite. Default action
// generators are deliberately not exported — they would click the demo
// nav.
export * from "./lib/actions.ts";

// The visual floors for this demo. The one exemption is the corpus-pinned
// selected-row fill:
// corpus carve-out: components.select.row_visuals pins white on
// [0, 0.48, 1] (rgb(0, 122, 255), 4.02:1) below the 4.5:1 floor; tracked
// as a corpus accessibility defect. Every other surface is asserted.
const selectVisual = extract<VisualFacts>((state) =>
  readVisualFacts(state, [SELECTED_FILL]),
);

// The dropdown's options, in draw order (src/spa/gallery.ts OPTIONS).
const OPTION_LABELS = ["Uno", "Dos", "Tres"] as const;

type ClickTarget = {
  readonly fingerprint: Fingerprint;
  readonly point: { readonly x: number; readonly y: number };
};

type SelectSnapshot = {
  // The model's `open?` flag; null when the debug handle is absent.
  readonly open: boolean | null;
  // The option labels drawn inside the open list, in draw order. Empty
  // whenever the list is not part of the view.
  readonly optionLabels: string[];
  // Clickable centres of the header and of each drawn row label.
  readonly header: ClickTarget | null;
  readonly options: ClickTarget[];
};

function modelOpen(): boolean | null {
  const current = handle();
  if (current === null) return null;
  const state = current.state();
  if (typeof state !== "object" || state === null) return null;
  const open: unknown = (state as Record<string, unknown>)["open?"];
  return typeof open === "boolean" ? open : null;
}

// A list row is a translate wrapper: an absolutely positioned box offset
// below the list origin (BOX_PAD_Y = 8, then one row pitch per option).
// The header is drawn at the component origin, so none of its ancestors
// carries a non-zero top. This is the shape that keeps a header label
// showing the selected option out of the option-label count.
function insideOpenList(label: Element): boolean {
  for (
    let node = label.parentElement;
    node !== null;
    node = node.parentElement
  ) {
    const style = (node as HTMLElement).style;
    if (style.position !== "absolute") continue;
    const top = Number.parseFloat(style.top);
    if (Number.isFinite(top) && top > 0) return true;
  }
  return false;
}

function targetFor(
  element: Element,
  geometry: StageGeometry,
): ClickTarget | null {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const point = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
  if (!validStagePoint(point, geometry)) return null;
  return { fingerprint: getFingerprint(element), point };
}

function readSelect(state: State): SelectSnapshot {
  const geometry = readStageGeometry(state);
  const root = state.document.querySelector(STAGE_SELECTOR);
  // Every drawn label is a leaf span (dom-painters buildLabel), already
  // selected by tag; leaves only, so a wrapper's textContent cannot count
  // twice.
  const labels =
    root === null
      ? []
      : [...root.querySelectorAll("span")].filter(
          (label) => label.childElementCount === 0,
        );
  const rows = labels.filter(insideOpenList);
  const header = labels.find((label) => !insideOpenList(label)) ?? null;
  const options = rows
    .map((label) => targetFor(label, geometry))
    .filter((target): target is ClickTarget => target !== null);
  return {
    open: modelOpen(),
    optionLabels: rows.map((label) => label.textContent?.trim() ?? ""),
    header: header === null ? null : targetFor(header, geometry),
    options,
  };
}

const select = extract<SelectSnapshot>(readSelect);

// The select demo draws no <button>/role-bearing row, so the stage
// generators only ever click the empty surface. Header and row labels are
// the click targets that drive the demo: the header toggles open?, a row
// selects its option and closes the list (header_toggles, select_closes).
export const selectClicks = actions((): ActionTemplate[] => {
  const snapshot = select.current;
  const targets =
    snapshot.header === null
      ? snapshot.options
      : [snapshot.header, ...snapshot.options];
  return targets.map((target) => ({
    Click: { fingerprint: target.fingerprint, point: target.point },
  }));
}).when(mounted);

// The per-state agreement: exactly the option labels, in draw order, while
// the model says open; none while it says closed. A missing handle or an
// unmounted stage leaves the property vacuously true (the same null guard
// the counter property uses).
export const optionLabelsMatchOpen = always(() => {
  const snapshot = select.current;
  if (snapshot.open === null) return true;
  const drawn = snapshot.optionLabels;
  if (!snapshot.open) return drawn.length === 0;
  return (
    drawn.length === OPTION_LABELS.length &&
    drawn.every((text, index) => text === OPTION_LABELS[index])
  );
});

// --- visual floors --------------------------------------------------------

// Readability (lib/visual.ts): leaf text must clear WCAG AA against the
// surface behind it. Measured per captured state, so a state that repaints
// a label over its surface is judged where it renders, not from the model.
// The cell's one exemption is the pinned selected-row fill (see the
// carve-out above); every other text box is asserted. Gated on mount: the
// pre-mount placeholder has no stage and the extractor's zeroed counts
// must not fail the property.
export const textReadable = always(
  now(() => {
    const facts = selectVisual.current;
    return !facts.stagePresent || facts.contrastViolations === 0;
  }),
);

// Reachability: the dropdown draws no <button>, so this floor only holds
// vacuously today — it is exported to catch a future row/header that the
// backend emits as a real target below 44x44.
export const touchTargets = always(
  now(() => {
    const facts = selectVisual.current;
    return !facts.stagePresent || facts.undersizedTargets === 0;
  }),
);

// The rows are one-line labels (white-space: pre, line-height 1): their
// box must hold the glyphs, never crop them.
export const noClippedText = always(
  now(() => {
    const facts = selectVisual.current;
    return !facts.stagePresent || facts.clippedTexts === 0;
  }),
);
