// Purpose: the hover machinery of the basic components — on-hover,
//   on-mouse-out, button and checkbox (components.hover spec).
// Responsibilities: onHover wraps a body in the enter/leave machinery
//   whose hover? flag lives in the component's extra scratch, addressed
//   and edited through the prop's path; onMouseOut adds the mouse-out
//   callback intents on leave; button is an on-hover wrapper around a
//   ui button carrying the hover flag, drawn with a light gray rounded
//   fill behind its border while hovered; checkbox is a pointer-down
//   toggle over the ui checkbox; the toggle effect updates its path
//   with logical not.
// Rationale: specs/components-hover.md is the design authority.
//   Entering sets hover? on a mouse-move over the body (hover_enter),
//   returning set-true followed by the child intents (mouse_out_callback);
//   leaving is detected by a global mouse-move (which is why the wrapper
//   always reports has-mouse-move-global) whose bound check is inclusive
//   at the upper edge (x > w, not >=) — hover_leave. A global move
//   inside the box returns only the child intents (hover_stays_inside).
//   The ui button fires on mouse-down inside its bounds and nothing on
//   mouse-up (event.model button_fires_on_down); the plain ui checkbox
//   draws state but handles no events (checkbox_view_only). No behavior
//   beyond the corpus.

import {
  call,
  defineComponent,
  type CallSite,
  type ComponentCall,
  type Props,
} from "../../model/component.ts";
import {
  bounds,
  button as uiButton,
  checkbox as uiCheckbox,
  on,
  roundedRectangle,
  withColor,
  withStyle,
  type ButtonNode,
  type Color,
  type Elem,
  type Handler,
  type Vec2,
} from "../../views/model.ts";
import { dispatch } from "../../events/dispatch.ts";
import { mouseMove, type TamborEvent } from "../../events/event.ts";
import type { IntentList } from "../../events/bubble.ts";
import { defeffect } from "../../effects/dispatch.ts";
import type { Path } from "../../effects/paths.ts";

// Hover is stored as a hover? prop, so it lives in the component's
// extra state and is edited through paths like any other state.
const HOVER_KEY = "hover?";

export interface HoverOptions {
  /** binds the wrapper's extra scratch at an explicit call site */
  readonly callsite?: CallSite;
  /** on-mouse-out: intents appended after the set-false on leave */
  readonly onMouseOut?: () => IntentList;
}

// A unique component per wrapper instance: the body differs per call
// site, and distinct components must never share a render-cache entry
// (component.model render_cached keys by component name plus props).
let instances = 0;

// on-hover: the wrapper component. Its declared hover? prop reads the
// flag from the extra scratch and its path edits it there.
export function onHover(
  body: (props: Props) => Elem,
  opts: HoverOptions = {},
): ComponentCall {
  const comp = defineComponent(`on-hover#${++instances}`, [{ keys: [HOVER_KEY] }], (props) =>
    hoverNodes(props, body, opts.onMouseOut),
  );
  return call(comp, {}, opts.callsite);
}

// on-mouse-out: on-hover plus the mouse-out callback intents on leave
// (mouse_out_callback); on enter the behavior is unchanged.
export function onMouseOut(
  body: (props: Props) => Elem,
  onLeave: () => IntentList,
  opts: Omit<HoverOptions, "onMouseOut"> = {},
): ComponentCall {
  return onHover(body, { ...opts, onMouseOut: onLeave });
}

