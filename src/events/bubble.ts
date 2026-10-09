// Purpose: tambor's event bubble layer — intent interception, on-bubble
//   nodes, wrap-on middleware and multi-pair on (event.bubble spec).
// Responsibilities: the Intent shape, the on-bubble node (its function
//   receives the whole child intent list and its return replaces it),
//   wrap-on middleware (the handler receives the default handler
//   first), the multi-pair on constructor that nests single-pair
//   nodes, and the event-layer element type dispatch walks.
// Rationale: openspec/specs/event-bubble/spec.md is the design authority — a custom
//   on type replaces descendant intents of that type
//   (intercept_by_type), on-bubble receives the whole intent list of
//   its children and its return value replaces it (on_bubble_raw),
//   wrap-on handlers receive the default handler as their first
//   argument (wrap_on_middleware), the first wrap-on pair is outermost
//   (wrap_on_ordering), and on with several pairs equals nesting the
//   single-pair forms (on_multi_pairs).

import { on, type Elem, type Handler } from "../views/model.ts";

// Intents are plain data: [type, ...args].
export type Intent = readonly unknown[];
export type IntentList = readonly Intent[];

// Every node's bubble is identity by default; an on-bubble node carries
// its own (bubble_after_children, on_bubble_raw).
export type BubbleFn = (intents: IntentList) => IntentList;

export interface BubbleNode {
  readonly type: "bubble";
  readonly bubble: BubbleFn;
  readonly drawables: readonly EventElem[];
}

// Everything dispatch walks: the view-model nodes plus the event
// layer's own bubble and wrap nodes.
export type EventElem = Elem | BubbleNode | WrapNode;

export function onBubble(bubble: BubbleFn, ...drawables: readonly EventElem[]): BubbleNode {
  return freeze({ type: "bubble", bubble, drawables });
}

// The wrap-on handler receives the default handler as its first
// argument and may call it, change its output, or skip it
// (wrap_on_middleware).
export type WrapHandler = (
  defaultHandler: (...args: readonly unknown[]) => IntentList,
  ...args: readonly unknown[]
) => IntentList;

export interface WrapNode {
  readonly type: "wrap";
  readonly eventType: string;
  readonly handler: WrapHandler;
  readonly drawables: readonly EventElem[];
}

type Pair = readonly [string, Handler];

// on accepts several event and handler pairs followed by one body and
// is equivalent to nesting the single-pair forms (on_multi_pairs); the
// first pair is outermost.
export function onPairs(pairs: readonly Pair[], body: EventElem): EventElem {
  return pairs.reduceRight<EventElem>((acc, [type, handler]) => {
    // the innermost acc is the plain body; every wrapped layer is a
    // single-pair handler node, which is an Elem
    return on(type, handler, acc as Elem);
  }, body);
}

// wrap-on with several pairs: the first pair is outermost
// (wrap_on_ordering), so the pairs nest around the body.
export function wrapOn(
  pairs: readonly (readonly [string, WrapHandler])[],
  body: EventElem,
): WrapNode {
  return pairs.reduceRight<EventElem>(
    (acc, [type, handler]) => freeze({ type: "wrap", eventType: type, handler, drawables: [acc] }),
    body,
  ) as WrapNode;
}

// Local deep freeze — same discipline as the view-model nodes.
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      freeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}
