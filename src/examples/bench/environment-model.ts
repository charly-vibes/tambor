// Purpose: the pure model half of the BZ6 environment bench app
//   (tambor-54j.18) — a Smalltalk-like environment over 100k logical
//   objects: a sparse object table, a 24-row inspector window of
//   FOLDED summary lines (the corpus logo demo's fold-per-repaint
//   pattern), a deterministic implicit edit history with checkpoint
//   snapshots, and the two strategy pairs the §4.3 row contrasts —
//   re-fold-all vs incremental fold per edit, and rewind-by-full-
//   replay vs rewind-by-checkpoint-restore.
// Responsibilities: EnvObj/EnvState, clsAt/articleAt/seedVal,
//   targetOf/fieldOf, foldObj, foldWindow/windowSum via statusLine,
//   makeObj/replay, seedEnvironment, editNaive/editFold and
//   rewindReplay/rewindCkpt (the four timed ops).
// Rationale: objects are immutable and every edit is a copy-on-write
//   of the table (the plain-data rule), so a checkpoint is a shared
//   immutable Map reference — restoring one is free, replaying past
//   it is the only cost — while the replay probe rebuilds the whole
//   world from empty, allocations and all (the logo fold(entries[0..
//   cursor]) hazard at 100k-object scale). The entry log is IMPLICIT:
//   entry n is a pure function of n, which keeps replay honest
//   (every entry re-applied) without storing a 100k-entry array. The
//   fold cache only ever needs to cover the visible window; the
//   naive op refreshes all 24 window entries per edit, the
//   incremental op only the edited entry's.

// The logical environment: 100k objects (the sparse table below is
// the only materialised part — the keyed-table viewport pattern).
export const OBJ_COUNT = 100_000;

// The visible inspector window: the first 24 objects, one folded
// summary line each.
export const WIN_ROWS = 24;

// Instance variables per object (the fold prints all of them).
export const FIELD_COUNT = 8;

// History depth the seed builds (logged edits on top of creation) and
// the checkpoint interval — 4096 edits / 1024 spacing leaves the
// checkpoint nearest a tip−512 probe at 3072, i.e. a 1024-entry
// replay for the candidate vs a full-world rebuild for the naive op.
export const SEED_EDITS = 4096;
export const CKPT_EVERY = 1024;

// The rewind probe depth: each timed rewind drops REWIND_N entries
// behind the tip and returns to it (a time-travel round trip).
export const REWIND_N = 512;

// Each logged edit raises its field by this fixed delta.
export const EDIT_DELTA = 3;

// The Smalltalk-ish class roster (articles matter to the printed fold).
export const CLASSES = [
  "Point",
  "Set",
  "Float",
  "Array",
  "Dictionary",
  "Rectangle",
  "BlockClosure",
  "OrderedCollection",
] as const;

export function clsAt(id: number): string {
  return CLASSES[id % CLASSES.length] as string;
}

// Smalltalk print names: "a Point", "an OrderedCollection".
export function articleAt(cls: string): string {
  return cls === "Array" || cls === "OrderedCollection" ? "an" : "a";
}

// Deterministic seeded ivars: odd fields are hundredths-scale floats,
// even fields small integers — the fold's printer has real work.
export function seedVal(id: number, field: number): number {
  return (id * 31 + field * 7) % 2000;
}

// Entry n of the implicit edit log edits object targetOf(n)'s
// fieldOf(n)-th ivar. The first 4096 entries (the seed) therefore hit
// objects 0..4095 — the visible window's 24 objects among them.
export function targetOf(n: number): number {
  return n % OBJ_COUNT;
}

export function fieldOf(n: number): number {
  return n % FIELD_COUNT;
}

// One environment object: identity, class and the ivar values. All
// plain data; edits rebuild the object (never mutate).
export interface EnvObj {
  readonly id: number;
  readonly cls: string;
  readonly vals: readonly number[];
}

export function makeObj(id: number): EnvObj {
  const vals: number[] = [];
  for (let field = 0; field < FIELD_COUNT; field++) vals.push(seedVal(id, field));
  return { id, cls: clsAt(id), vals };
}

