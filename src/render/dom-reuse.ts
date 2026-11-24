// Purpose: the per-child identity reuse machinery of the real-DOM
//   painters (add-runtime-invalidation tasks 3.5/3.6), extracted from
//   dom-painters.ts as a mechanical split (zero behavior change), plus
//   the pure keyed reconcile plan (reconcile, add-keyed-dom-
//   reconciliation §1).
// Responsibilities: BuiltRange (one child's built elements and its
//   position in the parent's child list), buildChildWithReuse (the
//   splice-or-build decision per child), the ReuseCtx contract a build
//   context satisfies to take part in reuse, and the keyed plan
//   (reconcile: reuse(prevIndex) or build per next child).
// Rationale: reusePrev is the PREVIOUS frame's Elem→range map —
//   undefined (or a miss, or an index mismatch, or an already-spliced
//   range) means build fresh; reuseNext records this frame's ranges
//   and becomes the next build's reusePrev. An unknown ChangeSet frame
//   passes reusePrev undefined: no subtree is reused for that frame
//   (identity is the only reuse key; stale output impossible). An
//   identity match at the SAME child position splices the previous
//   frame's elements (appendChild moves them in the real-DOM host); a
//   miss builds fresh and records the range it appended.
//   Reorder/insert/remove shift positions, so the index check rebuilds
//   conservatively — no keyed matching. The map holds built ranges,
//   never commits.

import type { ElementLike } from "./domsim.ts";
import type { AnyDraw } from "./primitives.ts";
import { declaredKey, keyedInner } from "../views/nodes.ts";
import type { ChangeSet } from "../effects/dispatch.ts";

// The per-frame render hint (add-runtime-invalidation §3, internal —
// set by the spa mount before every wire draw, never a public API): the
// frame's ChangeSet, whether the lane overlay is absent, the lane
// pan/scroll offset, and the ambient scheme. A draw WITHOUT a hint (any
// non-mount draw path) is conservative: it never short-circuits and
// never reuses subtrees.
export interface FrameHint {
  readonly changes: ChangeSet;
  readonly overlayNull: boolean;
  readonly lane: readonly [number, number];
  readonly scheme: string;
}

// The reuse half of a build context: element construction and the
// recursive traversal, plus the per-frame reuse maps — and the keyed
// containers (add-keyed-dom-reconciliation §2): keyedPrev/keyedNext
// swap whole-structure per build alongside reusePrev/reuseNext, keyed
// by container index-path; keyedPath/keyedEnterIndex are the mutable
// index-path stack (pushed on entering the array build branch, popped
// on leaving) so a key never matches across containers.
export interface ReuseCtx {
  make(tag: string): ElementLike;
  build(view: AnyDraw, parent: ElementLike): void;
  reusePrev?: WeakMap<object, BuiltRange> | undefined;
  reuseNext: WeakMap<object, BuiltRange>;
  // Ranges already spliced this frame: a structurally shared Elem (the
  // same object in two positions) may only donate its elements once.
  reuseUsed: Set<BuiltRange>;
  // Keyed container records: the PREVIOUS frame's children per
  // container index-path (undefined under the reuse gate — an unknown
  // ChangeSet or hintless draw has no keyed records, exactly as it has
  // no reusePrev), and this frame's records for the swap.
  keyedPrev?: Map<string, KeyedRecord> | undefined;
  keyedNext: Map<string, KeyedRecord>;
  keyedPath: number[];
  keyedEnterIndex: number;
  // containers a matching keyed path KEPT this frame (§5.1): the draw
  // swap removes the previous frame's top-level children except these
  keptContainers: Set<ElementLike>;
}

// One keyed container's previous children (add-keyed-dom-reconciliation
// §2): the reconcile plan reads them against the next children. The
// key→prevIndex mapping lives inside reconcile's first-match-wins scan
// (a map would collapse duplicate keys, which degrade by scan order).
export interface KeyedRecord {
  readonly children: readonly AnyDraw[];
  // the container element this record built (§5.1): a matching path
  // REUSES the box, so keyed splices reorder within one parent —
  // re-parenting a focused element drops focus (Chrome), reordering
  // in place keeps it; undefined for sim-built records
  readonly box?: ElementLike;
}

// One child's built elements: its position in the parent's child list
// and the elements its build appended (appendChild moves them on
// splice). The map holds built ranges, never commits.
export interface BuiltRange {
  readonly index: number;
  readonly els: readonly ElementLike[];
}

