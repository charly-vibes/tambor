// Purpose: executable contract tests for the components-hover spec —
//   the hover machinery of the basic components (on-hover, on-mouse-out,
//   button, checkbox).
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: openspec/specs/components-hover/spec.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate
//   text). No vacuous predicates: every check encodes its row's stated
//   behavior. The hover? scratch is driven through the real wiring —
//   the root ::extra scratch addressed by the prop's path — exactly as
//   the corpus describes it ("it lives in the component's extra state
//   and is edited through paths like any other state").

import { expect, it } from "vitest";
import fc from "fast-check";

import { onHover, onMouseOut, button, checkbox } from "../src/components/hover/hover.ts";
import {
  bounds,
  checkbox as uiCheckbox,
  children,
  isGroup,
  on,
  spacer,
  type ButtonNode,
  type Color,
  type Elem,
  type Node,
  type Vec2,
  type WithColorNode,
  type WithStyleNode,
} from "../src/views/model.ts";
import type { EventElem, IntentList } from "../src/events/bubble.ts";
import { dispatch, hasMouseMoveGlobal } from "../src/events/dispatch.ts";
import { keyPress, mouseDown, mouseMove, mouseMoveGlobal, mouseUp } from "../src/events/event.ts";
import { makeApp } from "../src/effects/dispatch.ts";
import type { Effect } from "../src/effects/dispatch.ts";
import type { CallSite, ComponentCall, Props } from "../src/model/component.ts";
import { render } from "../src/model/component.ts";
import { select, setPath, type Path } from "../src/effects/paths.ts";
import { makeHeadlessApp, type HeadlessApp } from "../src/app/app.ts";

// The root scratch binding every hover instance is wired against: the
// call falls back to the root ::extra entries when no callsite binds
// one (component.model implicit_extra_context).
const ROOT_EXTRA: Path = [["keypath", "::extra"]];

interface HoverWired {
  readonly app: HeadlessApp;
  /** the hover? path of the wired instance */
  readonly $hover: Path;
}

// A hover component wired against the root ::extra scratch: the view
// re-binds the call on every render so the hover? edits land in the
// app state and the next render sees them.
function hoverWired(
  make: (callsite: CallSite) => ComponentCall,
  hovered: boolean = false,
): HoverWired {
  // the probe reads the derived hover? path; a root call with no args
  // derives the same scratch address as the app-wired instance
  const $hover = make({}).props["$hover?"] as Path;
  // a hovered instance starts with hover? already set in the scratch
  const state = hovered ? setPath({}, $hover.slice(0, -1), { "hover?": true }) : {};
  const app = makeHeadlessApp({
    view: (s) => {
      const root = (s ?? {}) as Record<string, unknown>;
      const callsite: CallSite = {
        extra: (root["::extra"] as Record<string, unknown>) ?? {},
        $extra: ROOT_EXTRA,
      };
      return render(make(callsite)) as Elem;
    },
    state,
  });
  return { app, $hover };
}

function viewOf(app: HeadlessApp): EventElem {
  return app.render() as EventElem;
}

// Depth-first scan for nodes of one type (the corpus reads the drawn
// tree to assert visuals, e.g. p_button_visual).
function findAll(elem: EventElem | Elem, type: string): readonly Node[] {
  if (elem == null) return [];
  if (isGroup(elem as Elem)) {
    return (elem as readonly Elem[]).flatMap((child) => findAll(child, type));
  }
  return findAllNode(elem as Node, type);
}

function findAllNode(elem: Node, type: string): readonly Node[] {
  const below = children(elem).flatMap((child) => findAll(child, type));
  if (elem.type === type) return [elem, ...below];
  return below;
}

// The group whose direct children include a node of the given type —
// the wrapper's body group, so siblings and their draw order are
// observable (button_hover_visual: the fill sits behind the border).
function groupWithDirectChild(elem: EventElem | Elem, type: string): readonly Elem[] | undefined {
  if (elem == null) return undefined;
  if (isGroup(elem as Elem)) return searchGroup(elem as readonly Elem[], type);
  return searchNodeChildren(elem as Node, type);
}

