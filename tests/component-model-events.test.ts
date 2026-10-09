// Purpose: executable contract tests for the component-model spec's
//   forwarding, sizing and recursion rows — event forwarding, clipboard
//   forwarding, sizing props and recursive components.
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: openspec/specs/component-model/spec.md is the design authority; each
//   predicate here mirrors a Properties row (generator + predicate text)
//   and cites the defui_test.clj scenario it ports. No vacuous
//   predicates: every check encodes its row's stated behavior.
//   tambor-272 splits the former monolithic tests/component-model.test.ts
//   into topic files.

import { expect, it } from "vitest";
import fc from "fast-check";

import {
  call,
  defineComponent,
  render,
  setHeight,
  setWidth,
  stretchHeight,
  stretchWidth,
  type Props,
} from "../src/model/component.ts";
import type { Path } from "../src/effects/paths.ts";
import {
  label as labelNode,
  on,
  rectangle,
  spacer,
  type Rectangle,
} from "../src/views/model.ts";
import { dispatch, hasKeyEvent, hasKeyPress, hasMouseMoveGlobal } from "../src/events/dispatch.ts";
import {
  clipboard,
  keyEvent,
  keyPress,
  mouseDown,
  mouseMoveGlobal,
} from "../src/events/event.ts";
import type { EventElem } from "../src/events/bubble.ts";

// p_forward — derives_from: component.model.event_forwarding
// generator: events at a component
// predicate: the rendered view's handlers receive them
it("p_forward: the rendered view's handlers receive them", () => {
  // the pointer handler sits last so the pointer first-match search
  // (event.model) reaches it past the other handlers
  const forwarder = defineComponent("forwarder", [{ keys: ["tag"] }], (props) => [
    on("key-press", (s: unknown) => [["hit", "key-press", s]]),
    on("key-event", (s: unknown) => [["hit", "key-event", s]]),
    on("mouse-move-global", (pos: unknown) => [["hit", "mouse-move-global", pos]]),
    on("mouse-down", () => [["hit", "mouse-down", props.tag]], spacer(10, 10)),
  ]);
  const view = render(call(forwarder, { tag: "t" })) as EventElem;
  // pointer, key, key-event and global-move events forward to the
  // rendered view
  expect(dispatch(view, mouseDown([0, 0]))).toEqual([["hit", "mouse-down", "t"]]);
  expect(dispatch(view, keyPress("s"))).toEqual([["hit", "key-press", "s"]]);
  expect(dispatch(view, keyEvent("x"))).toEqual([["hit", "key-event", "x"]]);
  expect(dispatch(view, mouseMoveGlobal([1, 2]))).toEqual([
    ["hit", "mouse-move-global", [1, 2]],
  ]);
  // and the component answers the has-* queries from its rendered view
  expect(hasKeyPress(view)).toBe(true);
  expect(hasKeyEvent(view)).toBe(true);
  expect(hasMouseMoveGlobal(view)).toBe(true);
});

// p_clipboard — derives_from: component.model.clipboard_forwarding
// generator: copy event at a textarea component
// predicate: the selected text effect is emitted
it("p_clipboard: the selected text effect is emitted", () => {
  // The original defui leaves clipboard events unforwarded (the
  // IClipboardCopy block in component.cljc is commented out); the port
  // forwards them so textarea copy and paste work. The full textarea
  // component is a downstream ticket (K1); this component carries the
  // forwarding contract: a clipboard event at it emits the selected
  // text effect.
  const textareaish = defineComponent(
    "textareaish",
    [{ keys: ["text"] }],
    (props) =>
      on("clipboard", (data: unknown) => [["clipboard-copy", `${data}`]], labelNode(props.text as string)),
  );
  const view = render(call(textareaish, { text: "copy me" })) as EventElem;
  const intents = dispatch(view, clipboard("copied text"));
  expect(intents).toEqual([["clipboard-copy", "copied text"]]);
});

