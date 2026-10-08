// Purpose: executable contract tests for the tambor root spec — the
//   library-level properties (views are values, handlers are pure, the
//   core is headless, paths not callbacks, strict TypeScript build,
//   mobile-first touch targets).
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: specs/tambor.md is the design authority; the rows are
//   checked against the working spine (views, events, paths, effects,
//   examples, backends, interop). p_examples runs every scenario of
//   both examples through each backend; p_host drives the todo example
//   through the plain-data interop API (tambor-5bc ruling: hosts are
//   TypeScript and ClojureScript; no conversion calls, per interop.model).

import { expect, it, vi } from "vitest";
import fc from "fast-check";

// The Node builtins the build check needs, typed at the use site —
// @types/node is not a project dependency (typing.model: no any in
// public signatures; these are test-local pins).
// @ts-expect-error node:child_process has no type declarations here
import { execSync } from "node:child_process";
// @ts-expect-error node:fs has no type declarations here
import { readdirSync } from "node:fs";

import {
  bounds,
  children,
  isGroup,
  path as pathNode,
  rectangle,
  roundedRectangle,
  spacer,
  translate,
  withColor,
  withStrokeWidth,
  withStyle,
  type ButtonNode,
  type Color,
  type Elem,
  type Label,
  type Node,
  type Vec2,
  type WithStrokeWidthNode,
} from "../src/views/model.ts";
import {
  counter as counterView,
  counterCounter as counterCounterView,
} from "../src/effects/counter.ts";
import { rootRef, type Ref } from "../src/effects/ref.ts";
import { hitTargetSize, interactiveNodes } from "../src/app/touch.ts";
import { makeApp } from "../src/effects/dispatch.ts";
import { dispatch } from "../src/events/dispatch.ts";
import { keyPress, mouseDown, type TamborEvent } from "../src/events/event.ts";
import type { IntentList } from "../src/events/bubble.ts";
import { CanvasBackend } from "../src/render/canvas.ts";
import { DomBackend } from "../src/render/dom.ts";
import { TextBackend } from "../src/render/text.ts";
import { createCanvas } from "../src/render/domsim.ts";
import {
  FILTER_OPTIONS,
  FILTER_PATH,
  NEW_TODO_EXTRA_PATH,
  NEXT_TEXT_PATH,
  TODOS_PATH,
  filterFn,
  todoApp,
  todoItem,
  todoState,
  toggle,
  type TodoState,
} from "../src/examples/todo/todo.ts";
import { makeOpsApp } from "../src/interop/app.ts";
import {
  PMap,
  cljsOps,
  kw,
  not,
  pmap,
  toJs,
} from "./helpers/interop-standins.ts";

// The View union: the type tags of the view.model node union plus the
// group (a vector of nodes is itself a node — group_is_node). p_values
// checks membership against this closed set.
const VIEW_TYPE_TAGS: readonly string[] = [
  "label",
  "rectangle",
  "rounded-rectangle",
  "path",
  "spacer",
  "translate",
  "with-color",
  "with-style",
  "with-stroke-width",
  "button",
  "handler",
  "checkbox",
];

function assertInViewUnion(elem: Elem): void {
  if (elem == null) return; // nil draws nothing and is a member
  if (isGroup(elem)) {
    elem.forEach(assertInViewUnion);
    return;
  }
  expect(VIEW_TYPE_TAGS).toContain(elem.type);
}