// The index-path scoping for keyed container records (the mutable stack
// under ReuseCtx.keyedPath): push one segment, run the build, pop it —
// a build must never leave its segment behind.
export function withKeyedSegment<T>(ctx: ReuseCtx, segment: number, build: () => T): T {
  ctx.keyedPath.push(segment);
  try {
    return build();
  } finally {
    ctx.keyedPath.pop();
  }
}

// Splice placement: appendChild MOVES an already-attached child (the
// move-mirror contract) — re-appending every spliced element every
// frame fires a childList mutation per element with no visual effect.
// The keyed container's placement pass (placeKeyedChildren's order
// pass) restores exact childList order with minimal moves afterward;
// in a fresh container (buildChildrenOf's new div) the parent check
// misses and the append runs as before. Hosts without a parentElement
// reading fall back to the append (always-move) behavior.
function adoptOrAppend(parent: ElementLike, el: ElementLike): void {
  const current = (el as { parentElement?: ElementLike | null }).parentElement;
  if (current === parent) return;
  parent.appendChild(el);
}

// Build one child of a sequence with per-child identity reuse
// (add-runtime-invalidation task 3.5) extended with keyed matching
// (add-keyed-dom-reconciliation §2): an identity match at the SAME
// child position splices the previous frame's elements (appendChild
// moves them in the real-DOM host); a keyed plan match (keyedPrevInner,
// resolved per container by the reconcile plan) splices the matched
// range REGARDLESS of position — the key locates, the Elem identity
// confirms, the range machinery is still M1's reusePrev/reuseUsed.
// Any keyed miss (no range, already donated, reuse gate closed) falls
// through to the positional/fresh rules — the renderer never throws on
// key bugs. The child builds and records its range under its INNER
// Elem (keyedInner): the keyed wrapper is fresh per call and never an
// identity signal.
export function buildChildWithReuse(
  ctx: ReuseCtx,
  child: AnyDraw,
  parent: ElementLike,
  index: number,
  keyedPrevInner?: AnyDraw,
): readonly ElementLike[] {
  // the index-path segment this child occupies (an array child's build
  // branch reads it to derive its own container path)
  ctx.keyedEnterIndex = index;
  const inner = keyedInner(child);
  if (keyedPrevInner !== undefined) {
    const keyed = spliceKeyed(ctx, keyedPrevInner, inner, parent);
      if (keyed !== undefined) return keyed.els;
  }
  const prev = ctx.reusePrev?.get(child as object);
  if (
    prev !== undefined &&
    prev.index === index &&
    !ctx.reuseUsed.has(prev)
  ) {
    for (const el of prev.els) adoptOrAppend(parent, el);
    ctx.reuseUsed.add(prev);
    ctx.reuseNext.set(inner as object, prev);
    return prev.els;
  }
  const start = parent.children.length;
  ctx.build(child, parent);
  const els = parent.children.slice(start);
  recordRange(ctx, child, inner, index, parent, start);
  return els;
}

// Record a freshly built child's range: under the CHILD object (the
// exact children-array element the next frame's positional lookup
// uses) AND under the inner Elem for a keyed wrapper (the unwrap build
// path has no inner call to record it) — both point at the SAME range,
// so keyed lookups and positional lookups stay sound; the keyed splice
// path re-records under the inner Elem so the moved range stays
// reachable by key across frames.
function recordRange(
  ctx: ReuseCtx,
  child: AnyDraw,
  inner: AnyDraw,
  index: number,
  parent: ElementLike,
  start: number,
): void {
  if (child === null || typeof child !== "object") return;
  const range: BuiltRange = { index, els: parent.children.slice(start) };
  ctx.reuseNext.set(child as object, range);
  if (inner === null || typeof inner !== "object" || inner === (child as unknown))
    return;
  ctx.reuseNext.set(inner as object, range);
}

// The keyed splice attempt (add-keyed-dom-reconciliation §2): the
// plan's matched previous Elem donates its range when that range
// exists and is not already donated this frame — the key located, the
// Elem identity confirmed by the plan, the range machinery M1's
// (reusePrev/reuseUsed). Returns false on any miss (gate closed, range
// gone, donated): the child falls through to the positional/fresh
// rules — the renderer never throws on key bugs.
function spliceKeyed(
  ctx: ReuseCtx,
  keyedPrevInner: AnyDraw,
  inner: AnyDraw,
  parent: ElementLike,
): BuiltRange | undefined {
  if (ctx.reusePrev === undefined) return undefined;
  const keyed = ctx.reusePrev.get(keyedPrevInner as object);
  if (keyed === undefined || ctx.reuseUsed.has(keyed)) return undefined;
  for (const el of keyed.els) adoptOrAppend(parent, el);
  refreshKeyedPos(keyed.els[0], inner);
  ctx.reuseUsed.add(keyed);
  ctx.reuseNext.set(inner as object, keyed);
  return keyed;
}