// One field's printed form: even fields are integers, odd fields are
// hundredths (the classic inspector's two-column print).
export function printVal(field: number, value: number): string {
  return field % 2 === 0 ? String(value) : (value / 100).toFixed(2);
}

// The inspector fold of one object: print name, class, every ivar and
// the ivar total — one entry's worth of the logo-style fold.
export function foldObj(obj: EnvObj): string {
  const parts: string[] = [];
  let total = 0;
  for (let field = 0; field < obj.vals.length; field++) {
    parts.push(printVal(field, obj.vals[field] as number));
    total += obj.vals[field] as number;
  }
  return `${articleAt(obj.cls)} ${obj.cls} ${obj.id} ${parts.join(" ")} total ${total}`;
}

// The visible window: object ids 0..WIN_ROWS-1, fixed (no scroll op —
// the window's stability is what makes the guards deterministic).
export function windowIds(): readonly number[] {
  const ids: number[] = [];
  for (let id = 0; id < WIN_ROWS; id++) ids.push(id);
  return ids;
}

// The state: the sparse table (id → object), the fold cache (only the
// window and the last-edited entry need coverage), the checkpoints
// (entry-count → immutable table snapshot, seed-maintained), the tip
// (applied entry count = history length) and the rewind counter.
export interface EnvState {
  readonly objects: ReadonlyMap<number, EnvObj>;
  readonly folds: ReadonlyMap<number, string>;
  readonly ckpts: ReadonlyMap<number, ReadonlyMap<number, EnvObj>>;
  readonly tip: number;
  readonly rewinds: number;
}

// The drawn line for one window entry: the cached fold when present
// (the ops maintain it), the fresh fold otherwise.
export function entryLine(state: EnvState, id: number): string {
  const cached = state.folds.get(id);
  const obj = state.objects.get(id);
  if (obj === undefined) return `#${id} ·`;
  return `#${id} ${cached ?? foldObj(obj)}`;
}

// The status guard: object count, history length, rewind counter and
// a checksum over the window's folded lines — it moves exactly when
// an op lands (edits advance hist, rewinds advance rewinds, and the
// two strategy pairs must leave the SAME sum).
export function statusLine(state: EnvState): string {
  let hash = 5381;
  for (const id of windowIds()) {
    const line = entryLine(state, id);
    for (let i = 0; i < line.length; i++) {
      hash = ((hash << 5) + hash + line.charCodeAt(i)) | 0;
    }
  }
  return `objs ${state.objects.size} hist ${state.tip} rewinds ${state.rewinds} sum ${hash}`;
}

// Apply entry n onto a builder table (local mutation — the fold's
// write side; callers own the copy-on-write boundary).
function applyEntry(objects: Map<number, EnvObj>, n: number): void {
  const id = targetOf(n);
  const obj = objects.get(id);
  if (obj === undefined) return;
  const field = fieldOf(n);
  const vals = obj.vals.slice();
  vals[field] = (vals[field] as number) + EDIT_DELTA;
  objects.set(id, { ...obj, vals });
}

// Replay entries from..to-1 onto a builder table.
function replay(objects: Map<number, EnvObj>, from: number, to: number): void {
  for (let n = from; n < to; n++) applyEntry(objects, n);
}

// Fold the whole world from EMPTY up to `to` entries: the 100k
// creations plus every logged edit — the logo fold(entries[0..cursor])
// hazard at environment scale.
function foldFromEmpty(to: number): Map<number, EnvObj> {
  const objects = new Map<number, EnvObj>();
  for (let id = 0; id < OBJ_COUNT; id++) objects.set(id, makeObj(id));
  replay(objects, 0, to);
  return objects;
}

// Refresh the window's fold cache entries from the current table.
function foldWindow(objects: ReadonlyMap<number, EnvObj>): Map<number, string> {
  const folds = new Map<number, string>();
  for (const id of windowIds()) {
    const obj = objects.get(id);
    if (obj !== undefined) folds.set(id, foldObj(obj));
  }
  return folds;
}