// p_sizing — derives_from: component.model.sizing_props
// generator: component with width prop
// predicate: setWidth returns a component with the new width prop
it("p_sizing: setWidth returns a component with the new width prop", () => {
  const sized = defineComponent(
    "sized",
    [{ keys: ["width", "height", "stretch-width", "stretch-height"] }],
    (props) => rectangle(props.width as number, 5),
  );
  const c = call(sized, { width: 10 });
  // setWidth assocs the new width prop and returns a component
  const wider = setWidth(c, 100);
  expect((wider.props as Props).width).toBe(100);
  // the re-render sees the new width
  expect((render(wider) as Rectangle).width).toBe(100);
  // setHeight by assoc too
  const taller = setHeight(wider, 50);
  expect((taller.props as Props).height).toBe(50);
  expect((taller.props as Props).width).toBe(100);
  // stretch flags are read from the component's stretch props
  const stretched = call(sized, { "stretch-width": true });
  expect(stretchWidth(stretched)).toBe(true);
  expect(stretchHeight(stretched)).toBe(false);
});

// ---------------------------------------------------------------------------
// Recursive components
// ---------------------------------------------------------------------------

// The tree data of the recursive component scenario.
interface TreeNode {
  readonly name: string;
  readonly children?: readonly TreeNode[];
}

// The recursive component: a component may call itself, and the
// derivation treats the recursive call as a component call
// (recursive_components).
const tree = defineComponent("tree", [{ keys: ["data"] }], (props) => {
  const d = props.data as TreeNode;
  const site = props as Props;
  return [
    labelNode(d.name),
    ...(d.children ?? []).map((child) =>
      call(tree, { data: child }, {
        extra: site.extra,
        $extra: site.$extra as Path,
        context: site.context,
        $context: site.$context as Path,
      }),
    ),
  ];
});

// The depth of the rendered recursion: groups nest one level per call.
function renderedDepth(elems: unknown): number {
  if (!Array.isArray(elems)) return 0;
  return 1 + Math.max(0, ...elems.map((e) => renderedDepth(e)));
}
function dataDepth(node: TreeNode): number {
  const kids = node.children ?? [];
  return 1 + Math.max(0, ...kids.map(dataDepth));
}
function isObject(e: unknown): boolean {
  return typeof e === "object";
}
function isNonNullObject(e: unknown): e is object {
  if (!isObject(e)) return false;
  return e !== null;
}
function isLabel(e: unknown): boolean {
  if (!isNonNullObject(e)) return false;
  if (Array.isArray(e)) return false;
  return "text" in e;
}
function namesInOrder(elems: unknown): readonly string[] {
  if (!Array.isArray(elems)) return [];
  return elems.flatMap((e) =>
    isLabel(e) ? [e.text] : namesInOrder(e),
  );
}
function countNames(node: TreeNode): number {
  return 1 + (node.children ?? []).reduce((n, c) => n + countNames(c), 0);
}

// p_recursive — derives_from: component.model.recursive_components
// generator: a tree component
// predicate: the recursion renders to the data depth
it("p_recursive: the recursion renders to the data depth", () => {
  // the defui_test-shaped scenario: the recursion renders the data in
  // depth-first order
  const data: TreeNode = {
    name: "root",
    children: [{ name: "a", children: [{ name: "leaf" }] }, { name: "b" }],
  };
  const rendered = render(call(tree, { data }));
  expect(namesInOrder(rendered)).toEqual(["root", "a", "leaf", "b"]);
  expect(renderedDepth(rendered)).toBe(dataDepth(data));

  // generalized: for every generated tree the recursion renders to the
  // data depth
  const leaf = fc.record({ name: fc.string({ minLength: 1 }) });
  const node: fc.Arbitrary<TreeNode> = fc.letrec((tie) => {
    return {
      node: fc.oneof(
        leaf,
        fc.record({
          name: fc.string({ minLength: 1 }),
          children: fc.array(tie("node") as fc.Arbitrary<TreeNode>, { maxLength: 3 }),
        }),
      ),
    };
  }).node;
  fc.assert(
    fc.property(node, (t) => {
      const out = render(call(tree, { data: t }));
      expect(renderedDepth(out)).toBe(dataDepth(t));
      expect(namesInOrder(out).length).toBe(countNames(t));
    }),
  );
});