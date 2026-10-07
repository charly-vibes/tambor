// Purpose: tambor's event bubble layer — intent interception and
//   on-bubble nodes (event.bubble spec).
// Responsibilities: the Intent shape, the on-bubble node (its function
//   receives the whole child intent list and its return replaces it),
//   and the event-layer element type dispatch walks.
// Rationale: specs/event-bubble.md is the design authority — after the
//   child results are collected the node applies its bubble function
//   once, and the default is identity (bubble_after_children);
//   on-bubble receives the whole intent list of its children and its
//   return value replaces it (on_bubble_raw). Wrap-on middleware and
//   multi-pair on land with their own rows.

import type { Elem, Handler } from "../views/model.ts";

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
// layer's own bubble node.
export type EventElem = Elem | BubbleNode;

export function onBubble(bubble: BubbleFn, ...drawables: readonly EventElem[]): BubbleNode {
  return freeze({ type: "bubble", bubble, drawables });
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
