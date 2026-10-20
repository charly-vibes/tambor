// Purpose: the pointer-delivery group index (tambor-54j.3 Phase 4 /
//   tambor-54j.10, event-model pointer_group_index) — the split-out
//   seam of the dispatch walk's indexed group branch.
// Responsibilities: dispatchPointerGroup — pointer delivery over one
//   group's children, served by the spatial hit index above the
//   threshold and by the reverse linear walk otherwise.
// Rationale: the child bounds snapshot is queried for the containing
//   candidates in original-position order — exactly the trial order of
//   the reverse walk — and each candidate is dispatched until one
//   responds. Children whose bounds do not contain the position are
//   skipped, which is invisible: every bounds-gated node (handler,
//   button, mismatched pointer forward) would fail its own gate
//   anyway. The carve-out: a subtree containing a bubble or wrap node
//   keeps the linear walk — those apply a function to the child
//   results and may synthesize intents from empty ones
//   (on_bubble_raw, wrap_on_middleware), which no bounds containment
//   justifies. The index is cached on the group's identity — the
//   route-time view cache (tambor-8xm) keeps group identity stable
//   across a no-change event stream, the same trust the cache itself
//   holds.

import { bounds, children, origin, type Elem } from "../views/model.ts";
import { buildHitIndex, hitCandidates, type HitIndex } from "../model/spatial-index.ts";
import type { EventElem, Intent, IntentList } from "./bubble.ts";
import type { TamborEvent } from "./event.ts";

type DispatchFn = (elem: EventElem, event: TamborEvent) => IntentList;
// (Intent/IntentList are re-exported by bubble.ts; the local aliases
// keep the signatures readable.)

// The threshold and grid cell pointer_group_index pins.
const GROUP_INDEX_MIN = 64;
const GROUP_INDEX_CELL = 64;

interface IndexItem {
  x: number;
  y: number;
  w: number;
  h: number;
  elem: EventElem;
}

interface GroupIndex {
  index: HitIndex<IndexItem> | null;
}

const GROUP_INDEXES = new WeakMap<object, GroupIndex>();

// A bubble or wrap anywhere in the subtree disqualifies the index:
// both apply a function to the child results and may return intents
// even when the children produce none.
function subtreeSynthesizes(elem: EventElem): boolean {
  if (elem == null) return false;
  if (Array.isArray(elem)) return elem.some(subtreeSynthesizes);
  const node = elem as { type: string; drawable?: EventElem };
  if (node.type === "bubble" || node.type === "wrap") return true;
  if (node.type === "translate") return subtreeSynthesizes(node.drawable!);
  return children(elem as Elem).some(subtreeSynthesizes);
}

function groupChildIndex(elems: readonly EventElem[]): GroupIndex {
  const cached = GROUP_INDEXES.get(elems);
  if (cached !== undefined) return cached;
  let synthesized = false;
  const items: IndexItem[] = [];
  for (let i = 0; i < elems.length; i++) {
    const elem = elems[i]!;
    if (subtreeSynthesizes(elem)) {
      synthesized = true;
      break;
    }
    const child = elem as Elem;
    const [ox, oy] = origin(child);
    const [w, h] = bounds(child);
    items.push({ x: ox, y: oy, w, h, elem });
  }
  const built: GroupIndex = { index: synthesized ? null : buildHitIndex(items, GROUP_INDEX_CELL) };
  GROUP_INDEXES.set(elems, built);
  return built;
}

// Pointer delivery over one group's children: the index path above
// the threshold, the reverse linear walk below it (and for the
// synthesis carve-out) — first non-empty intent list wins.
export function dispatchPointerGroup(
  elems: readonly EventElem[],
  event: TamborEvent,
  dispatch: DispatchFn,
): IntentList {
  if (elems.length >= GROUP_INDEX_MIN) {
    const { index } = groupChildIndex(elems);
    if (index !== null) {
      const pos = event.pos ?? [0, 0];
      for (const item of hitCandidates(index, pos[0], pos[1])) {
        const res = dispatch(item.elem, event);
        if (res.length > 0) return res;
      }
      return [];
    }
  }
  for (let i = elems.length - 1; i >= 0; i--) {
    const res = dispatch(elems[i], event);
    if (res.length > 0) return res;
  }
  return [];
}