// p_values — derives_from: tambor.views_are_values
// generator: random view trees — predicate: JSON round-trip of a view
// deep-equals the original, and its type is a member of the View union
it("p_values: JSON round-trip of a view deep-equals the original, and its type is a member of the View union", () => {
  // The generator covers the JSON-serialisable node kinds. Labels,
  // buttons, handlers and checkboxes carry functions (measure, onClick,
  // handler) — plain data per interop.model.plain_data_api ("plain type
  // or function") but not JSON-representable — so they sit outside the
  // round-trip domain, exactly like effect update functions
  // (typing.model.serialisable_effects).
  const color: fc.Arbitrary<Color> = fc.tuple(
    fc.double({ min: 0, max: 1, noNaN: true }),
    fc.double({ min: 0, max: 1, noNaN: true }),
    fc.double({ min: 0, max: 1, noNaN: true }),
  );
  const size = fc.integer({ min: 0, max: 64 });
  const coord = fc.integer({ min: -64, max: 64 });

  const tree = fc.letrec((tie) => {
    // the recursive ref, hoisted: every wrapper takes one Elem child
    const node = tie("node") as fc.Arbitrary<Elem>;
    return {
      node: fc.oneof(tie("leaf"), tie("wrap"), tie("group")) as fc.Arbitrary<Elem>,
      leaf: fc.oneof(
        fc.tuple(size, size).map(([w, h]) => rectangle(w, h)),
        fc.tuple(size, size, size).map(([w, h, r]) => roundedRectangle(w, h, r)),
        fc
          .array(fc.tuple(coord, coord), { maxLength: 4 })
          .map((points) => pathNode(...(points as readonly Vec2[]))),
        fc.tuple(coord, coord).map(([x, y]) => spacer(x, y)),
      ),
      wrap: fc.oneof(
        fc.tuple(coord, coord, node).map(([x, y, d]) => translate(x, y, d)),
        fc.tuple(color, node).map(([c, d]) => withColor(c, d)),
        fc.tuple(color, node).map(([c, d]) => withStyle("fill", withColor(c, d))),
        fc
          .tuple(fc.integer({ min: 0, max: 8 }), node)
          .map(([sw, d]) => withStrokeWidth(sw, d)),
      ),
      group: fc.array(node, { maxLength: 4 }),
    };
  });

  fc.assert(
    fc.property(tree.node, (view) => {
      const round = JSON.parse(JSON.stringify(view)) as Elem;
      expect(round).toEqual(view);
      assertInViewUnion(view);
    }),
  );
});

// p_pure — derives_from: tambor.handlers_are_pure
// generator: random state and event — predicate: state is deep-equal
// before and after calling a handler
it("p_pure: state is deep-equal before and after calling a handler", () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 0, max: 999 }), { maxLength: 8 }),
      fc.integer({ min: 0, max: 999 }),
      fc.tuple(fc.integer({ min: -10, max: 110 }), fc.integer({ min: -10, max: 110 })),
      (nums, num, pos) => {
        const state = { nums, num };
        const before = JSON.parse(JSON.stringify(state));
        // every handler the counter example renders, called with the
        // random event's position: none may touch the state directly —
        // state changes only flow back as effects (paths_not_callbacks)
        const tree = [
          ...(counterView(num, rootRef(state).get("num") as Ref<number>) ?? []),
          ...(counterCounterView(nums, rootRef(state).get("nums") as Ref<readonly number[]>) ?? []),
        ] as readonly Elem[];
        for (const node of interactiveNodes(tree)) {
          (node as ButtonNode).onClick?.(pos as Vec2);
        }
        expect(state).toEqual(before);
      },
    ),
  );
});

// p_headless — derives_from: tambor.backend_optional
// generator: import the core with no DOM — predicate: import succeeds
// and bounds of a label tree is computed
it("p_headless: import succeeds and bounds of a label tree is computed", async () => {
  // this environment has no DOM: the core (view, layout, events, paths,
  // effects) must import and run without document or window
  const globals = globalThis as unknown as { document?: unknown; window?: unknown };
  expect(globals.document).toBeUndefined();
  expect(globals.window).toBeUndefined();
  const model = await import("../src/views/model.ts");
  await import("../src/views/layout.ts");
  await import("../src/events/dispatch.ts");
  await import("../src/effects/paths.ts");
  await import("../src/effects/dispatch.ts");
  // bounds of a label tree is computed: label("hello") under the
  // headless default measure is 5 by 1
  expect(model.bounds(model.label("hello"))).toEqual([5, 1]);
});

// p_no_callbacks — derives_from: tambor.paths_not_callbacks
// generator: scan component handlers — predicate: every state change
// appears as an effect in a returned list
it("p_no_callbacks: every state change appears as an effect in a returned list", () => {
  const $nums = rootRef({ nums: [0, 1, 2] }).get("nums") as Ref<readonly number[]>;
  const tree = counterCounterView([0, 1, 2], $nums) as readonly Elem[];
  const targets = interactiveNodes(tree) as readonly ButtonNode[];
  // the Add Counter button plus one more! button per entry
  expect(targets).toHaveLength(4);
  for (const node of targets) {
    const result = node.onClick?.() as unknown;
    // every state change the counter example can make is an effect in
    // the returned list — counter-increment or add-counter carrying a
    // path — never a parent callback
    expect(Array.isArray(result)).toBe(true);
    for (const effect of result as readonly unknown[]) {
      expect(Array.isArray(effect)).toBe(true);
      const [type, effectPath] = effect as readonly unknown[];
      expect(["counter-increment", "add-counter"]).toContain(type);
      expect(Array.isArray(effectPath)).toBe(true);
      expect((effectPath as readonly unknown[]).length).toBeGreaterThan(0);
    }
  }
});

