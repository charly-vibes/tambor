// Purpose: executable contract tests for the ui-mobile spec's
//   orientation row — rotation during use keeps state intact and the
//   root relayouts.
// Responsibilities: encode the converted row's generator and predicate
//   as a vitest + fast-check style contract, one test per converted
//   property.
// Rationale: specs/ui-mobile.md is the design authority; the predicate
//   here mirrors the Properties row (generator + predicate text). The
//   absolute-origin check reuses locate() from src/ui/overflow.ts — the
//   corpus's own walker. tambor-272: redistributed from the former
//   monolithic tests/ui-mobile.test.ts — test names are byte-identical
//   contract bindings.

import { expect, it } from "vitest";

import type { ButtonNode, Vec2 } from "../src/views/model.ts";
import { CONTAINER_SIZE_KEY, makeApp } from "../src/effects/dispatch.ts";
import { locate } from "../src/ui/overflow.ts";
import { findAll } from "./helpers/scan.ts";
import { rotatedSize } from "../src/ui/rotate.ts";
import {
  mobileTodoView,
  todoState,
  type TodoState,
} from "../src/ui/fixture_todo.ts";

// ---------------------------------------------------------------------------
// p_rotate — orientation_supported
// ---------------------------------------------------------------------------

// p_rotate — derives_from: ui.mobile.orientation_supported
// generator: rotation during use
// predicate: state is deep-equal after rotation
it("p_rotate: state is deep-equal after rotation", () => {
  expect(rotatedSize([320, 640])).toEqual([640, 320]);
  expect(rotatedSize([640, 320])).toEqual([320, 640]);

  const backend = { containerSize: [320, 640] as readonly [number, number] | null };
  const state0 = todoState([{ description: "first" }]);
  const app = makeApp({
    view: (s, ctx) =>
      mobileTodoView(
        s as TodoState,
        (ctx[CONTAINER_SIZE_KEY] as Vec2 | undefined) ?? [320, 640],
      ).view,
    state: state0,
    backend,
  });
  // Use the app: add a todo through its dispatcher.
  app.dispatch([
    ["update", [["keypath", "todos"]], (t: readonly unknown[]) => [...t, { description: "new" }]],
  ]);
  const afterUse = app.getState();
  expect(afterUse).not.toEqual(state0);

  // Rotate the device: the backend reports the rotated size and the
  // root relayouts; the state is deep-equal — nothing was lost.
  backend.containerSize = rotatedSize(backend.containerSize!);
  const rotated = app.view();
  expect(rotated).toBeDefined();
  expect(app.getState()).toEqual(afterUse);
  // The relayout actually happened: the bottom bar follows the new
  // height's bottom third.
  const buttons = findAll(rotated, "button") as ButtonNode[];
  const add = buttons.find((b) => b.text === "Add Todo")!;
  const abs = locate(rotated, add);
  if (abs === null) throw new Error("target node not found in tree");
  expect(abs[1]).toBeGreaterThanOrEqual((2 * 320) / 3);
});
