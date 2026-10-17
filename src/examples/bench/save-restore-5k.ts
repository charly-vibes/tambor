// Purpose: the save/restore-5k benchmark app (tambor-di0) — B6 of the
//   bench core suite: 5000 plain-data items whose whole state is saved
//   to one JSON string and restored back from it, mounted as an
//   ordinary gallery demo through the same makeApp/SPA mount path as
//   every other corpus app.
// Responsibilities: Item/SaveRestoreState, saveRestore5kState (empty),
//   ITEMS_PATH/SAVED_PATH and the collect-one save/restore paths,
//   build5k (5000 fresh items), checksumOf (FNV-1a over the items),
//   serialise (whole state → one string), restoreFrom (string → items,
//   checksum-verified), saveRestore5kView (control row + status line),
//   and createSaveRestore5kApp.
// Rationale: the point of the benchmark is that state is plain data —
//   save is serialise, restore is parse, and neither traverses the
//   component tree. No benchmark-specific fast paths: every op is an
//   ordinary ["update", …] intent applied by the registry-aware
//   dispatcher; save and restore collect the sibling path's value with
//   the state.paths collect-one navigator (the same mechanism the
//   state-paths contracts pin) so each op reads what it needs from the
//   dispatcher, never from a closure. The view stays a summary line —
//   the measured op is serialise/parse + a small re-derive, not 5k
//   drawn rows; the demo starts empty so "Build 5k" is the untimed
//   setup op (scenario save-restore-5k) and Save/Restore cycle as the
//   timed ops.

import {
  button,
  label as labelNode,
  spacer,
  type Elem,
} from "../../views/model.ts";
import { horizontalLayout, verticalLayout } from "../../views/layout.ts";
import type { IntentList } from "../../events/bubble.ts";
import type { Path } from "../../effects/paths.ts";
import { makeApp, type App } from "../../effects/dispatch.ts";
import { VIEWPORT } from "../../spa/viewport.ts";

// The corpus size the bench holds (5,000 plain-data items).
export const ITEM_COUNT = 5000;

// The plain-data item: nothing but fields — no nodes, no handlers.
export interface Item {
  readonly id: number;
  readonly label: string;
  readonly weight: number;
}

// The app state: plain data — the item list and the saved serial form.
export interface SaveRestoreState {
  readonly items: readonly Item[];
  readonly saved: string;
}

export const ITEMS_PATH: Path = [["keypath", "items"]];
export const SAVED_PATH: Path = [["keypath", "saved"]];

// Save/restore paths: collect-one reads the sibling list (state.paths
// collect_one) ahead of the path's own old value, so the op is applied
// by the dispatcher with everything it needs — no closure over the view.
export const SAVE_PATH: Path = [
  ["collect-one", ITEMS_PATH],
  ["keypath", "saved"],
];
export const RESTORE_PATH: Path = [
  ["collect-one", SAVED_PATH],
  ["keypath", "items"],
];

// The demo's initial state: nothing built, nothing saved — building
// the 5k items is the untimed setup op.
export function saveRestore5kState(): SaveRestoreState {
  return { items: [], saved: "" };
}

// 5000 fresh items: stable ids 0..4999 and a deterministic label and
// weight per id, so a round-trip's checksum is comparable across ops.
export function build5k(): readonly Item[] {
  return Array.from({ length: ITEM_COUNT }, (_, i) => ({
    id: i,
    label: `item ${i}`,
    weight: (i % 97) + 1,
  }));
}

// FNV-1a 32-bit over the items' field form — the round-trip check.
export function checksumOf(items: readonly Item[]): number {
  let h = 0x811c9dc5;
  for (const it of items) {
    const s = `${it.id}:${it.label}:${it.weight};`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  return h >>> 0;
}

// The serial form the save op produces: items + their checksum, one
// JSON string — plain data in, plain string out, no tree walk.
export function serialise(items: readonly Item[]): string {
  return JSON.stringify({ checksum: checksumOf(items), items });
}

// The saved snapshot's shape (what JSON.parse hands back).
export interface SavedSnapshot {
  readonly checksum: number;
  readonly items: readonly Item[];
}

// The ops the buttons dispatch — plain functions the dispatcher's
// updatePath applies (collects arrive ahead of the path's old value).
export function saveOp(items: unknown, _oldSaved: unknown): string {
  return serialise(items as readonly Item[]);
}

// Restore: rehydrate from the serial string; a checksum mismatch (or
// nothing saved) leaves the current items untouched — a corrupt save
// is a no-op, never a partial restore.
export function restoreOp(saved: unknown, current: unknown): readonly Item[] {
  if (typeof saved !== "string" || saved === "") return current as readonly Item[];
  const snap = JSON.parse(saved) as SavedSnapshot;
  const items = snap.items as readonly Item[];
  return checksumOf(items) === snap.checksum ? items : current as readonly Item[];
}

// One op button: an ordinary handler returning its plain-data update.
function opButton(
  text: string,
  path: Path,
  op: (...args: readonly unknown[]) => unknown,
): Elem {
  return button(text, (): IntentList => [["update", path, op]]);
}

// The status line: counts + checksum prove the ops actually ran (the
// keyed-table finding — checked, not eyeballed).
export function statusLine(state: SaveRestoreState): string {
  const base = `items ${state.items.length} · checksum 0x${checksumOf(state.items).toString(16)}`;
  return state.saved === "" ? `${base} · nothing saved` : `${base} · saved ${state.saved.length} B`;
}

// The view: the control row, a spacer, the status line. The buttons'
// update intents route through the app's dispatcher; the drawn label
// is pure view — the serialise/parse happens in the state, not here.
export function saveRestore5kView(state: SaveRestoreState): Elem {
  const controls = horizontalLayout([
    opButton("Build 5k", ITEMS_PATH, () => build5k()),
    spacer(5, 0),
    opButton("Save", SAVE_PATH, saveOp),
    spacer(5, 0),
    opButton("Restore", RESTORE_PATH, restoreOp),
  ]) as Elem;
  const body = [controls, spacer(0, 10), labelNode(statusLine(state))] as const;
  return (verticalLayout([...body]) ?? controls) as Elem;
}

// The bench app: the ordinary registry-aware makeApp mount, the same
// shape gallery.ts's demos use — no benchmark-specific path.
export function createSaveRestore5kApp(): App {
  return makeApp({
    view: (state) => saveRestore5kView(state as SaveRestoreState),
    state: saveRestore5kState(),
    backend: { containerSize: VIEWPORT },
  });
}