// p_typescript — derives_from: tambor.typescript_strict
// generator: build the package — predicate: tsc strict passes and
// declarations are emitted
it("p_typescript: tsc strict passes and declarations are emitted", () => {
  // the project's strict flags (strict, noUncheckedIndexedAccess,
  // exactOptionalPropertyTypes, noImplicitOverride) run via the project
  // config; the build overrides the no-emit to produce declarations
  execSync(
    "npx tsc -p tsconfig.json --noEmit false --declaration --emitDeclarationOnly --outDir target/tsc-out",
    { stdio: "pipe" },
  );
  const decls = (readdirSync("target/tsc-out", { recursive: true }) as string[]).filter((f: string) =>
    f.endsWith(".d.ts"),
  );
  expect(decls.length).toBeGreaterThan(0);
});

// p_touch — derives_from: tambor.mobile_first
// generator: all interactive nodes — predicate: every hit target is at
// least 44 by 44
it("p_touch: every hit target is at least 44 by 44", () => {
  const $nums = rootRef({ nums: [0, 1, 2] }).get("nums") as Ref<readonly number[]>;
  const tree = counterCounterView([0, 1, 2], $nums) as readonly Elem[];
  const targets = interactiveNodes(tree);
  expect(targets.length).toBeGreaterThan(0);
  for (const node of targets) {
    const [w, h] = hitTargetSize(node, true);
    expect(w).toBeGreaterThanOrEqual(44);
    expect(h).toBeGreaterThanOrEqual(44);
  }
});

// ---------------------------------------------------------------------
// p_examples — derives_from: tambor.examples_are_acceptance
// generator: the scenario lists of both examples
// predicate: every scenario passes on each backend
// ---------------------------------------------------------------------

// One node found in a tree walk: the node and its absolute origin, plus
// the ancestor context the corpus predicates name (gray wrapper,
// clickability) — the same walk example-todo's predicates use.
interface Found {
  readonly node: Node;
  readonly x: number;
  readonly y: number;
  readonly underColor: boolean;
  readonly underHandler: boolean;
}

function scanOf(root: Elem): readonly Found[] {
  const out: Found[] = [];
  const drawablesOf = (node: Node): readonly Elem[] =>
    (node as unknown as { drawables?: readonly Elem[] }).drawables ?? [];
  const walk = (elem: Elem, ox: number, oy: number, color: boolean, handler: boolean): void => {
    if (elem == null) return;
    if (isGroup(elem)) {
      for (const child of elem) walk(child, ox, oy, color, handler);
      return;
    }
    const node = elem as Node;
    const kind = (node as unknown as { type?: string }).type ?? "";
    // event-layer nodes (wrap/bubble) carry drawables that views/model
    // children() does not know about
    if (kind === "wrap" || kind === "bubble") {
      for (const child of drawablesOf(node)) walk(child, ox, oy, color, handler);
      return;
    }
    let underColor = color;
    let underHandler = handler;
    if (node.type === "with-color") underColor = true;
    if (kind === "handler") underHandler = true;
    out.push({ node, x: ox, y: oy, underColor, underHandler });
    let dx = 0;
    let dy = 0;
    if (node.type === "translate") {
      dx = node.x;
      dy = node.y;
    }
    for (const child of children(node)) walk(child, ox + dx, oy + dy, underColor, underHandler);
  };
  walk(root, 0, 0, false, false);
  return out;
}

// The laid-out body under an app view: the Enter middleware wraps the
// whole app as its root wrap-on node, and the body is its drawable.
function viewBodyOf(appView: Elem): Elem {
  const w = appView as unknown as { type?: string; drawables?: readonly Elem[] };
  return w.type === "wrap" ? (w.drawables as readonly Elem[])[0]! : appView;
}

// The laid-out list: the app body's last translated child.
function listGroupOf(appView: Elem): Elem {
  const kids = viewBodyOf(appView) as readonly Elem[];
  const last = kids[kids.length - 1] as { type?: string; drawable?: Elem };
  return (last?.drawable ?? null) as Elem;
}

