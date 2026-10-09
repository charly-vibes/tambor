// Purpose: shared harness for the components-scrollview contract tests —
//   scrollview call construction, rendering, event-layer tree walking,
//   and update-intent application.
// Responsibilities: OFFSET_PATH is the offset path a scrollview call
//   carries for its defaulted offset prop (wheel and drag updates
//   address the stored offset through it); svCall builds a scrollview
//   call with an explicit $offset so the intents stay addressable at
//   the plain offset path of the test state (the defaulted call's own
//   scratch path is the component model's concern, component.model,
//   C0); svView renders such a call to its event-layer view tree;
//   isGroupElem and walk enumerate every node of an event-layer tree
//   depth first (walk keeps cyclomatic ≤ 3 by pushing the
//   drawable/drawables child case into kidsOf); applyUpdate applies an
//   update intent to a state holding offset, as the dispatcher would
//   (the intent is data: [type, path, fn]).
// Rationale: openspec/specs/components-scrollview/spec.md is the design authority;
//   tambor-272 redistributes the former monolithic
//   tests/components-scrollview.test.ts into topic files, and every
//   helper here is used by two or more of the resulting files, so they
//   live here instead of being duplicated.

import { expect } from "vitest";

import { scrollview } from "../../src/components/scrollview/scrollview.ts";
import { call, render, type ComponentCall } from "../../src/model/component.ts";
import type { EventElem } from "../../src/events/bubble.ts";
import type { Elem, Vec2 } from "../../src/views/model.ts";
import { updatePath, type Path } from "../../src/effects/paths.ts";

// The offset path a scrollview call carries for its defaulted offset
// prop; wheel and drag updates address the stored offset through it.
export const OFFSET_PATH: Path = [["keypath", "offset"]];

// A scrollview call rendered to its view tree.
// An explicit $offset keeps the intents addressable at the plain
// offset path of the test state; the defaulted call's own scratch path
// is the component model's concern (component.model, C0).
export function svView(opts: { offset?: Vec2; viewport: Vec2; body: Elem }): EventElem {
  return render(svCall(opts)) as EventElem;
}

export function svCall(opts: { offset?: Vec2; viewport: Vec2; body: Elem }): ComponentCall {
  return call(scrollview, {
    "scroll-bounds": opts.viewport,
    body: opts.body,
    $offset: OFFSET_PATH,
    ...(opts.offset !== undefined ? { offset: opts.offset } : {}),
  });
}

// Array.isArray does not narrow readonly arrays over the event-layer
// union (same shape as dispatch.ts's local helper).
export function isGroupElem(
  e: EventElem | readonly EventElem[],
): e is readonly EventElem[] {
  return Array.isArray(e);
}

// A non-null, non-group event-layer node — the narrow type the
// scrollbar walkers match on.
export type EventNode = Exclude<EventElem, null | undefined | readonly EventElem[]>;

export function isNode(e: EventElem | null | undefined): e is EventNode {
  return e != null && !isGroupElem(e);
}

// A node's event-layer children: its drawable, its drawables, or none.
function kidsOf(e: EventNode): readonly EventElem[] {
  if ("drawable" in e) return [e.drawable as EventElem];
  if ("drawables" in e) return e.drawables as readonly EventElem[];
  return [];
}

// Every node of an event-layer tree, depth first.
export function walk(e: EventElem): readonly EventElem[] {
  if (e == null) return [];
  if (isGroupElem(e)) return e.flatMap(walk);
  return [e, ...kidsOf(e).flatMap(walk)];
}

// Apply an update intent to a state holding offset, as the dispatcher
// would (the intent is data: [type, path, fn]).
export function applyUpdate(
  intents: readonly unknown[],
  state: { offset: Vec2 },
): { offset: Vec2 } {
  const eff = intents[0] as readonly unknown[];
  expect(eff[0]).toBe("update");
  return updatePath(state, eff[1] as Path, eff[2] as (old: unknown) => unknown) as {
    offset: Vec2;
  };
}