// The group whose direct children include a node of the given type —
// the wrapper's body group, so siblings and their draw order are
// observable (button_hover_visual: the fill sits behind the border).
function searchGroup(group: readonly Elem[], type: string): readonly Elem[] | undefined {
  if (groupHasDirectChild(group, type)) return group;
  return searchInChildren(group, type);
}

function groupHasDirectChild(group: readonly Elem[], type: string): boolean {
  return group.some((child) => !isGroup(child) && (child as Node).type === type);
}

function searchInChildren(kids: readonly Elem[], type: string): readonly Elem[] | undefined {
  for (const child of kids) {
    const found = groupWithDirectChild(child, type);
    if (found) return found;
  }
  return undefined;
}

function searchNodeChildren(node: Node, type: string): readonly Elem[] | undefined {
  return searchInChildren(children(node), type);
}

// p_enter — derives_from: components.hover.hover_enter
// generator: move inside a 40 by 20 body
// predicate: the effect sets hover? to true
it("p_enter: the effect sets hover? to true", () => {
  const body = () => spacer(40, 20);
  const { $hover } = hoverWired((callsite) => onHover(body, { callsite }));
  fc.assert(
    fc.property(fc.nat(39), fc.nat(19), (x, y) => {
      // a fresh app per case: the enter sets the scratch through the
      // app state, and each case starts unhovered
      const { app } = hoverWired((callsite) => onHover(body, { callsite }));
      // a mouse-move over the body: the effect sets hover? to true
      expect(dispatch(viewOf(app), mouseMove([x, y]))).toEqual([["set", $hover, true]]);
      // routed through the app it edits the hover? scratch through the
      // path, so the state reads true afterwards
      app.send(mouseMove([x, y]));
      expect(select(app.getState(), $hover)).toBe(true);
    }),
  );
  // leaving is detected by a global mouse-move, which is why the root
  // must always report has-mouse-move-global
  const { app } = hoverWired((callsite) => onHover(body, { callsite }));
  expect(hasMouseMoveGlobal(viewOf(app))).toBe(true);
});

// p_leave — derives_from: components.hover.hover_leave
// generator: global moves at -1, 41 and 21
// predicate: each adds set hover? false to the child intents
it("p_leave: each adds set hover? false to the child intents", () => {
  // the body carries a global-move handler so the child intents are
  // observable ahead of the hover effect
  const body = () => on("mouse-move-global", () => [["child-saw-move"]], spacer(40, 20));
  const make = (callsite: CallSite): ComponentCall => onHover(body, { callsite });
  // hover? is true from the scratch
  const { app, $hover } = hoverWired(make, true);
  // global moves at -1 (x < 0), 41 (x > w = 40) and 21 (y > h = 20):
  // each adds set hover? false to the child intents
  for (const pos of [[-1, 10], [41, 10], [10, 21]] as const) {
    expect(dispatch(viewOf(app), mouseMoveGlobal([...pos] as Vec2))).toEqual([
      ["child-saw-move"],
      ["set", $hover, false],
    ]);
  }
  // the guard: when hover? is false a global move outside returns only
  // the child intents — no hover effect
  const { app: plain } = hoverWired(make, false);
  expect(dispatch(viewOf(plain), mouseMoveGlobal([-1, 10]))).toEqual([["child-saw-move"]]);
  // the leave bound check is inclusive at the upper edge (x > w, not
  // >=): x == w and y == h are inside, so they stay
  expect(dispatch(viewOf(app), mouseMoveGlobal([40, 10]))).toEqual([["child-saw-move"]]);
  expect(dispatch(viewOf(app), mouseMoveGlobal([10, 20]))).toEqual([["child-saw-move"]]);
});

