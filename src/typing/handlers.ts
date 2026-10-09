// Purpose: the typed event-handler signatures of typing.model — the
//   fixed signature family the event handlers carry.
// Responsibilities: a mouse-down handler takes a Vec2 and returns
//   readonly Effect[]; the wrap-on handler receives the typed default
//   handler as its first argument (handler_signatures).
// Rationale: openspec/specs/typing-model/spec.md is the design authority. These are
//   type contracts over the spine's event data: a handler's return is
//   the effect batch the dispatcher applies, and wrap-on middleware
//   wraps the default handler (wrap_on_middleware), so its typed first
//   parameter is that default handler.

import type { TamborEvent } from "../events/event.ts";
import type { Vec2 } from "../views/model.ts";
import type { Effect } from "./effects.ts";

/** A mouse-down handler: the pointer position in, the effect batch
 * out. The delivery also passes the event object as a second, optional
 * argument (components.hover touch_no_hover reads its pointerType
 * there); the position is unchanged first (local_pos_passed). */
export type MouseDownHandler = (
  pos: Vec2,
  event?: TamborEvent,
) => readonly Effect[];

/** The typed default handler a wrap-on handler receives first. */
export type DefaultHandler = (
  state: unknown,
  effects: readonly Effect[],
) => unknown;

/** A wrap-on handler: the typed default handler first, then the event
 * arguments (wrap_on_middleware). */
export type WrapOnHandler<D extends DefaultHandler = DefaultHandler> = (
  defaultHandler: D,
  pos: Vec2,
) => readonly Effect[];
