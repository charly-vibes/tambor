// Purpose: the keyed focus-list verification app (add-keyed-dom-
//   reconciliation §5.1) — real-browser proof that focus survives keyed
//   list churn because it rides element identity.
// Responsibilities: KeyedFocusState, keyedFocusListView (a stack of
//   keyed BUTTON rows over plain state plus the Insert first / Remove
//   first controls), and createKeyedFocusListApp — the ordinary
//   registry-aware makeApp mount, no benchmark-specific path.
// Rationale: the corpus has no real text-input node (the textarea is
//   canvas-drawn), and the DOM backend's real <button> is the only
//   focusable host element it emits — so the spec's focus-preservation
//   outcome is verified on keyed button rows: focus a mid-list row,
//   insert a row above, and the focused element keeps its DOM identity
//   (document.activeElement is the SAME node). The keyed splice moves
//   elements; the browser keeps focus on the moved element by identity.
//   Text selection cannot be demonstrated without a host input painter
//   (out of scope — spec pin: no focus API ships); rows carry their
//   value as text so the content-stability surface is still observable.
//   Mounted as an ordinary gallery demo (id keyed-focus-list).

import { button, keyed, translate, type Elem } from "../../views/model.ts";
import { height, origin } from "../../views/geometry.ts";
import { memo } from "../../components/memo/memo.ts";
import type { IntentList } from "../../events/bubble.ts";
import type { Path } from "../../effects/paths.ts";
import { makeApp, type App } from "../../effects/dispatch.ts";
import { VIEWPORT } from "../../spa/viewport.ts";

// The row shape: the stable id (the key) and the label text (the datum
// the drawn button carries).
export interface FocusRow {
  readonly id: string;
  readonly label: string;
}

export interface KeyedFocusState {
  readonly rows: readonly FocusRow[];
}

export const KEYED_FOCUS_ROWS_PATH: Path = [["keypath", "rows"]];

// The demo's initial state: 200 stable rows ("row n"), ids r-0..r-199.
export function keyedFocusState(): KeyedFocusState {
  return {
    rows: Array.from({ length: 200 }, (_, i) => ({
      id: `r-${i}`,
      label: `row ${i}`,
    })),
  };
}

// Insert a fresh row at the front (a new id shifts every existing
// row's position — the churn the focused row must survive).
export function insertFocusFirst(rows: readonly FocusRow[]): readonly FocusRow[] {
  const max = rows.reduce((m, r) => Math.max(m, Number(r.id.slice(2))), -1);
  const n = max + 1;
  return [{ id: `r-${n}`, label: `row ${n}` }, ...rows];
}

// Remove the FIRST row (the row above the focused one leaves; the
// focused row shifts one position up and must keep focus).
export function removeFocusFirst(rows: readonly FocusRow[]): readonly FocusRow[] {
  return rows.slice(1);
}

function opButton(text: string, op: (rows: readonly FocusRow[]) => readonly FocusRow[]): Elem {
  return button(text, (): IntentList => [["update", KEYED_FOCUS_ROWS_PATH, op]]);
}

// One row: a real <button> carrying the row id — the focusable element
// the focus verification drives (the keyed wrapper goes on the row's
// translate node in the view: see keyedFocusListView).
function rowButton(row: FocusRow): Elem {
  return button(`${row.label} (${row.id})`, () => []);
}

// The row's translate node, memoized on the row object: the node must
// be IDENTITY-STABLE across frames for the keyed plan to match
// (keyMatch: key + inner-Elem identity) — the splice donates the
// previous frame's DOM wrapper, whose subtree holds the focused button.
// The corpus translate() deep-freezes, so the demo builds its own
// unfrozen translate-shaped node (the renderer reads x/y structurally)
// and the view re-skins node.y per frame — the position update the
// splice's geometry refresh reads.
const rowNode = memo((row: FocusRow): Elem => {
  const node = {
    type: "translate",
    x: 0,
    y: 0,
    drawable: rowButton(row),
  } as Elem;
  return node;
});

const GAP = 1; // the verticalLayout default (vstack_offsets)

export function keyedFocusListView(state: KeyedFocusState): Elem {
  const op1 = opButton("Insert first", insertFocusFirst);
  const op2 = opButton("Remove first", removeFocusFirst);
  // the keyed splice reorders each donated WRAPPER within one parent —
  // the persistent keyed box keeps that parent stable, so the focused
  // button's parent never changes (Chrome keeps focus across a
  // same-parent reorder and drops it across a re-parent). Controls
  // stay unkeyed (M1's positional rule); the ops' y offsets follow the
  // same accumulate rule verticalLayout applies (first child bare).
  const children: Elem[] = [op1];
  let offset = height(op1) + origin(op1)[1] + GAP;
  children.push(translate(0, offset, op2));
  offset += height(op2) + origin(op2)[1] + GAP;
  for (const row of state.rows) {
    const node = rowNode(row);
    (node as { y: number }).y = offset;
    children.push(keyed(row.id, node));
    // next y = this y + height + gap: origin(node)[1] is the y just
    // set (translate origin = its own offset), so it must NOT re-enter
    // the accumulate
    offset += height(node) + GAP;
  }
  return children;
}

export function createKeyedFocusListApp(): App {
  return makeApp({
    view: (state) => keyedFocusListView(state as KeyedFocusState),
    state: keyedFocusState(),
    backend: { containerSize: VIEWPORT },
  });
}