// p_stay — derives_from: components.hover.hover_stays_inside
// generator: global move at 10, 10
// predicate: no hover effect is returned
it("p_stay: no hover effect is returned", () => {
  const body = () => on("mouse-move-global", () => [["child-saw-move"]], spacer(40, 20));
  const { app, $hover } = hoverWired((callsite) => onHover(body, { callsite }), true);
  // a global move inside the box returns only the child intents: the
  // exact list carries no hover effect
  expect(dispatch(viewOf(app), mouseMoveGlobal([10, 10]))).toEqual([["child-saw-move"]]);
  // and the hover? scratch is untouched
  expect(select(app.getState(), $hover)).toBe(true);
});

// p_mouse_out — derives_from: components.hover.mouse_out_callback
// generator: leave with a callback
// predicate: callback intents follow the set false
it("p_mouse_out: callback intents follow the set false", () => {
  // the body handles plain moves and global moves so both the enter
  // and the leave child intents are observable
  const body = () => [
    on("mouse-move", () => [["child-move"]], spacer(40, 20)),
    on("mouse-move-global", () => [["child-saw-move"]], spacer(40, 20)),
  ];
  const make = (callsite: CallSite): ComponentCall =>
    onMouseOut(body, () => [["mouse-out", "left"]], { callsite });
  // on enter (hover? still false): set hover? true followed by the
  // child intents
  const { app, $hover } = hoverWired(make, false);
  expect(dispatch(viewOf(app), mouseMove([10, 10]))).toEqual([
    ["set", $hover, true],
    ["child-move"],
  ]);
  // on leave (hover? true from the scratch): the child intents, then
  // set hover? false, then the mouse-out callback intents
  const { app: hovered } = hoverWired(make, true);
  expect(dispatch(viewOf(hovered), mouseMoveGlobal([-1, 10]))).toEqual([
    ["child-saw-move"],
    ["set", $hover, false],
    ["mouse-out", "left"],
  ]);
});

// p_button — derives_from: components.hover.button_component
// generator: text Add Todo with on-click
// predicate: pointer down inside returns the on-click result and up returns nothing
it("p_button: pointer down inside returns the on-click result and up returns nothing", () => {
  // on-click is a function with no arguments returning intents
  const onClick = () =>
    [["add-todo"], ["set", [["keypath", "next-todo-text"]], ""]] as IntentList;
  const btn = button("Add Todo", onClick);
  const view = render(btn) as EventElem;
  // the basic button is an on-hover wrapper around a ui button with
  // text, on-click and the hover flag
  const nodes = findAll(view, "button");
  expect(nodes).toHaveLength(1);
  const node = nodes[0] as ButtonNode;
  expect(node.text).toBe("Add Todo");
  expect(typeof node.onClick).toBe("function");
  expect(node.hover).toBe(false);
  // the on-hover wrapper marks the root
  expect(hasMouseMoveGlobal(view)).toBe(true);
  const [w, h] = bounds(node);
  fc.assert(
    fc.property(fc.nat(w - 1), fc.nat(h - 1), (x, y) => {
      // pointer down inside returns the on-click result
      expect(dispatch(view, mouseDown([x, y]))).toEqual([
        ["add-todo"],
        ["set", [["keypath", "next-todo-text"]], ""],
      ]);
      // and up returns nothing
      expect(dispatch(view, mouseUp([x, y]))).toEqual([]);
    }),
  );
});

// p_button_visual — derives_from: components.hover.button_hover_visual
// generator: hover true and false
// predicate: only the hovered view contains the fill
it("p_button_visual: only the hovered view contains the fill", () => {
  const onClick = () => [] as IntentList;
  // not hovered: no fill
  const plain = hoverWired((callsite) => button("Add Todo", onClick, callsite));
  expect(findAll(viewOf(plain.app), "rounded-rectangle")).toEqual([]);
  // hovered: a light gray rounded fill behind the button's border
  const hovered = hoverWired((callsite) => button("Add Todo", onClick, callsite), true);
  const hoveredView = viewOf(hovered.app);
  const fills = findAll(hoveredView, "rounded-rectangle");
  expect(fills).toHaveLength(1);
  // the fill is light gray and drawn with the fill style
  const fillWrapper = groupWithDirectChild(hoveredView, "button")?.[0] as WithStyleNode;
  expect(fillWrapper.type).toBe("with-style");
  expect(fillWrapper.style).toBe("fill");
  const colorWrapper = fillWrapper.drawables[0] as WithColorNode;
  expect(colorWrapper.type).toBe("with-color");
  const lightGray: Color = [0.976, 0.976, 0.976];
  expect(colorWrapper.color).toEqual(lightGray);
  expect((colorWrapper.drawables[0] as Node | undefined)?.type).toBe("rounded-rectangle");
  // behind its border: the fill is drawn before the ui button
  const bodyGroup = groupWithDirectChild(hoveredView, "button") as readonly Elem[];
  expect((bodyGroup[1] as Node | undefined)?.type).toBe("button");
});