// The wrapper's view: an on-mouse-move node for entering (terminal, so
// the handler collects the child intents itself) nested in an
// on-mouse-move-global node for leaving, whose handler is appended
// after the child intents (event.model global_move_all).
function hoverNodes(
  props: Props,
  body: (props: Props) => Elem,
  onMouseOut?: () => IntentList,
): Elem {
  const hovered = props[HOVER_KEY] === true;
  const $hover = props[`$${HOVER_KEY}`] as Path;
  const bodyElem = body(props);
  const [w, h] = bounds(bodyElem);

  // entering: a mouse-move over the body — when hover? is false the
  // effect sets hover? to true, followed by the child intents
  // (hover_enter, mouse_out_callback)
  const enter = on("mouse-move", (pos: unknown, event: unknown) => {
    // the child intents under the same move, preceded by the set-true
    // effect while not yet hovered
    const child = dispatch(bodyElem, mouseMove(pos as Vec2));
    if (!isMousePointer(event)) return child;
    return hovered ? child : ([["set", $hover, true]] as IntentList).concat(child);
  }, bodyElem);

  // leaving: a global mouse-move outside the bounds — x < 0, x > w,
  // y < 0 or y > h, inclusive at the upper edge (x > w, not >=)
  // (hover_leave). Inside the box only the child intents flow
  // (hover_stays_inside); when hover? is false nothing is added.
  return on("mouse-move-global", (pos: unknown, event: unknown) => {
    const p = pos as Vec2;
    const outside = p[0] < 0 || p[0] > w || p[1] < 0 || p[1] > h;
    if (!hovered || !outside || !isMousePointer(event)) return [];
    const intents: IntentList = ([["set", $hover, false]] as IntentList).concat(
      onMouseOut ? onMouseOut() : [],
    );
    return intents;
  }, enter);
}

// Hover effects are produced only for pointerType mouse
// (touch_no_hover): a non-mouse pointer event drives neither enter nor
// leave. No event argument at all (a legacy 1-arg caller) counts as
// mouse — the delivery rule is additive.
function isMousePointer(event: unknown): boolean {
  const ev = event as TamborEvent | undefined;
  return ev === undefined || ev.pointerType === "mouse";
}

// The light gray of the hovered button fill (button_hover_visual) —
// the corpus's light gray (components.select row_visuals).
const BUTTON_FILL: Color = [0.976, 0.976, 0.976];
const BUTTON_RADIUS = 5;

// The basic button: an on-hover wrapper around a ui button with text,
// on-click and the hover flag (button_component); a hovered button
// draws a light gray rounded fill behind its border
// (button_hover_visual).
export function button(
  text: string,
  onClick?: Handler,
  callsite?: CallSite,
): ComponentCall {
  const opts: HoverOptions = callsite !== undefined ? { callsite } : {};
  return onHover((props) => {
    const hovered = props[HOVER_KEY] === true;
    const ui = buttonNode(text, hovered, onClick);
    if (!hovered) return ui;
    const [w, h] = bounds(ui);
    const fill = withStyle(
      "fill",
      withColor(BUTTON_FILL, roundedRectangle(w, h, BUTTON_RADIUS)),
    );
    // behind its border: the fill is drawn before the ui button
    return [fill, ui];
  }, opts);
}

// A ui button carrying the hover flag (ButtonNode.hover of the landed
// view model), frozen like every constructed node (immutable_nodes).
function buttonNode(text: string, hover: boolean, onClick?: Handler): ButtonNode {
  const node: { type: "button"; text: string; onClick?: Handler; hover: boolean } = {
    type: "button",
    text,
    hover,
  };
  if (onClick !== undefined) node.onClick = onClick;
  return Object.freeze(node);
}

// The basic checkbox: a pointer down returns exactly the toggle effect
// carrying its checked path (checkbox_toggle), drawn over the ui
// checkbox which itself handles no events (checkbox_view_only).
const checkboxComp = defineComponent("checkbox", [{ keys: ["checked"] }], (props) =>
  on("mouse-down", () => [["toggle", props.$checked as Path]], uiCheckbox(props.checked as boolean)),
);

export interface CheckboxProps {
  readonly checked?: boolean;
  /** the checked path the toggle effect carries */
  readonly $checked: Path;
}

export function checkbox(props: CheckboxProps): ComponentCall {
  return call(checkboxComp, props as unknown as Record<string, unknown>);
}

// toggle updates its path with logical not (checkbox_toggle); a
// registered effect receives dispatch first and the update it
// dispatches is applied (effect.dispatch compose_via_dispatch).
defeffect("toggle", (dispatch, ...args: unknown[]) => {
  dispatch(["update", args[0] as Path, (b: unknown) => !b]);
});