// The nearest checkpoint at or before `count` (seed-maintained: the
// multiples of CKPT_EVERY in (0, SEED_EDITS]).
function nearestCkpt(
  ckpts: ReadonlyMap<number, ReadonlyMap<number, EnvObj>>,
  count: number,
): readonly [number, ReadonlyMap<number, EnvObj>] | undefined {
  const at = Math.floor((count - 1) / CKPT_EVERY) * CKPT_EVERY;
  const snap = ckpts.get(at);
  return snap === undefined ? undefined : [at, snap];
}

// The demo's initial state: an empty table — seeding it is the
// untimed setup op.
export function emptyEnvironment(): EnvState {
  return {
    objects: new Map(),
    folds: new Map(),
    ckpts: new Map(),
    tip: 0,
    rewinds: 0,
  };
}

// The untimed seed: 100k objects, SEED_EDITS logged edits (checkpoints
// every CKPT_EVERY entries) and the window's initial folds.
export function seedEnvironment(): EnvState {
  const objects = new Map<number, EnvObj>();
  for (let id = 0; id < OBJ_COUNT; id++) objects.set(id, makeObj(id));
  const ckpts = new Map<number, ReadonlyMap<number, EnvObj>>();
  for (let n = 0; n < SEED_EDITS; n++) {
    if (n % CKPT_EVERY === 0 && n > 0) ckpts.set(n, new Map(objects));
    applyEntry(objects, n);
  }
  return { objects, folds: foldWindow(objects), ckpts, tip: SEED_EDITS, rewinds: 0 };
}

// Copy-on-write table for one more logged edit (both edit strategies
// pay this — the delta between them is the fold strategy alone).
function withEdit(state: EnvState): Map<number, EnvObj> {
  const objects = new Map(state.objects);
  applyEntry(objects, state.tip);
  return objects;
}

// The §4.3 naive edit: apply the edit, then RE-FOLD ALL window
// entries (the logo repaint pattern — every entry, every op).
export function editNaive(state: EnvState): EnvState {
  const objects = withEdit(state);
  const folds = foldWindow(objects);
  const id = targetOf(state.tip);
  const obj = objects.get(id);
  if (obj !== undefined) folds.set(id, foldObj(obj));
  return { ...state, objects, folds, tip: state.tip + 1 };
}

// The incremental-fold candidate: the same edit, but only the edited
// entry's fold is recomputed (the window's objects are untouched, so
// their cached folds stay valid).
export function editFold(state: EnvState): EnvState {
  const objects = withEdit(state);
  const folds = new Map(state.folds);
  const id = targetOf(state.tip);
  const obj = objects.get(id);
  if (obj !== undefined) folds.set(id, foldObj(obj));
  return { ...state, objects, folds, tip: state.tip + 1 };
}

// The naive rewind probe: drop REWIND_N behind the tip and return —
// by folding the whole world from EMPTY (allocations included), then
// replaying the probe window. Ends at exactly the pre-op state.
export function rewindReplay(state: EnvState): EnvState {
  const target = state.tip - REWIND_N;
  const objects = foldFromEmpty(target);
  replay(objects, target, state.tip);
  return {
    ...state,
    objects,
    folds: foldWindow(objects),
    tip: state.tip,
    rewinds: state.rewinds + 1,
  };
}

// The checkpointed rewind candidate: restore the nearest snapshot at
// or before the probe target (a shared immutable reference — free),
// copy it once, replay to the tip. Ends at exactly the pre-op state.
export function rewindCkpt(state: EnvState): EnvState {
  const target = state.tip - REWIND_N;
  const found = nearestCkpt(state.ckpts, target);
  const objects = new Map<number, EnvObj>(found !== undefined ? found[1] : []);
  replay(objects, found === undefined ? 0 : found[0], state.tip);
  return {
    ...state,
    objects,
    folds: foldWindow(objects),
    tip: state.tip,
    rewinds: state.rewinds + 1,
  };
}