// The descriptions rendered in the app's list, in row order.
function rowDescriptionsOf(appView: Elem): readonly string[] {
  const list = listGroupOf(appView);
  if (list == null) return [];
  return scanOf(list)
    .filter((f) => f.node.type === "label")
    .map((f) => (f.node as Label).text);
}

// The delete-X handlers of an app view: handlers whose subtree draws a
// width-3 stroke (the delete X), in document order = visible row order.
function deleteHandlersOf(view: Elem): readonly Found[] {
  return scanOf(view).filter(
    (f) =>
      f.node.type === "handler" &&
      scanOf(f.node as Elem).some(
        (g) => g.node.type === "with-stroke-width" && (g.node as WithStrokeWidthNode).strokeWidth === 3,
      ),
  );
}

// The checkbox handlers of an app view, in visible row order.
function checkboxHandlersOf(view: Elem): readonly Found[] {
  return scanOf(view).filter(
    (f) => f.node.type === "handler" && scanOf(f.node as Elem).some((g) => g.node.type === "checkbox"),
  );
}

// A click at the centre of a found node's drawn bounds.
function centreOf(f: Found): Vec2 {
  const [w, h] = bounds(f.node);
  return [f.x + w / 2, f.y + h / 2];
}

// The three backends of the corpus (the generator's "each backend").
const BACKENDS = ["canvas", "dom", "text"] as const;
type BackendName = (typeof BACKENDS)[number];

// A per-backend wire: subscribe collects the events the backend
// forwards after its own input normalisation; draw renders the view;
// pointer/key inject one raw input through that backend's own path
// (canvas/dom through the mounted surface, text through send).
interface Wire {
  draw(view: Elem): void;
  pointer(pos: Vec2): void;
  key(key: string): void;
  readonly received: readonly TamborEvent[];
}

function makeWire(name: BackendName, size: readonly [number, number]): Wire {
  const received: TamborEvent[] = [];
  if (name === "text") {
    // no DOM: the input arrives pre-normalised
    const backend = new TextBackend({ containerSize: size });
    backend.subscribe((ev) => received.push(ev));
    return {
      draw: (view) => backend.draw(view),
      pointer: (pos) => backend.send(mouseDown(pos)),
      key: (key) => backend.send(keyPress(key)),
      received,
    };
  }
  const backend =
    name === "canvas"
      ? new CanvasBackend({ containerSize: size })
      : new DomBackend({ containerSize: size });
  const surface = createCanvas();
  surface.rect = { x: 0, y: 0, width: size[0], height: size[1] };
  backend.attach(surface);
  backend.subscribe((ev) => received.push(ev));
  return {
    draw: (view) => backend.draw(view),
    pointer: (pos) =>
      surface.dispatch({ type: "pointerdown", clientX: pos[0], clientY: pos[1] }),
    // the surface speaks the raw DOM spelling ("Enter"); the backend
    // normalises it before forwarding (p_keys)
    key: (key) => surface.dispatch({ type: "keydown", key: key === "enter" ? "Enter" : key }),
    received,
  };
}

// One scenario of an example: a state, the example's view over it (built
// once and run unchanged on every backend), a scripted list of routed
// events, and the state outcome the corpus row states.
interface Scenario {
  readonly name: string;
  readonly size: readonly [number, number];
  readonly state: unknown;
  readonly view: Elem;
  readonly steps: readonly {
    readonly pos?: Vec2;
    readonly key?: string;
    readonly check: (intents: IntentList) => void;
  }[];
  readonly expectState?: (after: unknown) => void;
}

// --- the scenario list of example.counter (TRACEABILITY: counter.cljc) ---

