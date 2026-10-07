// Purpose: tambor's event router — hit-testing and delivery of input
//   events through view trees (event.model spec).
// Responsibilities: dispatch(view, event) — pure, returns the intents
//   produced by the matching descendants under the delivery rule of the
//   event type — plus the capability queries (has-key-press,
//   has-key-event, has-mouse-move-global).
// Rationale: specs/event-model.md is the design authority. Pointer
//   events (mouse-down, mouse-up, mouse-move, scroll, drop) are
//   first-match-wins: children are tried last to first and the first
//   non-empty intent list stops the search (pointer_first_match).
//   Key-press, key-event, clipboard and mouse-enter-global events
//   concatenate the intents of all children in order (key_concat).
//   mouse-move-global is delivered to every descendant with the offset
//   adjusted by each origin (global_move_all). Hit-testing is
//   half-open: 0 <= local x < width and the same on y
//   (hit_half_open). Descending through Translate subtracts x and y
//   from the event position (coords_translated). An on-mouse-down node
//   calls its handler terminally on a matching down and forwards other
//   pointer events to its children (down_handler_terminal,
//   up_handler_descends). After the child results are collected the
//   node applies its bubble function once, default identity
//   (bubble_after_children). A button returns its on-click result on a
//   mouse-down inside bounds and nothing on mouse-up
//   (button_fires_on_down). Everything is pure (event_pure).

import {
  bounds,
  children,
  isGroup,
  type ButtonNode,
  type Elem,
  type HandlerNode,
  type Vec2,
} from "../views/model.ts";
import type { EventElem, Intent, IntentList } from "./bubble.ts";
import type { TamborEvent } from "./event.ts";

// Delivery-rule families of specs/event-model.md.
const POINTER_KINDS: readonly string[] = [
  "mouse-down",
  "mouse-up",
  "mouse-move",
  "scroll",
  "drop",
];
const CONCAT_KINDS: readonly string[] = [
  "key-press",
  "key-event",
  "clipboard",
  "mouse-enter-global",
];
const GLOBAL_MOVE_KIND = "mouse-move-global";

// The input event kinds with corpus-defined delivery rules; any other
// handler type is a custom intent interceptor (event.bubble).
const INPUT_KINDS: readonly string[] = [...POINTER_KINDS, ...CONCAT_KINDS, GLOBAL_MOVE_KIND];

function isPointerKind(type: string): boolean {
  return POINTER_KINDS.includes(type);
}

// Array.isArray does not narrow readonly arrays over the event-layer
// union, so groups get an explicit predicate (views/model's isGroup is
// scoped to the Elem union, which excludes the event layer's nodes).
function isGroupElem(
  elem: EventElem | readonly EventElem[],
): elem is readonly EventElem[] {
  return Array.isArray(elem);
}

function isConcatKind(type: string): boolean {
  return CONCAT_KINDS.includes(type);
}

function isInputKind(type: string): boolean {
  return INPUT_KINDS.includes(type);
}

// dispatch(view, event) returns the list of intents produced by the
// matching descendants (event.model). Pure: it never mutates the tree
// or the event (event_pure).
export function dispatch(elem: EventElem, event: TamborEvent): IntentList {
  if (elem == null) return [];
  if (isGroupElem(elem)) return dispatchGroup(elem, event);
  switch (elem.type) {
    case "translate": {
      // Descending through Translate subtracts x and y from the event
      // position (coords_translated).
      const shifted = event.pos
        ? { ...event, pos: [event.pos[0] - elem.x, event.pos[1] - elem.y] as Vec2 }
        : event;
      return dispatch(elem.drawable, shifted);
    }
    case "with-color":
    case "with-style":
    case "with-stroke-width":
      return dispatchGroup(elem.drawables, event);
    case "checkbox":
      // the checkbox draw (its only child) is traversed like any group
      return dispatchGroup(children(elem), event);
    case "handler":
      return dispatchHandler(elem, event);
    case "button":
      return dispatchButton(elem, event);
    case "bubble":
      // after the child results are collected the node applies its
      // bubble function once (bubble_after_children, on_bubble_raw)
      return elem.bubble(dispatchGroup(elem.drawables, event));
    default:
      // leaves (label, rectangle, path, spacer, ...) produce no intents
      return [];
  }
}

// Group delivery under the rule of the event type: pointer kinds try
// children last to first and stop at the first non-empty list
// (pointer_first_match); concat and global kinds visit every child in
// order and concatenate (key_concat, global_move_all).
function dispatchGroup(elems: readonly EventElem[], event: TamborEvent): IntentList {
  if (isPointerKind(event.type)) {
    for (let i = elems.length - 1; i >= 0; i--) {
      const res = dispatch(elems[i], event);
      if (res.length > 0) return res;
    }
    return [];
  }
  const out: Intent[] = [];
  for (const elem of elems) out.push(...dispatch(elem, event));
  return out;
}