// p_checkbox — derives_from: components.hover.checkbox_toggle
// generator: checked false then true
// predicate: the effect is toggle with the checked path and applying it flips the value
it("p_checkbox: the effect is toggle with the checked path and applying it flips the value", () => {
  for (const checked of [false, true]) {
    const state = { todo: { complete: checked } };
    const $checked: Path = [["keypath", "todo"], ["keypath", "complete"]];
    const view = render(checkbox({ checked, $checked })) as EventElem;
    // a pointer down on a checkbox returns exactly the toggle effect
    // carrying its checked path
    const intents = dispatch(view, mouseDown([6, 6]));
    expect(intents).toEqual([["toggle", $checked]]);
    // and toggle updates that path with logical not: applying it flips
    // the value
    const app = makeApp({ view: () => null, state });
    app.dispatch(intents as readonly Effect[]);
    expect(select(app.getState(), $checked)).toBe(!checked);
  }
});

// p_touch_hover — derives_from: components.hover.touch_no_hover
// generator: touch pointer moves
// predicate: hover? is never set
it("p_touch_hover: hover? is never set", () => {
  const body = () => on("mouse-move-global", () => [["child-saw-move"]], spacer(40, 20));
  const make = (callsite: CallSite): ComponentCall => onHover(body, { callsite });
  fc.assert(
    fc.property(fc.nat(39), fc.nat(19), (x, y) => {
      const { app, $hover } = hoverWired(make, false);
      // a touch move over the body returns nothing and hover? is never
      // set — the scratch entry stays absent
      expect(dispatch(viewOf(app), mouseMove([x, y], { pointerType: "touch" }))).toEqual([]);
      app.send(mouseMove([x, y], { pointerType: "touch" }));
      expect(select(app.getState(), $hover)).toBeUndefined();
    }),
  );
  // hovered: a touch global move outside the box returns only the
  // child intents and hover? stays true
  const { app, $hover } = hoverWired(make, true);
  expect(dispatch(viewOf(app), mouseMoveGlobal([41, 10], { pointerType: "touch" }))).toEqual([
    ["child-saw-move"],
  ]);
  app.send(mouseMoveGlobal([41, 10], { pointerType: "touch" }));
  expect(select(app.getState(), $hover)).toBe(true);
  // pen is not mouse either (touch_no_hover names pointerType mouse)
  expect(dispatch(viewOf(app), mouseMoveGlobal([41, 10], { pointerType: "pen" }))).toEqual([
    ["child-saw-move"],
  ]);
});

// p_checkbox_view — derives_from: components.hover.checkbox_view_only
// generator: ui checkbox
// predicate: events return nothing
it("p_checkbox_view: events return nothing", () => {
  for (const checked of [false, true]) {
    const view = uiCheckbox(checked) as EventElem;
    expect(dispatch(view, mouseDown([6, 6]))).toEqual([]);
    expect(dispatch(view, mouseMove([6, 6]))).toEqual([]);
    expect(dispatch(view, mouseMoveGlobal([6, 6]))).toEqual([]);
    expect(dispatch(view, mouseUp([6, 6]))).toEqual([]);
    expect(dispatch(view, keyPress("x"))).toEqual([]);
  }
});