// "counter layout, ::counter-increment": click the more! button, num 11.
// "counter-counter stack, per-entry paths": click the second more, nums
// 0, 2, 2. "::add-counter conj 0": click Add Counter, nums 0, 1, 2, 0.
function counterScenarios(): readonly Scenario[] {
  const single = { num: 10 };
  const $num = rootRef(single).get("num") as Ref<number>;
  const one = counterView(10, $num) as readonly Elem[];
  const [w, h] = bounds(one[0] as Node);

  const stacked = { nums: [0, 1, 2] };
  const $nums = rootRef(stacked).get("nums") as Ref<readonly number[]>;
  const stack = counterCounterView([0, 1, 2], $nums) as readonly Elem[];
  const mores = scanOf(stack as Elem).filter(
    (f) => f.node.type === "button" && (f.node as ButtonNode).text === "more!",
  );
  const addBtn = scanOf(stack as Elem).find(
    (f) => f.node.type === "button" && (f.node as ButtonNode).text === "Add Counter",
  )!;

  return [
    {
      name: "counter: more increments num",
      size: [120, 60],
      state: single,
      view: one as Elem,
      steps: [
        {
          pos: [w / 2, h / 2],
          check: (is) => expect(is).toEqual([["counter-increment", [["keypath", "num"]]]]),
        },
      ],
      expectState: (s) => expect(s).toEqual({ num: 11 }),
    },
    {
      name: "counter-counter: the second more touches only entry 1",
      size: [120, 60],
      state: stacked,
      view: stack as Elem,
      steps: [
        {
          pos: centreOf(mores[1]!),
          check: (is) =>
            expect(is).toEqual([
              ["counter-increment", [["keypath", "nums"], ["seq-nth", 1]]],
            ]),
        },
      ],
      expectState: (s) => expect(s).toEqual({ nums: [0, 2, 2] }),
    },
    {
      name: "counter-counter: Add Counter appends zero",
      size: [120, 60],
      state: stacked,
      view: stack as Elem,
      steps: [
        {
          pos: centreOf(addBtn),
          check: (is) => expect(is).toEqual([["add-counter", [["keypath", "nums"]]]]),
        },
      ],
      expectState: (s) => expect(s).toEqual({ nums: [0, 1, 2, 0] }),
    },
  ];
}

// --- the scenario list of example.todo (TRACEABILITY: todo.cljc) ---

