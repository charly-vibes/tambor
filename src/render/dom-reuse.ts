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
  keyedPath: readonly number[];
  keyedEnterIndex: number;
}

// One keyed container's previous children (add-keyed-dom-reconciliation
// §2): the reconcile plan reads them against the next children. The
// key→prevIndex mapping lives inside reconcile's first-match-wins scan
// (a map would collapse duplicate keys, which degrade by scan order).
export interface KeyedRecord {
  readonly children: readonly AnyDraw[];
}

// One child's built elements: its position in the parent's child list
// and the elements its build appended (appendChild moves them on
// splice). The map holds built ranges, never commits.
export interface BuiltRange {
  readonly index: number;
  readonly els: readonly ElementLike[];
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
): void {
  // the index-path segment this child occupies (an array child's build
  // branch reads it to derive its own container path)
  ctx.keyedEnterIndex = index;
  const inner = keyedInner(child);
  if (keyedPrevInner !== undefined && spliceKeyed(ctx, keyedPrevInner, inner, parent))
    return;
  const prev = ctx.reusePrev?.get(child as object);
  if (
    prev !== undefined &&
    prev.index === index &&
    !ctx.reuseUsed.has(prev)
  ) {
    for (const el of prev.els) parent.appendChild(el);
    ctx.reuseUsed.add(prev);
    ctx.reuseNext.set(inner as object, prev);
    return;
  }
  const start = parent.children.length;
  ctx.build(child, parent);
  recordRange(ctx, child, inner, index, parent, start);
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
): boolean {
  if (ctx.reusePrev === undefined) return false;
  const keyed = ctx.reusePrev.get(keyedPrevInner as object);
  if (keyed === undefined || ctx.reuseUsed.has(keyed)) return false;
  for (const el of keyed.els) parent.appendChild(el);
  ctx.reuseUsed.add(keyed);
  ctx.reuseNext.set(inner as object, keyed);
  return true;
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
  // acyclic.
  const box = ctx.make("div");
  box.style["position"] = "absolute";
  box.style["left"] = "0px";
  box.style["top"] = "0px";
  // push this container's index-path segment, plan against the
  // previous record (undefined under the reuse gate = positional
  // rules only), record this frame's children for the swap
  ctx.keyedPath = [...ctx.keyedPath, ctx.keyedEnterIndex];
  const record = ctx.keyedPrev?.get(ctx.keyedPath.join("."));
  const prevInners =
    record === undefined
      ? children.map((): AnyDraw | undefined => undefined)
      : reconcile(record.children, children).map(
          (step): AnyDraw | undefined => {
            if (step.op !== "reuse") return undefined;
            // a null inner (keyed(k, null)) has no range to donate —
            // the child falls through to the positional/fresh rules
            const prevInner = keyedInner(record.children[step.prevIndex]!);
            return prevInner === null ? undefined : prevInner;
          },
        );
  ctx.keyedNext.set(ctx.keyedPath.join("."), { children });
  for (let i = 0; i < children.length; i++)
    buildChildWithReuse(ctx, children[i]!, box, i, prevInners[i]);
  parent.appendChild(box);
  ctx.keyedPath = ctx.keyedPath.slice(0, -1);
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