// The donated wrapper keeps the PREVIOUS frame's geometry — a keyed row
// that shifted position (a row inserted above it) would land at its old
// y. The keyed contract (nodes.ts) keys "the row's translate node", so
// the fresh inner carries the new coordinates: re-skin the donated
// wrapper's position from them (the subtree is untouched — identity is
// the whole point).
function refreshKeyedPos(el: ElementLike | undefined, inner: AnyDraw): void {
  if (el === undefined || inner === null || typeof inner !== "object") return;
  const pos = inner as { x?: number; y?: number };
  el.style["left"] = `${pos.x ?? 0}px`;
  el.style["top"] = `${pos.y ?? 0}px`;
}

// The sequence/array build branch (moved from dom.ts for the keyed
// records — the file sits at the pretender file cap): the container box
// is composited at the containing origin, the keyed plan resolves
// against THIS container's previous record (index-path keyed — a key
// never matches across containers), and the path stack pops on exit.
export function buildArrayChildren(
  ctx: ReuseCtx,
  children: readonly AnyDraw[],
  parent: ElementLike,
): void {
  // a bare sequence superimposes its children at the current origin
  // (canvas semantics) — the box anchors them (tambor-0rp); atOrigin
  // semantics (dom-painters), inlined here to keep the painter split
  // acyclic. The box itself may be the previous frame's container (see
  // the container-identity note below). The array's own index-path
  // segment is ctx.keyedEnterIndex, set by the buildChildWithReuse /
  // painter wrapper that entered this array.
  return withKeyedSegment(ctx, ctx.keyedEnterIndex, () => {
    const pathKey = ctx.keyedPath.join(".");
    const record = ctx.keyedPrev?.get(pathKey);
    // container identity (§5.1): a matching path keeps the SAME box so
    // splices reorder within one parent — re-parenting the focused
    // element drops focus; a fresh box (first frame, gate closed) builds
    // everything fresh as before
    const prevBox = record?.box;
    const box = prevBox !== undefined ? prevBox : ctx.make("div");
    if (prevBox !== undefined) ctx.keptContainers.add(box);
    box.style["position"] = "absolute";
    box.style["left"] = "0px";
    box.style["top"] = "0px";
    const prevInners = keyedPlan(record, children);
    ctx.keyedNext.set(pathKey, { children, box });
    placeKeyedChildren(ctx, children, box, prevInners);
    adoptOrAppend(parent, box);
  });
}

// The per-container placement: build/splice each child into the box,
// then drop this frame's ORPHANS (state-removed rows nobody donates —
// the persistent box would otherwise keep them visible).
function placeKeyedChildren(
  ctx: ReuseCtx,
  children: readonly AnyDraw[],
  box: ElementLike,
  prevInners: readonly (AnyDraw | undefined)[],
): void {
  const placed = new Set<ElementLike>();
  const placedOrder: ElementLike[] = [];
  for (let i = 0; i < children.length; i++)
    for (const el of buildChildWithReuse(ctx, children[i]!, box, i, prevInners[i])) {
      placed.add(el);
      placedOrder.push(el);
    }
  // identity sweep, not a tail-count: a KEPT nested keyed box (§5.1)
  // moved within this box adds nothing new to slice, so placed alone
  // under-counts — kept containers are never orphans by definition
  for (const el of [...box.children])
    if (!placed.has(el) && !ctx.keptContainers.has(el)) box.removeChild(el);
  // order pass: childList order must equal the view order (the §2 pin —
  // a keyed draw builds identically to the unkeyed shape) while moving
  // only misplaced elements (the B2 target: a swap moves 2, an
  // insert-first inserts 1 and moves 0 — insertBefore shifts the tail
  // without touching it). The box is persistent (container identity),
  // so an element already at its target index is left untouched and
  // untouched rows fire no childList mutation.
  for (let i = 0; i < placedOrder.length; i++) {
    const el = placedOrder[i]!;
    if (box.children[i] === el) continue;
    box.insertBefore(el, box.children[i] ?? null);
  }
}