// "delete-X geometry / delete": click the first row's X — delete with the
// todo path; a click past it returns no delete; the list becomes second,
// third. "complete": click the second checkbox — only second becomes
// complete. "toggle and filter fns": click active — set selected-filter;
// a click on the selected label returns nothing. "filtered list edits
// original list": under active, delete visible 1 — original becomes
// first, third; under complete, uncheck the only visible todo — third is
// open and the next render shows no rows. "delete / complete / add": the
// Add Todo button emits add-todo then set next-todo-text "". "Enter via
// wrap-on": the focused textarea's Enter emits the button's effects, and
// any other key passes through as insert-text.
function todoScenarios(): readonly Scenario[] {
  const base = todoState();
  const plain = todoApp(base, {});
  const del0 = deleteHandlersOf(plain)[0]!;

  const second = todoApp({ ...base, todos: base.todos }, {});
  const cbs = checkboxHandlersOf(second);

  const withActive: TodoState = { ...todoState(), "selected-filter": "active" };
  const activeView = todoApp(withActive, {});
  const delHandlers = deleteHandlersOf(activeView);

  const withComplete: TodoState = { ...todoState(), "selected-filter": "complete" };
  const completeView = todoApp(withComplete, {});
  const cbHandlers = checkboxHandlersOf(completeView);

  const drafted: TodoState = { ...todoState(), "next-todo-text": "hello" };
  const draftedView = todoApp(drafted, {});
  const addBtn = scanOf(draftedView).find((f) => f.node.type === "button")!;
  const focusedView = todoApp(drafted, { focus: NEXT_TEXT_PATH });

  const toggleView = todoApp(base, {});
  const activeOpt = scanOf(toggleView).find(
    (f) =>
      f.node.type === "handler" &&
      scanOf(f.node as Elem).some((g) => g.node.type === "label" && (g.node as Label).text === "active"),
  )!;
  const allPlain = scanOf(toggleView).find(
    (f) =>
      f.node.type === "label" && (f.node as Label).text === "all" && !f.underColor && !f.underHandler,
  )!;

  return [
    {
      name: "todo: the delete X deletes the first todo",
      size: [300, 300],
      state: base,
      view: plain,
      steps: [
        {
          pos: [del0.x + 3, del0.y + 3],
          check: (is) => {
            expect(is).toHaveLength(1);
            expect(is[0]![0]).toBe("delete");
            const p = is[0]![1] as readonly unknown[];
            expect(p[0]).toEqual(["keypath", "todos"]);
            expect((p[1] as readonly unknown[])[0]).toBe("filter");
            expect(p[2]).toEqual(["seq-nth", 0]);
          },
        },
        {
          pos: [del0.x + 15, del0.y + 3],
          check: (is) => expect(is.some((e) => e[0] === "delete")).toBe(false),
        },
      ],
      expectState: (s) =>
        expect((s as TodoState).todos.map((t) => t.description)).toEqual(["second", "third"]),
    },
    {
      name: "todo: the second checkbox completes only the second",
      size: [300, 300],
      state: base,
      view: plain,
      steps: [
        {
          pos: [cbs[1]!.x + 1, cbs[1]!.y + 1],
          check: (is) => {
            expect(is).toHaveLength(1);
            expect(is[0]![0]).toBe("update");
            const p = is[0]![1] as readonly unknown[];
            expect(p[p.length - 1]).toEqual(["keypath", "complete?"]);
            expect(p[2]).toEqual(["seq-nth", 1]);
          },
        },
      ],
      expectState: (s) =>
        expect((s as TodoState).todos).toEqual([
          { description: "first", "complete?": false },
          { description: "second", "complete?": true },
          { description: "third", "complete?": true },
        ]),
    },
    {
      name: "todo: clicking active selects it; clicking the selected one does nothing",
      size: [300, 300],
      state: base,
      view: plain,
      steps: [
        {
          pos: centreOf(activeOpt),
          check: (is) => expect(is).toEqual([["set", FILTER_PATH, "active"]]),
        },
        {
          pos: centreOf(allPlain),
          check: (is) => expect(is).toEqual([]),
        },
      ],
      expectState: (s) => {
        expect((s as TodoState)["selected-filter"]).toBe("active");
        // the next render under active shows first and second
        expect(rowDescriptionsOf(todoApp(s as TodoState, {}))).toEqual(["first", "second"]);
      },
    },
    {
      name: "todo: deleting visible 1 under active edits the original list",
      size: [300, 300],
      state: withActive,
      view: activeView,
      steps: [
        {
          pos: [delHandlers[1]!.x + 3, delHandlers[1]!.y + 3],
          check: (is) => {
            expect(is).toHaveLength(1);
            expect(is[0]![0]).toBe("delete");
            const p = is[0]![1] as readonly unknown[];
            expect(p[2]).toEqual(["seq-nth", 1]);
          },
        },
      ],
      expectState: (s) =>
        expect((s as TodoState).todos.map((t) => t.description)).toEqual(["first", "third"]),
    },
    {
      name: "todo: unchecking the only visible todo under complete empties the next render",
      size: [300, 300],
      state: withComplete,
      view: completeView,
      steps: [
        {
          pos: [cbHandlers[0]!.x + 1, cbHandlers[0]!.y + 1],
          check: (is) => {
            expect(is).toHaveLength(1);
            expect(is[0]![0]).toBe("update");
            const p = is[0]![1] as readonly unknown[];
            expect(p[2]).toEqual(["seq-nth", 0]);
            expect(p[p.length - 1]).toEqual(["keypath", "complete?"]);
          },
        },
      ],
      expectState: (s) => {
        expect((s as TodoState).todos[2]).toEqual({ description: "third", "complete?": false });
        // the next render under complete shows no rows
        expect(rowDescriptionsOf(todoApp(s as TodoState, {}))).toEqual([]);
      },
    },
    {
      name: "todo: the Add Todo button adds then clears the draft",
      size: [300, 300],
      state: drafted,
      view: draftedView,
      steps: [
        {
          pos: centreOf(addBtn),
          check: (is) =>
            expect(is).toEqual([["add-todo", TODOS_PATH, "hello"], ["set", NEXT_TEXT_PATH, ""]]),
        },
      ],
      expectState: (s) => {
        const todos = (s as TodoState).todos;
        expect(todos).toHaveLength(4);
        expect(todos[todos.length - 1]).toEqual({ description: "hello", "complete?": false });
        expect((s as TodoState)["next-todo-text"]).toBe("");
      },
    },
    {
      name: "todo: Enter on the focused new-todo textarea equals the button",
      size: [300, 300],
      state: drafted,
      view: focusedView,
      steps: [
        {
          key: "enter",
          check: (is) =>
            expect(is).toEqual([["add-todo", TODOS_PATH, "hello"], ["set", NEXT_TEXT_PATH, ""]]),
        },
      ],
      expectState: (s) =>
        expect((s as TodoState).todos).toHaveLength(4),
    },
    {
      name: "todo: any other key passes through to the textarea",
      size: [300, 300],
      state: drafted,
      view: focusedView,
      steps: [
        {
          key: "x",
          check: (is) =>
            expect(is).toEqual([["insert-text", "x", NEXT_TEXT_PATH, NEW_TODO_EXTRA_PATH]]),
        },
      ],
      expectState: (s) => expect((s as TodoState).todos).toHaveLength(3),
    },
  ];
}

