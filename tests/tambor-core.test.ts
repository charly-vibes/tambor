// Purpose: executable contract tests for the tambor root spec's core
//   library properties — views are values, handlers are pure, the core
//   is headless, paths not callbacks, strict TypeScript build,
//   mobile-first touch targets.
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: openspec/specs/tambor/spec.md is the design authority; the rows are
//   checked against the working spine (views, events, paths, effects).
//   Split out of the former monolithic tests/tambor.test.ts
//   (tambor-272); the example-acceptance and host rows live in
//   tambor-examples.test.ts and tambor-host.test.ts.

import { expect, it } from "vitest";
import fc from "fast-check";

// The Node builtins the build check needs, typed at the use site —
// @types/node is not a project dependency (typing.model: no any in
// public signatures; these are test-local pins).
// @ts-expect-error node:child_process has no type declarations here
import { execSync } from "node:child_process";
// @ts-expect-error node:fs has no type declarations here
import { readdirSync } from "node:fs";

import {
  isGroup,
  path as pathNode,
  rectangle,
  roundedRectangle,
  spacer,
  translate,
  withColor,
  withStyle,
  withStrokeWidth,
  type ButtonNode,
  type Color,
  type Elem,
  type Vec2,
} from "../src/views/model.ts";
import {
  counter as counterView,
  counterCounter as counterCounterView,
} from "../src/effects/counter.ts";
import { rootRef, type Ref } from "../src/effects/ref.ts";
import { hitTargetSize, interactiveNodes } from "../src/app/touch.ts";

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
      node: fc.oneof(
        tie("leaf"),
        tie("wrap"),
        tie("group"),
      ) as fc.Arbitrary<Elem>,
      leaf: fc.oneof(
        fc.tuple(size, size).map(([w, h]) => rectangle(w, h)),
        fc
          .tuple(size, size, size)
          .map(([w, h, r]) => roundedRectangle(w, h, r)),
        fc
          .array(fc.tuple(coord, coord), { maxLength: 4 })
          .map((points) => pathNode(...(points as readonly Vec2[]))),
        fc.tuple(coord, coord).map(([x, y]) => spacer(x, y)),
      ),
      wrap: fc.oneof(
        fc.tuple(coord, coord, node).map(([x, y, d]) => translate(x, y, d)),
        fc.tuple(color, node).map(([c, d]) => withColor(c, d)),
        fc
          .tuple(color, node)
          .map(([c, d]) => withStyle("fill", withColor(c, d))),
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
      fc.tuple(
        fc.integer({ min: -10, max: 110 }),
        fc.integer({ min: -10, max: 110 }),
      ),
      (nums, num, pos) => {
        const state = { nums, num };
        const before = JSON.parse(JSON.stringify(state));
        // every handler the counter example renders, called with the
        // random event's position: none may touch the state directly —
        // state changes only flow back as effects (paths_not_callbacks)
        const tree = [
          ...(counterView(num, rootRef(state).get("num") as Ref<number>) ?? []),
          ...(counterCounterView(
            nums,
            rootRef(state).get("nums") as Ref<readonly number[]>,
          ) ?? []),
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
  const globals = globalThis as unknown as {
    document?: unknown;
    window?: unknown;
  };
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
  const $nums = rootRef({ nums: [0, 1, 2] }).get("nums") as Ref<
    readonly number[]
  >;
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
// 30s: a full tsc build with declaration emit is a subprocess (same
// cold-CI headroom as p_strict in typing-strict — run 37831173691)
it("p_typescript: tsc strict passes and declarations are emitted", () => {
  // the project's strict flags (strict, noUncheckedIndexedAccess,
  // exactOptionalPropertyTypes, noImplicitOverride) run via the project
  // config; the build overrides the no-emit to produce declarations
  execSync(
    "npx tsc -p tsconfig.json --noEmit false --declaration --emitDeclarationOnly --outDir target/tsc-out",
    { stdio: "pipe" },
  );
  const decls = (
    readdirSync("target/tsc-out", { recursive: true }) as string[]
  ).filter((f: string) => f.endsWith(".d.ts"));
  expect(decls.length).toBeGreaterThan(0);
}, 30000);

// p_touch — derives_from: tambor.mobile_first
// generator: all interactive nodes — predicate: every hit target is at
// least 44 by 44
it("p_touch: every hit target is at least 44 by 44", () => {
  const $nums = rootRef({ nums: [0, 1, 2] }).get("nums") as Ref<
    readonly number[]
  >;
  const tree = counterCounterView([0, 1, 2], $nums) as readonly Elem[];
  const targets = interactiveNodes(tree);
  expect(targets.length).toBeGreaterThan(0);
  for (const node of targets) {
    const [w, h] = hitTargetSize(node, true);
    expect(w).toBeGreaterThanOrEqual(44);
    expect(h).toBeGreaterThanOrEqual(44);
  }
});