// The keyed plan for one container: the previous children's inner
// Elems per reused index (undefined elsewhere — build steps and
// null-inner keyed wrappers donate nothing).
function keyedPlan(
  record: KeyedRecord | undefined,
  children: readonly AnyDraw[],
): readonly (AnyDraw | undefined)[] {
  if (record === undefined) return children.map(() => undefined);
  return reconcile(record.children, children).map((step) => {
    if (step.op !== "reuse") return undefined;
    // a null inner (keyed(k, null)) has no range to donate — the
    // child falls through to the positional/fresh rules
    const prevInner = keyedInner(record.children[step.prevIndex]!);
    return prevInner === null ? undefined : prevInner;
  });
}

// The pure keyed reconcile plan (add-keyed-dom-reconciliation §1): given
// a container's previous and next children, return one step per NEXT
// child — splice the previous frame's range for prevIndex, or build
// fresh. Plain data, no DOM, no elements touched: the painter computes
// the plan once per container and buildChildWithReuse consumes the step
// for its index (§2); splice donation still flows through
// reusePrev/reuseUsed.
export type ReconcileStep =
  | { readonly op: "reuse"; readonly prevIndex: number }
  | { readonly op: "build" };

// An explicit key extractor for reconcile; the default (declaredKey)
// reads the declared `key` field. Returns undefined for unkeyed
// children — they keep M1's positional rule.
export type KeyFn = (child: AnyDraw) => string | number | undefined;

const BUILD: ReconcileStep = Object.freeze({ op: "build" });

function reuseStep(prevIndex: number): ReconcileStep {
  return Object.freeze({ op: "reuse", prevIndex });
}

// Matching rules (design decisions 2/3, Pins): the key locates the
// candidate slot and the INNER Elem identity confirms it (a keyed
// wrapper is fresh per call — never an identity signal); duplicate keys
// degrade by FIRST MATCH WINS — the first same-key child donates, every
// further same-key child builds (never splices: drawn output never
// depends on key hygiene); every other miss falls through to M1's
// positional rule (same index + inner identity), which keys extend but
// never restrict; each previous range donates at most once per plan
// (reuseUsed's guard, decided here so the painter cannot double-claim).
export function reconcile(
  prev: readonly AnyDraw[],
  next: readonly AnyDraw[],
  key?: KeyFn,
): readonly ReconcileStep[] {
  const extract = key ?? declaredKey;
  const donated = new Set<number>(); // prev indexes already claimed
  const claimed = new Set<string | number>(); // keys already donated
  const steps: ReconcileStep[] = [];
  for (let j = 0; j < next.length; j++) {
    const child = next[j]!;
    const inner = keyedInner(child);
    const k = extract(child);
    const matched =
      k !== undefined
        ? keyMatch(prev, inner, k, extract, donated, claimed) ??
          positionalMatch(prev, j, inner, donated)
        : positionalMatch(prev, j, inner, donated);
    if (matched === undefined) {
      steps.push(BUILD);
      continue;
    }
    donated.add(matched);
    steps.push(reuseStep(matched));
  }
  return steps;
}

// First-match-wins key lookup: the first previous child whose key
// matches (Object.is) and whose INNER Elem is identity-equal donates.
// A key already donated by an earlier same-key sibling never matches
// again (further same-key children build — never splice).
function keyMatch(
  prev: readonly AnyDraw[],
  inner: AnyDraw,
  k: string | number,
  extract: KeyFn,
  donated: Set<number>,
  claimed: Set<string | number>,
): number | undefined {
  if (claimed.has(k)) return undefined;
  for (let i = 0; i < prev.length; i++) {
    if (donated.has(i)) continue;
    const pk = extract(prev[i]!);
    if (pk !== undefined && Object.is(pk, k) && keyedInner(prev[i]!) === inner) {
      claimed.add(k);
      return i;
    }
  }
  return undefined;
}

// M1's positional rule: same index, same inner Elem identity, not
// already donated this plan. Keys extend the lookup domain but never
// restrict this fallback.
function positionalMatch(
  prev: readonly AnyDraw[],
  j: number,
  inner: AnyDraw,
  donated: Set<number>,
): number | undefined {
  const pj = prev[j];
  return pj !== undefined && !donated.has(j) && keyedInner(pj) === inner
    ? j
    : undefined;
}