it("p_examples: every scenario passes on each backend", () => {
  // unknown-effect reports (other-keys passes insert-text through to the
  // textarea interpreter, which a plain top-level dispatcher skips) stay
  // silent here — the row checks the returned effects
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  try {
    // the scenario lists of both examples
    const scenarios = [...counterScenarios(), ...todoScenarios()];
    expect(scenarios.length).toBeGreaterThanOrEqual(11);
    for (const be of BACKENDS) {
      for (const scenario of scenarios) {
        const wire = makeWire(be, scenario.size);
        // each backend renders the app, unchanged
        wire.draw(scenario.view);
        const app = makeApp({ view: () => null, state: scenario.state });
        for (const step of scenario.steps) {
          const before = wire.received.length;
          if (step.pos !== undefined) wire.pointer(step.pos);
          else wire.key(step.key!);
          const ev = wire.received[before];
          expect(ev, `${be}: ${scenario.name} routed nothing`).toBeDefined();
          const intents = dispatch(scenario.view, ev!);
          step.check(intents);
          app.dispatch(intents);
        }
        scenario.expectState?.(app.getState());
      }
    }

    // Generalized property: for random nums, clicking the i-th more
    // button routes counter-increment with that entry's path on every
    // backend, and applying it changes only entry i.
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 99 }), { minLength: 1, maxLength: 5 }),
        fc.nat(7),
        fc.constantFrom(...BACKENDS),
        (nums, pick, be) => {
          const i = pick % nums.length;
          const state = { nums: [...nums] };
          const $nums = rootRef(state).get("nums") as Ref<readonly number[]>;
          const view = counterCounterView(nums, $nums) as Elem;
          const wire = makeWire(be, [120, 60]);
          wire.draw(view);
          const more = scanOf(view).filter(
            (f) => f.node.type === "button" && (f.node as ButtonNode).text === "more!",
          )[i]!;
          const [bw, bh] = bounds(more.node);
          wire.pointer([more.x + bw / 2, more.y + bh / 2]);
          const intents = dispatch(view, wire.received[0]!);
          expect(intents).toEqual([["counter-increment", [["keypath", "nums"], ["seq-nth", i]]]]);
          const app = makeApp({ view: () => null, state });
          app.dispatch(intents);
          const out = (app.getState() as { nums: readonly number[] }).nums;
          expect(out[i]).toBe(nums[i]! + 1);
          expect(out.filter((_, j) => j !== i)).toEqual(nums.filter((_, j) => j !== i));
        },
      ),
    );
  } finally {
    logSpy.mockRestore();
  }
});