// Hit-testing is half-open: 0 <= x < width and 0 <= y < height, so the
// right and bottom edges are exclusive (hit_half_open). The position
// is already node-local — every Translate on the way down shifted it
// (coords_translated, local_pos_passed).
function insideBounds(elem: Elem, pos: Vec2): boolean {
  const [w, h] = bounds(elem);
  return pos[0] >= 0 && pos[0] < w && pos[1] >= 0 && pos[1] < h;
}

// Handler nodes deliver under the rule of their event type. A matching
// pointer event is terminal: the handler fires inside bounds and the
// children are not consulted for that event (down_handler_terminal). A
// mismatched pointer event forwards to the children in reverse order
// behind the node's own bounds gate (up_handler_descends). Key, key-
// event, clipboard and mouse-enter-global events visit every child in
// order, concatenate the results, and append the node's own handler on
// a match (key_concat). mouse-move-global visits every descendant with
// the position minus each origin (global_move_all).
function dispatchHandler(node: HandlerNode, event: TamborEvent): IntentList {
  const kind = node.eventType;
  if (!isInputKind(kind)) {
    // custom type: intent interception happens at the bubble layer
    return dispatchGroup(node.drawables, event);
  }
  if (event.type === kind) {
    if (isPointerKind(kind)) {
      const pos = event.pos ?? [0, 0];
      if (!insideBounds(node, pos)) return [];
      return asIntents(node.handler(pos));
    }
    // concat and global kinds: children first, then the node's handler
    const res: Intent[] = [...dispatchGroup(node.drawables, event)];
    res.push(...asIntents(node.handler(...handlerArgs(event))));
    return res;
  }
  if (isPointerKind(event.type)) {
    // a mismatched pointer kind forwards to the children behind the
    // node's own bounds gate (up_handler_descends)
    const pos = event.pos ?? [0, 0];
    if (!insideBounds(node, pos)) return [];
    return dispatchGroup(node.drawables, event);
  }
  return dispatchGroup(node.drawables, event);
}

// A ui button returns its on-click result on a mouse-down inside its
// bounds and nothing on mouse-up (button_fires_on_down).
function dispatchButton(node: ButtonNode, event: TamborEvent): IntentList {
  if (event.type !== "mouse-down" || !node.onClick) return [];
  const pos = event.pos ?? [0, 0];
  if (!insideBounds(node, pos)) return [];
  return asIntents(node.onClick(pos));
}

// Handler argument convention: pointer handlers receive the position
// relative to their own node origin (local_pos_passed); key handlers
// receive the key; clipboard handlers the data.
function handlerArgs(event: TamborEvent): readonly unknown[] {
  switch (event.type) {
    case "key-press":
    case "key-event":
      return [event.key];
    case "clipboard":
      return [event.data];
    case "mouse-enter-global":
    case "mouse-move-global":
      return [event.pos ?? [0, 0]];
    default:
      return [event.pos ?? [0, 0]];
  }
}

// Handlers return a list of intents or nil (raw mode returns nil and
// still triggers a repaint); nil normalises to the empty list.
function asIntents(result: unknown): IntentList {
  if (result == null) return [];
  return result as IntentList;
}

// has-key-press, has-key-event and has-mouse-move-global are true when
// the node or any descendant handles that event, so a backend can skip
// delivery (capability_queries).
function hasHandler(elem: EventElem, kind: string): boolean {
  if (elem == null) return false;
  if (isGroupElem(elem)) return elem.some((child) => hasHandler(child, kind));
  switch (elem.type) {
    case "handler":
      return elem.eventType === kind || elem.drawables.some((child) => hasHandler(child, kind));
    case "translate":
      return hasHandler(elem.drawable, kind);
    case "with-color":
    case "with-style":
    case "with-stroke-width":
    case "bubble":
      return elem.drawables.some((child) => hasHandler(child, kind));
    case "checkbox":
      return children(elem).some((child) => hasHandler(child, kind));
    case "button":
      return false;
    default:
      return false;
  }
}

export function hasKeyPress(elem: EventElem): boolean {
  return hasHandler(elem, "key-press");
}

export function hasKeyEvent(elem: EventElem): boolean {
  return hasHandler(elem, "key-event");
}

export function hasMouseMoveGlobal(elem: EventElem): boolean {
  return hasHandler(elem, "mouse-move-global");
}