// ---------------------------------------------------------------------
// p_host — derives_from: tambor.host_agnostic
// generator: the todo example from TypeScript and ClojureScript
// predicate: the same effects result with no conversion calls
// ---------------------------------------------------------------------
//
// Executable encoding (tambor-5bc ruling): the todo example is driven
// twice — once in TypeScript, through the example's own handlers and the
// native effect dispatcher; once as a ClojureScript program, whose data
// (keywords, persistent maps) crosses the boundary unconverted through
// the five-function data-ops seam. The same interactions emit the same
// effects (per tag), and applying them lands both hosts on deep-equal
// state, with the host data still host data (no conversion calls).
it("p_host: the same effects result with no conversion calls", () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  try {
    // --- the todo example in TypeScript: its own handlers emit the batches
    const drafted: TodoState = { ...todoState(), "next-todo-text": "hello" };
    const tsView = todoApp(drafted, {});
    const btn = scanOf(tsView).find((f) => f.node.type === "button")!.node as ButtonNode;
    // interaction 1 — the Add Todo button
    const tsAdd = btn.onClick?.() as IntentList;
    expect(tsAdd).toEqual([["add-todo", TODOS_PATH, "hello"], ["set", NEXT_TEXT_PATH, ""]]);
    // interaction 2 — the second todo's checkbox
    const secondRow = todoItem(
      { description: "second", "complete?": false },
      [["keypath", "todos"], ["seq-nth", 1]],
    );
    const tsComplete = dispatch(secondRow, mouseDown([11, 5]));
    expect(tsComplete[0]![0]).toBe("update");
    // interaction 3 — the third todo's delete X
    const thirdRow = todoItem(
      { description: "third", "complete?": true },
      [["keypath", "todos"], ["seq-nth", 2]],
    );
    const tsDelete = dispatch(thirdRow, mouseDown([8, 8]));
    expect(tsDelete).toEqual([["delete", [["keypath", "todos"], ["seq-nth", 2]]]]);
    // interaction 4 — the active toggle option
    const toggleView = toggle(FILTER_OPTIONS, "all", FILTER_PATH);
    const activeOpt = scanOf(toggleView).find(
      (f) =>
        f.node.type === "handler" &&
        scanOf(f.node as Elem).some((g) => g.node.type === "label" && (g.node as Label).text === "active"),
    )!;
    const tsFilter = dispatch(toggleView, mouseDown(centreOf(activeOpt)));
    expect(tsFilter).toEqual([["set", FILTER_PATH, "active"]]);

    const tsApp = makeApp({ view: () => null, state: todoState() });
    for (const batch of [tsAdd, tsComplete, tsDelete, tsFilter]) tsApp.dispatch(batch);

    // --- the same todo example in ClojureScript: keyword tags, keyword
    // keys, persistent-map todos — host data straight through the seam
    const kwTodos = kw(null, "todos");
    const kwComplete = kw(null, "complete?");
    const kwNext = kw(null, "next-todo-text");
    const kwFilter = kw(null, "selected-filter");
    const hostTodo = (description: string, complete: boolean): PMap =>
      pmap([["description", description], [kwComplete, complete]]);
    const cljsInitial = (): PMap =>
      pmap([
        ["todos", [hostTodo("first", false), hostTodo("second", false), hostTodo("third", true)]],
        [kwNext, ""],
        [kwFilter, "all"],
      ]);
    // the add-todo effect is host-written, like any ClojureScript
    // program's own effects: append a persistent-map todo
    const registry = new Map<string, (state: unknown, ...args: unknown[]) => unknown>();
    registry.set("add-todo", (state, ...args) => {
      const [path, text] = args as [readonly unknown[], string];
      const key = path[0];
      const todos = cljsOps.get(state, key) as unknown[];
      return cljsOps.assoc(state, key, [...todos, hostTodo(text, false)]);
    });
    const initial = cljsInitial();
    const firstTodo = (cljsOps.get(initial, kwTodos) as unknown[])[0];
    const opsApp = makeOpsApp({ state: initial, ops: cljsOps, registry });

    // the same interactions, emitted in the host's idiom: the same tags
    const hostBatches: readonly (readonly unknown[])[][] = [
      [[kw(null, "add-todo"), [kwTodos], "hello"], [kw(null, "set"), [kwNext], ""]],
      [[kw(null, "update"), [kwTodos, 1, kwComplete], not]],
      [[kw(null, "delete"), [kwTodos, 2]]],
      [[kw(null, "set"), [kwFilter], "active"]],
    ];
    const tsBatches: readonly IntentList[] = [tsAdd, tsComplete, tsDelete, tsFilter];
    // the same effects result: identical effect tags per interaction
    for (const [ts, host] of tsBatches.map((ts, i) => [ts, hostBatches[i]!] as const)) {
      expect(ts.map((e) => e[0])).toEqual(host.map((e) => cljsOps.tag(e[0])));
    }
    for (const batch of hostBatches) opsApp.dispatch(batch);

    // applying either side's batches lands both hosts on the same state
    const tsFinal = tsApp.getState() as TodoState;
    const hostFinal = opsApp.getState();
    expect(toJs(hostFinal)).toEqual(tsFinal);

    // ...with no conversion calls: the host data crossed the boundary
    // unconverted — the state is still a persistent map, its todos are
    // still persistent maps, and the untouched branch (first) kept its
    // reference identity through every dispatch
    expect(hostFinal).toBeInstanceOf(PMap);
    const finalTodos = cljsOps.get(hostFinal, kwTodos) as unknown[];
    expect(finalTodos).toHaveLength(3);
    expect(finalTodos[0]).toBe(firstTodo);
    expect(finalTodos[2]).toBeInstanceOf(PMap);
  } finally {
    logSpy.mockRestore();
  }
});
